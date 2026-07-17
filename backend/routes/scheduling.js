const express = require('express');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const authenticateToken = require('../middleware/auth');
const checkRole = require('../middleware/rbac');
const EmailOutbox = require('../models/EmailOutbox');
const JobSchedule = require('../models/JobSchedule');
const Notification = require('../models/Notification');
const Order = require('../models/Order');
const OutgoingQuote = require('../models/OutgoingQuote');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const VendorScheduleDecision = require('../models/VendorScheduleDecision');
const VendorWorkOrder = require('../models/VendorWorkOrder');
const { createVendorWorkOrderPdf } = require('../utils/workOrderPdf');
const { vendorPrimaryEmail, vendorPrimaryPhone } = require('../utils/incomingQuotes');
const { invalidateDashboardStatsCache } = require('../utils/dashboardStatsCache');
const memCache = require('../utils/memoryCache');
const { TIMEZONE, TOKEN_TTL_MS, MAX_DECISION_BODY_BYTES, cleanText, generateToken, hashToken, encryptToken, nextScheduleReference, nextWorkOrderReference, parseProposal, parseDecision, scheduleSnapshotHash, workOrderSnapshotHash, publicSchedule } = require('../utils/scheduling');

const router = express.Router();
const staffRoles = checkRole(['admin', 'manager', 'account_rep']);
const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false });
const STAGE5_TYPES = ['vendor_schedule_proposal', 'vendor_schedule_accepted_confirmation', 'customer_schedule_confirmation', 'staff_schedule_accepted_alert', 'vendor_schedule_change_confirmation', 'staff_schedule_change_alert'];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const actorId = req => req.user?.userId || req.user?.id;
const noStore = res => { res.set('Cache-Control', 'no-store, max-age=0'); res.set('Pragma', 'no-cache'); };
const invalidate = () => { memCache.del('orders:stats:v2'); invalidateDashboardStatsCache(); };

async function conflicts(vendorId, start, end, excludeOrderId, session) {
  return JobSchedule.find({ vendorId, orderId: { $ne: excludeOrderId }, status: { $in: ['pending_vendor', 'accepted'] }, proposedStart: { $lt: end }, proposedEnd: { $gt: start } })
    .select('scheduleReference orderId proposedStart proposedEnd status').session(session || null).lean();
}
function proposalOutbox(schedule, token) {
  return { type: 'vendor_schedule_proposal', dedupeKey: `${schedule._id}:vendor_schedule_proposal`, recipients: [schedule.vendorSnapshot.email], payload: { encryptedToken: encryptToken(token), vendorName: schedule.vendorSnapshot.name, customerName: schedule.customerSnapshot.name, scheduleReference: schedule.scheduleReference, requestReference: schedule.jobSnapshot.requestReference, service: schedule.jobSnapshot.service, proposedStart: schedule.proposedStart, proposedEnd: schedule.proposedEnd, timezone: TIMEZONE }, orderId: schedule.orderId, outgoingQuoteId: schedule.outgoingQuoteId, jobScheduleId: schedule._id };
}
function decisionOutbox(schedule, decision, workOrder) {
  const accepted = decision.decision === 'accepted';
  const base = { decision: decision.decision, typedName: decision.typedName, changeRequestMessage: decision.changeRequestMessage, scheduleReference: schedule.scheduleReference, revisionNumber: schedule.revisionNumber, requestReference: schedule.jobSnapshot.requestReference, orderReference: schedule.jobSnapshot.orderReference, customerName: schedule.customerSnapshot.name, vendorName: schedule.vendorSnapshot.name, service: schedule.jobSnapshot.service, address: schedule.customerSnapshot.address, proposedStart: schedule.proposedStart, proposedEnd: schedule.proposedEnd, timezone: TIMEZONE, accessInstructions: schedule.accessInstructions, decisionAt: decision.decisionAt };
  if (!accepted) return [
    { type: 'vendor_schedule_change_confirmation', dedupeKey: `${schedule._id}:vendor_schedule_change_confirmation`, recipients: [schedule.vendorSnapshot.email], payload: base, orderId: schedule.orderId, outgoingQuoteId: schedule.outgoingQuoteId, jobScheduleId: schedule._id },
    { type: 'staff_schedule_change_alert', dedupeKey: `${schedule._id}:staff_schedule_change_alert`, recipients: ['sales@huttas.com'], payload: base, orderId: schedule.orderId, outgoingQuoteId: schedule.outgoingQuoteId, jobScheduleId: schedule._id }
  ];
  return [
    { type: 'customer_schedule_confirmation', dedupeKey: `${schedule._id}:customer_schedule_confirmation`, recipients: [schedule.customerSnapshot.email], payload: base, orderId: schedule.orderId, outgoingQuoteId: schedule.outgoingQuoteId, jobScheduleId: schedule._id, vendorWorkOrderId: workOrder._id },
    { type: 'vendor_schedule_accepted_confirmation', dedupeKey: `${schedule._id}:vendor_schedule_accepted_confirmation`, recipients: [schedule.vendorSnapshot.email], payload: { ...base, vendorWorkOrderId: String(workOrder._id) }, orderId: schedule.orderId, outgoingQuoteId: schedule.outgoingQuoteId, jobScheduleId: schedule._id, vendorWorkOrderId: workOrder._id },
    { type: 'staff_schedule_accepted_alert', dedupeKey: `${schedule._id}:staff_schedule_accepted_alert`, recipients: ['sales@huttas.com'], payload: base, orderId: schedule.orderId, outgoingQuoteId: schedule.outgoingQuoteId, jobScheduleId: schedule._id, vendorWorkOrderId: workOrder._id }
  ];
}

router.get('/public/view', publicLimiter, async (req, res, next) => {
  try { noStore(res); const schedule = await JobSchedule.findOne({ publicTokenHash: hashToken(req.query.token), status: { $in: ['pending_vendor', 'accepted', 'changes_requested'] }, tokenExpiresAt: { $gt: new Date() } }).lean(); if (!schedule) return res.status(404).json({ message: 'This schedule link is invalid, expired, or no longer current' }); const decision = await VendorScheduleDecision.findOne({ jobScheduleId: schedule._id }).lean(); res.json(publicSchedule(schedule, decision)); } catch (error) { next(error); }
});

router.post('/public/decision', publicLimiter, async (req, res, next) => {
  noStore(res);
  if (Buffer.byteLength(JSON.stringify(req.body || {})) > MAX_DECISION_BODY_BYTES) return res.status(413).json({ message: 'Decision request is too large' });
  const token = cleanText(req.body?.token, 500); const { payload, errors } = parseDecision(req.body);
  if (token.length < 20) errors.unshift('A valid schedule token is required');
  if (errors.length) return res.status(400).json({ message: errors.join('. ') });
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const schedule = await JobSchedule.findOne({ publicTokenHash: hashToken(token), status: { $in: ['pending_vendor', 'accepted', 'changes_requested'] }, tokenExpiresAt: { $gt: new Date() }, proposedStart: { $gt: new Date() } }).session(session);
      if (!schedule) throw Object.assign(new Error('This schedule is invalid, expired, or no longer awaiting a decision'), { status: 404 });
      const wanted = payload.action === 'accept' ? 'accepted' : 'changes_requested';
      const existing = await VendorScheduleDecision.findOne({ jobScheduleId: schedule._id }).session(session);
      if (existing) { if (existing.decision !== wanted) throw Object.assign(new Error('A different decision has already been recorded'), { status: 409 }); result = { success: true, status: existing.decision, decisionAt: existing.decisionAt, duplicate: true }; return; }
      if (schedule.status !== 'pending_vendor') throw Object.assign(new Error('This schedule is no longer awaiting a decision'), { status: 409 });
      const order = await Order.findOne({ _id: schedule.orderId, currentJobScheduleId: schedule._id, workflowStatus: 'schedule_pending_vendor' }).session(session);
      if (!order) throw Object.assign(new Error('This proposal is no longer the current schedule'), { status: 409 });
      const decisionAt = new Date();
      const [decision] = await VendorScheduleDecision.create([{ jobScheduleId: schedule._id, orderId: order._id, vendorId: schedule.vendorId, decision: wanted, typedName: payload.typedName, changeRequestMessage: wanted === 'changes_requested' ? payload.changeRequestMessage : undefined, decisionAt, scheduleReference: schedule.scheduleReference, revisionNumber: schedule.revisionNumber, scheduleSnapshotHash: scheduleSnapshotHash(schedule), ipAddress: cleanText(req.ip, 128), userAgent: cleanText(req.get('user-agent'), 1000) }], { session });
      schedule.status = wanted;
      if (wanted === 'accepted') schedule.acceptedAt = decisionAt; else schedule.changesRequestedAt = decisionAt;
      schedule.history.push({ action: wanted, message: wanted === 'changes_requested' ? payload.changeRequestMessage : `Accepted by ${payload.typedName}` });
      await schedule.save({ session });
      let workOrder = null;
      if (wanted === 'accepted') {
        if (order.confirmedJobScheduleId && String(order.confirmedJobScheduleId) !== String(schedule._id)) await JobSchedule.updateOne({ _id: order.confirmedJobScheduleId, status: 'accepted' }, { $set: { status: 'superseded', supersededAt: decisionAt } }, { session });
        const workOrderReference = await nextWorkOrderReference(session);
        const workData = { workOrderReference, orderId: order._id, jobScheduleId: schedule._id, outgoingQuoteId: schedule.outgoingQuoteId, vendorId: schedule.vendorId, revisionNumber: schedule.revisionNumber, customerSnapshot: schedule.customerSnapshot.toObject?.() || schedule.customerSnapshot, vendorSnapshot: schedule.vendorSnapshot.toObject?.() || schedule.vendorSnapshot, jobSnapshot: schedule.jobSnapshot.toObject?.() || schedule.jobSnapshot, scheduledStart: schedule.proposedStart, scheduledEnd: schedule.proposedEnd, timezone: TIMEZONE, accessInstructions: schedule.accessInstructions, generatedAt: decisionAt };
        workData.snapshotHash = workOrderSnapshotHash(workData); [workOrder] = await VendorWorkOrder.create([workData], { session });
        Object.assign(order, { workflowStatus: 'scheduled', confirmedJobScheduleId: schedule._id, scheduledStart: schedule.proposedStart, scheduledEnd: schedule.proposedEnd, scheduledTimezone: TIMEZONE, scheduleConfirmedAt: decisionAt, scheduleDate: schedule.proposedStart });
      } else order.workflowStatus = 'schedule_changes_requested';
      await order.save({ session });
      const users = await User.find({ isActive: true, role: { $in: ['admin', 'manager', 'account_rep'] } }).select('_id').session(session).lean();
      if (users.length) await Notification.insertMany(users.map(user => ({ userId: user._id, title: wanted === 'accepted' ? 'Vendor accepted schedule' : 'Vendor requested schedule changes', message: `${schedule.vendorSnapshot.name} ${wanted === 'accepted' ? 'accepted' : 'requested changes to'} ${schedule.scheduleReference}.`, type: wanted === 'accepted' ? 'success' : 'warning', priority: 'high', actionUrl: '#scheduling', metadata: { orderId: order._id, jobScheduleId: schedule._id, decision: wanted } })), { session });
      await EmailOutbox.insertMany(decisionOutbox(schedule, decision, workOrder), { session });
      result = { success: true, status: wanted, decisionAt, duplicate: false };
    });
    invalidate(); res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'A schedule decision was already recorded' });
    next(error);
  } finally { await session.endSession(); }
});

router.use(authenticateToken, staffRoles);

router.get('/orders', async (_req, res, next) => {
  try { const orders = await Order.find({ workflowStatus: { $in: ['customer_approved', 'schedule_pending_vendor', 'schedule_changes_requested', 'scheduled'] } }).populate('vendor', 'name email phone emails phones').sort({ updatedAt: -1 }).lean(); const scheduleIds = orders.map(o => o.currentJobScheduleId).filter(Boolean); const schedules = await JobSchedule.find({ _id: { $in: scheduleIds } }).lean(); const byId = new Map(schedules.map(s => [String(s._id), s])); res.json(orders.map(o => ({ ...o, currentSchedule: byId.get(String(o.currentJobScheduleId)) || null }))); } catch (error) { next(error); }
});
router.get('/orders/:orderId', async (req, res, next) => {
  try { const order = await Order.findById(req.params.orderId).populate('vendor').lean(); if (!order) return res.status(404).json({ message: 'Order not found' }); const [schedules, decisions, workOrders, emailMessages] = await Promise.all([JobSchedule.find({ orderId: order._id }).select('+internalNotes').sort({ revisionNumber: -1 }).lean(), VendorScheduleDecision.find({ orderId: order._id }).lean(), VendorWorkOrder.find({ orderId: order._id }).sort({ revisionNumber: -1 }).lean(), EmailOutbox.find({ orderId: order._id, type: { $in: STAGE5_TYPES } }).select('-payload').sort({ createdAt: -1 }).lean()]); if (!['admin', 'manager'].includes(req.user.role)) decisions.forEach(d => { delete d.ipAddress; delete d.userAgent; }); res.json({ order, schedules, decisions, workOrders, emailMessages }); } catch (error) { next(error); }
});
router.post('/orders/:orderId/proposals', async (req, res, next) => {
  const { payload, errors } = parseProposal(req.body); if (errors.length) return res.status(400).json({ message: errors.join('. ') });
  const session = await mongoose.startSession();
  try { let created; await session.withTransaction(async () => {
    const order = await Order.findById(req.params.orderId).session(session); if (!order || !['customer_approved', 'scheduled', 'schedule_changes_requested'].includes(order.workflowStatus)) throw Object.assign(new Error('Order is not ready for a scheduling proposal'), { status: 409 });
    const [quote, vendor] = await Promise.all([OutgoingQuote.findOne({ _id: order.approvedOutgoingQuoteId, status: 'sent', customerDecisionStatus: 'approved' }).session(session), Vendor.findOne({ _id: order.vendor, isActive: true, onboardingStatus: 'approved' }).session(session)]);
    if (!quote || !vendor) throw Object.assign(new Error('Approved quote and active selected vendor are required'), { status: 409 });
    const vendorEmail = vendorPrimaryEmail(vendor); if (!emailPattern.test(vendorEmail) || !emailPattern.test(quote.customerSnapshot?.email || '') || !quote.customerSnapshot?.address || !quote.scopeOfWork) throw Object.assign(new Error('Valid vendor/customer emails, service address, and approved scope are required'), { status: 409 });
    const overlap = await conflicts(vendor._id, payload.proposedStart, payload.proposedEnd, order._id, session); if (overlap.length && !payload.conflictAcknowledged) throw Object.assign(new Error('Vendor schedule conflict acknowledgement is required'), { status: 409, conflicts: overlap });
    const latest = await JobSchedule.findOne({ orderId: order._id }).sort({ revisionNumber: -1 }).session(session); const reference = await nextScheduleReference(session); const token = generateToken(); const expires = new Date(Math.min(Date.now() + TOKEN_TTL_MS, payload.proposedStart.getTime()));
    [created] = await JobSchedule.create([{ scheduleReference: reference, orderId: order._id, outgoingQuoteId: quote._id, customerId: order.customerId, vendorId: vendor._id, revisionNumber: (latest?.revisionNumber || 0) + 1, previousVersionId: latest?._id, proposedStart: payload.proposedStart, proposedEnd: payload.proposedEnd, timezone: TIMEZONE, accessInstructions: payload.accessInstructions, internalNotes: payload.internalNotes, conflictAcknowledged: payload.conflictAcknowledged, conflictSnapshot: overlap, customerSnapshot: { name: quote.customerSnapshot.name, email: quote.customerSnapshot.email, phone: quote.customerSnapshot.phone, address: quote.customerSnapshot.address }, vendorSnapshot: { name: vendor.name, email: vendorEmail, phone: vendorPrimaryPhone(vendor) }, jobSnapshot: { requestReference: order.requestReference, orderReference: order.orderId, service: quote.jobSnapshot.service || order.service, description: quote.jobSnapshot.description || order.description, scopeOfWork: quote.scopeOfWork }, publicTokenHash: hashToken(token), tokenExpiresAt: expires, sentAt: new Date(), sentBy: actorId(req), history: [{ action: 'proposal_sent', actorId: actorId(req), actorEmail: req.user.email }] }], { session });
    order.currentJobScheduleId = created._id; order.workflowStatus = 'schedule_pending_vendor'; await order.save({ session }); await EmailOutbox.create([proposalOutbox(created, token)], { session });
  }); invalidate(); res.status(201).json(created); } catch (error) { if (error.conflicts) return res.status(error.status).json({ message: error.message, conflicts: error.conflicts }); next(error); } finally { await session.endSession(); }
});
router.post('/:scheduleId/revoke', async (req, res, next) => { try { const schedule = await JobSchedule.findOne({ _id: req.params.scheduleId, status: 'pending_vendor' }); if (!schedule) return res.status(409).json({ message: 'Only a pending proposal can be revoked' }); schedule.status = 'revoked'; schedule.revokedAt = new Date(); schedule.revokedBy = actorId(req); schedule.publicTokenHash = undefined; await schedule.save(); const order = await Order.findById(schedule.orderId); if (order && String(order.currentJobScheduleId) === String(schedule._id)) { order.currentJobScheduleId = order.confirmedJobScheduleId; order.workflowStatus = order.confirmedJobScheduleId ? 'scheduled' : 'customer_approved'; await order.save(); } invalidate(); res.json(schedule); } catch (error) { next(error); } });
router.get('/work-orders/:id/pdf', async (req, res, next) => { try { const workOrder = await VendorWorkOrder.findById(req.params.id).lean(); if (!workOrder) return res.status(404).json({ message: 'Work order not found' }); const pdf = await createVendorWorkOrderPdf(workOrder); res.set('Content-Type', 'application/pdf'); res.set('Content-Disposition', `inline; filename="${workOrder.workOrderReference}.pdf"`); res.send(pdf); } catch (error) { next(error); } });
router.post('/outbox/:id/retry', async (req, res, next) => { try { const message = await EmailOutbox.findOne({ _id: req.params.id, type: { $in: STAGE5_TYPES }, status: 'permanently_failed' }); if (!message) return res.status(409).json({ message: 'Only a permanently failed scheduling email can be retried' }); Object.assign(message, { status: 'pending', attempts: 0, nextAttemptAt: new Date(), lockedUntil: undefined, lockedBy: undefined, lastErrorCategory: undefined }); await message.save(); res.json({ success: true }); } catch (error) { next(error); } });

router.use((error, _req, res, _next) => { console.error('Scheduling error:', error?.name || 'Error', error?.message || ''); res.status(error.status || (error.name === 'ValidationError' ? 400 : 500)).json({ message: error.message || 'Scheduling request failed' }); });
module.exports = router;
