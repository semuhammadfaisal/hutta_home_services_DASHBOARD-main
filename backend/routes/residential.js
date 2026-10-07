const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { GridFSBucket, ObjectId } = require('mongodb');
const authenticateToken = require('../middleware/auth');
const checkRole = require('../middleware/rbac');
const CustomerInvoice = require('../models/CustomerInvoice');
const CustomerQuoteDecision = require('../models/CustomerQuoteDecision');
const Counter = require('../models/Counter');
const Customer = require('../models/Customer');
const JobCompletion = require('../models/JobCompletion');
const JobSchedule = require('../models/JobSchedule');
const Notification = require('../models/Notification');
const Order = require('../models/Order');
const OutgoingQuote = require('../models/OutgoingQuote');
const Payment = require('../models/Payment');
const PortalActivity = require('../models/PortalActivity');
const Property = require('../models/Property');
const PropertyMembership = require('../models/PropertyMembership');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const SecurityAuditEvent = require('../models/SecurityAuditEvent');
const { validateProperty, exactText } = require('../utils/residentialProperties');
const { invalidateDashboardStatsCache } = require('../utils/dashboardStatsCache');
const { createCustomerInvoicePdf } = require('../utils/invoicePdf');
const { createOutgoingQuotePdf } = require('../utils/quotePdf');
const { createPaymentReceiptPdf } = require('../utils/receiptPdf');
const memCache = require('../utils/memoryCache');
const {
  APPROVAL_CONSENT_TEXT,
  MAX_DECISION_BODY_BYTES,
  parseDecisionPayload,
  quoteSnapshotHash,
  sha256
} = require('../utils/customerQuoteDecisions');
const {
  createBillingPortalSession,
  createSetupSession,
  isConfigured: paymentProviderConfigured,
  listPaymentMethods
} = require('../utils/paymentProvider');
const {
  requestCapabilities,
  submissionKey,
  validateIdempotencyKey,
  validateOrderAction,
  validateRequestPayload
} = require('../utils/residentialRequests');
const { synchronizeWorkflowOrder } = require('../utils/workflowSync');
const {
  safeAttachment,
  serializeActivity,
  serializeCompletion,
  serializeEstimate,
  serializeInvoice,
  serializeOrder,
  serializeProperty,
  serializeSchedule,
  workflowTracker
} = require('../utils/residentialSerializers');

const router = express.Router();
const VENDOR_PUBLIC_FIELDS = 'name legalBusinessName category rocNumber rocLicenseNumber contractorLicenseNumber rocLicenseTypeClassification';
const REQUEST_FILE_LIMIT = Math.min(10, Math.max(1, Number.parseInt(process.env.RESIDENTIAL_REQUEST_MAX_FILES, 10) || 5));
const REQUEST_FILE_BYTES = Math.min(25 * 1024 * 1024, Math.max(1024, Number.parseInt(process.env.RESIDENTIAL_REQUEST_MAX_FILE_BYTES, 10) || 10 * 1024 * 1024));
const REQUEST_BATCH_BYTES = Math.min(50 * 1024 * 1024, Math.max(REQUEST_FILE_BYTES, Number.parseInt(process.env.RESIDENTIAL_REQUEST_MAX_BATCH_BYTES, 10) || 25 * 1024 * 1024));
const REQUEST_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const requestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number.parseInt(process.env.RESIDENTIAL_REQUEST_RATE_LIMIT, 10) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => String(req.user.userId),
  message: { message: 'Too many service requests. Please wait a few minutes and try again.' }
});
const actionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number.parseInt(process.env.RESIDENTIAL_ACTION_RATE_LIMIT, 10) || 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => String(req.user.userId),
  message: { message: 'Too many order updates. Please wait a few minutes and try again.' }
});
const requestUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: REQUEST_FILE_BYTES, files: REQUEST_FILE_LIMIT },
  fileFilter: (_req, file, callback) => callback(
    REQUEST_MIME_TYPES.has(String(file.mimetype || '').toLowerCase()) ? null : new Error('Only PDF, JPG, PNG, and WebP files are allowed'),
    REQUEST_MIME_TYPES.has(String(file.mimetype || '').toLowerCase())
  )
}).array('documents', REQUEST_FILE_LIMIT);

function validId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function pageOptions(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

function activeMembershipFilter(userId, now = new Date()) {
  return {
    userId,
    status: 'active',
    'permissions.view': true,
    startsAt: { $lte: now },
    $or: [{ endsAt: { $exists: false } }, { endsAt: null }, { endsAt: { $gt: now } }]
  };
}

async function residentialScope(userId) {
  const memberships = await PropertyMembership.find(activeMembershipFilter(userId)).lean();
  return {
    memberships,
    propertyIds: memberships.map(item => item.propertyId),
    membershipByProperty: new Map(memberships.map(item => [String(item.propertyId), item]))
  };
}

async function scopedProperty(req, res) {
  if (!validId(req.params.propertyId)) {
    res.status(400).json({ message: 'Invalid property id' });
    return null;
  }
  const membership = await PropertyMembership.findOne({
    ...activeMembershipFilter(req.user.userId),
    propertyId: req.params.propertyId
  }).lean();
  if (!membership) {
    res.status(404).json({ message: 'Property not found' });
    return null;
  }
  const property = await Property.findOne({ _id: req.params.propertyId, status: 'active' }).lean();
  if (!property) {
    res.status(404).json({ message: 'Property not found' });
    return null;
  }
  return { membership, property };
}

async function scopedOrder(req, res) {
  if (!validId(req.params.orderId)) {
    res.status(400).json({ message: 'Invalid order id' });
    return null;
  }
  const scope = await residentialScope(req.user.userId);
  if (!scope.propertyIds.length) {
    res.status(404).json({ message: 'Order not found' });
    return null;
  }
  const order = await Order.findOne({ _id: req.params.orderId, propertyId: { $in: scope.propertyIds } })
    .populate('vendor', VENDOR_PUBLIC_FIELDS)
    .lean();
  if (!order) {
    res.status(404).json({ message: 'Order not found' });
    return null;
  }
  return order;
}

async function canRequestForOrder(userId, order) {
  const membership = await PropertyMembership.findOne({
    ...activeMembershipFilter(userId),
    propertyId: order.propertyId,
    'permissions.requestService': true
  }).select('_id').lean();
  return Boolean(membership);
}

function pagination(total, page, limit) {
  return { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) };
}

function gridFsFilename(document) {
  if (!document?.url?.includes('/uploads/')) return null;
  return decodeURIComponent(document.url.split('/uploads/')[1].split(/[?#]/)[0]);
}

function safeDownloadName(value = 'document') {
  return String(value).replace(/[\r\n"\\]/g, '_').slice(0, 180) || 'document';
}

async function streamDocument(document, res, next, disposition = 'inline') {
  try {
    if (!document || document.status === 'archived') return res.status(404).json({ message: 'Document not found' });
    if (document.storageProvider && document.storageProvider !== 'gridfs') {
      return res.status(409).json({ message: 'This document must be accessed through SMPLfix support' });
    }
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
      return res.status(503).json({ message: 'File storage is not ready' });
    }
    let file = null;
    if (document.fileId && ObjectId.isValid(String(document.fileId))) {
      file = await mongoose.connection.db.collection('uploads.files').findOne({ _id: new ObjectId(String(document.fileId)) });
    }
    if (!file) {
      const filename = gridFsFilename(document);
      if (filename) file = await mongoose.connection.db.collection('uploads.files').findOne({ filename });
    }
    if (!file) return res.status(404).json({ message: 'Stored document is unavailable' });
    const filename = safeDownloadName(document.name || file.metadata?.originalName);
    res.set({
      'Content-Type': document.type || file.metadata?.mimetype || 'application/octet-stream',
      'Content-Disposition': `${disposition}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': file.length,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' })
      .openDownloadStream(file._id)
      .on('error', next)
      .pipe(res);
  } catch (error) {
    next(error);
  }
}

function handleRequestUpload(req, res, next) {
  requestUpload(req, res, error => {
    if (error?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: `Each file must be ${Math.round(REQUEST_FILE_BYTES / 1024 / 1024)} MB or smaller` });
    if (error?.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ message: `Upload no more than ${REQUEST_FILE_LIMIT} files` });
    if (error) return res.status(400).json({ message: error.message || 'Upload failed' });
    const total = (req.files || []).reduce((sum, file) => sum + Number(file.size || 0), 0);
    if (total > REQUEST_BATCH_BYTES) return res.status(413).json({ message: `Combined uploads must be ${Math.round(REQUEST_BATCH_BYTES / 1024 / 1024)} MB or smaller` });
    next();
  });
}

function hasValidRequestSignature(file) {
  const buffer = file?.buffer || Buffer.alloc(0);
  const mime = String(file?.mimetype || '').toLowerCase();
  if (mime === 'application/pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === 'image/webp') return buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
  return false;
}

async function uploadRequestFiles(files, userId) {
  if (!files?.length) return { documents: [], fileIds: [] };
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) throw Object.assign(new Error('File storage is not ready'), { status: 503 });
  const invalid = files.find(file => !hasValidRequestSignature(file));
  if (invalid) throw Object.assign(new Error(`${invalid.originalname || 'A file'} does not match its declared file type`), { status: 400 });
  const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
  const documents = [];
  const fileIds = [];
  for (const file of files) {
    const safeName = String(file.originalname || 'document').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120);
    const filename = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${safeName}`;
    const stored = await new Promise((resolve, reject) => {
      const stream = bucket.openUploadStream(filename, {
        metadata: { originalName: safeName, mimetype: file.mimetype, uploadedBy: String(userId), source: 'residential_request' }
      });
      stream.once('error', reject);
      stream.once('finish', () => resolve(stream.id));
      stream.end(file.buffer);
    });
    fileIds.push(stored);
    documents.push({
      documentId: crypto.randomUUID(),
      name: safeName,
      url: `/uploads/${encodeURIComponent(filename)}`,
      type: file.mimetype,
      size: file.size,
      storageProvider: 'gridfs',
      fileId: stored,
      uploadedBy: String(userId)
    });
  }
  return { documents, fileIds };
}

async function deleteUploadedFiles(fileIds) {
  if (!fileIds?.length || mongoose.connection.readyState !== 1 || !mongoose.connection.db) return;
  const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
  await Promise.allSettled(fileIds.map(fileId => bucket.delete(fileId)));
}

function propertyAddress(property) {
  return [property.addressLine1, property.addressLine2, property.city, property.state, property.postalCode].filter(Boolean).join(', ');
}

async function nextCounter(name, session) {
  const counter = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { value: 1 } },
    { new: true, upsert: true, session, setDefaultsOnInsert: true }
  );
  return counter.value;
}

async function notifyRequestCreated({ session, userId, order, property, emergency }) {
  const staff = await User.find({ isActive: true, role: { $in: ['admin', 'manager', 'account_rep'] } }).select('_id').session(session).lean();
  const priority = emergency ? 'high' : order.priority === 'high' ? 'high' : 'medium';
  const notifications = [
    {
      userId,
      title: emergency ? 'Emergency request submitted' : 'Service request submitted',
      message: `${order.requestReference} was submitted for ${property.label || property.addressLine1}.`,
      type: 'order', priority,
      actionUrl: '#home',
      metadata: { orderId: order._id, propertyId: property._id, requestReference: order.requestReference }
    },
    ...staff.map(user => ({
      userId: user._id,
      title: emergency ? 'Emergency residential request' : 'New residential request',
      message: `${order.customer.name} submitted ${order.requestReference}${emergency ? ' with emergency priority' : ''}.`,
      type: 'order', priority,
      actionUrl: '#service-requests/overview',
      metadata: { orderId: order._id, propertyId: property._id, requestReference: order.requestReference }
    }))
  ];
  await Notification.insertMany(notifications, { session });
}

async function createSharedResidentialOrder({ req, membership, property, payload, documents = [], idempotencyKey, repeatedFromOrder = null }) {
  const session = await mongoose.startSession();
  let createdOrder;
  let wasDuplicate = false;
  try {
    await session.withTransaction(async () => {
      const key = submissionKey(req.user.userId, idempotencyKey);
      const duplicate = await Order.findOne({ portalSubmissionKey: key }).session(session);
      if (duplicate) {
        createdOrder = duplicate;
        wasDuplicate = true;
        return;
      }
      const customer = await Customer.findById(membership.customerId).session(session);
      if (!customer) throw Object.assign(new Error('Customer account is not connected to this property'), { status: 409 });
      const now = new Date();
      const requestSequence = await nextCounter(`website-request:${now.getUTCFullYear()}`, session);
      const orderSequence = await nextCounter('orders', session);
      const requestReference = `REQ-${now.getUTCFullYear()}-${String(requestSequence).padStart(6, '0')}`;
      const customerOrderCount = await Order.countDocuments({ customerId: customer._id, workOrderNumber: { $exists: true } }).session(session);
      const emergency = payload.urgency === 'emergency';
      const actionType = repeatedFromOrder ? 'book_again' : emergency ? 'emergency_submitted' : 'submitted';
      const [order] = await Order.create([{
        orderId: `ORD-${String(orderSequence).padStart(6, '0')}`,
        workOrderNumber: `WO-${String(customerOrderCount + 1).padStart(2, '0')}`,
        customerId: customer._id,
        propertyId: property._id,
        customer: {
          name: customer.name || [req.user.firstName, req.user.lastName].filter(Boolean).join(' ') || req.user.email,
          email: customer.email || req.user.email,
          phone: customer.phone || req.user.phone || '',
          address: propertyAddress(property)
        },
        service: payload.serviceCategory,
        amount: null,
        vendorCost: 0,
        processingFee: 0,
        profit: 0,
        source: 'residential_portal',
        requestReference,
        workflowStatus: 'request_received',
        pricingStatus: 'unquoted',
        status: 'new',
        priority: emergency || payload.urgency === 'urgent' ? 'high' : payload.urgency === 'soon' ? 'medium' : 'low',
        description: payload.description || payload.issueChips.join(', '),
        customerIntake: {
          preferredTiming: payload.preferredTiming,
          accessInstructions: payload.accessInstructions,
          completedAt: now
        },
        residentialRequest: {
          serviceCategory: payload.serviceCategory,
          issueChips: payload.issueChips,
          urgency: payload.urgency,
          preferredTiming: payload.preferredTiming,
          accessInstructions: payload.accessInstructions,
          isEmergency: emergency,
          emergencyDisclaimerAcceptedAt: emergency ? now : undefined,
          submittedBy: req.user.userId
        },
        repeatedFromOrderId: repeatedFromOrder?._id,
        portalSubmissionKey: key,
        documents,
        customerRequestHistory: [{
          type: actionType,
          requestedBy: req.user.userId,
          requestedAt: now,
          preferredTiming: payload.preferredTiming,
          previousOrderId: repeatedFromOrder?._id
        }]
      }], { session });
      await synchronizeWorkflowOrder(order, 'request_received', { session });
      await PortalActivity.create([{
        userId: req.user.userId,
        customerId: customer._id,
        propertyId: property._id,
        orderId: order._id,
        type: actionType,
        title: emergency ? 'Emergency request submitted' : repeatedFromOrder ? 'Service booked again' : 'Service requested',
        summary: `${payload.serviceCategory} · ${requestReference}`,
        occurredAt: now,
        metadata: { urgency: payload.urgency, repeatedFromOrderId: repeatedFromOrder?._id }
      }], { session });
      await notifyRequestCreated({ session, userId: req.user.userId, order, property, emergency });
      createdOrder = order;
    });
  } finally {
    await session.endSession();
  }
  memCache.del('orders:stats:v2');
  invalidateDashboardStatsCache();
  return { order: createdOrder, duplicate: wasDuplicate };
}

async function recordResidentialOrderAction({ req, scoped, action, payload }) {
  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      const now = new Date();
      const cancel = action === 'cancel';
      const pendingField = cancel ? 'cancellationRequest' : 'rescheduleRequest';
      const match = { _id: scoped._id, [`${pendingField}.status`]: { $ne: 'pending' } };
      if (!cancel) match['cancellationRequest.status'] = { $ne: 'pending' };
      updated = await Order.findOneAndUpdate(
        match,
        {
          $set: { [pendingField]: { status: 'pending', ...payload, requestedAt: now, requestedBy: req.user.userId } },
          $push: { customerRequestHistory: { type: cancel ? 'cancel_requested' : 'reschedule_requested', requestedBy: req.user.userId, requestedAt: now, ...payload } }
        },
        { new: true, runValidators: true, session }
      );
      if (!updated) throw Object.assign(new Error(cancel ? 'A cancellation request is already pending' : 'A schedule change or cancellation request is already pending'), { status: 409 });
      const title = cancel ? 'Cancellation requested' : 'Schedule change requested';
      const customerMessage = cancel
        ? `We received your cancellation request for ${updated.requestReference || updated.orderId}.`
        : `We received your schedule request for ${updated.requestReference || updated.orderId}.`;
      const staff = await User.find({ isActive: true, role: { $in: ['admin', 'manager', 'account_rep'] } }).select('_id').session(session).lean();
      await PortalActivity.create([{
        userId: req.user.userId,
        customerId: updated.customerId,
        propertyId: updated.propertyId,
        orderId: updated._id,
        type: cancel ? 'cancel_requested' : 'reschedule_requested',
        title,
        summary: cancel ? `${updated.service} · ${updated.requestReference || updated.orderId}` : `${updated.service} · ${payload.preferredTiming}`,
        occurredAt: now
      }], { session });
      await Notification.insertMany([
        { userId: req.user.userId, title: cancel ? 'Cancellation request received' : 'Schedule request received', message: customerMessage, type: 'order', priority: 'medium', actionUrl: '#home', metadata: { orderId: updated._id } },
        ...staff.map(user => ({ userId: user._id, title, message: `${updated.customer.name} requested an update to ${updated.requestReference || updated.orderId}.`, type: 'order', priority: 'high', actionUrl: '#service-requests/overview', metadata: { orderId: updated._id, propertyId: updated.propertyId } }))
      ], { session });
    });
  } finally {
    await session.endSession();
  }
  return updated;
}

async function vendorMapFor(ids) {
  const unique = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!unique.length) return new Map();
  const vendors = await Vendor.find({ _id: { $in: unique } }).select(VENDOR_PUBLIC_FIELDS).lean();
  return new Map(vendors.map(vendor => [String(vendor._id), vendor]));
}

async function authorizedQuote(req, res, { requireApproval = false } = {}) {
  if (!validId(req.params.quoteId)) {
    res.status(400).json({ message: 'Invalid estimate id' });
    return null;
  }
  const quote = await OutgoingQuote.findById(req.params.quoteId).lean();
  if (!quote) {
    res.status(404).json({ message: 'Estimate not found' });
    return null;
  }
  const order = await Order.findById(quote.orderId).lean();
  if (!order?.propertyId) {
    res.status(404).json({ message: 'Estimate not found' });
    return null;
  }
  const membership = await PropertyMembership.findOne({
    ...activeMembershipFilter(req.user.userId),
    propertyId: order.propertyId,
    customerId: order.customerId,
    ...(requireApproval ? { 'permissions.approveEstimates': true } : {})
  }).lean();
  if (!membership || membership.relationship === 'agent') {
    res.status(requireApproval ? 403 : 404).json({ message: requireApproval ? 'You are not authorized to decide this estimate' : 'Estimate not found' });
    return null;
  }
  return { membership, order, quote };
}

async function decideResidentialQuote(req, authorized, payload) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const quote = await OutgoingQuote.findOne({
        _id: authorized.quote._id,
        status: 'sent',
        validUntil: { $gt: new Date() }
      }).session(session);
      if (!quote) throw Object.assign(new Error('This estimate is expired or no longer available'), { status: 409 });
      const wantedDecision = payload.action === 'approve' ? 'approved' : 'changes_requested';
      const existing = await CustomerQuoteDecision.findOne({ outgoingQuoteId: quote._id }).session(session);
      if (existing) {
        if (existing.decision !== wantedDecision) throw Object.assign(new Error('A different decision has already been recorded'), { status: 409 });
        result = { duplicate: true, decision: existing, quote, order: authorized.order };
        return;
      }
      if ((quote.customerDecisionStatus || 'pending') !== 'pending') throw Object.assign(new Error('This estimate is no longer awaiting your decision'), { status: 409 });
      const order = await Order.findOne({ _id: quote.orderId, currentOutgoingQuoteId: quote._id, workflowStatus: 'quote_sent' }).session(session);
      if (!order) throw Object.assign(new Error('This estimate is no longer current'), { status: 409 });
      const decisionAt = new Date();
      const [decision] = await CustomerQuoteDecision.create([{
        outgoingQuoteId: quote._id,
        orderId: order._id,
        customerId: quote.customerId,
        decision: wantedDecision,
        typedName: payload.typedName,
        termsAccepted: wantedDecision === 'approved' && payload.termsAccepted,
        changeRequestMessage: wantedDecision === 'changes_requested' ? payload.changeRequestMessage : undefined,
        decisionAt,
        quoteReference: quote.quoteReference,
        revisionNumber: quote.revisionNumber,
        consentText: APPROVAL_CONSENT_TEXT,
        termsHash: sha256(quote.termsAndConditions),
        quoteSnapshotHash: quoteSnapshotHash(quote),
        ipAddress: String(req.ip || '').slice(0, 128),
        userAgent: String(req.get('user-agent') || '').slice(0, 1000),
        source: 'residential_portal'
      }], { session });
      quote.customerDecisionStatus = wantedDecision;
      quote.history.push({ action: wantedDecision === 'approved' ? 'customer_approved' : 'customer_changes_requested', actorId: req.user.userId, actorEmail: req.user.email, message: wantedDecision === 'approved' ? `Approved by ${payload.typedName}` : payload.changeRequestMessage });
      await quote.save({ session });
      if (wantedDecision === 'approved') {
        order.approvedOutgoingQuoteId = quote._id;
        order.customerApprovedAt = decisionAt;
      } else {
        order.approvedOutgoingQuoteId = undefined;
        order.customerApprovedAt = undefined;
      }
      await synchronizeWorkflowOrder(order, wantedDecision === 'approved' ? 'customer_approved' : 'quote_changes_requested', { session });
      const approved = wantedDecision === 'approved';
      const staff = await User.find({ isActive: true, role: { $in: ['admin', 'manager', 'account_rep'] } }).select('_id').session(session).lean();
      await Notification.insertMany([
        { userId: req.user.userId, title: approved ? 'Estimate approved' : 'Estimate changes requested', message: `${quote.quoteReference} has been updated.`, type: approved ? 'success' : 'warning', priority: 'high', actionUrl: '#estimates', metadata: { orderId: order._id, outgoingQuoteId: quote._id } },
        ...staff.map(user => ({ userId: user._id, title: approved ? 'Client approved estimate' : 'Client requested estimate changes', message: `${payload.typedName} ${approved ? 'approved' : 'requested changes to'} ${quote.quoteReference}.`, type: approved ? 'success' : 'warning', priority: 'high', actionUrl: '#customer-approvals', metadata: { orderId: order._id, outgoingQuoteId: quote._id, customerQuoteDecisionId: decision._id } }))
      ], { session });
      await PortalActivity.create([{
        userId: req.user.userId, customerId: order.customerId, propertyId: order.propertyId, orderId: order._id,
        type: approved ? 'estimate_approved' : 'estimate_changes_requested',
        title: approved ? 'Estimate approved' : 'Estimate changes requested',
        summary: `${quote.quoteReference} · ${order.service}`,
        occurredAt: decisionAt
      }], { session });
      result = { duplicate: false, decision, quote, order };
    });
  } finally {
    await session.endSession();
  }
  memCache.del('orders:stats:v2');
  invalidateDashboardStatsCache();
  return result;
}

router.use(authenticateToken, checkRole(['residential']));

router.get('/estimates/:quoteId', async (req, res, next) => {
  try {
    const authorized = await authorizedQuote(req, res);
    if (!authorized) return;
    const vendor = await Vendor.findById(authorized.quote.vendorId).select(VENDOR_PUBLIC_FIELDS).lean();
    res.json({ estimate: serializeEstimate(authorized.quote, vendor) });
  } catch (error) { next(error); }
});

router.get('/estimates/:quoteId/pdf', async (req, res, next) => {
  try {
    const authorized = await authorizedQuote(req, res);
    if (!authorized) return;
    const vendor = await Vendor.findById(authorized.quote.vendorId).select(VENDOR_PUBLIC_FIELDS).lean();
    const pdfQuote = {
      ...authorized.quote,
      vendorSnapshot: vendor ? {
        licensedContractorName: vendor.legalBusinessName || vendor.name,
        licenseType: vendor.rocLicenseTypeClassification,
        rocNumber: vendor.rocLicenseNumber || vendor.rocNumber || vendor.contractorLicenseNumber
      } : {}
    };
    const pdf = await createOutgoingQuotePdf(pdfQuote);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${safeDownloadName(authorized.quote.quoteReference)}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.send(pdf);
  } catch (error) { next(error); }
});

router.post('/estimates/:quoteId/decision', actionLimiter, async (req, res, next) => {
  try {
    if (req.user.role !== 'residential') return res.status(403).json({ message: 'Only an authorized client can decide an estimate' });
    if (Buffer.byteLength(JSON.stringify(req.body || {})) > MAX_DECISION_BODY_BYTES) return res.status(413).json({ message: 'Decision request is too large' });
    const authorized = await authorizedQuote(req, res, { requireApproval: true });
    if (!authorized) return;
    const { payload, errors } = parseDecisionPayload(req.body);
    if (errors.length) return res.status(400).json({ message: errors.join('. ') });
    const result = await decideResidentialQuote(req, authorized, payload);
    const vendor = await Vendor.findById(result.quote.vendorId).select(VENDOR_PUBLIC_FIELDS).lean();
    res.status(result.duplicate ? 200 : 201).json({
      success: true,
      duplicate: result.duplicate,
      decision: result.decision.decision,
      decisionAt: result.decision.decisionAt,
      estimate: serializeEstimate(result.quote, vendor),
      order: serializeOrder(result.order)
    });
  } catch (error) { next(error); }
});

router.get('/billing', async (req, res, next) => {
  try {
    if (!req.query.propertyId) return res.status(400).json({ message: 'Property is required' });
    req.params.propertyId = req.query.propertyId;
    const found = await scopedProperty(req, res);
    if (!found) return;
    if (found.membership.permissions?.manageBilling !== true) return res.status(403).json({ message: 'You do not have billing permission for this property' });
    const customer = await Customer.findById(found.membership.customerId).select('+paymentProvider.name +paymentProvider.customerId');
    if (!customer) return res.status(409).json({ message: 'Billing account is unavailable' });
    const configured = paymentProviderConfigured();
    const methods = configured ? await listPaymentMethods(customer) : [];
    res.json({ provider: 'stripe', configured, methods, rawCardCollection: false });
  } catch (error) { next(error); }
});

async function hostedBillingSession(req, res, next, factory) {
  try {
    const propertyId = String(req.body?.propertyId || '');
    req.params.propertyId = propertyId;
    const found = await scopedProperty(req, res);
    if (!found) return;
    if (found.membership.permissions?.manageBilling !== true) return res.status(403).json({ message: 'You do not have billing permission for this property' });
    const customer = await Customer.findById(found.membership.customerId).select('+paymentProvider.name +paymentProvider.customerId');
    if (!customer) return res.status(409).json({ message: 'Billing account is unavailable' });
    const result = await factory(customer);
    if (!/^https:\/\/(?:checkout|billing)\.stripe\.com\//.test(result.url)) throw new Error('Payment provider returned an invalid hosted URL');
    res.status(201).json(result);
  } catch (error) { next(error); }
}

router.post('/billing/setup-session', actionLimiter, (req, res, next) => hostedBillingSession(req, res, next, createSetupSession));
router.post('/billing/portal-session', actionLimiter, (req, res, next) => hostedBillingSession(req, res, next, createBillingPortalSession));

router.post('/requests', requestLimiter, handleRequestUpload, async (req, res, next) => {
  let uploaded = { documents: [], fileIds: [] };
  try {
    const idempotencyKey = validateIdempotencyKey(req.get('Idempotency-Key'));
    if (!idempotencyKey) return res.status(400).json({ message: 'A valid Idempotency-Key header is required' });
    const existing = await Order.findOne({ portalSubmissionKey: submissionKey(req.user.userId, idempotencyKey) }).lean();
    if (existing) return res.status(200).json({ duplicate: true, order: serializeOrder(existing) });
    const { payload, errors } = validateRequestPayload(req.body, false);
    if (errors.length) return res.status(400).json({ message: errors[0], errors });
    req.params.propertyId = payload.propertyId;
    const found = await scopedProperty(req, res);
    if (!found) return;
    if (found.membership.permissions?.requestService !== true) return res.status(403).json({ message: 'You do not have permission to request service for this property' });
    uploaded = await uploadRequestFiles(req.files, req.user.userId);
    const creation = await createSharedResidentialOrder({ req, ...found, payload, documents: uploaded.documents, idempotencyKey });
    if (creation.duplicate) await deleteUploadedFiles(uploaded.fileIds);
    res.status(creation.duplicate ? 200 : 201).json({ duplicate: creation.duplicate, order: serializeOrder(creation.order) });
  } catch (error) {
    await deleteUploadedFiles(uploaded.fileIds);
    if (error?.code === 11000) {
      const key = validateIdempotencyKey(req.get('Idempotency-Key'));
      const duplicate = key ? await Order.findOne({ portalSubmissionKey: submissionKey(req.user.userId, key) }).lean() : null;
      if (duplicate) return res.status(200).json({ duplicate: true, order: serializeOrder(duplicate) });
    }
    next(error);
  }
});

router.post('/emergency-requests', requestLimiter, handleRequestUpload, async (req, res, next) => {
  let uploaded = { documents: [], fileIds: [] };
  try {
    const idempotencyKey = validateIdempotencyKey(req.get('Idempotency-Key'));
    if (!idempotencyKey) return res.status(400).json({ message: 'A valid Idempotency-Key header is required' });
    const existing = await Order.findOne({ portalSubmissionKey: submissionKey(req.user.userId, idempotencyKey) }).lean();
    if (existing) return res.status(200).json({ duplicate: true, order: serializeOrder(existing) });
    const { payload, errors } = validateRequestPayload(req.body, true);
    if (errors.length) return res.status(400).json({ message: errors[0], errors });
    req.params.propertyId = payload.propertyId;
    const found = await scopedProperty(req, res);
    if (!found) return;
    if (found.membership.permissions?.requestService !== true) return res.status(403).json({ message: 'You do not have permission to request service for this property' });
    uploaded = await uploadRequestFiles(req.files, req.user.userId);
    const creation = await createSharedResidentialOrder({ req, ...found, payload, documents: uploaded.documents, idempotencyKey });
    if (creation.duplicate) await deleteUploadedFiles(uploaded.fileIds);
    res.status(creation.duplicate ? 200 : 201).json({
      duplicate: creation.duplicate,
      message: 'Emergency request received. Submission does not guarantee emergency dispatch. If anyone is in immediate danger, call 911.',
      order: serializeOrder(creation.order)
    });
  } catch (error) {
    await deleteUploadedFiles(uploaded.fileIds);
    if (error?.code === 11000) {
      const key = validateIdempotencyKey(req.get('Idempotency-Key'));
      const duplicate = key ? await Order.findOne({ portalSubmissionKey: submissionKey(req.user.userId, key) }).lean() : null;
      if (duplicate) return res.status(200).json({ duplicate: true, order: serializeOrder(duplicate) });
    }
    next(error);
  }
});

router.post('/orders/:orderId/book-again', requestLimiter, async (req, res, next) => {
  try {
    const idempotencyKey = validateIdempotencyKey(req.get('Idempotency-Key'));
    if (!idempotencyKey) return res.status(400).json({ message: 'A valid Idempotency-Key header is required' });
    const existing = await Order.findOne({ portalSubmissionKey: submissionKey(req.user.userId, idempotencyKey) }).lean();
    if (existing) return res.status(200).json({ duplicate: true, order: serializeOrder(existing) });
    const original = await scopedOrder(req, res);
    if (!original) return;
    if (!requestCapabilities(original).canBookAgain) return res.status(409).json({ message: 'Only completed services can be booked again' });
    req.params.propertyId = String(original.propertyId);
    const found = await scopedProperty(req, res);
    if (!found) return;
    if (found.membership.permissions?.requestService !== true) return res.status(403).json({ message: 'You do not have permission to request service for this property' });
    const payload = {
      propertyId: String(original.propertyId),
      serviceCategory: original.residentialRequest?.serviceCategory || original.service,
      issueChips: original.residentialRequest?.issueChips || [],
      description: original.description || original.service,
      urgency: 'routine',
      preferredTiming: String(req.body?.preferredTiming || '').trim().slice(0, 500) || 'Please contact me to schedule',
      accessInstructions: String(req.body?.accessInstructions || '').trim().slice(0, 1000),
      emergencyDisclaimerAccepted: false
    };
    const creation = await createSharedResidentialOrder({ req, ...found, payload, idempotencyKey, repeatedFromOrder: original });
    res.status(creation.duplicate ? 200 : 201).json({ duplicate: creation.duplicate, order: serializeOrder(creation.order) });
  } catch (error) { next(error); }
});

router.post('/orders/:orderId/cancel-request', actionLimiter, async (req, res, next) => {
  try {
    const scoped = await scopedOrder(req, res);
    if (!scoped) return;
    if (!await canRequestForOrder(req.user.userId, scoped)) return res.status(403).json({ message: 'You do not have permission to change this order' });
    const validation = validateOrderAction(scoped, 'cancel', req.body);
    if (validation.error) return res.status(409).json({ message: validation.error });
    const updated = await recordResidentialOrderAction({ req, scoped, action: 'cancel', payload: validation.payload });
    res.json({ order: serializeOrder(updated) });
  } catch (error) { next(error); }
});

router.post('/orders/:orderId/reschedule-request', actionLimiter, async (req, res, next) => {
  try {
    const scoped = await scopedOrder(req, res);
    if (!scoped) return;
    if (!await canRequestForOrder(req.user.userId, scoped)) return res.status(403).json({ message: 'You do not have permission to change this order' });
    const validation = validateOrderAction(scoped, 'reschedule', req.body);
    if (validation.error) return res.status(409).json({ message: validation.error });
    const updated = await recordResidentialOrderAction({ req, scoped, action: 'reschedule', payload: validation.payload });
    res.json({ order: serializeOrder(updated) });
  } catch (error) { next(error); }
});

router.get('/me', async (req, res, next) => {
  try {
    const scope = await residentialScope(req.user.userId);
    const properties = scope.propertyIds.length
      ? await Property.find({ _id: { $in: scope.propertyIds }, status: 'active' }).sort({ label: 1, createdAt: 1 }).lean()
      : [];
    res.json({
      user: {
        id: req.user.userId,
        email: req.user.email,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        phone: req.user.phone,
        role: 'residential'
      },
      properties: properties.map(property => serializeProperty(property, scope.membershipByProperty.get(String(property._id))))
    });
  } catch (error) { next(error); }
});

router.post('/properties', actionLimiter, async (req, res, next) => {
  const payload = validateProperty(req.body);
  if (payload.errors.length) return res.status(400).json({ message: payload.errors.join('. ') });
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const user = await User.findOne({ _id: req.user.userId, role: 'residential', isActive: true }).session(session);
      if (!user) throw Object.assign(new Error('Residential access required'), { status: 403 });
      const owners = await PropertyMembership.find({ ...activeMembershipFilter(user._id), relationship: 'owner', 'permissions.manageProperty': true }).session(session).lean();
      const customerIds = [...new Set(owners.map(item => String(item.customerId)))];
      let customer = await Customer.findOne({ portalOwnerUserId: user._id }).session(session);
      if (!customer && customerIds.length === 1) customer = await Customer.findById(customerIds[0]).session(session);
      if (!customer && customerIds.length > 1) throw Object.assign(new Error('Your account has multiple owners. Contact support to connect this property.'), { status: 409 });
      if (!customer) {
        // An email match alone must never grant access to a legacy customer's records.
        if (await Customer.exists({ $or: [{ email: exactText(user.email) }, { 'emails.address': exactText(user.email) }] }).session(session)) throw Object.assign(new Error('Your customer account needs staff linking before adding properties.'), { status: 409 });
        customer = (await Customer.create([{ name: `${user.firstName} ${user.lastName}`.trim(), email: user.email, phone: user.phone, customerType: 'residential', portalOwnerUserId: user._id }], { session }))[0];
      }
      const legacyAddress = { addressLine1: exactText(payload.data.addressLine1), city: exactText(payload.data.city), state: exactText(payload.data.state), postalCode: exactText(payload.data.postalCode), $or: [{ addressLine2: exactText(payload.data.addressLine2) }, ...(payload.data.addressLine2 ? [] : [{ addressLine2: { $exists: false } }, { addressLine2: null }])] };
      const existing = await Property.findOne({ $or: [{ residentialAddressKey: payload.addressKey }, legacyAddress] }).session(session);
      if (existing) {
        const owner = owners.find(item => String(item.propertyId) === String(existing._id));
        if (!owner || existing.status !== 'active') throw Object.assign(new Error('This address requires staff review before it can be connected.'), { status: 409 });
        result = { data: serializeProperty(existing, owner), alreadyConnected: true }; return;
      }
      const property = (await Property.create([{ ...payload.data, ownerCustomerId: customer._id, residentialAddressKey: payload.addressKey, source: 'manual' }], { session }))[0];
      const membership = (await PropertyMembership.create([{ userId: user._id, propertyId: property._id, customerId: customer._id, relationship: 'owner', createdBy: user._id, permissions: { view: true, requestService: true, approveEstimates: true, manageBilling: true, manageProperty: true } }], { session }))[0];
      await PortalActivity.create([{ userId: user._id, customerId: customer._id, propertyId: property._id, type: 'property_added', title: 'Property added', summary: property.label }], { session });
      await SecurityAuditEvent.create([{ action: 'residential_property_added', userId: user._id, entityType: 'Property', entityId: String(property._id), ipAddress: req.ip, metadata: { authorityConfirmed: true, customerId: customer._id } }], { session });
      result = { data: serializeProperty(property, membership), alreadyConnected: false };
    });
    res.status(result.alreadyConnected ? 200 : 201).json(result);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'A matching record was created. Refresh your properties or contact support.' });
    if (error.status) return res.status(error.status).json({ message: error.message });
    next(error);
  } finally { await session.endSession(); }
});

router.get('/properties', async (req, res, next) => {
  try {
    const scope = await residentialScope(req.user.userId);
    const properties = scope.propertyIds.length
      ? await Property.find({ _id: { $in: scope.propertyIds }, status: 'active' }).sort({ label: 1, createdAt: 1 }).lean()
      : [];
    res.json({ data: properties.map(property => serializeProperty(property, scope.membershipByProperty.get(String(property._id)))) });
  } catch (error) { next(error); }
});

router.get('/properties/:propertyId', async (req, res, next) => {
  try {
    const found = await scopedProperty(req, res);
    if (!found) return;
    const [activeOrders, completedOrders] = await Promise.all([
      Order.countDocuments({ propertyId: found.property._id, workflowStatus: { $nin: ['completed'] } }),
      Order.countDocuments({ propertyId: found.property._id, workflowStatus: 'completed' })
    ]);
    res.json({
      property: serializeProperty(found.property, found.membership),
      summary: { activeOrders, completedOrders }
    });
  } catch (error) { next(error); }
});

router.get('/orders', async (req, res, next) => {
  try {
    const { page, limit, skip } = pageOptions(req.query);
    const scope = await residentialScope(req.user.userId);
    const match = { propertyId: { $in: scope.propertyIds } };
    if (req.query.propertyId) {
      if (!validId(req.query.propertyId) || !scope.membershipByProperty.has(String(req.query.propertyId))) {
        return res.status(404).json({ message: 'Property not found' });
      }
      match.propertyId = req.query.propertyId;
    }
    if (req.query.status) match.workflowStatus = String(req.query.status).slice(0, 80);
    const [total, orders] = await Promise.all([
      Order.countDocuments(match),
      Order.find(match).populate('vendor', VENDOR_PUBLIC_FIELDS).sort({ createdAt: -1 }).skip(skip).limit(limit).lean()
    ]);
    res.json({ data: orders.map(serializeOrder), pagination: pagination(total, page, limit) });
  } catch (error) { next(error); }
});

router.get('/orders/:orderId', async (req, res, next) => {
  try {
    const order = await scopedOrder(req, res);
    if (!order) return;
    const [estimate, schedule, invoice, completion, payment] = await Promise.all([
      OutgoingQuote.findOne({ orderId: order._id, status: { $in: ['sent', 'superseded'] } }).sort({ revisionNumber: -1 }).lean(),
      JobSchedule.findOne({ orderId: order._id, status: { $ne: 'revoked' } }).sort({ revisionNumber: -1 }).lean(),
      CustomerInvoice.findOne({ orderId: order._id }).lean(),
      JobCompletion.findOne({ orderId: order._id, status: { $ne: 'voided' } }).lean(),
      Payment.findOne({ order: order._id }).select('paymentId status amount paymentMethod paymentDate dueDate receiptNumber customerInvoiceId').lean()
    ]);
    const vendorId = estimate?.vendorId || schedule?.vendorId || order.vendor?._id;
    const vendor = vendorId ? await Vendor.findById(vendorId).select(VENDOR_PUBLIC_FIELDS).lean() : null;
    res.json({
      order: serializeOrder(order),
      estimate: estimate ? serializeEstimate(estimate, vendor) : null,
      schedule: schedule ? serializeSchedule(schedule, vendor) : null,
      completion: completion ? serializeCompletion(completion) : null,
      invoice: invoice ? serializeInvoice(invoice, payment, vendor) : null,
      tracker: workflowTracker(order, { estimate, schedule, completion, invoice, payment })
    });
  } catch (error) { next(error); }
});

router.get('/estimates', async (req, res, next) => {
  try {
    const { page, limit, skip } = pageOptions(req.query);
    const scope = await residentialScope(req.user.userId);
    const orderIds = scope.propertyIds.length
      ? await Order.find({ propertyId: { $in: scope.propertyIds } }).distinct('_id')
      : [];
    const match = { orderId: { $in: orderIds }, status: { $in: ['sent', 'superseded'] } };
    const [total, estimates] = await Promise.all([
      OutgoingQuote.countDocuments(match),
      OutgoingQuote.find(match).sort({ sentAt: -1, revisionNumber: -1 }).skip(skip).limit(limit).lean()
    ]);
    const vendors = await vendorMapFor(estimates.map(estimate => estimate.vendorId));
    res.json({ data: estimates.map(estimate => serializeEstimate(estimate, vendors.get(String(estimate.vendorId)))), pagination: pagination(total, page, limit) });
  } catch (error) { next(error); }
});

router.get('/schedules', async (req, res, next) => {
  try {
    const { page, limit, skip } = pageOptions(req.query);
    const scope = await residentialScope(req.user.userId);
    const orderIds = scope.propertyIds.length
      ? await Order.find({ propertyId: { $in: scope.propertyIds } }).distinct('_id')
      : [];
    const match = { orderId: { $in: orderIds }, status: { $ne: 'revoked' } };
    const [total, schedules] = await Promise.all([
      JobSchedule.countDocuments(match),
      JobSchedule.find(match).sort({ proposedStart: -1 }).skip(skip).limit(limit).lean()
    ]);
    const vendors = await vendorMapFor(schedules.map(schedule => schedule.vendorId));
    res.json({ data: schedules.map(schedule => serializeSchedule(schedule, vendors.get(String(schedule.vendorId)))), pagination: pagination(total, page, limit) });
  } catch (error) { next(error); }
});

router.get('/invoices', async (req, res, next) => {
  try {
    const { page, limit, skip } = pageOptions(req.query);
    const scope = await residentialScope(req.user.userId);
    const orderIds = scope.propertyIds.length
      ? await Order.find({ propertyId: { $in: scope.propertyIds } }).distinct('_id')
      : [];
    const match = { orderId: { $in: orderIds } };
    const [total, invoices] = await Promise.all([
      CustomerInvoice.countDocuments(match),
      CustomerInvoice.find(match).sort({ issuedAt: -1 }).skip(skip).limit(limit).lean()
    ]);
    const payments = invoices.length
      ? await Payment.find({ customerInvoiceId: { $in: invoices.map(item => item._id) } })
        .select('paymentId status amount paymentMethod paymentDate dueDate receiptNumber customerInvoiceId').lean()
      : [];
    const quotes = invoices.length
      ? await OutgoingQuote.find({ _id: { $in: invoices.map(item => item.outgoingQuoteId).filter(Boolean) } }).select('vendorId').lean()
      : [];
    const byInvoice = new Map(payments.map(item => [String(item.customerInvoiceId), item]));
    const quoteById = new Map(quotes.map(item => [String(item._id), item]));
    const vendors = await vendorMapFor(quotes.map(item => item.vendorId));
    res.json({
      data: invoices.map(invoice => {
        const quote = quoteById.get(String(invoice.outgoingQuoteId));
        return serializeInvoice(invoice, byInvoice.get(String(invoice._id)), vendors.get(String(quote?.vendorId)));
      }),
      pagination: pagination(total, page, limit)
    });
  } catch (error) { next(error); }
});

router.get('/activity', async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const scope = await residentialScope(req.user.userId);
    const [activities, notifications] = await Promise.all([
      PortalActivity.find({
        $or: [
          { userId: req.user.userId },
          { propertyId: { $in: scope.propertyIds } }
        ]
      }).sort({ occurredAt: -1 }).limit(limit).lean(),
      Notification.find({ userId: req.user.userId }).sort({ createdAt: -1 }).limit(limit).lean()
    ]);
    const data = [...activities.map(serializeActivity), ...notifications.map(serializeActivity)]
      .sort((left, right) => new Date(right.occurredAt) - new Date(left.occurredAt))
      .slice(0, limit);
    res.json({ data });
  } catch (error) { next(error); }
});

router.get('/documents', async (req, res, next) => {
  try {
    const scope = await residentialScope(req.user.userId);
    const [properties, orders] = await Promise.all([
      Property.find({ _id: { $in: scope.propertyIds }, status: 'active' }).select('documents').lean(),
      Order.find({ propertyId: { $in: scope.propertyIds } }).select('propertyId documents').lean()
    ]);
    const completions = orders.length
      ? await JobCompletion.find({ orderId: { $in: orders.map(item => item._id) }, status: { $ne: 'voided' } })
        .select('orderId beforePhotos afterPhotos').lean()
      : [];
    const data = [];
    properties.forEach(property => (property.documents || []).filter(item => item.status !== 'archived').forEach(document => {
      data.push({ source: 'property', propertyId: String(property._id), ...safeAttachment(document, `/api/residential/properties/${property._id}/documents/${encodeURIComponent(document.documentId)}`) });
    }));
    orders.forEach(order => (order.documents || []).filter(item => item.status !== 'archived').forEach(document => {
      data.push({ source: 'order', propertyId: String(order.propertyId), orderId: String(order._id), ...safeAttachment(document, `/api/residential/orders/${order._id}/documents/${encodeURIComponent(document.documentId)}`) });
    }));
    completions.forEach(completion => ['before', 'after'].forEach(phase => {
      (completion[`${phase}Photos`] || []).filter(item => item.status !== 'archived').forEach(document => {
        data.push({ source: `${phase}_photo`, orderId: String(completion.orderId), ...safeAttachment(document, `/api/residential/orders/${completion.orderId}/completion-photos/${phase}/${encodeURIComponent(document.documentId)}`) });
      });
    }));
    res.json({ data });
  } catch (error) { next(error); }
});

router.get('/properties/:propertyId/documents/:documentId', async (req, res, next) => {
  try {
    const found = await scopedProperty(req, res);
    if (!found) return;
    const document = (found.property.documents || []).find(item => item.documentId === req.params.documentId);
    return streamDocument(document, res, next, req.query.download === '1' ? 'attachment' : 'inline');
  } catch (error) { next(error); }
});

router.get('/orders/:orderId/documents/:documentId', async (req, res, next) => {
  try {
    const order = await scopedOrder(req, res);
    if (!order) return;
    const document = (order.documents || []).find(item => item.documentId === req.params.documentId);
    return streamDocument(document, res, next, req.query.download === '1' ? 'attachment' : 'inline');
  } catch (error) { next(error); }
});

router.get('/orders/:orderId/completion-photos/:phase/:documentId', async (req, res, next) => {
  try {
    const order = await scopedOrder(req, res);
    if (!order) return;
    if (!['before', 'after'].includes(req.params.phase)) return res.status(400).json({ message: 'Invalid photo phase' });
    const completion = await JobCompletion.findOne({ orderId: order._id, status: { $ne: 'voided' } }).lean();
    const document = (completion?.[`${req.params.phase}Photos`] || []).find(item => item.documentId === req.params.documentId);
    return streamDocument(document, res, next, req.query.download === '1' ? 'attachment' : 'inline');
  } catch (error) { next(error); }
});

router.get('/invoices/:invoiceId/pdf', async (req, res, next) => {
  try {
    if (!validId(req.params.invoiceId)) return res.status(400).json({ message: 'Invalid invoice id' });
    const scope = await residentialScope(req.user.userId);
    const invoice = await CustomerInvoice.findById(req.params.invoiceId).lean();
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    const owned = await Order.exists({ _id: invoice.orderId, propertyId: { $in: scope.propertyIds } });
    if (!owned) return res.status(404).json({ message: 'Invoice not found' });
    const quote = invoice.outgoingQuoteId ? await OutgoingQuote.findById(invoice.outgoingQuoteId).select('vendorId').lean() : null;
    const vendor = quote?.vendorId ? await Vendor.findById(quote.vendorId).select(VENDOR_PUBLIC_FIELDS).lean() : null;
    const pdf = await createCustomerInvoicePdf({
      ...invoice,
      contractor: vendor ? {
        name: vendor.legalBusinessName || vendor.name,
        licenseType: vendor.rocLicenseTypeClassification,
        rocNumber: vendor.rocLicenseNumber || vendor.rocNumber || vendor.contractorLicenseNumber
      } : undefined
    });
    await CustomerInvoice.updateOne({ _id: invoice._id }, { $set: { pdfGeneratedAt: new Date() } });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${safeDownloadName(invoice.invoiceNumber)}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.send(pdf);
  } catch (error) { next(error); }
});

router.get('/payments/:paymentId/receipt.pdf', async (req, res, next) => {
  try {
    if (!validId(req.params.paymentId)) return res.status(400).json({ message: 'Invalid payment id' });
    const scope = await residentialScope(req.user.userId);
    const payment = await Payment.findById(req.params.paymentId)
      .populate('customer', 'name email address')
      .populate('order', 'orderId service propertyId')
      .lean();
    if (!payment?.order || !scope.membershipByProperty.has(String(payment.order.propertyId))) return res.status(404).json({ message: 'Receipt not found' });
    if (!['received', 'completed'].includes(payment.status)) return res.status(409).json({ message: 'A receipt is available after payment is received' });
    const pdf = await createPaymentReceiptPdf(payment);
    const reference = payment.receiptNumber || `RCPT-${payment.paymentId || payment._id}`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${safeDownloadName(reference)}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.send(pdf);
  } catch (error) { next(error); }
});

router.use((error, _req, res, _next) => {
  console.error('Residential portal error:', error?.name || 'Error', error?.message || '');
  const status = error.status || (['ValidationError', 'CastError'].includes(error.name) ? 400 : 500);
  res.status(status).json({ message: status === 500 ? 'Residential portal request failed' : error.message });
});

router.__test = { activeMembershipFilter, pageOptions, validId };

module.exports = router;
