const crypto = require('crypto');
const express = require('express');
const { workspaceFilter } = require('../utils/serviceRequestWorkspace');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const multer = require('multer');
const { GridFSBucket, ObjectId } = require('mongodb');
const authenticateToken = require('../middleware/auth');
const checkRole = require('../middleware/rbac');
const EmailOutbox = require('../models/EmailOutbox');
const IncomingQuote = require('../models/IncomingQuote');
const Notification = require('../models/Notification');
const Order = require('../models/Order');
const QuoteInvitation = require('../models/QuoteInvitation');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Property = require('../models/Property');
const VendorPortalMembership = require('../models/VendorPortalMembership');
const VendorEstimateDraft = require('../models/VendorEstimateDraft');
const SecurityAuditEvent = require('../models/SecurityAuditEvent');
const { buildPublicUrl } = require('../utils/publicAppUrl');
const memCache = require('../utils/memoryCache');
const { invalidateDashboardStatsCache } = require('../utils/dashboardStatsCache');
const { synchronizeWorkflowOrder } = require('../utils/workflowSync');
const {
  QUOTE_INVITE_TTL_MS,
  cleanText,
  complianceForVendor,
  decryptToken,
  encryptToken,
  generateToken,
  hashToken,
  nextQuoteReference,
  orderReadyForQuotes,
  parseQuotePayload,
  vendorPrimaryEmail,
  vendorSnapshot
} = require('../utils/incomingQuotes');
const { activeCompliance, distributionKey, evaluateVendorLeadEligibility } = require('../utils/vendorLeadDistribution');
const { recordBidSubmission, respondToLead } = require('../utils/vendorLeadResponses');
const { serializeVendorLead } = require('../utils/vendorLeadSerializers');
const { serializeVendorEstimateDraft } = require('../utils/vendorEstimateDrafts');

const router = express.Router();
const staffRoles = checkRole(['admin', 'manager', 'account_rep']);
const MAX_FILE_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES || `${50 * 1024 * 1024}`, 10);
const MAX_FILES = 10;
const allowedExtensions = new Set(['pdf', 'doc', 'docx', 'txt', 'jpg', 'jpeg', 'png']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
  fileFilter: (_req, file, callback) => {
    const extension = String(file.originalname || '').split('.').pop().toLowerCase();
    callback(allowedExtensions.has(extension) ? null : new Error('File type is not allowed'), allowedExtensions.has(extension));
  }
}).array('documents', MAX_FILES);
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many quote requests. Please try again later.' }
});

function actorId(req) {
  return req.user?.userId || req.user?.id;
}

function invalidateQuoteCaches() {
  memCache.del('orders:stats:v2');
  invalidateDashboardStatsCache();
}

function quoteUrl(token) {
  return buildPublicUrl('/pages/vendor-quote.html', `token=${encodeURIComponent(token)}`);
}

function safeInvitation(invitation) {
  const item = invitation?.toObject ? invitation.toObject() : { ...invitation };
  delete item.tokenHash;
  delete item.distributionKey;
  item.displayStatus = ['sent', 'delivery_failed'].includes(item.status) && new Date(item.expiresAt) <= new Date() ? 'expired' : item.status;
  return item;
}

function uploadMiddleware(req, res, next) {
  upload(req, res, error => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'A quote attachment exceeds the file-size limit' });
    return res.status(400).json({ message: error.message || 'Attachment upload failed' });
  });
}

function validObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

async function activeVendor(id, session) {
  if (!validObjectId(id)) return null;
  return Vendor.findOne({
    _id: id,
    isActive: true,
    $or: [
      { onboardingSource: { $exists: false } },
      { onboardingSource: 'manual' },
      { onboardingStatus: 'approved' }
    ]
  }).session(session || null);
}

async function ensureQuoteStage(order, session) {
  if (order.source === 'residential_portal' && (!order.employee || !order.residentialStaffReview?.reviewedAt)) throw Object.assign(new Error('Assign a coordinator and confirm residential request review before sending to vendors'), { status: 409 });
  if (!['request_received', 'quote_collection', 'vendor_selected'].includes(order.workflowStatus)) throw Object.assign(new Error('This order cannot enter quote collection from its current stage'), { status: 409 });
  if (!orderReadyForQuotes(order)) {
    const error = new Error('Service category and service address must be completed before Stage 2');
    error.status = 409;
    throw error;
  }
  if (order.workflowStatus === 'vendor_selected') {
    const error = new Error('A vendor has already been selected for this Order');
    error.status = 409;
    throw error;
  }
  if (order.pricingStatus !== 'unquoted') {
    const error = new Error('Only unquoted Orders can enter Stage 2');
    error.status = 409;
    throw error;
  }
  if (order.workflowStatus !== 'quote_collection') {
    order.pricingStatus = 'unquoted';
    order.amount = null;
  }
  return synchronizeWorkflowOrder(order, 'quote_collection', { session });
}

async function staffRecipients(session) {
  return User.find({ isActive: true, role: { $in: ['admin', 'manager', 'account_rep'] } }).select('_id email').session(session || null).lean();
}

function invitationOutbox(invitation, quote, order, vendor, token, type = 'vendor_quote_invitation') {
  return {
    type,
    dedupeKey: `${invitation._id}:${type}:${invitation.sendCount}`,
    recipients: [invitation.email],
    payload: {
      encryptedToken: encryptToken(token),
      quoteReference: quote.quoteReference,
      requestReference: order.requestReference || order.orderId,
      vendorName: vendor.name,
      service: order.service,
      ...(invitation.responseRequired ? {
        propertyAddress: invitation.leadSnapshot?.propertyAddress || '',
        scope: invitation.leadSnapshot?.scope || '',
        requestedWindow: invitation.leadSnapshot?.requestedWindow || '',
        relevantNotes: invitation.leadSnapshot?.relevantNotes || '',
        responseDueAt: invitation.responseDueAt,
        bidDueAt: invitation.bidDueAt
      } : {}),
      expiresAt: invitation.expiresAt,
      personalMessage: invitation.personalMessage || ''
    },
    orderId: order._id,
    incomingQuoteId: quote._id,
    quoteInvitationId: invitation._id
  };
}

async function queueInvitation({ order, vendor, quote, invitedBy, invitedByEmail, email, personalMessage, type = 'vendor_quote_invitation', session, lead = null }) {
  const token = generateToken();
  const [invitation] = await QuoteInvitation.create([{
    tokenHash: hashToken(token),
    orderId: order._id,
    vendorId: vendor._id,
    quoteId: quote._id,
    email,
    invitedBy,
    invitedByEmail,
    personalMessage,
    ...(lead ? {
      responseRequired: true,
      responseDueAt: lead.responseDueAt,
      bidDueAt: lead.bidDueAt,
      distributionKey: lead.distributionKey,
      leadSnapshot: lead.leadSnapshot,
      qualificationSnapshot: lead.qualificationSnapshot,
      responseHistory: [{ action: 'distributed', actorType: 'staff', actorId: invitedBy, createdAt: new Date() }]
    } : {}),
    status: 'sent',
    sentAt: new Date(),
    expiresAt: lead?.expiresAt || new Date(Date.now() + QUOTE_INVITE_TTL_MS)
  }], { session });
  await EmailOutbox.create([invitationOutbox(invitation, quote, order, vendor, token, type)], { session });
  return { invitation, inviteUrl: quoteUrl(token) };
}

async function sendAdditionalInvitation({ invitation, order, vendor, email, personalMessage, req }) {
  if (invitation.status === 'processing') {
    throw Object.assign(new Error('The vendor is currently submitting this quote'), { status: 409 });
  }
  const quote = await IncomingQuote.findOne({ _id: invitation.quoteId, status: 'draft' });
  if (!quote) {
    throw Object.assign(new Error('This vendor quote is no longer awaiting submission; request a revision instead'), { status: 409 });
  }

  const latestMessage = await EmailOutbox.findOne({
    quoteInvitationId: invitation._id,
    type: { $in: ['vendor_quote_invitation', 'vendor_quote_revision_request'] },
    'payload.encryptedToken': { $exists: true }
  }).sort({ createdAt: -1 }).lean();
  let token = '';
  try {
    token = latestMessage?.payload?.encryptedToken ? decryptToken(latestMessage.payload.encryptedToken) : '';
  } catch (_error) {
    token = '';
  }

  const rotated = !token || hashToken(token) !== invitation.tokenHash;
  if (rotated) token = generateToken();
  const updated = await QuoteInvitation.findOneAndUpdate({
    _id: invitation._id,
    status: { $in: ['sent', 'delivery_failed'] }
  }, {
    $set: {
      ...(rotated ? { tokenHash: hashToken(token) } : {}),
      email,
      personalMessage,
      invitedBy: actorId(req),
      invitedByEmail: req.user.email,
      expiresAt: new Date(Date.now() + QUOTE_INVITE_TTL_MS),
      status: 'sent',
      sentAt: new Date(),
      lastDeliveryError: null
    },
    $inc: { sendCount: 1 }
  }, { new: true }).select('+tokenHash');
  if (!updated) {
    throw Object.assign(new Error('This invitation changed while it was being sent. Refresh and try again.'), { status: 409 });
  }

  if (rotated) {
    await EmailOutbox.updateMany({
      quoteInvitationId: updated._id,
      type: { $in: ['vendor_quote_invitation', 'vendor_quote_revision_request'] },
      status: { $in: ['pending', 'retry_scheduled', 'permanently_failed'] }
    }, { $set: { status: 'cancelled', lockedUntil: null, lockedBy: null } });
  }
  await EmailOutbox.create(invitationOutbox(updated, quote, order, vendor, token, quote.revisionNumber > 1 ? 'vendor_quote_revision_request' : 'vendor_quote_invitation'));
  return { invitation: updated, quote, inviteUrl: quoteUrl(token) };
}

function fileSignatureValid(file) {
  const extension = String(file.originalname || '').split('.').pop().toLowerCase();
  const buffer = file.buffer || Buffer.alloc(0);
  if (extension === 'pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  if (extension === 'png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (extension === 'jpg' || extension === 'jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (extension === 'doc') return buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (extension === 'docx') return buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (extension === 'txt') return !buffer.subarray(0, Math.min(buffer.length, 4096)).includes(0x00);
  return false;
}

async function storePublicFiles(files, quote, invitation) {
  if (!files?.length) return [];
  const invalid = files.find(file => !fileSignatureValid(file));
  if (invalid) throw Object.assign(new Error(`${invalid.originalname} does not match its declared file type`), { status: 400 });
  const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
  const uploaded = [];
  for (const file of files) {
    const documentId = crypto.randomUUID();
    const safeName = String(file.originalname || 'quote-document').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120);
    const filename = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${safeName}`;
    const fileId = await new Promise((resolve, reject) => {
      const stream = bucket.openUploadStream(filename, { metadata: { documentId, entityType: 'incoming-quote', entityId: quote._id, invitationId: invitation._id, originalName: file.originalname, linkStatus: 'linked' } });
      stream.once('error', reject);
      stream.once('finish', () => resolve(stream.id));
      stream.end(file.buffer);
    });
    uploaded.push({
      documentId,
      name: file.originalname,
      url: `/api/attachments/incoming-quote/${quote._id}/${documentId}`,
      type: file.mimetype || 'application/octet-stream',
      size: file.size,
      storageProvider: 'gridfs',
      fileId,
      uploadedAt: new Date(),
      uploadedBy: `vendor:${invitation.vendorId}`,
      uploadedByEmail: invitation.email,
      status: 'active'
    });
  }
  return uploaded;
}

async function findPublicInvitation(req, res, next) {
  try {
    const token = req.get('x-vendor-quote-token') || '';
    if (token.length < 32 || token.length > 100) return res.status(401).json({ message: 'A valid quote invitation token is required' });
    await QuoteInvitation.updateOne({
      tokenHash: hashToken(token),
      status: 'processing',
      responseRequired: { $ne: true },
      processingStartedAt: { $lt: new Date(Date.now() - 15 * 60 * 1000) },
      expiresAt: { $gt: new Date() }
    }, { $set: { status: 'sent' }, $unset: { processingStartedAt: '' } });
    await QuoteInvitation.updateOne({ tokenHash: hashToken(token), status: 'processing', responseRequired: true, processingStartedAt: { $lt: new Date(Date.now() - 15 * 60 * 1000) }, expiresAt: { $gt: new Date() } }, { $set: { status: 'accepted_to_bid' }, $unset: { processingStartedAt: '' } });
    const invitation = await QuoteInvitation.findOne({
      tokenHash: hashToken(token),
      status: { $in: ['sent', 'delivery_failed', 'accepted_to_bid'] },
      expiresAt: { $gt: new Date() }
    }).select('+tokenHash');
    if (!invitation) return res.status(410).json({ message: 'This quote invitation is invalid, expired, revoked, or already used' });
    req.quoteInvitation = invitation;
    req.quoteToken = token;
    next();
  } catch (error) {
    next(error);
  }
}

async function notifyStaffOfLeadResponse(invitation, response) {
  const staff = await staffRecipients();
  if (!staff.length) return;
  await Notification.insertMany(staff.map(user => ({ userId: user._id, title: response === 'accept' ? 'Vendor accepted lead to bid' : 'Vendor declined lead', message: response === 'accept' ? 'A vendor committed to submit an estimate.' : 'A vendor declined a lead and supplied a reason.', type: response === 'accept' ? 'success' : 'info', priority: 'medium', actionUrl: '#incoming-quotes', metadata: { orderId: invitation.orderId, quoteInvitationId: invitation._id, vendorId: invitation.vendorId } })));
}

router.get('/public/lead', publicLimiter, findPublicInvitation, async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store').json({ lead: serializeVendorLead(req.quoteInvitation) }); } catch (error) { next(error); }
});

router.post('/public/lead/respond', publicLimiter, findPublicInvitation, async (req, res, next) => {
  try {
    if (req.body.response === 'accept') {
      const vendor = await Vendor.findById(req.quoteInvitation.vendorId).select('+stripeConnect.accountId');
      if (!activeCompliance(vendor)) return res.status(409).json({ message: 'Vendor compliance is no longer active and current' });
    }
    const result = await respondToLead({ invitationId: req.quoteInvitation._id, vendorId: req.quoteInvitation.vendorId, response: req.body.response, declineReasonCode: req.body.declineReasonCode, declineReason: req.body.declineReason });
    if (!result.reused) await notifyStaffOfLeadResponse(result.invitation, req.body.response);
    res.json({ lead: serializeVendorLead(result.invitation), reused: result.reused });
  } catch (error) { next(error); }
});

router.get('/public/form', publicLimiter, findPublicInvitation, async (req, res, next) => {
  try {
    if (req.quoteInvitation.responseRequired) return res.status(409).json({ message: req.quoteInvitation.status === 'accepted_to_bid' ? 'Sign in to the Vendor Portal to upload, review, and confirm this estimate' : 'Accept this lead before preparing an estimate' });
    const [order, vendor, quote] = await Promise.all([
      Order.findById(req.quoteInvitation.orderId).select('orderId requestReference service description customer.address'),
      Vendor.findById(req.quoteInvitation.vendorId),
      IncomingQuote.findById(req.quoteInvitation.quoteId)
    ]);
    if (!order || !vendor || !quote) return res.status(410).json({ message: 'The quote request is no longer available' });
    res.set('Cache-Control', 'no-store');
    const requestDetails = req.quoteInvitation.responseRequired ? {
      service: req.quoteInvitation.leadSnapshot?.service,
      serviceAddress: req.quoteInvitation.leadSnapshot?.propertyAddress,
      serviceDetails: req.quoteInvitation.leadSnapshot?.scope
    } : {
      service: order.service,
      serviceAddress: order.customer?.address || '',
      serviceDetails: order.description || ''
    };
    res.json({
      quoteReference: quote.quoteReference,
      requestReference: order.requestReference || order.orderId,
      ...requestDetails,
      vendorName: vendor.name,
      expiresAt: req.quoteInvitation.expiresAt,
      revisionNumber: quote.revisionNumber
    });
  } catch (error) {
    next(error);
  }
});

router.post('/public/form', publicLimiter, findPublicInvitation, uploadMiddleware, async (req, res, next) => {
  const invitation = req.quoteInvitation;
  try {
    if (invitation.responseRequired) return res.status(409).json({ message: 'Distributed leads must use the reviewed Vendor Portal estimate workflow' });
    const { payload, errors } = parseQuotePayload(req.body, { requireComplete: true });
    if (errors.length) return res.status(400).json({ message: errors.join('. ') });
    const claimed = await QuoteInvitation.findOneAndUpdate({
      _id: invitation._id,
      tokenHash: hashToken(req.quoteToken),
      status: invitation.responseRequired ? 'accepted_to_bid' : { $in: ['sent', 'delivery_failed'] },
      expiresAt: { $gt: new Date() }
    }, { $set: { status: 'processing', processingStartedAt: new Date() } }, { new: true });
    if (!claimed) return res.status(409).json({ message: 'This quote is already being submitted or has already been used' });

    const [quote, vendor, order] = await Promise.all([
      IncomingQuote.findOne({ _id: claimed.quoteId, status: 'draft' }),
      activeVendor(claimed.vendorId),
      Order.findById(claimed.orderId)
    ]);
    if (!quote || !vendor || !order || order.workflowStatus === 'vendor_selected') throw Object.assign(new Error('This quote request is closed'), { status: 409 });
    if (claimed.responseRequired) {
      const currentVendor = await Vendor.findById(claimed.vendorId).select('+stripeConnect.accountId');
      if (!activeCompliance(currentVendor)) throw Object.assign(new Error('Vendor compliance is no longer active and current'), { status: 409 });
    }
    const documents = await storePublicFiles(req.files, quote, claimed);
    Object.assign(quote, payload, {
      source: 'vendor',
      status: 'submitted',
      total: payload.laborAmount + payload.materialsAmount,
      vendorSnapshot: vendorSnapshot(vendor),
      submittedAt: new Date()
    });
    quote.documents.push(...documents);
    quote.history.push({ action: 'submitted', actorType: 'vendor', actorEmail: claimed.email });
    await quote.save();
    claimed.status = 'submitted';
    claimed.submittedAt = new Date();
    claimed.processingStartedAt = undefined;
    if (claimed.responseRequired) claimed.responseHistory.push({ action: 'quote_submitted', actorType: 'vendor', createdAt: new Date() });
    await claimed.save();
    if (claimed.responseRequired) await recordBidSubmission(claimed);

    const staff = await staffRecipients();
    if (staff.length) {
      await Notification.insertMany(staff.map(user => ({
        userId: user._id,
        title: 'Vendor quote submitted',
        message: `${vendor.name} submitted ${quote.quoteReference} for ${order.requestReference || order.orderId}.`,
        type: 'success',
        priority: 'high',
        actionUrl: '#incoming-quotes',
        metadata: { orderId: order._id, incomingQuoteId: quote._id }
      })));
      const staffEmails = [...new Set(staff.map(user => user.email).filter(Boolean))];
      if (staffEmails.length) await EmailOutbox.create({
        type: 'vendor_quote_staff_alert',
        dedupeKey: `${quote._id}:staff-submission`,
        recipients: staffEmails,
        payload: { quoteReference: quote.quoteReference, requestReference: order.requestReference || order.orderId, vendorName: vendor.name, total: quote.total },
        orderId: order._id,
        incomingQuoteId: quote._id,
        quoteInvitationId: claimed._id
      });
    }
    await EmailOutbox.create({
      type: 'vendor_quote_submission_confirmation',
      dedupeKey: `${quote._id}:vendor-confirmation`,
      recipients: [claimed.email],
      payload: { quoteReference: quote.quoteReference, requestReference: order.requestReference || order.orderId, vendorName: vendor.name, total: quote.total },
      orderId: order._id,
      incomingQuoteId: quote._id,
      quoteInvitationId: claimed._id
    });
    res.status(201).json({ success: true, quoteReference: quote.quoteReference, status: 'submitted' });
  } catch (error) {
    if (invitation?._id) {
      await QuoteInvitation.updateOne({ _id: invitation._id, status: 'processing' }, { $set: { status: invitation.responseRequired ? 'accepted_to_bid' : 'sent' }, $unset: { processingStartedAt: '' } }).catch(() => {});
    }
    next(error);
  }
});

router.use(authenticateToken, staffRoles);

router.get('/vendor-options', async (_req, res, next) => {
  try {
    const vendors = await Vendor.find({
      isActive: true,
      $or: [{ onboardingSource: { $exists: false } }, { onboardingSource: 'manual' }, { onboardingStatus: 'approved' }]
    }).select('name email phone emails phones category contractorLicenseNumber rocLicenseNumber rocLicenseTypeClassification rocLicenseExpirationDate certificateOfInsuranceOnFile insuranceExpirationDate').sort({ name: 1 }).lean();
    res.json(vendors.map(vendor => ({ ...vendor, compliance: complianceForVendor(vendor), primaryEmail: vendorPrimaryEmail(vendor) })));
  } catch (error) {
    next(error);
  }
});

router.get('/eligible-orders', async (_req, res, next) => {
  try {
    const orders = await Order.find({
      pricingStatus: 'unquoted',
      ...workspaceFilter(_req),
      workflowStatus: { $in: ['request_received', 'quote_collection'] },
      'missingData.serviceCategory': false,
      'missingData.serviceAddress': false,
      'customer.address': { $nin: [null, ''] }
    }).select('orderId requestReference customer.name customer.address service workflowStatus').sort({ createdAt: -1 }).lean();
    res.json(orders.filter(orderReadyForQuotes));
  } catch (error) {
    next(error);
  }
});

router.get('/orders', async (_req, res, next) => {
  try {
    const orders = await Order.find({ ...workspaceFilter(_req), workflowStatus: { $in: ['quote_collection', 'vendor_selected'] } })
      .select('orderId requestReference customer service description workflowStatus pricingStatus selectedIncomingQuoteId createdAt')
      .sort({ updatedAt: -1 }).lean();
    const orderIds = orders.map(order => order._id);
    const [quotes, invitations] = await Promise.all([
      IncomingQuote.find({ orderId: { $in: orderIds } }).select('orderId status total earliestAvailableDate vendorSnapshot.complianceStatus').lean(),
      QuoteInvitation.find({ orderId: { $in: orderIds }, status: { $in: ['sent', 'delivery_failed', 'accepted_to_bid', 'processing'] } }).select('orderId status expiresAt').lean()
    ]);
    res.json(orders.map(order => {
      const orderQuotes = quotes.filter(quote => String(quote.orderId) === String(order._id));
      const submitted = orderQuotes.filter(quote => ['submitted', 'selected', 'not_selected'].includes(quote.status));
      return {
        ...order,
        quoteCount: submitted.length,
        awaitingVendorCount: invitations.filter(invite => String(invite.orderId) === String(order._id) && new Date(invite.expiresAt) > new Date()).length,
        complianceWarningCount: submitted.filter(quote => quote.vendorSnapshot?.complianceStatus !== 'current').length,
        lowestQuote: submitted.length ? Math.min(...submitted.map(quote => Number(quote.total || 0))) : null,
        earliestAvailability: submitted.map(quote => quote.earliestAvailableDate).filter(Boolean).sort()[0] || null
      };
    }));
  } catch (error) {
    next(error);
  }
});

router.post('/orders/:orderId/residential-review', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    if (!validObjectId(req.params.orderId) || !validObjectId(req.body.employeeId) || req.body.confirmReviewed !== true) return res.status(400).json({ message: 'Select a coordinator and confirm review' });
    const scope = cleanText(req.body.scope, 5000);
    if (!scope) return res.status(400).json({ message: 'Reviewed scope is required' });
    await session.withTransaction(async () => {
      const employee = await require('../models/Employee').findOne({ _id: req.body.employeeId, isActive: true }).session(session);
      if (!employee) throw Object.assign(new Error('Coordinator is unavailable'), { status: 400 });
      const order = await Order.findOne({ _id: req.params.orderId, source: 'residential_portal', workflowStatus: 'request_received' }).session(session);
      if (!order || !orderReadyForQuotes(order) || order.requiresIntakeReview) throw Object.assign(new Error('Request is unavailable or requires intake correction before review'), { status: 409 });
      order.employee = employee._id; order.residentialStaffReview = { reviewedAt: new Date(), reviewedBy: actorId(req), scope: redactCustomerContact(scope, 5000) }; await order.save({ session });
      await synchronizeWorkflowOrder(order, 'request_received', { session });
      await SecurityAuditEvent.create([{ action: 'residential_request_reviewed', userId: actorId(req), entityType: 'Order', entityId: String(order._id), metadata: { employeeId: employee._id }, ipAddress: req.ip }], { session });
    });
    invalidateQuoteCaches(); res.json({ reviewed: true });
  } catch (error) { next(error); } finally { await session.endSession(); }
});

router.post('/orders/:orderId/start', async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const sync = await ensureQuoteStage(order);
    invalidateQuoteCaches();
    res.json({ ...order.toObject(), sync });
  } catch (error) {
    next(error);
  }
});

router.get('/orders/:orderId', async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId).populate('selectedIncomingQuoteId').lean();
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const [quotes, invitations, emailMessages, estimateDrafts] = await Promise.all([
      IncomingQuote.find({ orderId: order._id }).populate('vendorId', 'name category').sort({ vendorId: 1, revisionNumber: -1 }).lean(),
      QuoteInvitation.find({ orderId: order._id }).populate('vendorId', 'name').sort({ createdAt: -1 }).lean(),
      EmailOutbox.find({ orderId: order._id, type: { $in: ['vendor_quote_invitation', 'vendor_quote_submission_confirmation', 'vendor_quote_staff_alert', 'vendor_quote_revision_request'] } })
        .select('type recipients status attempts sentAt lastAttemptAt lastErrorCategory incomingQuoteId quoteInvitationId createdAt')
        .sort({ createdAt: -1 }).lean(),
      VendorEstimateDraft.find({ orderId: order._id }).sort({ updatedAt: -1 }).lean()
    ]);
    res.json({ order, quotes, invitations: invitations.map(safeInvitation), emailMessages, estimateDrafts: estimateDrafts.map(draft => { const item = serializeVendorEstimateDraft(draft); item.attachments = item.attachments.map(file => ({ ...file, downloadUrl: `/api/incoming-quotes/estimate-drafts/${item.id}/files/${encodeURIComponent(file.id)}` })); return item; }) });
  } catch (error) {
    next(error);
  }
});

async function createDraft({ order, vendor, source, previousVersion, req, session }) {
  const quoteReference = await nextQuoteReference(session);
  const revisionNumber = previousVersion ? previousVersion.revisionNumber + 1 : 1;
  const quoteChainId = previousVersion?.quoteChainId || `${order._id}:${vendor._id}`;
  const [quote] = await IncomingQuote.create([{
    quoteReference,
    quoteChainId,
    revisionNumber,
    previousVersionId: previousVersion?._id,
    orderId: order._id,
    vendorId: vendor._id,
    source,
    status: 'draft',
    vendorSnapshot: vendorSnapshot(vendor),
    history: [{ action: 'draft_created', actorType: 'staff', actorId: actorId(req), actorEmail: req.user.email }]
  }], { session });
  return quote;
}

router.get('/estimate-drafts/:draftId', async (req, res, next) => {
  try {
    if (!validObjectId(req.params.draftId)) return res.status(404).json({ message: 'Estimate draft not found' });
    const draft = await VendorEstimateDraft.findById(req.params.draftId).lean();
    if (!draft) return res.status(404).json({ message: 'Estimate draft not found' });
    const payload = serializeVendorEstimateDraft(draft);
    payload.attachments = payload.attachments.map(file => ({ ...file, downloadUrl: `/api/incoming-quotes/estimate-drafts/${payload.id}/files/${encodeURIComponent(file.id)}` }));
    res.set('Cache-Control', 'private, no-store').json({ draft: payload });
  } catch (error) { next(error); }
});

router.get('/estimate-drafts/:draftId/files/:documentId', async (req, res, next) => {
  try {
    if (!validObjectId(req.params.draftId)) return res.status(404).json({ message: 'Estimate attachment not found' });
    const draft = await VendorEstimateDraft.findById(req.params.draftId).select('+sourceFiles.fileId');
    const file = draft?.sourceFiles?.find(item => item.documentId === req.params.documentId);
    if (!file?.fileId || !ObjectId.isValid(String(file.fileId))) return res.status(404).json({ message: 'Estimate attachment not found' });
    const name = cleanText(file.name, 180).replace(/[\r\n"\\]/g, '_');
    res.set({ 'Content-Type': file.mimeType, 'Content-Disposition': `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' }).openDownloadStream(new ObjectId(String(file.fileId))).on('error', next).pipe(res);
  } catch (error) { next(error); }
});

function leadRules() {
  return {
    minimumRating: Number(process.env.VENDOR_LEAD_MINIMUM_RATING || 3),
    minimumPerformanceScore: Number(process.env.VENDOR_LEAD_MINIMUM_PERFORMANCE_SCORE || 50)
  };
}

function propertyAddress(property, order) {
  if (!property) return cleanText(order.customer?.address, 700);
  return [property.addressLine1, property.addressLine2, property.city, property.state, property.postalCode]
    .map(value => cleanText(value, 240)).filter(Boolean).join(', ').slice(0, 700);
}

function redactCustomerContact(value, max) {
  return cleanText(value, max)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[contact withheld]')
    .replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, '[contact withheld]');
}

function distributionDates(body) {
  const now = new Date();
  const responseDueAt = new Date(body.responseDueAt);
  const bidDueAt = new Date(body.bidDueAt);
  const expiresAt = new Date(Math.min(bidDueAt.getTime() + 24 * 60 * 60 * 1000, now.getTime() + 30 * 24 * 60 * 60 * 1000));
  if (Number.isNaN(responseDueAt.getTime()) || Number.isNaN(bidDueAt.getTime())) throw Object.assign(new Error('Valid responseDueAt and bidDueAt values are required'), { status: 400 });
  if (responseDueAt <= now || bidDueAt <= responseDueAt) throw Object.assign(new Error('Response deadline must be in the future and before the bid deadline'), { status: 400 });
  if (bidDueAt > new Date(now.getTime() + 29 * 24 * 60 * 60 * 1000)) throw Object.assign(new Error('Bid deadline must be within 29 days'), { status: 400 });
  return { responseDueAt, bidDueAt, expiresAt };
}

async function notifyDistributedVendors(results) {
  const memberships = await VendorPortalMembership.find({ vendorId: { $in: results.map(item => item.vendor._id) }, status: 'active' }).select('userId vendorId').lean();
  const byVendor = new Map(results.map(item => [String(item.vendor._id), item]));
  const notices = memberships.map(membership => {
    const item = byVendor.get(String(membership.vendorId));
    return item && {
      userId: membership.userId,
      title: 'New lead available to bid',
      message: `${item.order.service} at ${item.invitation.leadSnapshot?.propertyAddress || 'the service property'} requires your response.`,
      type: 'order',
      priority: 'high',
      actionUrl: '/pages/vendor-portal.html#leads',
      metadata: { invitationId: item.invitation._id, vendorId: item.vendor._id, orderId: item.order._id }
    };
  }).filter(Boolean);
  if (notices.length) await Notification.insertMany(notices);
}

router.get('/orders/:orderId/eligible-vendors', async (req, res, next) => {
  try {
    if (!validObjectId(req.params.orderId)) return res.status(400).json({ message: 'Valid order ID is required' });
    const order = await Order.findById(req.params.orderId).lean();
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const [property, vendors, activeQuotes] = await Promise.all([
      order.propertyId ? Property.findById(order.propertyId).lean() : null,
      Vendor.find({}).select('+stripeConnect.accountId').sort({ name: 1 }).lean(),
      IncomingQuote.find({ orderId: order._id, status: { $nin: ['withdrawn', 'not_selected', 'superseded'] } }).select('vendorId').lean()
    ]);
    const unavailable = new Set(activeQuotes.map(quote => String(quote.vendorId)));
    const candidates = vendors.map(vendor => {
      const result = evaluateVendorLeadEligibility(vendor, order, property, leadRules());
      const alreadyActive = unavailable.has(String(vendor._id));
      return { id: String(vendor._id), name: vendor.name, category: vendor.category || '', tradeClassifications: vendor.tradeClassifications || [], eligible: result.eligible && !alreadyActive, reasons: [...result.reasons, ...(alreadyActive ? ['Vendor already has an active quote or invitation for this order'] : [])], qualification: result.snapshot };
    });
    res.json({ candidates });
  } catch (error) { next(error); }
});

router.post('/orders/:orderId/leads/distribute', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    if (!validObjectId(req.params.orderId)) return res.status(400).json({ message: 'Valid order ID is required' });
    const vendorIds = [...new Set((Array.isArray(req.body.vendorIds) ? req.body.vendorIds : []).map(String))];
    if (!vendorIds.length || vendorIds.length > 20 || vendorIds.some(id => !validObjectId(id))) return res.status(400).json({ message: 'Select between 1 and 20 valid vendors' });
    const idempotencyKey = cleanText(req.get('idempotency-key') || req.body.idempotencyKey, 120);
    if (idempotencyKey.length < 16) return res.status(400).json({ message: 'An idempotency key of at least 16 characters is required' });
    const dates = distributionDates(req.body);
    let output = [];
    let sync;
    await session.withTransaction(async () => {
      const order = await Order.findById(req.params.orderId).session(session);
      if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
      const [property, vendors] = await Promise.all([
        order.propertyId ? Property.findById(order.propertyId).session(session).lean() : null,
        Vendor.find({ _id: { $in: vendorIds } }).select('+stripeConnect.accountId').session(session)
      ]);
      if (vendors.length !== vendorIds.length) throw Object.assign(new Error('One or more selected vendors do not exist'), { status: 400 });
      const evaluated = vendors.map(vendor => ({ vendor, result: evaluateVendorLeadEligibility(vendor, order, property, leadRules()) }));
      const blocked = evaluated.filter(item => !item.result.eligible).map(item => ({ vendorId: String(item.vendor._id), vendorName: item.vendor.name, reasons: item.result.reasons }));
      if (blocked.length) throw Object.assign(new Error('One or more vendors are not eligible for this lead'), { status: 409, details: { blocked } });
      sync = await ensureQuoteStage(order, session);
      const leadSnapshot = {
        propertyAddress: propertyAddress(property, order),
        service: cleanText(order.service, 160),
        scope: redactCustomerContact(req.body.scope || order.description, 5000),
        requestedWindow: redactCustomerContact(req.body.requestedWindow || order.customerIntake?.preferredTiming, 500),
        relevantNotes: redactCustomerContact(req.body.relevantNotes, 2000)
      };
      for (const item of evaluated) {
        const key = distributionKey(order._id, item.vendor._id, idempotencyKey);
        const existingInvite = await QuoteInvitation.findOne({ distributionKey: key }).select('+distributionKey').session(session);
        if (existingInvite) {
          const existingQuote = await IncomingQuote.findById(existingInvite.quoteId).session(session);
          output.push({ invitation: existingInvite, quote: existingQuote, vendor: item.vendor, order, reused: true });
          continue;
        }
        const activeQuote = await IncomingQuote.findOne({ orderId: order._id, vendorId: item.vendor._id, status: { $nin: ['withdrawn', 'not_selected', 'superseded'] } }).session(session);
        if (activeQuote) throw Object.assign(new Error(`${item.vendor.name} already has an active quote chain for this order`), { status: 409 });
        const email = cleanText(vendorPrimaryEmail(item.vendor), 320).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error(`${item.vendor.name} does not have a valid lead email`), { status: 409 });
        const quote = await createDraft({ order, vendor: item.vendor, source: 'vendor', req, session });
        const queued = await queueInvitation({ order, vendor: item.vendor, quote, invitedBy: actorId(req), invitedByEmail: req.user.email, email, personalMessage: '', session, lead: { ...dates, distributionKey: key, leadSnapshot, qualificationSnapshot: item.result.snapshot } });
        output.push({ invitation: queued.invitation, inviteUrl: queued.inviteUrl, quote, vendor: item.vendor, order, reused: false });
      }
      await SecurityAuditEvent.create([{
        action: 'vendor_leads_distributed', userId: actorId(req), userEmail: req.user.email,
        entityType: 'Order', entityId: String(order._id), ipAddress: req.ip, userAgent: req.get('user-agent'),
        metadata: { invitationIds: output.map(item => item.invitation._id), vendorIds, responseDueAt: dates.responseDueAt, bidDueAt: dates.bidDueAt, idempotencyKeyHash: crypto.createHash('sha256').update(idempotencyKey).digest('hex') }
      }], { session });
    const residential = output.find(item => !item.reused && item.order.source === 'residential_portal');
    if (residential) {
      const order = residential.order;
      await require('../models/PortalActivity').create([{ userId: order.residentialRequest?.submittedBy, customerId: order.customerId, propertyId: order.propertyId, orderId: order._id, type: 'vendor_estimates_requested', title: 'Collecting vendor estimates', summary: 'SMPLfix sent your reviewed request to qualified vendors.' }], { session });
      if (order.residentialRequest?.submittedBy) await require('../models/Notification').create([{ userId: order.residentialRequest.submittedBy, title: 'Collecting vendor estimates', message: 'Your request was reviewed and sent to qualified vendors. We will notify you when an estimate is ready.', type: 'order', priority: 'medium', actionUrl: '#home', metadata: { orderId: order._id } }], { session });
    }
    });
    await notifyDistributedVendors(output.filter(item => !item.reused));
    invalidateQuoteCaches();
    res.status(output.every(item => item.reused) ? 200 : 201).json({
      leads: output.map(item => ({ vendor: { id: String(item.vendor._id), name: item.vendor.name }, invitation: safeInvitation(item.invitation), quoteReference: item.quote?.quoteReference || '', inviteUrl: item.inviteUrl || null, reused: item.reused })),
      sync
    });
  } catch (error) {
    if (error?.details) error.exposeDetails = error.details;
    next(error);
  } finally { await session.endSession(); }
});

router.post('/orders/:orderId/quotes', async (req, res, next) => {
  try {
    const [order, vendor] = await Promise.all([Order.findById(req.params.orderId), activeVendor(req.body.vendorId)]);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!vendor) return res.status(400).json({ message: 'Select an active approved vendor' });
    const sync = await ensureQuoteStage(order);
    const existing = await IncomingQuote.findOne({ orderId: order._id, vendorId: vendor._id, status: { $nin: ['withdrawn', 'not_selected'] } });
    if (existing) return res.status(409).json({ message: 'This vendor already has an active quote chain for the Order' });
    const quote = await createDraft({ order, vendor, source: 'staff', req });
    const { payload, errors } = parseQuotePayload(req.body, { requireComplete: Boolean(req.body.submit) });
    if (errors.length) {
      await quote.deleteOne();
      return res.status(400).json({ message: errors.join('. ') });
    }
    Object.assign(quote, payload, { total: payload.laborAmount + payload.materialsAmount });
    if (req.body.submit) {
      quote.status = 'submitted';
      quote.submittedAt = new Date();
      quote.submittedBy = actorId(req);
      quote.history.push({ action: 'submitted', actorType: 'staff', actorId: actorId(req), actorEmail: req.user.email });
    }
    await quote.save();
    res.status(201).json(quote);
  } catch (error) {
    next(error);
  }
});

router.patch('/quotes/:quoteId', async (req, res, next) => {
  try {
    const quote = await IncomingQuote.findOne({ _id: req.params.quoteId, status: 'draft', source: 'staff' });
    if (!quote) return res.status(409).json({ message: 'Only staff-created drafts can be edited' });
    const { payload, errors } = parseQuotePayload({ ...quote.toObject(), ...req.body, estimatedDuration: req.body.estimatedDuration || quote.estimatedDuration });
    if (errors.length) return res.status(400).json({ message: errors.join('. ') });
    Object.assign(quote, payload, { total: payload.laborAmount + payload.materialsAmount });
    quote.history.push({ action: 'draft_updated', actorType: 'staff', actorId: actorId(req), actorEmail: req.user.email });
    await quote.save();
    res.json({ ...quote.toObject(), sync });
  } catch (error) {
    next(error);
  }
});

router.post('/quotes/:quoteId/submit', async (req, res, next) => {
  try {
    const quote = await IncomingQuote.findOne({ _id: req.params.quoteId, status: 'draft', source: 'staff' });
    if (!quote) return res.status(409).json({ message: 'Only a staff draft can be submitted here' });
    const { payload, errors } = parseQuotePayload({ ...quote.toObject(), ...req.body, estimatedDuration: req.body.estimatedDuration || quote.estimatedDuration }, { requireComplete: true });
    if (errors.length) return res.status(400).json({ message: errors.join('. ') });
    Object.assign(quote, payload, { status: 'submitted', submittedAt: new Date(), submittedBy: actorId(req) });
    quote.history.push({ action: 'submitted', actorType: 'staff', actorId: actorId(req), actorEmail: req.user.email });
    await quote.save();
    res.json(quote);
  } catch (error) {
    next(error);
  }
});

router.post('/orders/:orderId/invitations', async (req, res, next) => {
  try {
    const [order, vendor] = await Promise.all([Order.findById(req.params.orderId), activeVendor(req.body.vendorId)]);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!vendor) return res.status(400).json({ message: 'Select an active approved vendor' });
    const sync = await ensureQuoteStage(order);
    const email = cleanText(req.body.email || vendorPrimaryEmail(vendor), 320).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'A valid vendor email is required' });
    }
    const personalMessage = cleanText(req.body.personalMessage, 2000);
    const activeInvite = await QuoteInvitation.findOne({ orderId: order._id, vendorId: vendor._id, status: { $in: ['sent', 'delivery_failed', 'processing'] } }).sort({ createdAt: -1 }).select('+tokenHash');
    if (activeInvite) {
      const result = await sendAdditionalInvitation({ invitation: activeInvite, order, vendor, email, personalMessage, req });
      return res.json({ invitation: safeInvitation(result.invitation), inviteUrl: result.inviteUrl, quote: result.quote, reusedInvitation: true, sync });
    }
    const existing = await IncomingQuote.findOne({ orderId: order._id, vendorId: vendor._id, status: { $nin: ['withdrawn', 'not_selected', 'superseded'] } });
    if (existing) return res.status(409).json({ message: 'This vendor already has an active quote; request a revision instead' });
    const quote = await createDraft({ order, vendor, source: 'vendor', req });
    const result = await queueInvitation({ order, vendor, quote, invitedBy: actorId(req), invitedByEmail: req.user.email, email, personalMessage });
    res.status(201).json({ invitation: safeInvitation(result.invitation), inviteUrl: result.inviteUrl, quote, reusedInvitation: false, sync });
  } catch (error) {
    next(error);
  }
});

router.post('/quotes/:quoteId/request-revision', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const previous = await IncomingQuote.findOne({ _id: req.params.quoteId, status: 'submitted' }).session(session);
      if (!previous) throw Object.assign(new Error('Only a current submitted quote can be revised'), { status: 409 });
      const [order, vendor] = await Promise.all([Order.findById(previous.orderId).session(session), activeVendor(previous.vendorId, session)]);
      if (!order || !vendor) throw Object.assign(new Error('Order or vendor is unavailable'), { status: 409 });
      previous.status = 'superseded';
      previous.supersededAt = new Date();
      previous.supersededBy = actorId(req);
      previous.history.push({ action: 'revision_requested', actorType: 'staff', actorId: actorId(req), actorEmail: req.user.email, message: cleanText(req.body.message, 2000) });
      await previous.save({ session });
      const quote = await createDraft({ order, vendor, source: 'vendor', previousVersion: previous, req, session });
      const email = cleanText(req.body.email || vendorPrimaryEmail(vendor), 320).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('A valid vendor email is required'), { status: 400 });
      result = await queueInvitation({ order, vendor, quote, invitedBy: actorId(req), invitedByEmail: req.user.email, email, personalMessage: cleanText(req.body.message, 2000), type: 'vendor_quote_revision_request', session });
      result.quote = quote;
    });
    res.status(201).json({ invitation: safeInvitation(result.invitation), inviteUrl: result.inviteUrl, quote: result.quote });
  } catch (error) {
    next(error);
  } finally {
    await session.endSession();
  }
});

router.post('/quotes/:quoteId/revise-staff', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    let revision;
    await session.withTransaction(async () => {
      const previous = await IncomingQuote.findOne({ _id: req.params.quoteId, status: 'submitted' }).session(session);
      if (!previous) throw Object.assign(new Error('Only a current submitted quote can be revised'), { status: 409 });
      const [order, vendor] = await Promise.all([Order.findById(previous.orderId).session(session), activeVendor(previous.vendorId, session)]);
      if (!order || !vendor || order.workflowStatus !== 'quote_collection') throw Object.assign(new Error('Order or vendor is unavailable for revision'), { status: 409 });
      previous.status = 'superseded';
      previous.supersededAt = new Date();
      previous.supersededBy = actorId(req);
      previous.history.push({ action: 'staff_revision_created', actorType: 'staff', actorId: actorId(req), actorEmail: req.user.email });
      await previous.save({ session });
      revision = await createDraft({ order, vendor, source: 'staff', previousVersion: previous, req, session });
      revision.scopeOfWork = previous.scopeOfWork;
      revision.laborAmount = previous.laborAmount;
      revision.materialsAmount = previous.materialsAmount;
      revision.total = previous.total;
      revision.estimatedDuration = previous.estimatedDuration;
      revision.earliestAvailableDate = previous.earliestAvailableDate;
      revision.siteAccessRequired = previous.siteAccessRequired;
      revision.accessNotes = previous.accessNotes;
      revision.exclusionsConditions = previous.exclusionsConditions;
      await revision.save({ session });
    });
    res.status(201).json(revision);
  } catch (error) {
    next(error);
  } finally {
    await session.endSession();
  }
});

async function rotateInvitation(req, res, next, mode) {
  try {
    const invitation = await QuoteInvitation.findById(req.params.invitationId).select('+tokenHash').populate('orderId').populate('vendorId').populate('quoteId');
    if (!invitation) return res.status(404).json({ message: 'Quote invitation not found' });
    if (['submitted', 'revoked', 'processing', 'declined', 'expired'].includes(invitation.status)) return res.status(409).json({ message: 'This invitation cannot be resent' });
    let token;
    if (mode === 'resend') {
      const latestMessage = await EmailOutbox.findOne({
        quoteInvitationId: invitation._id,
        type: { $in: ['vendor_quote_invitation', 'vendor_quote_revision_request'] },
        'payload.encryptedToken': { $exists: true }
      }).sort({ createdAt: -1 }).lean();
      try {
        token = latestMessage?.payload?.encryptedToken ? decryptToken(latestMessage.payload.encryptedToken) : '';
      } catch (_error) {
        token = '';
      }
    }
    if (!token || hashToken(token) !== invitation.tokenHash) {
      token = generateToken();
      invitation.tokenHash = hashToken(token);
    }
    await EmailOutbox.updateMany({
      quoteInvitationId: invitation._id,
      type: { $in: ['vendor_quote_invitation', 'vendor_quote_revision_request'] },
      status: { $in: ['pending', 'retry_scheduled', 'permanently_failed'] }
    }, { $set: { status: 'cancelled', lockedUntil: null, lockedBy: null } });
    if (!invitation.responseRequired) invitation.expiresAt = new Date(Date.now() + QUOTE_INVITE_TTL_MS);
    invitation.status = invitation.responseRequired && invitation.acceptedAt ? 'accepted_to_bid' : 'sent';
    invitation.sentAt = new Date();
    invitation.sendCount += 1;
    invitation.lastDeliveryError = undefined;
    await invitation.save();
    if (mode === 'resend') await EmailOutbox.create(invitationOutbox(invitation, invitation.quoteId, invitation.orderId, invitation.vendorId, token, invitation.quoteId.revisionNumber > 1 ? 'vendor_quote_revision_request' : 'vendor_quote_invitation'));
    res.json({ invitation: safeInvitation(invitation), inviteUrl: quoteUrl(token) });
  } catch (error) {
    next(error);
  }
}

router.post('/invitations/:invitationId/resend', (req, res, next) => rotateInvitation(req, res, next, 'resend'));
router.post('/invitations/:invitationId/rotate', (req, res, next) => rotateInvitation(req, res, next, 'rotate'));
router.post('/invitations/:invitationId/revoke', async (req, res, next) => {
  try {
    const invitation = await QuoteInvitation.findOne({ _id: req.params.invitationId, status: { $nin: ['submitted', 'revoked'] } });
    if (!invitation) return res.status(409).json({ message: 'This invitation cannot be revoked' });
    invitation.status = 'revoked';
    invitation.revokedAt = new Date();
    invitation.revokedBy = actorId(req);
    await invitation.save();
    await EmailOutbox.updateMany({
      quoteInvitationId: invitation._id,
      type: { $in: ['vendor_quote_invitation', 'vendor_quote_revision_request'] },
      status: { $in: ['pending', 'retry_scheduled', 'permanently_failed'] }
    }, { $set: { status: 'cancelled', lockedUntil: null, lockedBy: null } });
    const withdrawnQuote = await IncomingQuote.findOneAndUpdate(
      { _id: invitation.quoteId, status: 'draft' },
      { $set: { status: 'withdrawn' }, $push: { history: { action: 'invitation_revoked', actorType: 'staff', actorId: actorId(req), actorEmail: req.user.email } } },
      { new: true }
    );
    if (withdrawnQuote?.previousVersionId) {
      await IncomingQuote.updateOne(
        { _id: withdrawnQuote.previousVersionId, status: 'superseded' },
        { $set: { status: 'submitted' }, $unset: { supersededAt: '', supersededBy: '' }, $push: { history: { action: 'revision_cancelled', actorType: 'system' } } }
      );
    }
    res.json({ invitation: safeInvitation(invitation) });
  } catch (error) {
    next(error);
  }
});

router.post('/quotes/:quoteId/select', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    let selected;
    await session.withTransaction(async () => {
      const quote = await IncomingQuote.findOne({ _id: req.params.quoteId, status: 'submitted' }).session(session);
      if (!quote) throw Object.assign(new Error('Select a current submitted quote'), { status: 409 });
      const order = await Order.findOne({ _id: quote.orderId, workflowStatus: 'quote_collection', selectedIncomingQuoteId: { $exists: false } }).session(session);
      if (!order) throw Object.assign(new Error('This Order already has a selected vendor or is not collecting quotes'), { status: 409 });
      const warnings = quote.vendorSnapshot?.complianceWarnings || [];
      if (warnings.length && req.body.complianceAcknowledged !== true) throw Object.assign(new Error('Compliance warnings must be acknowledged before selection'), { status: 409 });
      quote.status = 'selected';
      quote.selectedAt = new Date();
      quote.selectedBy = actorId(req);
      quote.complianceWarningAcknowledged = warnings.length ? true : false;
      quote.complianceWarningAcknowledgedAt = warnings.length ? new Date() : undefined;
      quote.complianceWarningAcknowledgedBy = warnings.length ? actorId(req) : undefined;
      quote.history.push({ action: 'selected', actorType: 'staff', actorId: actorId(req), actorEmail: req.user.email });
      await quote.save({ session });
      await IncomingQuote.updateMany({ orderId: order._id, _id: { $ne: quote._id }, status: 'submitted' }, { $set: { status: 'not_selected' }, $push: { history: { action: 'not_selected', actorType: 'system' } } }, { session });
      await IncomingQuote.updateMany({ orderId: order._id, _id: { $ne: quote._id }, status: 'draft' }, { $set: { status: 'withdrawn' }, $push: { history: { action: 'closed_after_selection', actorType: 'system' } } }, { session });
          await QuoteInvitation.updateMany({ orderId: order._id, status: { $in: ['sent', 'delivery_failed', 'accepted_to_bid', 'processing'] } }, { $set: { status: 'revoked', revokedAt: new Date(), revokedBy: actorId(req) } }, { session });
      order.vendor = quote.vendorId;
      order.vendorCost = quote.total;
      order.profit = 0;
      order.selectedIncomingQuoteId = quote._id;
      order.pricingStatus = 'unquoted';
      order.amount = null;
      const sync = await synchronizeWorkflowOrder(order, 'vendor_selected', { session });
      selected = { quote, sync };
    });
    invalidateQuoteCaches();
    res.json(selected.quote ? { ...selected.quote.toObject(), sync: selected.sync } : selected);
  } catch (error) {
    next(error);
  } finally {
    await session.endSession();
  }
});

router.post('/outbox/:messageId/retry', async (req, res, next) => {
  try {
    const message = await EmailOutbox.findOne({ _id: req.params.messageId, type: { $in: ['vendor_quote_invitation', 'vendor_quote_submission_confirmation', 'vendor_quote_staff_alert', 'vendor_quote_revision_request'] }, status: 'permanently_failed' });
    if (!message) return res.status(409).json({ message: 'Only a permanently failed quote email can be retried' });
    message.status = 'pending';
    message.attempts = 0;
    message.nextAttemptAt = new Date();
    message.lockedUntil = undefined;
    message.lockedBy = undefined;
    message.lastErrorCategory = undefined;
    await message.save();
    res.json({ success: true, status: 'pending' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
