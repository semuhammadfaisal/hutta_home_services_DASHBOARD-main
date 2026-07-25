const express = require('express');
const mongoose = require('mongoose');
const checkRole = require('../middleware/rbac');
const CustomerQuoteDecision = require('../models/CustomerQuoteDecision');
const CustomerSatisfactionDecision = require('../models/CustomerSatisfactionDecision');
const EmailOutbox = require('../models/EmailOutbox');
const IncomingQuote = require('../models/IncomingQuote');
const IntakeSubmission = require('../models/IntakeSubmission');
const JobSchedule = require('../models/JobSchedule');
const JobCompletion = require('../models/JobCompletion');
const Order = require('../models/Order');
const OutgoingQuote = require('../models/OutgoingQuote');
const QuoteInvitation = require('../models/QuoteInvitation');
const VendorScheduleDecision = require('../models/VendorScheduleDecision');
const { synchronizeWorkflowOrder } = require('../utils/workflowSync');

const router = express.Router();
const allowedRoles = checkRole(['admin', 'manager', 'account_rep']);
const adminOnly = checkRole(['admin']);

const stageByStatus = {
  request_received: 1,
  quote_collection: 2,
  vendor_selected: 3,
  outgoing_quote_draft: 3,
  quote_sent: 4,
  quote_changes_requested: 4,
  customer_approved: 5,
  schedule_pending_vendor: 5,
  schedule_changes_requested: 5,
  scheduled: 6,
  completed: 6,
  closeout_issue_reported: 6
};

const attentionLabel = {
  request_received: 'Complete intake review',
  vendor_selected: 'Prepare customer quote',
  outgoing_quote_draft: 'Complete and send quote',
  quote_changes_requested: 'Customer requested quote changes',
  customer_approved: 'Propose vendor schedule',
  schedule_changes_requested: 'Vendor requested schedule changes',
  scheduled: 'Submit job completion',
  closeout_issue_reported: 'Resolve customer closeout issue'
};

function stageFor(order) {
  return stageByStatus[order.workflowStatus] || 1;
}

function clampLimit(value, fallback, maximum = 20) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(maximum, parsed)) : fallback;
}

function phoenixWeekBounds(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Phoenix',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short'
  }).formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  const localDate = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const mondayLocal = localDate - (((weekday + 6) % 7) * 86400000);
  // Arizona is UTC-7 year-round. Converting local midnight to UTC adds seven hours.
  const start = new Date(mondayLocal + (7 * 60 * 60 * 1000));
  return { start, end: new Date(start.getTime() + (7 * 86400000)) };
}

function idsToSet(ids = []) {
  return new Set(ids.filter(Boolean).map(String));
}

function toObjectIds(ids = []) {
  return ids.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(String(id)));
}

function summary(order, failedEmailOrderIds = new Set(), complianceOrderIds = new Set(), context = {}) {
  const reasons = [];
  if (order.missingData?.serviceCategory) reasons.push('Missing service category');
  if (order.missingData?.serviceAddress) reasons.push('Missing service address');
  if (order.requiresIntakeReview) reasons.push('Customer match review');
  if (failedEmailOrderIds.has(String(order._id))) reasons.push('Email delivery failed');
  if (complianceOrderIds.has(String(order._id))) reasons.push('Vendor compliance warning');
  if (context.overdueReason) reasons.unshift(context.overdueReason);
  if (['quote_changes_requested', 'schedule_changes_requested'].includes(order.workflowStatus)) {
    reasons.push(attentionLabel[order.workflowStatus]);
  }
  if (!order.employee) reasons.push('Unassigned');
  if (!reasons.length && attentionLabel[order.workflowStatus]) reasons.push(attentionLabel[order.workflowStatus]);
  const categories = [
    context.overdueReason && 'overdue',
    reasons.some(reason => /missing|review|compliance|failed|changes requested/i.test(reason)) && 'blocked',
    !order.employee && 'unassigned'
  ].filter(Boolean);
  const employee = order.employee && typeof order.employee === 'object'
    ? { id: order.employee._id, name: order.employee.name, avatar: order.employee.avatar || '' }
    : null;
  return {
    _id: order._id,
    orderId: order.orderId,
    requestReference: order.requestReference,
    customer: order.customer,
    service: order.service,
    vendor: order.vendor,
    workflowStatus: order.workflowStatus,
    stage: stageFor(order),
    updatedAt: order.updatedAt,
    createdAt: order.createdAt,
    employee,
    categories,
    category: categories[0] || 'blocked',
    primaryReason: reasons[0] || attentionLabel[order.workflowStatus] || 'Review workflow item',
    nextAction: nextActionFor(order),
    reasons,
    actionRequired: reasons.length > 0
  };
}

function nextActionFor(order) {
  const actions = {
    request_received: 'Review',
    quote_collection: 'Follow Up',
    vendor_selected: 'Prepare Quote',
    outgoing_quote_draft: 'Prepare Quote',
    quote_sent: 'Review',
    quote_changes_requested: 'Review Changes',
    customer_approved: 'Schedule',
    schedule_pending_vendor: 'Follow Up',
    schedule_changes_requested: 'Review Changes',
    scheduled: 'Complete',
    completed: 'Review',
    closeout_issue_reported: 'Resolve'
  };
  return { label: actions[order.workflowStatus] || 'Review', targetStage: stageFor(order) };
}

function deadlineReasonMap(groups) {
  const result = new Map();
  const add = (ids, reason) => ids.forEach(id => {
    const key = String(id);
    if (!result.has(key)) result.set(key, reason);
  });
  add(groups.expiredIntakes, 'Intake completion link expired');
  add(groups.expiredInvitations, 'Vendor quote invitation expired');
  add(groups.expiredQuotes, 'Customer quote expired');
  add(groups.expiredSchedules, 'Vendor schedule proposal expired');
  add(groups.expiredCompletions, 'Vendor completion link expired');
  add(groups.overdueSatisfaction, 'Customer feedback overdue');
  return result;
}

function activityLabel(type) {
  return ({
    request_created: ['New request created', 1, 'info'],
    intake_completed: ['Customer completed request details', 1, 'success'],
    vendor_quote_submitted: ['Vendor quote submitted', 2, 'info'],
    vendor_quote_selected: ['Vendor quote selected', 2, 'success'],
    customer_quote_sent: ['Customer quote sent', 3, 'info'],
    customer_quote_approved: ['Customer approved the quote', 4, 'success'],
    customer_quote_changes_requested: ['Customer requested quote changes', 4, 'warning'],
    schedule_confirmed: ['Schedule confirmed with vendor', 5, 'success'],
    schedule_changes_requested: ['Vendor requested schedule changes', 5, 'warning'],
    job_completed: ['Job marked complete', 6, 'success'],
    satisfaction_received: ['Customer confirmed satisfaction', 6, 'success'],
    closeout_issue_reported: ['Customer reported a closeout issue', 6, 'danger']
  })[type] || ['Workflow activity updated', 1, 'info'];
}

async function loadRecentActivity(limit) {
  const projectionLimit = Math.max(limit, 8);
  const [intakes, incoming, outgoing, quoteDecisions, scheduleDecisions, completions, satisfaction] = await Promise.all([
    IntakeSubmission.find({ orderId: { $ne: null } }).select('orderId receivedAt completedAt').sort({ updatedAt: -1 }).limit(projectionLimit).lean(),
    IncomingQuote.find({ $or: [{ submittedAt: { $ne: null } }, { selectedAt: { $ne: null } }] }).select('orderId submittedAt selectedAt').sort({ updatedAt: -1 }).limit(projectionLimit).lean(),
    OutgoingQuote.find({ sentAt: { $ne: null } }).select('orderId sentAt').sort({ sentAt: -1 }).limit(projectionLimit).lean(),
    CustomerQuoteDecision.find().select('orderId decision decisionAt').sort({ decisionAt: -1 }).limit(projectionLimit).lean(),
    VendorScheduleDecision.find().select('orderId decision decisionAt').sort({ decisionAt: -1 }).limit(projectionLimit).lean(),
    JobCompletion.find({ completedAt: { $ne: null } }).select('orderId completedAt').sort({ completedAt: -1 }).limit(projectionLimit).lean(),
    CustomerSatisfactionDecision.find().select('orderId decision decisionAt').sort({ decisionAt: -1 }).limit(projectionLimit).lean()
  ]);
  const events = [];
  const push = (orderId, eventType, occurredAt) => {
    if (orderId && occurredAt) events.push({ orderId: String(orderId), eventType, occurredAt });
  };
  intakes.forEach(item => {
    push(item.orderId, 'request_created', item.receivedAt);
    push(item.orderId, 'intake_completed', item.completedAt);
  });
  incoming.forEach(item => {
    push(item.orderId, 'vendor_quote_submitted', item.submittedAt);
    push(item.orderId, 'vendor_quote_selected', item.selectedAt);
  });
  outgoing.forEach(item => push(item.orderId, 'customer_quote_sent', item.sentAt));
  quoteDecisions.forEach(item => push(item.orderId, item.decision === 'approved' ? 'customer_quote_approved' : 'customer_quote_changes_requested', item.decisionAt));
  scheduleDecisions.forEach(item => push(item.orderId, item.decision === 'accepted' ? 'schedule_confirmed' : 'schedule_changes_requested', item.decisionAt));
  completions.forEach(item => push(item.orderId, 'job_completed', item.completedAt));
  satisfaction.forEach(item => push(item.orderId, item.decision === 'satisfied' ? 'satisfaction_received' : 'closeout_issue_reported', item.decisionAt));
  const selected = events.sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)).slice(0, limit);
  const orders = await Order.find({ _id: { $in: selected.map(item => item.orderId) } })
    .select('requestReference orderId customer.name service')
    .lean();
  const ordersById = new Map(orders.map(order => [String(order._id), order]));
  return selected.map(event => {
    const order = ordersById.get(event.orderId) || {};
    const [label, stage, tone] = activityLabel(event.eventType);
    return {
      ...event,
      label,
      stage,
      tone,
      requestReference: order.requestReference || order.orderId,
      customerName: order.customer?.name || 'Customer',
      service: order.service || 'Service request'
    };
  });
}

router.get('/overview', allowedRoles, async (req, res, next) => {
  try {
    const workflowStatuses = Object.keys(stageByStatus);
    const now = new Date();
    const satisfactionDeadline = new Date(now.getTime() - (48 * 60 * 60 * 1000));
    const { start: weekStart, end: weekEnd } = phoenixWeekBounds(now);
    const attentionFilter = ['all', 'overdue', 'blocked', 'unassigned'].includes(req.query.attention) ? req.query.attention : 'all';
    const attentionLimit = clampLimit(req.query.attentionLimit, 5);
    const activityLimit = clampLimit(req.query.activityLimit, 8);
    const [
      statusGroups, failedEmails, complianceQuotes, expiredIntakes, expiredInvitations,
      expiredQuotes, expiredSchedules, expiredCompletions, overdueSatisfaction,
      scheduledThisWeek, recentActivity
    ] = await Promise.all([
      Order.aggregate([
        { $match: { workflowStatus: { $in: workflowStatuses } } },
        { $group: { _id: '$workflowStatus', total: { $sum: 1 } } }
      ]),
      EmailOutbox.find({ status: 'permanently_failed', orderId: { $exists: true } }).distinct('orderId'),
      IncomingQuote.find({ status: 'selected', 'vendorSnapshot.complianceWarnings.0': { $exists: true } }).distinct('orderId'),
      IntakeSubmission.find({ completionStatus: { $ne: 'completed' }, completionTokenExpiresAt: { $lte: now } }).distinct('orderId'),
      QuoteInvitation.find({ status: { $in: ['sent', 'delivery_failed', 'processing'] }, expiresAt: { $lte: now } }).distinct('orderId'),
      OutgoingQuote.find({ status: 'sent', customerDecisionStatus: 'pending', validUntil: { $lte: now } }).distinct('orderId'),
      JobSchedule.find({ status: 'pending_vendor', tokenExpiresAt: { $lte: now } }).distinct('orderId'),
      JobCompletion.find({ status: 'pending', tokenExpiresAt: { $lte: now } }).distinct('orderId'),
      Order.find({ workflowStatus: 'completed', satisfactionStatus: 'pending', completedAt: { $lte: satisfactionDeadline } }).distinct('_id'),
      Order.countDocuments({ workflowStatus: { $in: workflowStatuses }, scheduledStart: { $gte: weekStart, $lt: weekEnd } }),
      loadRecentActivity(activityLimit)
    ]);
    const statusTotals = new Map(statusGroups.map(item => [item._id, item.total]));
    const stageTotal = stage => Object.entries(stageByStatus).reduce((total, [status, mappedStage]) => total + (mappedStage === stage ? (statusTotals.get(status) || 0) : 0), 0);
    const failedEmailOrderIds = idsToSet(failedEmails);
    const complianceOrderIds = idsToSet(complianceQuotes);
    const overdueReasons = deadlineReasonMap({ expiredIntakes, expiredInvitations, expiredQuotes, expiredSchedules, expiredCompletions, overdueSatisfaction });
    const overdueIds = [...overdueReasons.keys()];
    const blockedIds = [...new Set([...failedEmailOrderIds, ...complianceOrderIds])];
    const blockedCondition = {
      $or: [
        { _id: { $in: toObjectIds(blockedIds) } },
        { 'missingData.serviceCategory': true },
        { 'missingData.serviceAddress': true },
        { requiresIntakeReview: true },
        { workflowStatus: { $in: ['quote_changes_requested', 'schedule_changes_requested', 'closeout_issue_reported'] } }
      ]
    };
    const overdueCondition = { _id: { $in: toObjectIds(overdueIds) } };
    const unassignedCondition = { employee: null };
    const allCondition = { $or: [overdueCondition, blockedCondition, unassignedCondition] };
    const baseWorkflowCondition = { workflowStatus: { $in: workflowStatuses } };
    const [allAttentionCount, overdueCount, blockedCount, unassignedCount, attentionStatusGroups] = await Promise.all([
      Order.countDocuments({ $and: [baseWorkflowCondition, allCondition] }),
      Order.countDocuments({ $and: [baseWorkflowCondition, overdueCondition] }),
      Order.countDocuments({ $and: [baseWorkflowCondition, blockedCondition] }),
      Order.countDocuments({ $and: [baseWorkflowCondition, unassignedCondition] }),
      Order.aggregate([
        { $match: { $and: [baseWorkflowCondition, allCondition] } },
        { $group: { _id: '$workflowStatus', total: { $sum: 1 } } }
      ])
    ]);
    const selectedCondition = { all: allCondition, overdue: overdueCondition, blocked: blockedCondition, unassigned: unassignedCondition }[attentionFilter];
    const attentionOrders = await Order.find({ $and: [baseWorkflowCondition, selectedCondition] })
      .select('orderId requestReference customer service vendor employee workflowStatus missingData requiresIntakeReview createdAt updatedAt satisfactionStatus')
      .populate('vendor', 'name')
      .populate('employee', 'name avatar')
      .sort({ updatedAt: -1 })
      .limit(attentionLimit)
      .lean();
    const attention = attentionOrders.map(order => summary(order, failedEmailOrderIds, complianceOrderIds, {
      overdueReason: overdueReasons.get(String(order._id))
    }));
    const attentionStatusTotals = new Map(attentionStatusGroups.map(item => [item._id, item.total]));
    const counts = [1, 2, 3, 4, 5, 6].map(stage => ({
      stage,
      total: stageTotal(stage),
      attention: Object.entries(stageByStatus).reduce((total, [status, mappedStage]) => (
        total + (mappedStage === stage ? (attentionStatusTotals.get(status) || 0) : 0)
      ), 0)
    }));
    const recentOrders = await Order.find(baseWorkflowCondition)
      .select('orderId requestReference customer service vendor workflowStatus updatedAt')
      .populate('vendor', 'name')
      .sort({ updatedAt: -1 })
      .limit(12)
      .lean();
    const recent = recentOrders.map(order => summary(order, failedEmailOrderIds, complianceOrderIds));
    const [completedNeedsClose, fullyClosed] = await Promise.all([
      Order.countDocuments({ workflowStatus: 'completed', satisfactionStatus: { $in: ['not_requested', 'pending'] } }),
      Order.countDocuments({ workflowStatus: 'completed', satisfactionStatus: { $in: ['satisfied', 'issue_resolved'] } })
    ]);
    const workflowOrderTotal = [...statusTotals.values()].reduce((total, value) => total + value, 0);
    const openRequests = Math.max(0, workflowOrderTotal - fullyClosed);
    const readyToClose = (statusTotals.get('scheduled') || 0)
      + (statusTotals.get('closeout_issue_reported') || 0)
      + completedNeedsClose;
    const metrics = [
      { key: 'open_requests', label: 'Open Requests', total: openRequests, supportingCount: blockedCount, supportingLabel: 'blocked', tone: 'info', targetStage: 1 },
      { key: 'waiting_vendors', label: 'Waiting for Vendors', total: statusTotals.get('quote_collection') || 0, supportingCount: idsToSet(expiredInvitations).size, supportingLabel: 'overdue', tone: 'warning', targetStage: 2 },
      { key: 'awaiting_approval', label: 'Awaiting Approval', total: statusTotals.get('quote_sent') || 0, supportingCount: idsToSet(expiredQuotes).size, supportingLabel: 'overdue', tone: 'orange', targetStage: 4 },
      { key: 'scheduled_this_week', label: 'Scheduled This Week', total: scheduledThisWeek, supportingCount: 0, supportingLabel: '', tone: 'purple', targetStage: 5 },
      { key: 'ready_to_close', label: 'Ready to Close', total: readyToClose, supportingCount: idsToSet(overdueSatisfaction).size, supportingLabel: 'feedback overdue', tone: 'success', targetStage: 6 }
    ];
    res.json({
      counts,
      metrics,
      attentionCounts: { all: allAttentionCount, overdue: overdueCount, blocked: blockedCount, unassigned: unassignedCount },
      actionRequiredTotal: allAttentionCount,
      attention,
      recent,
      recentActivity,
      refreshedAt: new Date().toISOString()
    });
  } catch (error) { next(error); }
});

router.get('/orders/:orderId/journey', allowedRoles, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.orderId)) return res.status(400).json({ message: 'Invalid Order ID' });
    const order = await Order.findById(req.params.orderId)
      .select('orderId requestReference customer service description vendor workflowStatus missingData requiresIntakeReview createdAt updatedAt')
      .populate('vendor', 'name')
      .lean();
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const [intake, incoming, outgoing, schedule, completion] = await Promise.all([
      IntakeSubmission.findOne({ orderId: order._id }).select('requestReference status receivedAt requiresReview').lean(),
      IncomingQuote.findOne({ orderId: order._id, status: 'selected' }).select('quoteReference status selectedAt updatedAt').lean(),
      OutgoingQuote.findOne({ orderId: order._id }).sort({ revisionNumber: -1 }).select('quoteReference status customerDecisionStatus sentAt updatedAt').lean(),
      JobSchedule.findOne({ orderId: order._id }).sort({ revisionNumber: -1 }).select('scheduleReference status sentAt acceptedAt updatedAt').lean(),
      JobCompletion.findOne({ orderId: order._id }).select('completionReference status completedAt satisfactionDecisionId updatedAt').lean()
    ]);
    const currentStage = stageFor(order);
    const references = [intake?.requestReference, incoming?.quoteReference, outgoing?.quoteReference, outgoing?.quoteReference, schedule?.scheduleReference, completion?.completionReference];
    const timestamps = [intake?.receivedAt || order.createdAt, incoming?.selectedAt || incoming?.updatedAt, outgoing?.sentAt || outgoing?.updatedAt, outgoing?.sentAt || outgoing?.updatedAt, schedule?.acceptedAt || schedule?.sentAt || schedule?.updatedAt, completion?.completedAt || completion?.updatedAt];
    const stages = [1, 2, 3, 4, 5, 6].map(stage => ({
      stage,
      state: stage < currentStage ? 'completed' : stage === currentStage ? 'current' : 'upcoming',
      reference: references[stage - 1] || null,
      timestamp: timestamps[stage - 1] || null
    }));
    if ((order.missingData?.serviceAddress || order.missingData?.serviceCategory || order.requiresIntakeReview) && currentStage === 1) stages[0].state = 'attention';
    if (order.workflowStatus === 'quote_changes_requested') stages[3].state = 'attention';
    if (order.workflowStatus === 'schedule_changes_requested') stages[4].state = 'attention';
    if (order.workflowStatus === 'completed') stages[5].state = 'completed';
    if (order.workflowStatus === 'closeout_issue_reported') stages[5].state = 'attention';
    res.json({ order, currentStage, stages });
  } catch (error) { next(error); }
});

router.post('/reconcile/:orderId', adminOnly, async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.orderId)) return res.status(400).json({ message: 'Invalid Order ID' });
  const session = await mongoose.startSession();
  try {
    let sync;
    await session.withTransaction(async () => {
      const order = await Order.findById(req.params.orderId).session(session);
      if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
      if (!order.workflowStatus) throw Object.assign(new Error('This manual Order is not managed by Workflow Center'), { status: 409 });
      sync = await synchronizeWorkflowOrder(order, order.workflowStatus, { session });
    });
    res.json({ success: true, sync });
  } catch (error) {
    next(error);
  } finally {
    await session.endSession();
  }
});

module.exports = router;
module.exports.__test = { stageByStatus, stageFor, summary, phoenixWeekBounds, activityLabel, nextActionFor };
