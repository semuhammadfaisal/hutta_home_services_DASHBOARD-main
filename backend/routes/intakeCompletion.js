const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const multer = require('multer');
const { GridFSBucket } = require('mongodb');
const IntakeSubmission = require('../models/IntakeSubmission');
const Notification = require('../models/Notification');
const Order = require('../models/Order');
const { synchronizeWorkflowOrder } = require('../utils/workflowSync');
const User = require('../models/User');
const memCache = require('../utils/memoryCache');
const { invalidateDashboardStatsCache } = require('../utils/dashboardStatsCache');
const { hashToken, parseCompletionPayload } = require('../utils/intakeCompletion');

const router = express.Router();
const MAX_FILES = 6;
const MAX_FILE_BYTES = Math.min(parseInt(process.env.MAX_UPLOAD_BYTES || `${10 * 1024 * 1024}`, 10), 10 * 1024 * 1024);
const allowedExtensions = new Set(['pdf', 'jpg', 'jpeg', 'png']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
  fileFilter: (_req, file, callback) => {
    const extension = String(file.originalname || '').split('.').pop().toLowerCase();
    callback(allowedExtensions.has(extension) ? null : new Error('Only PDF, JPG, and PNG files are allowed'), allowedExtensions.has(extension));
  }
}).array('documents', MAX_FILES);
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again later.' }
});

function noStore(_req, res, next) {
  res.set({ 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff' });
  next();
}

function uploadMiddleware(req, res, next) {
  upload(req, res, error => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'Each attachment must be 10 MB or smaller' });
    return res.status(400).json({ message: error.message || 'Attachment upload failed' });
  });
}

function fileSignatureValid(file) {
  const extension = String(file.originalname || '').split('.').pop().toLowerCase();
  const buffer = file.buffer || Buffer.alloc(0);
  if (extension === 'pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  if (extension === 'png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return (extension === 'jpg' || extension === 'jpeg') && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

async function findIntakeByToken(token) {
  if (token.length < 32 || token.length > 100) return null;
  await IntakeSubmission.updateOne({
    completionTokenHash: hashToken(token),
    completionStatus: 'processing',
    completionStartedAt: { $lt: new Date(Date.now() - 15 * 60 * 1000) },
    completionTokenExpiresAt: { $gt: new Date() }
  }, { $set: { completionStatus: 'pending' }, $unset: { completionStartedAt: '' } });
  return IntakeSubmission.findOne({
    completionTokenHash: hashToken(token),
    completionStatus: { $in: ['pending', 'processing', 'completed'] },
    completionTokenExpiresAt: { $gt: new Date() }
  }).select('+completionTokenHash');
}

async function publicIntake(req, res, next) {
  try {
    const token = String(req.get('x-intake-completion-token') || '');
    const intake = await findIntakeByToken(token);
    if (!intake) return res.status(410).json({ message: 'This request link is invalid or has expired. Please contact smplfix.' });
    req.intake = intake;
    req.intakeToken = token;
    next();
  } catch (error) {
    next(error);
  }
}

async function storeFiles(files, order, intake) {
  if (!files?.length) return [];
  const invalid = files.find(file => !fileSignatureValid(file));
  if (invalid) throw Object.assign(new Error(`${invalid.originalname} does not match its declared file type`), { status: 400 });
  const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
  const attachments = [];
  for (const file of files) {
    const documentId = crypto.randomUUID();
    const safeName = String(file.originalname || 'request-document').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120);
    const filename = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${safeName}`;
    const fileId = await new Promise((resolve, reject) => {
      const stream = bucket.openUploadStream(filename, { metadata: { documentId, entityType: 'order', entityId: order._id, intakeSubmissionId: intake._id, originalName: file.originalname, linkStatus: 'linked' } });
      stream.once('error', reject);
      stream.once('finish', () => resolve(stream.id));
      stream.end(file.buffer);
    });
    attachments.push({ documentId, name: file.originalname, url: `/uploads/${filename}`, type: file.mimetype || 'application/octet-stream', size: file.size, storageProvider: 'gridfs', fileId, uploadedAt: new Date(), uploadedBy: `customer:${intake.requestReference}`, uploadedByEmail: intake.normalizedCustomer.email, status: 'active' });
  }
  return attachments;
}

router.get('/public/view', publicLimiter, noStore, publicIntake, async (req, res, next) => {
  try {
    const order = await Order.findById(req.intake.orderId).select('requestReference customer service description customerIntake workflowStatus').lean();
    if (!order) return res.status(410).json({ message: 'This service request is no longer available' });
    res.json({
      requestReference: req.intake.requestReference,
      customerName: order.customer?.name || req.intake.normalizedCustomer.name,
      customerEmail: order.customer?.email || req.intake.normalizedCustomer.email,
      customerPhone: order.customer?.phone || req.intake.normalizedCustomer.phone,
      serviceCategory: order.service === 'Unclassified Website Request' ? '' : order.service,
      serviceAddress: order.customer?.address || '',
      serviceDetails: order.description || '',
      propertyType: order.customerIntake?.propertyType || '',
      preferredTiming: order.customerIntake?.preferredTiming || '',
      accessInstructions: order.customerIntake?.accessInstructions || '',
      completionStatus: req.intake.completionStatus,
      completedAt: req.intake.completedAt,
      expiresAt: req.intake.completionTokenExpiresAt,
      advancedToQuoteCollection: order.workflowStatus === 'quote_collection',
      requiresReview: Boolean(req.intake.requiresReview)
    });
  } catch (error) {
    next(error);
  }
});

router.post('/public/complete', publicLimiter, noStore, publicIntake, uploadMiddleware, async (req, res, next) => {
  const intake = req.intake;
  if (intake.completionStatus === 'completed') {
    const order = await Order.findById(intake.orderId).select('workflowStatus').lean();
    return res.json({ success: true, duplicate: true, requestReference: intake.requestReference, status: order?.workflowStatus === 'quote_collection' ? 'quote_collection' : 'review_required', completedAt: intake.completedAt });
  }
  if (intake.completionStatus === 'processing') return res.status(409).json({ message: 'This request is already being completed. Please wait and try again.' });

  const { payload, errors } = parseCompletionPayload(req.body);
  if (errors.length) return res.status(400).json({ message: errors.join('. ') });
  const claimed = await IntakeSubmission.findOneAndUpdate({
    _id: intake._id,
    completionTokenHash: hashToken(req.intakeToken),
    completionStatus: 'pending',
    completionTokenExpiresAt: { $gt: new Date() }
  }, { $set: { completionStatus: 'processing', completionStartedAt: new Date() } }, { new: true }).select('+completionTokenHash');
  if (!claimed) return res.status(409).json({ message: 'This request is already being completed.' });

  let attachments = [];
  try {
    const order = await Order.findById(claimed.orderId);
    if (!order || !['request_received', 'quote_collection'].includes(order.workflowStatus)) throw Object.assign(new Error('This request can no longer be changed through this link'), { status: 409 });
    attachments = await storeFiles(req.files, order, claimed);
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const currentIntake = await IntakeSubmission.findOne({ _id: claimed._id, completionStatus: 'processing' }).session(session);
        const currentOrder = await Order.findById(claimed.orderId).session(session);
        if (!currentIntake || !currentOrder) throw Object.assign(new Error('This request has already been completed'), { status: 409 });
        const now = new Date();
        const requiresReview = Boolean(currentIntake.requiresReview || currentOrder.requiresIntakeReview);
        currentOrder.service = payload.serviceCategory;
        currentOrder.customer.address = payload.serviceAddress;
        currentOrder.description = payload.serviceDetails;
        currentOrder.customerIntake = { propertyType: payload.propertyType, preferredTiming: payload.preferredTiming, accessInstructions: payload.accessInstructions, completedAt: now };
        currentOrder.missingData = { serviceCategory: false, serviceAddress: false };
        currentOrder.pricingStatus = 'unquoted';
        currentOrder.amount = null;
        currentOrder.documents.push(...attachments);
        const sync = await synchronizeWorkflowOrder(currentOrder, requiresReview ? 'request_received' : 'quote_collection', { session });

        currentIntake.completionStatus = 'completed';
        currentIntake.completedAt = now;
        currentIntake.completionStartedAt = undefined;
        currentIntake.completionSnapshot = { ...payload, submittedAt: now, documentCount: attachments.length };
        await currentIntake.save({ session });

        const staff = await User.find({ isActive: true, role: { $in: ['admin', 'manager', 'account_rep'] } }).select('_id').session(session).lean();
        if (staff.length) await Notification.insertMany(staff.map(user => ({
          userId: user._id,
          title: requiresReview ? 'Customer details completed — review required' : 'Customer completed service request',
          message: `${currentIntake.requestReference} ${requiresReview ? 'is ready for customer-match review.' : 'has moved to vendor quote collection.'}`,
          type: requiresReview ? 'warning' : 'success',
          priority: 'high',
          actionUrl: requiresReview ? '#workflow-center/stage-1' : '#workflow-center/stage-2',
          metadata: { intakeSubmissionId: currentIntake._id, orderId: currentOrder._id, requestReference: currentIntake.requestReference }
        })), { session });
        result = { success: true, duplicate: false, requestReference: currentIntake.requestReference, status: requiresReview ? 'review_required' : 'quote_collection', completedAt: now, sync };
      });
    } finally {
      await session.endSession();
    }
    memCache.del('orders:stats:v2');
    invalidateDashboardStatsCache();
    res.status(201).json(result);
  } catch (error) {
    await IntakeSubmission.updateOne({ _id: claimed._id, completionStatus: 'processing' }, { $set: { completionStatus: 'pending' }, $unset: { completionStartedAt: '' } });
    next(error);
  }
});

router.use((error, _req, res, _next) => {
  res.status(error.status || 500).json({ message: error.status ? error.message : 'Unable to complete this service request' });
});

module.exports = router;
