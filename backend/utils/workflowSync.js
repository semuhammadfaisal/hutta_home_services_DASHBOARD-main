const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const PipelineRecord = require('../models/PipelineRecord');
const Stage = require('../models/Stage');

const WORKFLOW_STATUS = Object.freeze({
  request_received: { orderStatus: 'new', stageKey: 'work_order_received' },
  quote_collection: { orderStatus: 'in-progress', stageKey: 'bidding' },
  vendor_selected: { orderStatus: 'in-progress', stageKey: 'bidding' },
  outgoing_quote_draft: { orderStatus: 'in-progress', stageKey: 'bidding' },
  quote_sent: { orderStatus: 'in-progress', stageKey: 'bid_submitted' },
  quote_changes_requested: { orderStatus: 'in-progress', stageKey: 'bidding' },
  customer_approved: { orderStatus: 'in-progress', stageKey: 'approved_ready_to_schedule' },
  schedule_pending_vendor: { orderStatus: 'in-progress', stageKey: 'approved_ready_to_schedule' },
  schedule_changes_requested: { orderStatus: 'in-progress', stageKey: 'approved_ready_to_schedule' },
  scheduled: { orderStatus: 'in-progress', stageKey: 'in_progress' },
  awaiting_customer_closeout: { orderStatus: 'in-progress', stageKey: 'invoice_sent' },
  completed: { orderStatus: 'completed', stageKey: 'invoice_sent' },
  closeout_issue_reported: { orderStatus: 'in-progress', stageKey: 'awaiting_documentation' }
});

const STAGE_DEFINITIONS = Object.freeze({
  work_order_received: { name: 'Work Order Received', position: 1, aliases: [/^work order received$/i] },
  bidding: { name: 'Bidding', position: 2, aliases: [/^bidding$/i] },
  bid_submitted: { name: 'Bid Submitted to Client', position: 3, aliases: [/^bid submitted to client$/i] },
  approved_ready_to_schedule: {
    name: 'Approved – Ready to Schedule',
    position: 4,
    aliases: [/^approved.*ready to schedule$/i]
  },
  in_progress: { name: 'In Progress', position: 5, aliases: [/^in progress$/i] },
  awaiting_documentation: { name: 'Awaiting Documentation', position: 6, aliases: [/^awaiting documentation$/i] },
  ready_to_invoice: { name: 'Ready to Invoice', position: 7, aliases: [/^ready to invoice$/i] },
  invoice_sent: { name: 'Invoice Sent', position: 8, aliases: [/^invoice sent$/i] },
  paid: { name: 'Paid', position: 9, aliases: [/^paid$/i] },
  closed: { name: 'Closed', position: 10, aliases: [/^closed$/i] }
});

function withSession(query, session) {
  return session ? query.session(session) : query;
}

async function resolveStage(systemKey, session, { createMissing = true } = {}) {
  const definition = STAGE_DEFINITIONS[systemKey];
  if (!definition) throw Object.assign(new Error(`Unknown Pipeline system stage: ${systemKey}`), { status: 500 });

  let stage = await withSession(Stage.findOne({ systemKey }), session);
  if (stage) return stage;

  const stages = await withSession(Stage.find({}), session);
  stage = stages.find(candidate => definition.aliases.some(pattern => pattern.test(String(candidate.name || '').trim())));
  if (stage) {
    if (!stage.systemKey) {
      stage.systemKey = systemKey;
      await stage.save({ session });
    }
    return stage;
  }

  if (!createMissing) return null;
  [stage] = await Stage.create([{
    name: definition.name,
    position: definition.position,
    description: `System Pipeline stage: ${definition.name}`,
    systemKey
  }], session ? { session } : undefined);
  return stage;
}

function pipelinePayload(order, stage, source, now) {
  return {
    stageId: stage._id,
    orderId: order._id,
    orderIdDisplay: order.orderId,
    customerName: order.customer?.name || 'Unknown customer',
    email: order.customer?.email || '',
    phone: order.customer?.phone || '',
    priority: order.priority || 'medium',
    budget: Number.isFinite(Number(order.amount)) ? Number(order.amount) : 0,
    startDate: order.scheduledStart || order.scheduleDate || order.startDate,
    address: order.customer?.address || '',
    description: order.description || order.service || '',
    notes: order.notes || '',
    stageSource: source,
    stageSyncedAt: now,
    workflowStatus: order.workflowStatus,
    orderStatus: order.status
  };
}

async function hasReceivedPayment(orderId, session) {
  return Boolean(await withSession(Payment.exists({
    order: orderId,
    status: { $in: ['received', 'completed'] }
  }), session));
}

async function synchronizeWorkflowOrderInSession(order, targetWorkflowStatus, options = {}) {
  const {
    session,
    stageSource = 'workflow',
    preserveNoBid = true,
    saveOrder = true
  } = options;
  const mapping = WORKFLOW_STATUS[targetWorkflowStatus];
  if (!mapping) throw Object.assign(new Error(`Unsupported workflow status: ${targetWorkflowStatus}`), { status: 400 });

  const now = new Date();
  order.workflowStatus = targetWorkflowStatus;
  order.status = mapping.orderStatus;

  let stageKey = mapping.stageKey;
  let source = stageSource;
  if (await hasReceivedPayment(order._id, session)) {
    stageKey = 'paid';
    source = 'payment';
  }

  let record = await withSession(PipelineRecord.findOne({
    $or: [
      { orderId: order._id },
      ...(order.pipelineRecordId ? [{ _id: order.pipelineRecordId }] : [])
    ]
  }).populate('stageId'), session);

  const currentStage = record?.stageId;
  const protectedNoBid = preserveNoBid && currentStage && (
    currentStage.isNoBid ||
    /^(lost|no bid|no-bid)$/i.test(String(currentStage.name || '').trim())
  );

  let stage = currentStage;
  if (!protectedNoBid) stage = await resolveStage(stageKey, session);

  if (!record) {
    [record] = await PipelineRecord.create([pipelinePayload(order, stage, source, now)], session ? { session } : undefined);
  } else {
    Object.assign(record, pipelinePayload(order, stage, protectedNoBid ? record.stageSource : source, now));
    await record.save({ session });
  }

  order.pipelineRecordId = record._id;
  order.pipelineStage = stage?.name || order.pipelineStage;
  if (saveOrder) await order.save({ session });

  return {
    orderId: String(order._id),
    workflowStatus: order.workflowStatus,
    orderStatus: order.status,
    pipelineStage: order.pipelineStage,
    pipelineRecordId: String(record._id),
    updatedAt: now
  };
}

async function synchronizeWorkflowOrder(order, targetWorkflowStatus, options = {}) {
  if (options.session) return synchronizeWorkflowOrderInSession(order, targetWorkflowStatus, options);

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      order.$session(session);
      result = await synchronizeWorkflowOrderInSession(order, targetWorkflowStatus, { ...options, session });
    });
    return result;
  } finally {
    order.$session(null);
    await session.endSession();
  }
}

async function synchronizePaymentStage(order, options = {}) {
  const { session, saveOrder = true } = options;
  if (!order.workflowStatus) return null;
  return synchronizeWorkflowOrder(order, order.workflowStatus, {
    session,
    stageSource: 'payment',
    preserveNoBid: false,
    saveOrder
  });
}

module.exports = {
  STAGE_DEFINITIONS,
  WORKFLOW_STATUS,
  resolveStage,
  synchronizePaymentStage,
  synchronizeWorkflowOrder
};
