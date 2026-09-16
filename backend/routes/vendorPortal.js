const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const { GridFSBucket, ObjectId } = require('mongodb');
const { encryptTaxId } = require('../utils/taxIdCrypto');
const { applyComputedPortalStatus, ACTIVE_DOCUMENT_TYPES } = require('../utils/vendorCompliance');
const { loadVendorAccess, requireVendorPermission } = require('../utils/vendorPortalAccess');
const { assertNoVendorPrivateData, serializeMembership, serializeVendor } = require('../utils/vendorSerializers');
const { configured, createHostedOnboarding, refreshConnectStatus } = require('../utils/vendorConnectProvider');
const { verifyVendorRoc } = require('../utils/rocVerificationProvider');
const VendorPortalMembership = require('../models/VendorPortalMembership');
const VendorEstimateDraft = require('../models/VendorEstimateDraft');
const IncomingQuote = require('../models/IncomingQuote');
const JobCompletion = require('../models/JobCompletion');
const JobSchedule = require('../models/JobSchedule');
const Notification = require('../models/Notification');
const Order = require('../models/Order');
const QuoteInvitation = require('../models/QuoteInvitation');
const SecurityAuditEvent = require('../models/SecurityAuditEvent');
const User = require('../models/User');
const VendorAssignmentMessage = require('../models/VendorAssignmentMessage');
const VendorInvoice = require('../models/VendorInvoice');
const VendorPayout = require('../models/VendorPayout');
const VendorPerformanceEvent = require('../models/VendorPerformanceEvent');
const VendorScheduleDecision = require('../models/VendorScheduleDecision');
const VendorWorkOrder = require('../models/VendorWorkOrder');
const { vendorSnapshot } = require('../utils/incomingQuotes');
const { activeCompliance } = require('../utils/vendorLeadDistribution');
const { recordBidSubmission, respondToLead } = require('../utils/vendorLeadResponses');
const { serializeVendorLead } = require('../utils/vendorLeadSerializers');
const { cents, clean: cleanEstimate, dollars, normalizeLineItems, serializeVendorEstimateDraft } = require('../utils/vendorEstimateDrafts');
const { parseVendorEstimate } = require('../utils/vendorEstimateParserProvider');
const { nextCompletionReference } = require('../utils/closeout');
const { nextWorkOrderReference, scheduleSnapshotHash, workOrderSnapshotHash } = require('../utils/scheduling');
const { expirationWarnings, findAssignment, redactContact, serializeAssignment, transition } = require('../utils/vendorAssignments');
const { normalizeInvoiceLines, normalizeInvoiceNumber, serializeVendorInvoice } = require('../utils/vendorBilling');
const { summary: vendorPerformanceSummary } = require('../utils/vendorPerformance');

const router = express.Router();
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const DOCUMENT_TYPES = new Set(Object.keys(ACTIVE_DOCUMENT_TYPES));
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: MAX_FILE_BYTES } }).single('document');
const ESTIMATE_FILE_BYTES = 20 * 1024 * 1024;
const ESTIMATE_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const estimateUpload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: ESTIMATE_FILE_BYTES }, fileFilter: (_req, file, callback) => callback(ESTIMATE_MIME.has(file.mimetype) ? null : new Error('Only PDF, JPEG, PNG, and WebP estimate files are allowed'), ESTIMATE_MIME.has(file.mimetype)) }).single('estimate');
const ASSIGNMENT_PHOTO_BYTES = 10 * 1024 * 1024;
const ASSIGNMENT_PHOTO_COUNT = 5;
const assignmentPhotoUpload = multer({ storage: multer.memoryStorage(), limits: { files: ASSIGNMENT_PHOTO_COUNT * 2, fileSize: ASSIGNMENT_PHOTO_BYTES }, fileFilter: (_req, file, callback) => callback(['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype) ? null : new Error('Only JPEG, PNG, and WebP completion photos are allowed'), ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) }).fields([{ name: 'beforePhotos', maxCount: ASSIGNMENT_PHOTO_COUNT }, { name: 'afterPhotos', maxCount: ASSIGNMENT_PHOTO_COUNT }]);
const invoiceUpload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: 15 * 1024 * 1024 }, fileFilter: (_req, file, callback) => callback(ESTIMATE_MIME.has(file.mimetype) ? null : new Error('Only PDF, JPEG, PNG, and WebP invoice files are allowed'), ESTIMATE_MIME.has(file.mimetype)) }).single('invoiceDocument');

function clean(value, max = 500) { return String(value || '').trim().slice(0, max); }
function cleanList(value, limit = 100) { return [...new Set((Array.isArray(value) ? value : []).map(item => clean(item, 80)).filter(Boolean))].slice(0, limit); }
function validDate(value) { return value && !Number.isNaN(Date.parse(value)) ? new Date(value) : null; }
function validFile(file) {
  if (!file) return false;
  const bytes = file.buffer || Buffer.alloc(0);
  if (file.mimetype === 'application/pdf') return bytes.subarray(0, 5).toString() === '%PDF-';
  if (file.mimetype === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (file.mimetype === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return false;
}
function validEstimateFile(file) {
  if (!file || !ESTIMATE_MIME.has(file.mimetype)) return false;
  const bytes = file.buffer || Buffer.alloc(0);
  if (file.mimetype === 'application/pdf') return bytes.subarray(0, 5).toString() === '%PDF-';
  if (file.mimetype === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (file.mimetype === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.mimetype === 'image/webp') return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  return false;
}
function storeFile(file, metadata) {
  return new Promise((resolve, reject) => {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return reject(new Error('File storage is unavailable'));
    const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
    const safeName = clean(file.originalname, 120).replace(/[^a-zA-Z0-9._-]+/g, '_') || 'document';
    const stream = bucket.openUploadStream(`${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${safeName}`, { metadata });
    stream.once('error', reject);
    stream.once('finish', () => resolve(stream.id));
    stream.end(file.buffer);
  });
}
function assignmentPhotoMiddleware(req, res, next) {
  assignmentPhotoUpload(req, res, error => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'Each completion photo must be 10 MB or smaller' });
    return res.status(400).json({ message: error.message || 'Completion photo upload failed' });
  });
}
function invoiceUploadMiddleware(req, res, next) {
  invoiceUpload(req, res, error => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'Invoice document must be 15 MB or smaller' });
    return res.status(400).json({ message: error.message || 'Invoice upload failed' });
  });
}
function validPhoto(file) { return file && validEstimateFile(file) && file.mimetype !== 'application/pdf'; }
async function scopedAssignment(req) {
  if (!mongoose.Types.ObjectId.isValid(req.params.assignmentId)) return null;
  const order = await Order.findOne({ vendorAssignments: { $elemMatch: { _id: req.params.assignmentId, vendor: req.vendorRecord._id } } });
  if (!order) return null;
  const assignment = findAssignment(order, req.params.assignmentId, req.vendorRecord._id);
  return assignment ? { order, assignment } : null;
}
async function assignmentSchedule(order, assignment) {
  if (assignment.jobScheduleId) return JobSchedule.findOne({ _id: assignment.jobScheduleId, orderId: order._id, vendorId: assignment.vendor });
  return JobSchedule.findOne({ orderId: order._id, vendorId: assignment.vendor, $or: [{ assignmentId: assignment._id }, { assignmentId: { $exists: false } }] }).sort({ revisionNumber: -1 });
}
async function saveAssignmentPhotos(files, completion, category, user) {
  if ((files || []).some(file => !validPhoto(file))) throw Object.assign(new Error(`A ${category} photo is malformed or does not match its declared type`), { status: 400 });
  const output = [];
  for (const file of files || []) {
    const documentId = crypto.randomUUID();
    const fileId = await storeFile(file, { source: 'vendor-portal-completion', entityType: 'vendor-assignment', entityId: String(completion.assignmentId), orderId: String(completion.orderId), jobCompletionId: String(completion._id), vendorId: String(completion.vendorId), documentId, category, linkStatus: 'linked' });
    output.push({ documentId, name: clean(file.originalname, 160), url: `/api/vendor-portal/assignments/${completion.assignmentId}/completion-files/${documentId}`, type: file.mimetype, size: file.size, fileId, storageProvider: 'gridfs', uploadedAt: new Date(), uploadedBy: String(user.userId), uploadedByEmail: user.email, status: 'active', complianceDocumentType: `completion_${category}` });
  }
  return output;
}

router.use(loadVendorAccess);

router.get('/me', (req, res) => {
  const payload = { vendor: serializeVendor(req.vendorRecord), membership: serializeMembership(req.vendorMembership), stripeConnectConfigured: configured() };
  res.set('Cache-Control', 'private, no-store').json(assertNoVendorPrivateData(payload));
});

async function notifyStaff(title, message, metadata) {
  const users = await User.find({ isActive: true, role: { $in: ['admin', 'manager', 'account_rep'] } }).select('_id').lean();
  if (users.length) await Notification.insertMany(users.map(user => ({ userId: user._id, title, message, type: 'order', priority: 'high', actionUrl: '#incoming-quotes', metadata })));
}

async function scopedLead(req, statuses = ['accepted_to_bid']) {
  if (!mongoose.Types.ObjectId.isValid(req.params.invitationId)) return null;
  const query = { _id: req.params.invitationId, vendorId: req.vendorRecord._id, responseRequired: true, status: { $in: statuses } };
  if (statuses.includes('submitted')) query.$or = [{ status: 'submitted' }, { expiresAt: { $gt: new Date() } }];
  else query.expiresAt = { $gt: new Date() };
  return QuoteInvitation.findOne(query);
}

async function findOrCreateEstimateDraft(invitation, userId) {
  let draft = await VendorEstimateDraft.findOne({ invitationId: invitation._id }).select('+sourceFiles.fileId +sourceFiles.sha256 +parserAudit.sourceSha256');
  if (!draft) draft = await VendorEstimateDraft.create({ invitationId: invitation._id, quoteId: invitation.quoteId, orderId: invitation.orderId, vendorId: invitation.vendorId, source: 'manual', sourceFiles: [], parserAudit: { status: 'not_requested' }, reviewedBy: userId });
  return draft;
}

router.get('/assignments', requireVendorPermission('assignments'), async (req, res, next) => {
  try {
    const orders = await Order.find({ 'vendorAssignments.vendor': req.vendorRecord._id }).sort({ 'vendorAssignments.scheduledStart': 1 });
    const assignments = orders.flatMap(order => order.vendorAssignments.filter(item => String(item.vendor) === String(req.vendorRecord._id)).map(item => ({ order, item })));
    const assignmentIds = assignments.map(entry => entry.item._id);
    const [schedules, completions, messages] = await Promise.all([
      JobSchedule.find({ vendorId: req.vendorRecord._id, $or: [{ assignmentId: { $in: assignmentIds } }, { orderId: { $in: orders.map(order => order._id) }, assignmentId: { $exists: false } }] }).sort({ revisionNumber: -1 }).lean(),
      JobCompletion.find({ vendorId: req.vendorRecord._id, assignmentId: { $in: assignmentIds } }).lean(),
      VendorAssignmentMessage.find({ vendorId: req.vendorRecord._id, assignmentId: { $in: assignmentIds }, status: 'sent' }).sort({ createdAt: 1 }).lean()
    ]);
    const warnings = expirationWarnings(req.vendorRecord);
    const payload = assignments.map(({ order, item }) => {
      const schedule = schedules.find(value => String(value.assignmentId || '') === String(item._id)) || (assignments.filter(entry => String(entry.order._id) === String(order._id) && String(entry.item.vendor) === String(item.vendor)).length === 1 ? schedules.find(value => String(value.orderId) === String(order._id) && !value.assignmentId) : null);
      return serializeAssignment(order, item, { schedule, completion: completions.find(value => String(value.assignmentId) === String(item._id)), messages: messages.filter(value => String(value.assignmentId) === String(item._id)), complianceWarnings: warnings, vendorLicensed: req.vendorRecord.licensedTrade });
    });
    res.set('Cache-Control', 'private, no-store').json({ assignments: payload, complianceWarnings: warnings });
  } catch (error) { next(error); }
});

router.get('/assignments/:assignmentId', requireVendorPermission('assignments'), async (req, res, next) => {
  try {
    const scoped = await scopedAssignment(req); if (!scoped) return res.status(404).json({ message: 'Assignment not found' });
    const [schedule, completion, messages] = await Promise.all([assignmentSchedule(scoped.order, scoped.assignment), JobCompletion.findOne({ orderId: scoped.order._id, assignmentId: scoped.assignment._id, vendorId: req.vendorRecord._id }).lean(), VendorAssignmentMessage.find({ assignmentId: scoped.assignment._id, vendorId: req.vendorRecord._id, status: 'sent' }).sort({ createdAt: 1 }).lean()]);
    res.set('Cache-Control', 'private, no-store').json({ assignment: serializeAssignment(scoped.order, scoped.assignment, { schedule, completion, messages, complianceWarnings: expirationWarnings(req.vendorRecord), vendorLicensed: req.vendorRecord.licensedTrade }) });
  } catch (error) { next(error); }
});

router.post('/assignments/:assignmentId/schedule-response', requireVendorPermission('assignments'), async (req, res, next) => {
  try {
    const scoped = await scopedAssignment(req); if (!scoped) return res.status(404).json({ message: 'Assignment not found' });
    const schedule = await assignmentSchedule(scoped.order, scoped.assignment);
    if (!schedule || schedule.status !== 'pending_vendor' || schedule.proposedStart <= new Date()) return res.status(409).json({ message: 'This schedule is no longer awaiting a response' });
    const action = clean(req.body.action, 40); const typedName = clean(req.body.typedName, 160); const changeRequestMessage = clean(req.body.changeRequestMessage, 3000);
    if (!['accept', 'request_changes'].includes(action) || typedName.length < 2) return res.status(400).json({ message: 'Choose a schedule response and enter your full name' });
    if (action === 'request_changes' && changeRequestMessage.length < 10) return res.status(400).json({ message: 'Explain the requested schedule change using at least 10 characters' });
    if (action === 'accept' && !activeCompliance(req.vendorRecord, schedule.proposedEnd)) return res.status(409).json({ message: 'Compliance must remain current through the scheduled visit' });
    if (action === 'accept') {
      const conflict = await JobSchedule.findOne({ _id: { $ne: schedule._id }, vendorId: req.vendorRecord._id, status: 'accepted', proposedStart: { $lt: schedule.proposedEnd }, proposedEnd: { $gt: schedule.proposedStart } }).select('scheduleReference proposedStart proposedEnd').lean();
      if (conflict) return res.status(409).json({ message: 'This visit conflicts with another confirmed assignment', conflict: { reference: conflict.scheduleReference, start: conflict.proposedStart, end: conflict.proposedEnd } });
    }
    const decisionStatus = action === 'accept' ? 'accepted' : 'changes_requested';
    if (await VendorScheduleDecision.exists({ jobScheduleId: schedule._id })) return res.status(409).json({ message: 'A schedule response has already been recorded' });
    const decision = await VendorScheduleDecision.create({ jobScheduleId: schedule._id, orderId: scoped.order._id, vendorId: req.vendorRecord._id, decision: decisionStatus, typedName, changeRequestMessage: decisionStatus === 'changes_requested' ? changeRequestMessage : undefined, decisionAt: new Date(), scheduleReference: schedule.scheduleReference, revisionNumber: schedule.revisionNumber, scheduleSnapshotHash: scheduleSnapshotHash(schedule), ipAddress: clean(req.ip, 128), userAgent: clean(req.get('user-agent'), 1000), source: 'vendor_portal' });
    schedule.status = decisionStatus; schedule[decisionStatus === 'accepted' ? 'acceptedAt' : 'changesRequestedAt'] = decision.decisionAt; schedule.history.push({ action: decisionStatus, actorId: req.user.userId, actorEmail: req.user.email, message: decisionStatus === 'accepted' ? `Accepted by ${typedName}` : changeRequestMessage }); await schedule.save();
    if (decisionStatus === 'accepted') {
      let workOrder = await VendorWorkOrder.findOne({ jobScheduleId: schedule._id });
      if (!workOrder) { const data = { workOrderReference: await nextWorkOrderReference(), orderId: scoped.order._id, assignmentId: scoped.assignment._id, jobScheduleId: schedule._id, outgoingQuoteId: schedule.outgoingQuoteId, vendorId: req.vendorRecord._id, revisionNumber: schedule.revisionNumber, customerSnapshot: schedule.customerSnapshot.toObject?.() || schedule.customerSnapshot, vendorSnapshot: schedule.vendorSnapshot.toObject?.() || schedule.vendorSnapshot, jobSnapshot: schedule.jobSnapshot.toObject?.() || schedule.jobSnapshot, scheduledStart: schedule.proposedStart, scheduledEnd: schedule.proposedEnd, timezone: schedule.timezone, accessInstructions: schedule.accessInstructions, generatedAt: new Date() }; data.snapshotHash = workOrderSnapshotHash(data); workOrder = await VendorWorkOrder.create(data); }
      let completion = await JobCompletion.findOne({ orderId: scoped.order._id, assignmentId: scoped.assignment._id });
      if (!completion) completion = await JobCompletion.create({ completionReference: await nextCompletionReference(), orderId: scoped.order._id, assignmentId: scoped.assignment._id, jobScheduleId: schedule._id, outgoingQuoteId: schedule.outgoingQuoteId, vendorWorkOrderId: workOrder._id, customerId: scoped.order.customerId, vendorId: req.vendorRecord._id, status: 'pending', customerSnapshot: schedule.customerSnapshot, vendorSnapshot: schedule.vendorSnapshot, scheduleSnapshot: { scheduleReference: schedule.scheduleReference, scheduledStart: schedule.proposedStart, scheduledEnd: schedule.proposedEnd, timezone: schedule.timezone, accessInstructions: schedule.accessInstructions }, jobSnapshot: schedule.jobSnapshot, approvedTotal: Number(scoped.order.amount || 0), createdBy: req.user.userId, history: [{ action: 'assignment_schedule_accepted', actorType: 'vendor', actorId: req.user.userId, actorEmail: req.user.email }] });
      scoped.assignment.jobScheduleId = schedule._id; scoped.assignment.vendorWorkOrderId = workOrder._id; scoped.assignment.jobCompletionId = completion._id; scoped.assignment.scheduledStart = schedule.proposedStart; scoped.assignment.scheduledEnd = schedule.proposedEnd; scoped.assignment.accessInstructions = schedule.accessInstructions; if ((scoped.assignment.status || 'assigned') === 'assigned') scoped.assignment.status = 'schedule_pending'; transition(scoped.assignment, 'scheduled', { type: 'vendor', id: req.user.userId }, `Accepted ${schedule.scheduleReference}`);
    } else { if ((scoped.assignment.status || 'assigned') === 'assigned') scoped.assignment.status = 'schedule_pending'; transition(scoped.assignment, 'schedule_changes_requested', { type: 'vendor', id: req.user.userId }, changeRequestMessage); }
    await scoped.order.save();
    await Promise.all([notifyStaff(decisionStatus === 'accepted' ? 'Vendor accepted assignment schedule' : 'Vendor requested schedule changes', `${req.vendorRecord.name} responded to ${schedule.scheduleReference}.`, { orderId: scoped.order._id, assignmentId: scoped.assignment._id, jobScheduleId: schedule._id, vendorId: req.vendorRecord._id }), SecurityAuditEvent.create({ action: `vendor_assignment_schedule_${decisionStatus}`, userId: req.user.userId, userEmail: req.user.email, entityType: 'VendorAssignment', entityId: String(scoped.assignment._id), ipAddress: req.ip, userAgent: req.get('user-agent'), metadata: { orderId: scoped.order._id, vendorId: req.vendorRecord._id, jobScheduleId: schedule._id } })]);
    res.status(201).json({ assignment: serializeAssignment(scoped.order, scoped.assignment, { schedule, complianceWarnings: expirationWarnings(req.vendorRecord) }) });
  } catch (error) { if (error?.code === 11000) return res.status(409).json({ message: 'A schedule response has already been recorded' }); next(error); }
});

router.patch('/assignments/:assignmentId/status', requireVendorPermission('assignments'), async (req, res, next) => {
  try {
    const scoped = await scopedAssignment(req); if (!scoped) return res.status(404).json({ message: 'Assignment not found' });
    const nextStatus = clean(req.body.status, 40);
    if (!['en_route', 'in_progress'].includes(nextStatus)) return res.status(400).json({ message: 'Vendors may update an assignment only to en route or in progress' });
    if (scoped.assignment.status === nextStatus) return res.json({ assignment: serializeAssignment(scoped.order, scoped.assignment) });
    transition(scoped.assignment, nextStatus, { type: 'vendor', id: req.user.userId }, clean(req.body.note, 500)); await scoped.order.save();
    await SecurityAuditEvent.create({ action: `vendor_assignment_${nextStatus}`, userId: req.user.userId, userEmail: req.user.email, entityType: 'VendorAssignment', entityId: String(scoped.assignment._id), ipAddress: req.ip, userAgent: req.get('user-agent'), metadata: { orderId: scoped.order._id, vendorId: req.vendorRecord._id } });
    res.json({ assignment: serializeAssignment(scoped.order, scoped.assignment) });
  } catch (error) { next(error); }
});

router.post('/assignments/:assignmentId/messages', requireVendorPermission('assignments'), async (req, res, next) => {
  try {
    const scoped = await scopedAssignment(req); if (!scoped) return res.status(404).json({ message: 'Assignment not found' });
    const body = redactContact(clean(req.body.body, 3000)); if (!body) return res.status(400).json({ message: 'Message is required' });
    const message = await VendorAssignmentMessage.create({ assignmentId: scoped.assignment._id, orderId: scoped.order._id, vendorId: req.vendorRecord._id, senderType: 'vendor', senderUserId: req.user.userId, body });
    await Promise.all([notifyStaff('Vendor assignment message', `${req.vendorRecord.name} sent a message for ${scoped.order.orderId}.`, { orderId: scoped.order._id, assignmentId: scoped.assignment._id, vendorId: req.vendorRecord._id }), SecurityAuditEvent.create({ action: 'vendor_assignment_message_sent', userId: req.user.userId, userEmail: req.user.email, entityType: 'VendorAssignment', entityId: String(scoped.assignment._id), ipAddress: req.ip, userAgent: req.get('user-agent'), metadata: { orderId: scoped.order._id, vendorId: req.vendorRecord._id, messageId: message._id } })]);
    res.status(201).json({ message: { id: String(message._id), sender: 'Your team', body: message.body, sentAt: message.createdAt } });
  } catch (error) { next(error); }
});

router.post('/assignments/:assignmentId/completion', requireVendorPermission('assignments'), assignmentPhotoMiddleware, async (req, res, next) => {
  try {
    const scoped = await scopedAssignment(req); if (!scoped) return res.status(404).json({ message: 'Assignment not found' });
    if (scoped.assignment.status !== 'in_progress') return res.status(409).json({ message: 'Mark the assignment in progress before submitting completion' });
    const rules = scoped.assignment.completionRules || {}; const notes = clean(req.body.serviceNotes, 5000); const beforeFiles = req.files?.beforePhotos || []; const afterFiles = req.files?.afterPhotos || [];
    if (rules.requireServiceNotes !== false && notes.length < 10) return res.status(400).json({ message: 'Service notes of at least 10 characters are required' });
    if (rules.requireBeforePhotos !== false && !beforeFiles.length) return res.status(400).json({ message: 'At least one before photo is required' });
    if (rules.requireAfterPhotos !== false && !afterFiles.length) return res.status(400).json({ message: 'At least one after photo is required' });
    let completion = await JobCompletion.findOne({ orderId: scoped.order._id, assignmentId: scoped.assignment._id, vendorId: req.vendorRecord._id });
    if (!completion || completion.status !== 'pending') return res.status(409).json({ message: 'Completion has already been submitted or is unavailable' });
    const before = await saveAssignmentPhotos(beforeFiles, completion, 'before', req.user); const after = await saveAssignmentPhotos(afterFiles, completion, 'after', req.user);
    completion.status = 'completed'; completion.source = 'vendor'; completion.completionNotes = notes; completion.beforePhotos = before; completion.afterPhotos = after; completion.completedAt = new Date(); completion.vendorEnteredName = clean(req.body.vendorEnteredName, 160) || req.vendorRecord.name; completion.completedBy = req.user.userId; completion.completedByEmail = req.user.email; completion.history.push({ action: 'assignment_completion_submitted', actorType: 'vendor', actorId: req.user.userId, actorEmail: req.user.email }); await completion.save();
    transition(scoped.assignment, 'completion_submitted', { type: 'vendor', id: req.user.userId }, `Completion ${completion.completionReference} submitted`); await scoped.order.save();
    await Promise.all([notifyStaff('Vendor completion submitted', `${req.vendorRecord.name} submitted completion evidence for ${scoped.order.orderId}.`, { orderId: scoped.order._id, assignmentId: scoped.assignment._id, jobCompletionId: completion._id, vendorId: req.vendorRecord._id }), SecurityAuditEvent.create({ action: 'vendor_assignment_completion_submitted', userId: req.user.userId, userEmail: req.user.email, entityType: 'VendorAssignment', entityId: String(scoped.assignment._id), ipAddress: req.ip, userAgent: req.get('user-agent'), metadata: { orderId: scoped.order._id, vendorId: req.vendorRecord._id, jobCompletionId: completion._id, beforePhotoCount: before.length, afterPhotoCount: after.length } })]);
    res.status(201).json({ completion: { id: String(completion._id), reference: completion.completionReference, status: completion.status, completedAt: completion.completedAt }, internalReview: true });
  } catch (error) { next(error); }
});

router.get('/assignments/:assignmentId/completion-files/:documentId', requireVendorPermission('assignments'), async (req, res, next) => {
  try {
    const scoped = await scopedAssignment(req); if (!scoped) return res.status(404).json({ message: 'Completion photo not found' });
    const completion = await JobCompletion.findOne({ orderId: scoped.order._id, assignmentId: scoped.assignment._id, vendorId: req.vendorRecord._id });
    const file = [...(completion?.beforePhotos || []), ...(completion?.afterPhotos || [])].find(item => item.status !== 'archived' && item.documentId === req.params.documentId);
    if (!file?.fileId || !ObjectId.isValid(String(file.fileId))) return res.status(404).json({ message: 'Completion photo not found' });
    res.set({ 'Content-Type': file.type, 'Content-Disposition': `inline; filename="${clean(file.name, 120).replace(/["\\]/g, '_')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' }).openDownloadStream(new ObjectId(String(file.fileId))).on('error', next).pipe(res);
  } catch (error) { next(error); }
});

router.get('/invoices', requireVendorPermission('invoices'), async (req, res, next) => {
  try {
    const invoices = await VendorInvoice.find({ vendorId: req.vendorRecord._id }).sort({ submittedAt: -1 });
    const payouts = await VendorPayout.find({ vendorId: req.vendorRecord._id, vendorInvoiceId: { $in: invoices.map(item => item._id) } }).select('+providerReference').lean();
    const byInvoice = new Map(payouts.map(item => [String(item.vendorInvoiceId), item]));
    res.set('Cache-Control', 'private, no-store').json({ invoices: invoices.map(item => serializeVendorInvoice(item, byInvoice.get(String(item._id)))) });
  } catch (error) { next(error); }
});

router.post('/assignments/:assignmentId/invoices', requireVendorPermission('invoices'), invoiceUploadMiddleware, async (req, res, next) => {
  try {
    const scoped = await scopedAssignment(req); if (!scoped) return res.status(404).json({ message: 'Assignment not found' });
    if (!['completion_submitted', 'completed'].includes(scoped.assignment.status)) return res.status(409).json({ message: 'Invoice submission opens after completion evidence is submitted' });
    const completion = await JobCompletion.findOne({ orderId: scoped.order._id, assignmentId: scoped.assignment._id, vendorId: req.vendorRecord._id, status: 'completed' });
    if (!completion) return res.status(409).json({ message: 'A completed assignment record is required before invoicing' });
    if (await VendorInvoice.exists({ assignmentId: scoped.assignment._id })) return res.status(409).json({ message: 'An invoice has already been submitted for this assignment' });
    if (!req.file || !validEstimateFile(req.file)) return res.status(400).json({ message: 'A valid supporting PDF, JPEG, PNG, or WebP invoice is required' });
    const invoiceNumber = clean(req.body.invoiceNumber, 120); const normalizedInvoiceNumber = normalizeInvoiceNumber(invoiceNumber);
    if (!invoiceNumber || !normalizedInvoiceNumber) return res.status(400).json({ message: 'Invoice number is required' });
    if (await VendorInvoice.exists({ vendorId: req.vendorRecord._id, normalizedInvoiceNumber })) return res.status(409).json({ message: 'This invoice number has already been submitted' });
    let rawLines; try { rawLines = JSON.parse(req.body.lineItems || '[]'); } catch (_error) { return res.status(400).json({ message: 'Invoice line items are malformed' }); }
    const normalized = normalizeInvoiceLines(rawLines, { verifyAmounts: true });
    const declaredAmount = Number(req.body.amount); if (!Number.isFinite(declaredAmount) || declaredAmount < 0) normalized.errors.push('Invoice amount is invalid');
    const servicePeriodStart = validDate(req.body.servicePeriodStart); const servicePeriodEnd = validDate(req.body.servicePeriodEnd);
    if (!servicePeriodStart || !servicePeriodEnd || servicePeriodEnd < servicePeriodStart) normalized.errors.push('A valid service period is required');
    if (normalized.errors.some(error => !/total does not match/.test(error))) return res.status(400).json({ message: normalized.errors.join('. ') });
    const hash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    if (await VendorInvoice.exists({ 'sourceDocument.sha256': hash })) return res.status(409).json({ message: 'This invoice document has already been submitted' });
    const flags = [];
    if (Math.abs(declaredAmount - normalized.amount) > 0.01 || normalized.errors.length) flags.push({ code: 'line_total_mismatch', message: 'Declared amount or submitted line totals differ from the server-calculated total' });
    const selectedQuote = await IncomingQuote.findOne({ orderId: scoped.order._id, vendorId: req.vendorRecord._id, status: 'selected' }).select('total').lean();
    if (selectedQuote && Math.abs(Number(selectedQuote.total || 0) - normalized.amount) > 0.01) flags.push({ code: 'amount_mismatch', message: 'Invoice total differs from the selected vendor estimate' });
    const scheduledStart = scoped.assignment.scheduledStart ? new Date(scoped.assignment.scheduledStart) : null; const scheduledEnd = scoped.assignment.scheduledEnd ? new Date(scoped.assignment.scheduledEnd) : null;
    if ((scheduledStart && servicePeriodStart > scheduledStart) || (scheduledEnd && servicePeriodEnd < scheduledEnd)) flags.push({ code: 'service_period_mismatch', message: 'Service period does not cover the confirmed assignment window' });
    const documentId = crypto.randomUUID();
    const fileId = await storeFile(req.file, { source: 'vendor-invoice', entityType: 'vendor-assignment', entityId: String(scoped.assignment._id), orderId: String(scoped.order._id), vendorId: String(req.vendorRecord._id), documentId, sha256: hash, linkStatus: 'linked' });
    const billingLane = req.vendorRecord.licensedTrade ? 'owner_billed' : (scoped.assignment.billingLane || 'smplfix_direct');
    const invoice = await VendorInvoice.create({ assignmentId: scoped.assignment._id, orderId: scoped.order._id, vendorId: req.vendorRecord._id, jobCompletionId: completion._id, invoiceNumber, normalizedInvoiceNumber, billingLane, servicePeriodStart, servicePeriodEnd, lineItems: normalized.lineItems, amount: normalized.amount, notes: clean(req.body.notes, 5000), sourceDocument: { documentId, name: clean(req.file.originalname, 180), mimeType: req.file.mimetype, size: req.file.size, fileId, sha256: hash, uploadedBy: req.user.userId }, mismatchFlags: flags, requiresInternalReview: true, submittedBy: req.user.userId, history: [{ action: 'submitted', actorType: 'vendor', actorId: req.user.userId, message: flags.length ? 'Submitted with mismatch flags' : 'Submitted for internal review' }] });
    let payout = null;
    if (billingLane === 'smplfix_direct') payout = await VendorPayout.create({ vendorInvoiceId: invoice._id, assignmentId: scoped.assignment._id, orderId: scoped.order._id, vendorId: req.vendorRecord._id, amount: invoice.amount, status: 'pending', history: [{ status: 'pending', message: 'Invoice submitted for internal review' }] });
    scoped.assignment.vendorInvoiceId = invoice._id; await scoped.order.save();
    await Promise.all([notifyStaff('Vendor invoice submitted', `${req.vendorRecord.name} submitted invoice ${invoice.invoiceNumber}${flags.length ? ' with review flags' : ''}.`, { orderId: scoped.order._id, assignmentId: scoped.assignment._id, vendorInvoiceId: invoice._id, vendorId: req.vendorRecord._id, mismatchCount: flags.length }), SecurityAuditEvent.create({ action: 'vendor_assignment_invoice_submitted', userId: req.user.userId, userEmail: req.user.email, entityType: 'VendorInvoice', entityId: String(invoice._id), ipAddress: req.ip, userAgent: req.get('user-agent'), metadata: { orderId: scoped.order._id, assignmentId: scoped.assignment._id, vendorId: req.vendorRecord._id, billingLane, amount: invoice.amount, mismatchCodes: flags.map(item => item.code), documentId } })]);
    res.status(201).json({ invoice: serializeVendorInvoice(invoice, payout), internalReview: true });
  } catch (error) { if (error?.code === 11000) return res.status(409).json({ message: 'This assignment, invoice number, or invoice document has already been submitted' }); next(error); }
});

router.get('/invoices/:invoiceId/document', requireVendorPermission('invoices'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.invoiceId)) return res.status(404).json({ message: 'Invoice document not found' });
    const invoice = await VendorInvoice.findOne({ _id: req.params.invoiceId, vendorId: req.vendorRecord._id }).select('+sourceDocument.fileId'); const file = invoice?.sourceDocument;
    if (!file?.fileId || !ObjectId.isValid(String(file.fileId))) return res.status(404).json({ message: 'Invoice document not found' });
    const name = clean(file.name, 160).replace(/["\\\r\n]/g, '_'); res.set({ 'Content-Type': file.mimeType, 'Content-Disposition': `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' }).openDownloadStream(new ObjectId(String(file.fileId))).on('error', next).pipe(res);
  } catch (error) { next(error); }
});

router.get('/performance', requireVendorPermission('assignments'), async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 90 * 86400000);
    const [events, invitations, schedules, completions, directPending] = await Promise.all([VendorPerformanceEvent.find({ vendorId: req.vendorRecord._id, occurredAt: { $gte: since } }).lean(), QuoteInvitation.find({ vendorId: req.vendorRecord._id, createdAt: { $gte: since } }).select('status createdAt respondedAt responseDueAt submittedAt bidDueAt').lean(), JobSchedule.find({ vendorId: req.vendorRecord._id, createdAt: { $gte: since } }).select('status proposedStart proposedEnd acceptedAt changesRequestedAt').lean(), JobCompletion.find({ vendorId: req.vendorRecord._id, createdAt: { $gte: since } }).select('status completionNotes beforePhotos afterPhotos completedAt').lean(), VendorPayout.countDocuments({ vendorId: req.vendorRecord._id, status: { $in: ['pending', 'approved', 'scheduled', 'failed', 'disputed'] } })]);
    const performance = vendorPerformanceSummary({ vendor: req.vendorRecord, events, invitations, schedules, completions }); const reminders = [];
    expirationWarnings(req.vendorRecord).forEach(item => reminders.push({ type: 'compliance', severity: item.severity, title: `${item.label} ${item.daysRemaining < 0 ? 'expired' : 'expires soon'}`, dueAt: item.expiresAt, action: 'Update compliance documentation' }));
    const incomplete = (req.vendorRecord ? require('../utils/vendorCompliance').complianceChecklist(req.vendorRecord) : []).filter(item => !item.complete);
    incomplete.forEach(item => reminders.push({ type: 'compliance', severity: 'warning', title: `${item.key.replaceAll('_', ' ')} is incomplete`, action: 'Complete vendor compliance' }));
    if (directPending && !req.vendorRecord.stripeConnect?.payoutsEnabled) reminders.push({ type: 'payout', severity: 'critical', title: 'Stripe Connect payout setup needs attention', action: 'Complete hosted payout onboarding' });
    res.set('Cache-Control', 'private, no-store').json({ performance, reminders });
  } catch (error) { next(error); }
});

function estimateUploadMiddleware(req, res, next) {
  estimateUpload(req, res, error => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'Estimate file must be 20 MB or smaller' });
    return res.status(400).json({ message: error.message || 'Estimate upload failed' });
  });
}

router.get('/leads', requireVendorPermission('assignments'), async (req, res, next) => {
  try {
    const invitations = await QuoteInvitation.find({ vendorId: req.vendorRecord._id, responseRequired: true })
      .populate('quoteId', 'quoteReference status').sort({ createdAt: -1 }).lean();
    res.set('Cache-Control', 'private, no-store').json({ leads: invitations.map(invitation => serializeVendorLead(invitation, invitation.quoteId)) });
  } catch (error) { next(error); }
});

router.get('/leads/:invitationId', requireVendorPermission('assignments'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.invitationId)) return res.status(404).json({ message: 'Lead not found' });
    const invitation = await QuoteInvitation.findOne({ _id: req.params.invitationId, vendorId: req.vendorRecord._id, responseRequired: true }).populate('quoteId', 'quoteReference status').lean();
    if (!invitation) return res.status(404).json({ message: 'Lead not found' });
    res.set('Cache-Control', 'private, no-store').json({ lead: serializeVendorLead(invitation, invitation.quoteId) });
  } catch (error) { next(error); }
});

router.post('/leads/:invitationId/respond', requireVendorPermission('assignments'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.invitationId)) return res.status(404).json({ message: 'Lead not found' });
    if (req.body.response === 'accept' && !activeCompliance(req.vendorRecord)) return res.status(409).json({ message: 'Vendor compliance is no longer active and current' });
    const result = await respondToLead({ invitationId: req.params.invitationId, vendorId: req.vendorRecord._id, response: req.body.response, declineReasonCode: req.body.declineReasonCode, declineReason: req.body.declineReason, actorId: req.user.userId });
    if (!result.reused) {
      await Promise.all([
        notifyStaff(req.body.response === 'accept' ? 'Vendor accepted lead to bid' : 'Vendor declined lead', req.body.response === 'accept' ? `${req.vendorRecord.name} committed to submit an estimate.` : `${req.vendorRecord.name} declined a lead.`, { invitationId: result.invitation._id, orderId: result.invitation.orderId, vendorId: req.vendorRecord._id }),
        SecurityAuditEvent.create({ action: req.body.response === 'accept' ? 'vendor_lead_accepted' : 'vendor_lead_declined', userId: req.user.userId, userEmail: req.user.email, entityType: 'QuoteInvitation', entityId: String(result.invitation._id), ipAddress: req.ip, userAgent: req.get('user-agent'), metadata: { vendorId: req.vendorRecord._id, orderId: result.invitation.orderId, responseTimeMs: result.invitation.responseTimeMs, declineReasonCode: result.invitation.declineReasonCode || null } })
      ]);
    }
    res.json({ lead: serializeVendorLead(result.invitation), reused: result.reused });
  } catch (error) { next(error); }
});

router.get('/leads/:invitationId/estimate-draft', requireVendorPermission('assignments'), async (req, res, next) => {
  try {
    const invitation = await scopedLead(req, ['accepted_to_bid', 'submitted']);
    if (!invitation) return res.status(404).json({ message: 'Estimate draft not found' });
    const draft = await VendorEstimateDraft.findOne({ invitationId: invitation._id, vendorId: req.vendorRecord._id });
    res.set('Cache-Control', 'private, no-store').json({ draft: draft ? serializeVendorEstimateDraft(draft) : { invitationId: String(invitation._id), status: 'draft', source: 'manual', scope: '', lineItems: [], subtotal: 0, notes: '', attachments: [], parser: { provider: 'none', status: 'not_requested' }, manualEntryRequired: true } });
  } catch (error) { next(error); }
});

router.post('/leads/:invitationId/estimate-draft/parse', requireVendorPermission('assignments'), estimateUploadMiddleware, async (req, res, next) => {
  try {
    const invitation = await scopedLead(req);
    if (!invitation) return res.status(404).json({ message: 'Accepted lead not found' });
    if (!req.file || !validEstimateFile(req.file)) return res.status(400).json({ message: 'The uploaded estimate is malformed or does not match its declared file type' });
    const draft = await findOrCreateEstimateDraft(invitation, req.user.userId);
    if (draft.status !== 'draft') return res.status(409).json({ message: 'Submitted estimate drafts are immutable' });
    const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    if ((draft.sourceFiles || []).some(file => file.sha256 === sha256)) return res.status(409).json({ message: 'This estimate file has already been uploaded' });
    const documentId = crypto.randomUUID();
    const fileId = await storeFile(req.file, { source: 'vendor-estimate', entityType: 'vendor-estimate-draft', entityId: String(draft._id), invitationId: String(invitation._id), quoteId: String(invitation.quoteId), vendorId: String(req.vendorRecord._id), documentId, originalName: cleanEstimate(req.file.originalname, 180), sha256, linkStatus: 'linked' });
    draft.sourceFiles.push({ documentId, name: cleanEstimate(req.file.originalname, 180), mimeType: req.file.mimetype, size: req.file.size, sha256, fileId, uploadedBy: req.user.userId });
    const requestedAt = new Date(); const parsed = await parseVendorEstimate(req.file); const completedAt = new Date();
    draft.source = 'document_parse';
    draft.parserAudit = { provider: parsed.provider || 'none', model: parsed.model || '', status: parsed.status, requestedAt, completedAt, sourceDocumentId: documentId, sourceSha256: sha256, requestId: parsed.requestId || '', errorCode: parsed.errorCode || '' };
    if (parsed.status === 'succeeded') {
      if (parsed.output.scope) draft.scope = parsed.output.scope;
      if (parsed.output.notes) draft.notes = parsed.output.notes;
      if (parsed.output.lineItems?.length) { const normalized = normalizeLineItems(parsed.output.lineItems, { requireItems: false }); draft.lineItems = normalized.lineItems; draft.subtotal = normalized.subtotal; }
    }
    await draft.save();
    await SecurityAuditEvent.create({ action: 'vendor_estimate_source_uploaded', userId: req.user.userId, userEmail: req.user.email, entityType: 'VendorEstimateDraft', entityId: String(draft._id), ipAddress: req.ip, userAgent: req.get('user-agent'), metadata: { invitationId: invitation._id, quoteId: invitation.quoteId, vendorId: req.vendorRecord._id, documentId, parserStatus: parsed.status, provider: parsed.provider || 'none' } });
    res.status(201).json({ draft: serializeVendorEstimateDraft(draft), parserMessage: parsed.status === 'succeeded' ? 'Draft line items were extracted. Review every field before submitting.' : parsed.status === 'unavailable' ? 'Automatic parsing is not configured. The original is saved; enter the estimate manually.' : 'Automatic parsing failed. The original is saved; enter the estimate manually.' });
  } catch (error) { next(error); }
});

router.put('/leads/:invitationId/estimate-draft', requireVendorPermission('assignments'), async (req, res, next) => {
  try {
    const invitation = await scopedLead(req);
    if (!invitation) return res.status(404).json({ message: 'Accepted lead not found' });
    const draft = await findOrCreateEstimateDraft(invitation, req.user.userId);
    if (draft.status !== 'draft') return res.status(409).json({ message: 'Submitted estimate drafts are immutable' });
    const normalized = normalizeLineItems(req.body.lineItems, { requireItems: true, verifyAmounts: true });
    const scope = cleanEstimate(req.body.scope, 10000); const notes = cleanEstimate(req.body.notes, 10000);
    if (!scope) normalized.errors.push('Estimate scope is required');
    const durationValue = Number(req.body.estimatedDuration?.value); const durationUnit = req.body.estimatedDuration?.unit;
    if (!Number.isFinite(durationValue) || durationValue <= 0 || !['hours', 'days', 'weeks'].includes(durationUnit)) normalized.errors.push('Valid estimated duration is required');
    const earliestAvailableDate = validDate(req.body.earliestAvailableDate);
    if (!earliestAvailableDate) normalized.errors.push('Earliest available date is required');
    if (normalized.errors.length) return res.status(400).json({ message: normalized.errors.join('. ') });
    draft.scope = scope; draft.lineItems = normalized.lineItems; draft.subtotal = normalized.subtotal; draft.notes = notes;
    draft.estimatedDuration = { value: durationValue, unit: durationUnit }; draft.earliestAvailableDate = earliestAvailableDate;
    draft.siteAccessRequired = req.body.siteAccessRequired === true; draft.accessNotes = cleanEstimate(req.body.accessNotes, 3000);
    if (draft.siteAccessRequired && !draft.accessNotes) return res.status(400).json({ message: 'Access notes are required when site access must be arranged' });
    draft.reviewedAt = new Date(); draft.reviewedBy = req.user.userId; await draft.save();
    res.json({ draft: serializeVendorEstimateDraft(draft) });
  } catch (error) { next(error); }
});

router.post('/leads/:invitationId/estimate-draft/submit', requireVendorPermission('assignments'), async (req, res, next) => {
  let claimed;
  try {
    if (req.body.confirmed !== true) return res.status(400).json({ message: 'Review confirmation is required before submission' });
    if (!activeCompliance(req.vendorRecord)) return res.status(409).json({ message: 'Vendor compliance is no longer active and current' });
    const invitation = await scopedLead(req);
    if (!invitation) return res.status(404).json({ message: 'Accepted lead not found' });
    const draft = await VendorEstimateDraft.findOne({ invitationId: invitation._id, vendorId: req.vendorRecord._id, status: 'draft' });
    if (!draft || !draft.reviewedAt) return res.status(409).json({ message: 'Save and review the estimate draft before submitting' });
    const normalized = normalizeLineItems(draft.lineItems, { requireItems: true, verifyAmounts: true });
    if (!draft.scope || normalized.errors.length) return res.status(400).json({ message: ['Estimate scope is required', ...normalized.errors].filter((value, index) => index || !draft.scope).join('. ') });
    claimed = await QuoteInvitation.findOneAndUpdate({ _id: invitation._id, vendorId: req.vendorRecord._id, status: 'accepted_to_bid', expiresAt: { $gt: new Date() } }, { $set: { status: 'processing', processingStartedAt: new Date() } }, { new: true });
    if (!claimed) return res.status(409).json({ message: 'This estimate is already being submitted or the lead is closed' });
    const [quote, order] = await Promise.all([IncomingQuote.findOne({ _id: claimed.quoteId, vendorId: req.vendorRecord._id, status: 'draft' }), Order.findById(claimed.orderId)]);
    if (!quote || !order || order.workflowStatus !== 'quote_collection' || order.selectedIncomingQuoteId) throw Object.assign(new Error('This quote request is closed'), { status: 409 });
    const laborCents = normalized.lineItems.filter(item => item.category === 'labor').reduce((sum, item) => sum + cents(item.amount), 0);
    const materialCents = normalized.lineItems.filter(item => item.category !== 'labor').reduce((sum, item) => sum + cents(item.amount), 0);
    Object.assign(quote, { source: 'vendor', status: 'submitted', vendorEstimateDraftId: draft._id, vendorLineItems: normalized.lineItems, vendorEstimateNotes: draft.notes, scopeOfWork: draft.scope, laborAmount: dollars(laborCents / 100), materialsAmount: dollars(materialCents / 100), total: normalized.subtotal, estimatedDuration: draft.estimatedDuration, earliestAvailableDate: draft.earliestAvailableDate, siteAccessRequired: draft.siteAccessRequired, accessNotes: draft.accessNotes, vendorSnapshot: vendorSnapshot(req.vendorRecord), submittedAt: new Date() });
    quote.history.push({ action: 'submitted', actorType: 'vendor', actorId: req.user.userId, actorEmail: req.user.email, message: `Reviewed estimate draft ${draft._id}` }); await quote.save();
    claimed.status = 'submitted'; claimed.submittedAt = new Date(); claimed.processingStartedAt = undefined; claimed.responseHistory.push({ action: 'quote_submitted', actorType: 'vendor', actorId: req.user.userId, createdAt: new Date() }); await claimed.save();
    draft.status = 'submitted'; draft.submittedAt = new Date(); draft.submittedBy = req.user.userId; await draft.save();
    const late = await recordBidSubmission(claimed);
    await Promise.all([notifyStaff('Vendor estimate submitted for internal review', `${req.vendorRecord.name} submitted ${quote.quoteReference}.`, { invitationId: claimed._id, orderId: order._id, incomingQuoteId: quote._id, estimateDraftId: draft._id, vendorId: req.vendorRecord._id, late }), SecurityAuditEvent.create({ action: 'vendor_estimate_reviewed_and_submitted', userId: req.user.userId, userEmail: req.user.email, entityType: 'VendorEstimateDraft', entityId: String(draft._id), ipAddress: req.ip, userAgent: req.get('user-agent'), metadata: { invitationId: claimed._id, quoteId: quote._id, orderId: order._id, vendorId: req.vendorRecord._id, attachmentCount: draft.sourceFiles.length, parserStatus: draft.parserAudit?.status, subtotal: draft.subtotal, late } })]);
    res.status(201).json({ quoteReference: quote.quoteReference, status: 'submitted', internalReview: true, late });
  } catch (error) {
    if (claimed?._id) await QuoteInvitation.updateOne({ _id: claimed._id, vendorId: req.vendorRecord._id, status: 'processing' }, { $set: { status: 'accepted_to_bid' }, $unset: { processingStartedAt: '' } }).catch(() => {});
    next(error);
  }
});

router.get('/estimate-drafts/:draftId/files/:documentId', requireVendorPermission('assignments'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.draftId)) return res.status(404).json({ message: 'Estimate attachment not found' });
    const draft = await VendorEstimateDraft.findOne({ _id: req.params.draftId, vendorId: req.vendorRecord._id }).select('+sourceFiles.fileId');
    const file = draft?.sourceFiles?.find(item => item.documentId === req.params.documentId);
    if (!file?.fileId || !ObjectId.isValid(String(file.fileId))) return res.status(404).json({ message: 'Estimate attachment not found' });
    const name = cleanEstimate(file.name, 180).replace(/[\r\n"\\]/g, '_');
    res.set({ 'Content-Type': file.mimeType, 'Content-Disposition': `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' }).openDownloadStream(new ObjectId(String(file.fileId))).on('error', next).pipe(res);
  } catch (error) { next(error); }
});

router.post('/leads/:invitationId/quote', requireVendorPermission('assignments'), (_req, res) => res.status(409).json({ message: 'Use the reviewed estimate draft workflow before submitting a vendor estimate' }));

router.get('/team', requireVendorPermission('team'), async (req, res, next) => {
  try {
    const memberships = await VendorPortalMembership.find({ vendorId: req.vendorRecord._id, status: 'active' }).populate('userId', 'firstName lastName email isActive').sort({ createdAt: 1 }).lean();
    res.json({ team: memberships.filter(item => item.userId?.isActive).map(item => ({ id: String(item._id), name: `${item.userId.firstName} ${item.userId.lastName}`.trim(), email: item.userId.email, role: item.role, permissions: item.permissions })) });
  } catch (error) { next(error); }
});

router.patch('/profile', requireVendorPermission('profile'), async (req, res, next) => {
  try {
    const vendor = req.vendorRecord;
    if (['rejected', 'suspended'].includes(vendor.portalStatus)) return res.status(409).json({ message: 'This vendor profile is not currently editable' });
    if (req.body.companyName !== undefined) vendor.name = clean(req.body.companyName, 160);
    if (req.body.legalBusinessName !== undefined) vendor.legalBusinessName = clean(req.body.legalBusinessName, 200);
    if (req.body.contactName !== undefined) vendor.primaryOwnerName = clean(req.body.contactName, 160);
    if (req.body.phone !== undefined) vendor.phone = clean(req.body.phone, 40);
    if (req.body.businessAddress !== undefined) vendor.businessAddress = clean(req.body.businessAddress, 500);
    if (req.body.entityType !== undefined) vendor.businessEntityType = clean(req.body.entityType, 80);
    if (req.body.tradeClassifications !== undefined) vendor.tradeClassifications = cleanList(req.body.tradeClassifications, 30);
    if (req.body.serviceArea !== undefined) vendor.serviceArea = {
      basePostalCode: clean(req.body.serviceArea?.basePostalCode, 20),
      radiusMiles: Math.max(0, Math.min(500, Number(req.body.serviceArea?.radiusMiles || 0))),
      counties: cleanList(req.body.serviceArea?.counties, 30),
      postalCodes: cleanList(req.body.serviceArea?.postalCodes, 100)
    };
    if (req.body.licensedTrade !== undefined) vendor.licensedTrade = req.body.licensedTrade === true;
    if (req.body.rocLicenseNumber !== undefined) vendor.rocLicenseNumber = clean(req.body.rocLicenseNumber, 100);
    if (req.body.rocClassification !== undefined) vendor.rocLicenseTypeClassification = clean(req.body.rocClassification, 160);
    applyComputedPortalStatus(vendor);
    await vendor.save();
    res.json(assertNoVendorPrivateData({ vendor: serializeVendor(vendor) }));
  } catch (error) { next(error); }
});

router.patch('/compliance', requireVendorPermission('compliance'), async (req, res, next) => {
  try {
    const vendor = await req.vendorRecord.constructor.findById(req.vendorRecord._id).select('+einTaxIdEncrypted +einTaxIdIv +einTaxIdTag +stripeConnect.accountId +agreementAudit.ipAddress +agreementAudit.userAgent');
    if (['rejected', 'suspended', 'approved_active'].includes(vendor.portalStatus)) return res.status(409).json({ message: 'Compliance changes require staff review for this vendor status' });
    if (req.body.agreement?.accepted === true) {
      const signerName = clean(req.body.agreement.signerName, 160);
      const version = clean(req.body.agreement.version, 80);
      if (!signerName || !version) return res.status(400).json({ message: 'Agreement signer and version are required' });
      vendor.huttasContractSigned = true;
      vendor.huttasContractSignedDate = new Date();
      vendor.agreementAudit = { signerName, signerTitle: clean(req.body.agreement.signerTitle, 120), version, acceptedAt: new Date(), ipAddress: clean(req.ip, 128), userAgent: clean(req.get('user-agent'), 1000), documentId: vendor.agreementAudit?.documentId };
    }
    if (req.body.w9) {
      const signedBy = clean(req.body.w9.signedBy, 160);
      if (!signedBy || req.body.w9.certified !== true) return res.status(400).json({ message: 'W-9 certification and signer are required' });
      const taxPayload = encryptTaxId(req.body.w9.taxId);
      if (taxPayload) {
        vendor.einTaxIdEncrypted = taxPayload.encrypted; vendor.einTaxIdIv = taxPayload.iv; vendor.einTaxIdTag = taxPayload.tag; vendor.einTaxIdLast4 = taxPayload.last4;
      } else if (!vendor.einTaxIdLast4) return res.status(400).json({ message: 'A valid EIN or Tax ID is required' });
      vendor.w9OnFile = true; vendor.w9Date = new Date();
      vendor.w9Profile = { federalTaxClassification: clean(req.body.w9.federalTaxClassification, 100), legalName: clean(req.body.w9.legalName, 200), businessName: clean(req.body.w9.businessName, 200), signedBy, signedAt: new Date(), documentId: vendor.w9Profile?.documentId };
    }
    if (req.body.coi) {
      const effectiveDate = validDate(req.body.coi.effectiveDate); const expirationDate = validDate(req.body.coi.expirationDate);
      if (!effectiveDate || !expirationDate || expirationDate <= effectiveDate) return res.status(400).json({ message: 'Valid COI effective and expiration dates are required' });
      vendor.coiProfile = { carrier: clean(req.body.coi.carrier, 160), policyNumber: clean(req.body.coi.policyNumber, 100), generalLiabilityPerOccurrence: Number(req.body.coi.generalLiabilityPerOccurrence || 0), generalLiabilityAggregate: Number(req.body.coi.generalLiabilityAggregate || 0), effectiveDate, expirationDate, additionalInsuredConfirmedAt: req.body.coi.additionalInsuredConfirmed === true ? new Date() : undefined, documentId: vendor.coiProfile?.documentId };
      vendor.insuranceExpirationDate = expirationDate;
      vendor.huttasAdditionalInsured = req.body.coi.additionalInsuredConfirmed === true;
    }
    if (req.body.workersComp) {
      const required = req.body.workersComp.required !== false;
      const effectiveDate = validDate(req.body.workersComp.effectiveDate); const expirationDate = validDate(req.body.workersComp.expirationDate);
      if (required && (!effectiveDate || !expirationDate || expirationDate <= effectiveDate)) return res.status(400).json({ message: 'Valid workers compensation dates are required' });
      if (!required && !clean(req.body.workersComp.exemptionReason, 500)) return res.status(400).json({ message: 'Workers compensation exemption reason is required' });
      vendor.workersCompProfile = { required, exemptionReason: clean(req.body.workersComp.exemptionReason, 500), carrier: clean(req.body.workersComp.carrier, 160), policyNumber: clean(req.body.workersComp.policyNumber, 100), effectiveDate, expirationDate, documentId: vendor.workersCompProfile?.documentId };
    }
    applyComputedPortalStatus(vendor);
    await vendor.save();
    res.json(assertNoVendorPrivateData({ vendor: serializeVendor(vendor) }));
  } catch (error) { next(error); }
});

router.post('/documents/:documentType', requireVendorPermission('compliance'), (req, res, next) => upload(req, res, error => {
  if (error?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'Document must be 15 MB or smaller' });
  if (error) return res.status(400).json({ message: 'Document upload failed' });
  next();
}), async (req, res, next) => {
  try {
    const documentType = clean(req.params.documentType, 40);
    if (!DOCUMENT_TYPES.has(documentType) || !validFile(req.file)) return res.status(400).json({ message: 'A valid PDF, PNG, or JPEG compliance document is required' });
    const vendor = req.vendorRecord; const documentId = crypto.randomUUID();
    const fileId = await storeFile(req.file, { source: 'vendor-portal', entityType: 'vendor', entityId: String(vendor._id), documentId, linkStatus: 'linked' });
    const complianceDocumentType = ACTIVE_DOCUMENT_TYPES[documentType];
    vendor.documents.forEach(item => { if (item.status !== 'archived' && item.complianceDocumentType === complianceDocumentType) { item.status = 'archived'; item.archivedAt = new Date(); item.archiveReason = 'Superseded in vendor portal'; } });
    vendor.documents.push({ documentId, name: clean(req.file.originalname, 160), url: `/api/vendor-portal/documents/${documentId}`, type: req.file.mimetype, size: req.file.size, fileId, storageProvider: 'gridfs', uploadedAt: new Date(), uploadedBy: req.user.userId, uploadedByEmail: req.user.email, complianceDocumentType });
    if (documentType === 'agreement') vendor.agreementAudit.documentId = documentId;
    if (documentType === 'w9') vendor.w9Profile.documentId = documentId;
    if (documentType === 'coi') { vendor.coiProfile.documentId = documentId; vendor.certificateOfInsuranceOnFile = true; }
    if (documentType === 'workers_comp') { vendor.workersCompProfile.documentId = documentId; vendor.workersCompInsuranceOnFile = true; }
    applyComputedPortalStatus(vendor); await vendor.save();
    res.status(201).json(assertNoVendorPrivateData({ vendor: serializeVendor(vendor) }));
  } catch (error) { next(error); }
});

router.get('/documents/:documentId', async (req, res, next) => {
  try {
    const document = (req.vendorRecord.documents || []).find(item => item.status !== 'archived' && item.documentId === req.params.documentId);
    if (!document?.fileId || !ObjectId.isValid(String(document.fileId))) return res.status(404).json({ message: 'Document not found' });
    res.set({ 'Cache-Control': 'private, no-store', 'Content-Type': document.type || 'application/octet-stream', 'Content-Disposition': `inline; filename="${clean(document.name, 120).replace(/["\\]/g, '_')}"` });
    new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' }).openDownloadStream(new ObjectId(String(document.fileId))).on('error', next).pipe(res);
  } catch (error) { next(error); }
});

router.post('/stripe-connect/onboarding', requireVendorPermission('compliance'), async (req, res, next) => {
  try { res.json(await createHostedOnboarding(req.vendorRecord)); } catch (error) { next(error); }
});
router.post('/stripe-connect/refresh', requireVendorPermission('compliance'), async (req, res, next) => {
  try { const status = await refreshConnectStatus(req.vendorRecord); applyComputedPortalStatus(req.vendorRecord); await req.vendorRecord.save(); res.json({ stripeConnect: status, status: req.vendorRecord.portalStatus }); } catch (error) { next(error); }
});
router.post('/roc-verification', requireVendorPermission('compliance'), async (req, res, next) => {
  try { req.vendorRecord.rocVerification = await verifyVendorRoc(req.vendorRecord); await req.vendorRecord.save(); res.json({ roc: serializeVendor(req.vendorRecord).roc }); } catch (error) { req.vendorRecord.rocVerification = { provider: 'configured', status: 'error', checkedAt: new Date(), mismatchReasons: [], staffReviewRequired: true }; await req.vendorRecord.save().catch(() => {}); next(error); }
});

module.exports = router;
