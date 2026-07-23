const express = require('express');
const mongoose = require('mongoose');
const checkRole = require('../middleware/rbac');
const EmailOutbox = require('../models/EmailOutbox');
const IncomingQuote = require('../models/IncomingQuote');
const IntakeSubmission = require('../models/IntakeSubmission');
const JobSchedule = require('../models/JobSchedule');
const JobCompletion = require('../models/JobCompletion');
const Order = require('../models/Order');
const OutgoingQuote = require('../models/OutgoingQuote');
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

function summary(order, failedEmailOrderIds = new Set(), complianceOrderIds = new Set()) {
  const reasons = [];
  if (order.missingData?.serviceCategory) reasons.push('Missing service category');
  if (order.missingData?.serviceAddress) reasons.push('Missing service address');
  if (order.requiresIntakeReview) reasons.push('Customer match review');
  if (attentionLabel[order.workflowStatus]) reasons.push(attentionLabel[order.workflowStatus]);
  if (failedEmailOrderIds.has(String(order._id))) reasons.push('Email delivery failed');
  if (complianceOrderIds.has(String(order._id))) reasons.push('Vendor compliance warning');
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
    reasons,
    actionRequired: reasons.length > 0
  };
}

router.get('/overview', allowedRoles, async (_req, res, next) => {
  try {
    const workflowStatuses = Object.keys(stageByStatus);
    const [orders, failedEmails, complianceQuotes] = await Promise.all([
      Order.find({ workflowStatus: { $in: workflowStatuses } })
        .select('orderId requestReference customer service vendor workflowStatus missingData requiresIntakeReview updatedAt')
        .populate('vendor', 'name')
        .sort({ updatedAt: -1 })
        .limit(500)
        .lean(),
      EmailOutbox.find({ status: 'permanently_failed', orderId: { $exists: true } }).distinct('orderId'),
      IncomingQuote.find({ status: 'selected', 'vendorSnapshot.complianceWarnings.0': { $exists: true } }).distinct('orderId')
    ]);
    const failedEmailOrderIds = new Set(failedEmails.map(String));
    const complianceOrderIds = new Set(complianceQuotes.map(String));
    const items = orders.map(order => summary(order, failedEmailOrderIds, complianceOrderIds));
    const counts = [1, 2, 3, 4, 5, 6].map(stage => ({
      stage,
      total: items.filter(item => item.stage === stage).length,
      attention: items.filter(item => item.stage === stage && item.actionRequired).length
    }));
    const attention = items
      .filter(item => item.actionRequired)
      .sort((a, b) => {
        const criticalA = a.reasons.some(reason => /failed|changes|missing/i.test(reason)) ? 1 : 0;
        const criticalB = b.reasons.some(reason => /failed|changes|missing/i.test(reason)) ? 1 : 0;
        return criticalB - criticalA || new Date(b.updatedAt) - new Date(a.updatedAt);
      })
      .slice(0, 20);
    res.json({
      counts,
      actionRequiredTotal: items.filter(item => item.actionRequired).length,
      attention,
      recent: items.slice(0, 12),
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
module.exports.__test = { stageByStatus, stageFor, summary };
