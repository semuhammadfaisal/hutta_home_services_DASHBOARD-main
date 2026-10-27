const AgentNotificationState = require('../models/AgentNotificationState');
const CustomerInvoice = require('../models/CustomerInvoice');
const EmailOutbox = require('../models/EmailOutbox');
const JobCompletion = require('../models/JobCompletion');
const JobSchedule = require('../models/JobSchedule');
const Notification = require('../models/Notification');
const Order = require('../models/Order');
const OutgoingQuote = require('../models/OutgoingQuote');
const PropertyMembership = require('../models/PropertyMembership');
const RealEstateTransaction = require('../models/RealEstateTransaction');
const User = require('../models/User');
const { deadlineRisk } = require('./agentRequests');

const rank = level => ({ low: 0, medium: 1, high: 2, critical: 3 }[level] ?? 0);
const completed = order => order.workflowStatus === 'completed' || order.status === 'completed';
const cancelled = order => order.status === 'cancelled' || order.workflowStatus === 'cancelled';

async function publishPortalNotification({ userId, email, title, message, priority = 'medium', eventKey, transactionId, orderId, eventType, audience = 'agent' }) {
  const actionPath = audience === 'homeowner' ? '#notifications' : `#transactions/${transactionId}`;
  const pagePath = audience === 'homeowner' ? '/pages/residential-portal.html' : '/pages/agent-portal.html';
  await Notification.updateOne(
    { dedupeKey: `${eventKey}:notification:${userId}` },
    { $setOnInsert: { userId, title, message, type: orderId ? 'order' : 'info', priority, actionUrl: actionPath, dedupeKey: `${eventKey}:notification:${userId}`, metadata: { transactionId, orderId, eventType } } },
    { upsert: true }
  );
  if (email) await EmailOutbox.updateOne(
    { dedupeKey: `${eventKey}:email:${userId}` },
    { $setOnInsert: { type: audience === 'homeowner' ? 'homeowner_agent_action_reminder' : 'agent_portal_update', dedupeKey: `${eventKey}:email:${userId}`, recipients: [String(email).toLowerCase()], payload: { subject: title, heading: title, message, pagePath, actionPath, actionLabel: audience === 'homeowner' ? 'Open Homeowner Portal' : 'Open Transaction' }, transactionId, orderId } },
    { upsert: true }
  );
}

async function notifyHomeownersOfAgentUpload(transaction, document) {
  const memberships = await PropertyMembership.find({ customerId: transaction.customerId, propertyId: transaction.propertyId, relationship: 'owner', status: 'active' }).select('userId').lean();
  const users = await User.find({ _id: { $in: memberships.map(item => item.userId) }, isActive: true }).select('_id email').lean();
  await Promise.all(users.map(user => publishPortalNotification({
    userId: user._id, email: user.email, title: 'Your agent uploaded a document',
    message: `A document was added to ${transaction.label}. Sign in to review your property activity.`,
    eventKey: `agent-document:${transaction._id}:${document.documentId}`, transactionId: transaction._id,
    eventType: 'agent_document_uploaded', audience: 'homeowner'
  })));
}

async function runAgentNotificationSweep(now = new Date()) {
  const transactions = await RealEstateTransaction.find({ status: 'active', accessEndsAt: { $gt: now } }).lean();
  for (const transaction of transactions) {
    const [agent, orders] = await Promise.all([
      User.findById(transaction.agentUserId).select('_id email isActive').lean(),
      Order.find({ customerId: transaction.customerId, propertyId: transaction.propertyId }).select('_id orderId requestReference service status workflowStatus residentialRequest customerInvoiceId').lean()
    ]);
    if (!agent?.isActive) continue;
    const orderIds = orders.map(item => item._id);
    const [quotes, schedules, completions, invoiceCount, stateDoc] = await Promise.all([
      OutgoingQuote.find({ orderId: { $in: orderIds }, status: 'sent' }).sort({ revisionNumber: -1 }).lean(),
      JobSchedule.find({ orderId: { $in: orderIds }, status: 'accepted' }).sort({ revisionNumber: -1 }).lean(),
      JobCompletion.find({ orderId: { $in: orderIds }, status: 'completed' }).select('orderId beforePhotos afterPhotos').lean(),
      CustomerInvoice.countDocuments({ orderId: { $in: orderIds } }),
      AgentNotificationState.findOne({ transactionId: transaction._id })
    ]);
    const quoteByOrder = new Map(); const scheduleByOrder = new Map();
    quotes.forEach(item => { if (!quoteByOrder.has(String(item.orderId))) quoteByOrder.set(String(item.orderId), item); });
    schedules.forEach(item => { if (!scheduleByOrder.has(String(item.orderId))) scheduleByOrder.set(String(item.orderId), item); });
    const state = stateDoc || new AgentNotificationState({ transactionId: transaction._id });
    const risks = { ...(state.deadlineRiskByOrder || {}) };
    for (const order of orders.filter(item => !completed(item) && !cancelled(item))) {
      const risk = deadlineRisk(order, transaction, quoteByOrder.get(String(order._id)), scheduleByOrder.get(String(order._id)), now);
      const previous = risks[String(order._id)] || { level: 'low', cycle: 0 };
      let cycle = Number(previous.cycle || 0);
      if (rank(risk.level) >= 2 && rank(previous.level) < 2) cycle += 1;
      if (rank(risk.level) >= 2 && (rank(previous.level) < 2 || rank(risk.level) > rank(previous.level))) {
        const title = risk.level === 'critical' ? 'Critical transaction deadline risk' : 'Transaction deadline needs attention';
        await publishPortalNotification({ userId: agent._id, email: agent.email, title, message: `${order.service || 'Service work'} for ${transaction.label}: ${risk.reason || 'The closing deadline may be at risk.'}`, priority: 'high', eventKey: `deadline:${transaction._id}:${order._id}:${cycle}:${risk.level}`, transactionId: transaction._id, orderId: order._id, eventType: `deadline_${risk.level}` });
      }
      risks[String(order._id)] = { level: risk.level, cycle };
    }
    const relevant = orders.filter(item => !cancelled(item));
    const documented = new Set(completions.filter(item => (item.beforePhotos || []).length && (item.afterPhotos || []).length).map(item => String(item.orderId)));
    const packageReady = relevant.length > 0 && relevant.every(item => completed(item) && documented.has(String(item._id))) && invoiceCount >= relevant.length;
    if (packageReady && !state.packageReady) await publishPortalNotification({ userId: agent._id, email: agent.email, title: 'Transaction package is ready', message: `The client-safe completion package for ${transaction.label} is ready to download.`, eventKey: `package-ready:${transaction._id}`, transactionId: transaction._id, eventType: 'package_ready' });
    state.deadlineRiskByOrder = risks; state.markModified('deadlineRiskByOrder'); state.packageReady = packageReady;
    if (packageReady && !state.packageReadyAt) state.packageReadyAt = now;
    await state.save();
  }
}

function createAgentNotificationWorker({ run = runAgentNotificationSweep, connected = () => true, intervalMs = 15 * 60 * 1000, setTimer = setInterval, clearTimer = clearInterval, logger = console } = {}) {
  let timer; let running = false;
  const tick = async () => { if (running || !connected()) return; running = true; try { await run(); } catch (error) { logger.error('Agent notification worker failed:', error?.message || error); } finally { running = false; } };
  return { tick, start() { if (timer) return; timer = setTimer(tick, intervalMs); timer.unref?.(); setImmediate(tick); }, stop() { if (timer) clearTimer(timer); timer = null; } };
}

module.exports = { createAgentNotificationWorker, notifyHomeownersOfAgentUpload, publishPortalNotification, runAgentNotificationSweep };
