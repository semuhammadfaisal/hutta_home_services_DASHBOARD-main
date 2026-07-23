const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const multer = require('multer');
const { GridFSBucket } = require('mongodb');
const authenticateToken = require('../middleware/auth');
const checkRole = require('../middleware/rbac');
const EmailOutbox = require('../models/EmailOutbox');
const IncomingQuote = require('../models/IncomingQuote');
const Notification = require('../models/Notification');
const Order = require('../models/Order');
const QuoteInvitation = require('../models/QuoteInvitation');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
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
      expiresAt: invitation.expiresAt,
      personalMessage: invitation.personalMessage || ''
    },
    orderId: order._id,
    incomingQuoteId: quote._id,
    quoteInvitationId: invitation._id
  };
}

async function queueInvitation({ order, vendor, quote, invitedBy, invitedByEmail, email, personalMessage, type = 'vendor_quote_invitation', session }) {
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
    status: 'sent',
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + QUOTE_INVITE_TTL_MS)
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
      processingStartedAt: { $lt: new Date(Date.now() - 15 * 60 * 1000) },
      expiresAt: { $gt: new Date() }
    }, { $set: { status: 'sent' }, $unset: { processingStartedAt: '' } });
    const invitation = await QuoteInvitation.findOne({
      tokenHash: hashToken(token),
      status: { $in: ['sent', 'delivery_failed'] },
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

router.get('/public/form', publicLimiter, findPublicInvitation, async (req, res, next) => {
  try {
    const [order, vendor, quote] = await Promise.all([
      Order.findById(req.quoteInvitation.orderId).select('orderId requestReference service description customer.address'),
      Vendor.findById(req.quoteInvitation.vendorId),
      IncomingQuote.findById(req.quoteInvitation.quoteId)
    ]);
    if (!order || !vendor || !quote) return res.status(410).json({ message: 'The quote request is no longer available' });
    res.set('Cache-Control', 'no-store');
    res.json({
      quoteReference: quote.quoteReference,
      requestReference: order.requestReference || order.orderId,
      service: order.service,
      serviceAddress: order.customer?.address || '',
      serviceDetails: order.description || '',
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
    const { payload, errors } = parseQuotePayload(req.body, { requireComplete: true });
    if (errors.length) return res.status(400).json({ message: errors.join('. ') });
    const claimed = await QuoteInvitation.findOneAndUpdate({
      _id: invitation._id,
      tokenHash: hashToken(req.quoteToken),
      status: { $in: ['sent', 'delivery_failed'] },
      expiresAt: { $gt: new Date() }
    }, { $set: { status: 'processing', processingStartedAt: new Date() } }, { new: true });
    if (!claimed) return res.status(409).json({ message: 'This quote is already being submitted or has already been used' });

    const [quote, vendor, order] = await Promise.all([
      IncomingQuote.findOne({ _id: claimed.quoteId, status: 'draft' }),
      activeVendor(claimed.vendorId),
      Order.findById(claimed.orderId)
    ]);
    if (!quote || !vendor || !order || order.workflowStatus === 'vendor_selected') throw Object.assign(new Error('This quote request is closed'), { status: 409 });
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
    await claimed.save();

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
      await QuoteInvitation.updateOne({ _id: invitation._id, status: 'processing' }, { $set: { status: 'sent' }, $unset: { processingStartedAt: '' } }).catch(() => {});
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
    const orders = await Order.find({ workflowStatus: { $in: ['quote_collection', 'vendor_selected'] } })
      .select('orderId requestReference customer service description workflowStatus pricingStatus selectedIncomingQuoteId createdAt')
      .sort({ updatedAt: -1 }).lean();
    const orderIds = orders.map(order => order._id);
    const [quotes, invitations] = await Promise.all([
      IncomingQuote.find({ orderId: { $in: orderIds } }).select('orderId status total earliestAvailableDate vendorSnapshot.complianceStatus').lean(),
      QuoteInvitation.find({ orderId: { $in: orderIds }, status: { $in: ['sent', 'delivery_failed', 'processing'] } }).select('orderId status expiresAt').lean()
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
    const [quotes, invitations, emailMessages] = await Promise.all([
      IncomingQuote.find({ orderId: order._id }).populate('vendorId', 'name category').sort({ vendorId: 1, revisionNumber: -1 }).lean(),
      QuoteInvitation.find({ orderId: order._id }).populate('vendorId', 'name').sort({ createdAt: -1 }).lean(),
      EmailOutbox.find({ orderId: order._id, type: { $in: ['vendor_quote_invitation', 'vendor_quote_submission_confirmation', 'vendor_quote_staff_alert', 'vendor_quote_revision_request'] } })
        .select('type recipients status attempts sentAt lastAttemptAt lastErrorCategory incomingQuoteId quoteInvitationId createdAt')
        .sort({ createdAt: -1 }).lean()
    ]);
    res.json({ order, quotes, invitations: invitations.map(safeInvitation), emailMessages });
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
    if (['submitted', 'revoked', 'processing'].includes(invitation.status)) return res.status(409).json({ message: 'This invitation cannot be resent' });
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
    invitation.expiresAt = new Date(Date.now() + QUOTE_INVITE_TTL_MS);
    invitation.status = 'sent';
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
      await QuoteInvitation.updateMany({ orderId: order._id, status: { $in: ['sent', 'delivery_failed', 'processing'] } }, { $set: { status: 'revoked', revokedAt: new Date(), revokedBy: actorId(req) } }, { session });
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
