const express = require('express');
const mongoose = require('mongoose');
const AgentInvitation = require('../models/AgentInvitation');
const AgentClientInvitation = require('../models/AgentClientInvitation');
const AgentReferralAttribution = require('../models/AgentReferralAttribution');
const Customer = require('../models/Customer');
const Property = require('../models/Property');
const PropertyMembership = require('../models/PropertyMembership');
const RealEstateAgentProfile = require('../models/RealEstateAgentProfile');
const RealEstateTransaction = require('../models/RealEstateTransaction');
const Notification = require('../models/Notification');
const Order = require('../models/Order');
const PortalActivity = require('../models/PortalActivity');
const User = require('../models/User');
const { agentPermissions, calculateAccessExpiry, createInvitationToken, hashInvitationToken, membershipPermissions } = require('../utils/agentAccess');
const { deadlineRisk } = require('../utils/agentRequests');
const { daysFromPhoenixToday } = require('../utils/agentOverview');
const { synchronizeWorkflowOrder } = require('../utils/workflowSync');

const router = express.Router();
const VendorAvailabilitySlot = require('../models/VendorAvailabilitySlot');
const Vendor = require('../models/Vendor');
const { activeCompliance, tradeMatches, serviceAreaMatches } = require('../utils/vendorLeadDistribution');
const { SERVICE_CATEGORIES } = require('../utils/residentialRequests');
const validId = value => mongoose.Types.ObjectId.isValid(String(value || ''));
const clean = (value, max) => String(value || '').trim().slice(0, max);
const agentProfilePayload = (user, profile, counts = {}) => {
  const required = { firstName: user?.firstName, lastName: user?.lastName, phone: user?.phone, brokerageName: profile?.brokerageName, licenseNumber: profile?.licenseNumber };
  const missingFields = Object.entries(required).filter(([, value]) => !String(value || '').trim()).map(([key]) => key);
  return {
    userId: String(user._id), profileId: profile?._id ? String(profile._id) : null,
    displayName: profile?.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone,
    brokerageName: profile?.brokerageName, licenseNumber: profile?.licenseNumber, referralCode: profile?.referralCode,
    status: profile?.status || (user.isActive ? 'profile_missing' : 'inactive'), isActive: user.isActive === true,
    profileCompletion: { complete: missingFields.length === 0, missingFields },
    counts: { activeTransactions: 0, totalTransactions: 0, pendingInvitations: 0, submittedRequests: 0, completedJobs: 0, ...counts },
    createdAt: user.createdAt, updatedAt: profile?.updatedAt || user.updatedAt
  };
};

router.get('/agents', async (_req, res, next) => {
  try {
    const users = await User.find({ role: 'real_estate_agent' }).select('_id firstName lastName email phone role isActive createdAt updatedAt').sort({ createdAt: -1 }).lean();
    const userIds = users.map(user => user._id);
    const [profiles, transactionCounts, invitationCounts, requestCounts, referrals] = await Promise.all([
      RealEstateAgentProfile.find({ userId: { $in: userIds } }).select('userId displayName brokerageName licenseNumber referralCode status updatedAt').lean(),
      RealEstateTransaction.aggregate([{ $match: { agentUserId: { $in: userIds } } }, { $group: { _id: '$agentUserId', totalTransactions: { $sum: 1 }, activeTransactions: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } } } }]),
      AgentClientInvitation.aggregate([{ $match: { agentUserId: { $in: userIds }, status: 'pending' } }, { $group: { _id: '$agentUserId', pendingInvitations: { $sum: 1 } } }]),
      Order.aggregate([{ $match: { 'residentialRequest.submittedBy': { $in: userIds }, source: { $in: ['agent_portal', 'agent_fulfillment'] } } }, { $group: { _id: '$residentialRequest.submittedBy', submittedRequests: { $sum: 1 } } }]),
      AgentReferralAttribution.aggregate([{ $match: { agentUserId: { $in: userIds } } }, { $group: { _id: '$agentUserId', completedJobs: { $sum: '$completedJobCount' } } }])
    ]);
    const profileMap = new Map(profiles.map(item => [String(item.userId), item]));
    const countMap = new Map();
    for (const rows of [transactionCounts, invitationCounts, requestCounts, referrals]) for (const row of rows) { const { _id, ...counts } = row; countMap.set(String(_id), { ...(countMap.get(String(_id)) || {}), ...counts }); }
    const data = users.map(user => agentProfilePayload(user, profileMap.get(String(user._id)), countMap.get(String(user._id))));
    res.set('Cache-Control', 'no-store').json({ data, summary: { total: data.length, active: data.filter(item => item.isActive && item.status === 'active').length, incomplete: data.filter(item => !item.profileCompletion.complete).length, activeTransactions: data.reduce((total, item) => total + Number(item.counts.activeTransactions || 0), 0) } });
  } catch (error) { next(error); }
});

router.get('/agents/:agentUserId', async (req, res, next) => {
  try {
    if (!validId(req.params.agentUserId)) return res.status(400).json({ message: 'Invalid agent id' });
    const user = await User.findOne({ _id: req.params.agentUserId, role: 'real_estate_agent' }).select('_id firstName lastName email phone role isActive createdAt updatedAt').lean();
    if (!user) return res.status(404).json({ message: 'Agent not found' });
    const [profile, transactions, invitations, referrals, orders] = await Promise.all([
      RealEstateAgentProfile.findOne({ userId: user._id }).select('userId displayName brokerageName licenseNumber referralCode status createdAt updatedAt').lean(),
      RealEstateTransaction.find({ agentUserId: user._id }).select('_id customerId propertyId label closeDate accessEndsAt status permissions acceptedAt createdAt').sort({ closeDate: -1 }).lean(),
      AgentClientInvitation.find({ agentUserId: user._id }).select('_id homeownerName homeownerEmail transactionLabel closeDate accessEndsAt status deliveryStatus expiresAt acceptedAt createdAt').sort({ createdAt: -1 }).limit(250).lean(),
      AgentReferralAttribution.find({ agentUserId: user._id }).select('_id customerId propertyId transactionId status attributedAt convertedAt convertedJobCount completedJobCount lastJobAt').sort({ attributedAt: -1 }).lean(),
      Order.find({ 'residentialRequest.submittedBy': user._id, source: { $in: ['agent_portal', 'agent_fulfillment'] } }).select('_id orderId requestReference service status workflowStatus source customerId propertyId residentialRequest.targetCompletionDeadline createdAt completedAt').sort({ createdAt: -1 }).limit(250).lean()
    ]);
    const customerIds = [...new Set(transactions.map(item => String(item.customerId)))];
    const propertyIds = [...new Set(transactions.map(item => String(item.propertyId)))];
    const [customers, properties] = await Promise.all([
      Customer.find({ _id: { $in: customerIds } }).select('_id name email phone status').lean(),
      Property.find({ _id: { $in: propertyIds } }).select('_id label addressLine1 addressLine2 city state postalCode propertyType status').lean()
    ]);
    const customerMap = new Map(customers.map(item => [String(item._id), item])); const propertyMap = new Map(properties.map(item => [String(item._id), item]));
    const transactionData = transactions.map(item => { const customer = customerMap.get(String(item.customerId)); const property = propertyMap.get(String(item.propertyId)); return { id: String(item._id), label: item.label, closeDate: item.closeDate, accessEndsAt: item.accessEndsAt, maximumAccessEndsAt: calculateAccessExpiry(item.closeDate, 30), status: item.status, permissions: item.permissions, acceptedAt: item.acceptedAt, createdAt: item.createdAt, customer: customer ? { id: String(customer._id), name: customer.name, email: customer.email, phone: customer.phone, status: customer.status } : null, property: property ? { id: String(property._id), label: property.label, addressLine1: property.addressLine1, addressLine2: property.addressLine2, city: property.city, state: property.state, postalCode: property.postalCode, propertyType: property.propertyType, status: property.status } : null }; });
    const completedJobs = referrals.reduce((total, item) => total + Number(item.completedJobCount || 0), 0);
    const counts = { activeTransactions: transactions.filter(item => item.status === 'active').length, totalTransactions: transactions.length, pendingInvitations: invitations.filter(item => item.status === 'pending').length, submittedRequests: orders.length, completedJobs };
    res.set('Cache-Control', 'no-store').json({
      agent: agentProfilePayload(user, profile, counts), transactions: transactionData,
      invitations: invitations.map(item => ({ id: String(item._id), homeownerName: item.homeownerName, homeownerEmail: item.homeownerEmail, transactionLabel: item.transactionLabel, closeDate: item.closeDate, accessEndsAt: item.accessEndsAt, status: item.status, deliveryStatus: item.deliveryStatus, expiresAt: item.expiresAt, acceptedAt: item.acceptedAt, createdAt: item.createdAt })),
      referrals: referrals.map(item => ({ id: String(item._id), transactionId: String(item.transactionId), status: item.status, attributedAt: item.attributedAt, convertedAt: item.convertedAt, convertedJobCount: item.convertedJobCount || 0, completedJobCount: item.completedJobCount || 0, lastJobAt: item.lastJobAt })),
      orders: orders.map(item => ({ id: String(item._id), orderId: item.orderId, requestReference: item.requestReference, service: item.service, status: item.status, workflowStatus: item.workflowStatus, source: item.source, transactionId: item.residentialRequest?.transactionId ? String(item.residentialRequest.transactionId) : null, targetCompletionDeadline: item.residentialRequest?.targetCompletionDeadline, createdAt: item.createdAt, completedAt: item.completedAt }))
    });
  } catch (error) { next(error); }
});
router.post('/availability-slots', async (req, res, next) => {
  try {
    const { vendorId, serviceCategory } = req.body;
    const startsAt = new Date(req.body.startsAt), endsAt = new Date(req.body.endsAt);
    const postalCodes = Array.isArray(req.body.postalCodes) ? [...new Set(req.body.postalCodes.map(String))] : [];
    if (!validId(vendorId) || !SERVICE_CATEGORIES.includes(serviceCategory) || !Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || startsAt <= new Date() || endsAt <= startsAt || endsAt - startsAt > 86400000 || !postalCodes.length || postalCodes.length > 100 || postalCodes.some(zip => !/^\d{5}$/.test(zip))) return res.status(400).json({ message: 'Valid vendor, service, future window, and ZIP codes are required' });
    const vendor = await Vendor.findById(vendorId).lean();
    if (!activeCompliance(vendor)) return res.status(409).json({ message: 'Vendor compliance is not current' });
    if (!tradeMatches(vendor, { service: serviceCategory }) || postalCodes.some(postalCode => !serviceAreaMatches(vendor, {}, { postalCode }))) return res.status(409).json({ message: 'Service or ZIP codes do not match the vendor profile' });
    const slot = await VendorAvailabilitySlot.create({ vendorId, serviceCategory, postalCodes, startsAt, endsAt, confirmedBy: req.user.userId });
    res.status(201).json({ id: String(slot._id), startsAt, endsAt, postalCodes });
  } catch (error) { next(error); }
});
router.post('/availability-slots/:id/withdraw', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid slot ID' });
    const slot = await VendorAvailabilitySlot.findByIdAndUpdate(req.params.id, { $set: { status: 'withdrawn' } }, { new: true });
    if (!slot) return res.status(404).json({ message: 'Slot not found' });
    res.json({ id: String(slot._id), status: slot.status });
  } catch (error) { next(error); }
});

router.get('/requests', async (_req, res, next) => {
  try {
    const orders = await Order.find({ source: 'agent_portal', workflowStatus: 'request_received' }).sort({ createdAt: -1 }).limit(250).lean();
    if (!orders.length) return res.json({ data: [], summary: { awaitingReview: 0, urgent: 0, closingWithinSevenDays: 0, attachments: 0 } });
    const transactionIds = orders.map(order => order.residentialRequest?.transactionId).filter(Boolean);
    const agentUserIds = orders.map(order => order.residentialRequest?.submittedBy).filter(Boolean);
    const [transactions, profiles] = await Promise.all([
      RealEstateTransaction.find({ _id: { $in: transactionIds } }).select('_id label closeDate propertyId customerId agentUserId').lean(),
      RealEstateAgentProfile.find({ userId: { $in: agentUserIds } }).select('userId displayName brokerageName').lean()
    ]);
    const transactionMap = new Map(transactions.map(item => [String(item._id), item]));
    const profileMap = new Map(profiles.map(item => [String(item.userId), item]));
    const now = new Date();
    const data = orders.map(order => {
      const transaction = transactionMap.get(String(order.residentialRequest?.transactionId || ''));
      const profile = profileMap.get(String(order.residentialRequest?.submittedBy || ''));
      const risk = deadlineRisk(order, transaction || {}, null, null, now);
      return {
        id: String(order._id), requestReference: order.requestReference || order.orderId, service: order.service,
        scope: order.description, priority: order.priority, createdAt: order.createdAt,
        customer: { name: order.customer?.name, address: order.customer?.address },
        agent: profile ? { userId: String(profile.userId), displayName: profile.displayName, brokerageName: profile.brokerageName } : null,
        transaction: transaction ? { id: String(transaction._id), label: transaction.label, closeDate: transaction.closeDate, propertyId: String(transaction.propertyId) } : null,
        request: { urgency: order.residentialRequest?.urgency, preferredTiming: order.residentialRequest?.preferredTiming, targetCompletionDeadline: order.residentialRequest?.targetCompletionDeadline, accessInstructions: order.residentialRequest?.accessInstructions },
        deadlineRisk: risk,
        documents: (order.documents || []).map(document => ({ id: document.documentId, name: document.name, type: document.portalDocumentType || document.type, size: document.size }))
      };
    });
    res.json({
      data,
      summary: {
        awaitingReview: data.length,
        urgent: data.filter(item => ['urgent', 'emergency'].includes(item.request.urgency) || ['critical', 'high'].includes(item.deadlineRisk?.level)).length,
        closingWithinSevenDays: data.filter(item => { const days = daysFromPhoenixToday(item.transaction?.closeDate, now); return days !== null && days >= 0 && days <= 7; }).length,
        attachments: data.reduce((total, item) => total + item.documents.length, 0)
      }
    });
  } catch (error) { next(error); }
});

router.post('/requests/:orderId/advance', async (req, res, next) => {
  if (!validId(req.params.orderId)) return res.status(400).json({ message: 'Invalid request id' });
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const order = await Order.findOne({ _id: req.params.orderId, source: 'agent_portal', workflowStatus: 'request_received' }).session(session);
      if (!order) throw Object.assign(new Error('Pending agent request not found'), { status: 404 });
      const transaction = await RealEstateTransaction.findOne({ _id: order.residentialRequest?.transactionId, customerId: order.customerId, propertyId: order.propertyId }).session(session);
      if (!transaction) throw Object.assign(new Error('The linked agent transaction is unavailable'), { status: 409 });
      const now = new Date();
      order.source = 'agent_fulfillment';
      order.residentialStaffReview = { reviewedAt: now, reviewedBy: req.user.userId, scope: order.description };
      const sync = await synchronizeWorkflowOrder(order, 'quote_collection', { session });
      await PortalActivity.create([{
        userId: transaction.agentUserId, customerId: order.customerId, propertyId: order.propertyId, orderId: order._id,
        type: 'agent_request_accepted', title: 'Request sent to fulfillment', summary: `${order.service} · ${order.requestReference || order.orderId}`, occurredAt: now,
        metadata: { transactionId: transaction._id, workflowStatus: 'quote_collection' }
      }], { session });
      await Notification.create([{
        userId: transaction.agentUserId, title: 'Request sent to fulfillment', message: `${order.service} is now being prepared for vendor quoting.`,
        type: 'order', priority: 'medium', actionUrl: '#requests', metadata: { transactionId: transaction._id, orderId: order._id }
      }], { session });
      result = { id: String(order._id), source: order.source, workflowStatus: sync.workflowStatus, pipelineRecordId: sync.pipelineRecordId };
    });
    res.json({ request: result });
  } catch (error) { next(error); } finally { await session.endSession(); }
});

router.post('/agents', async (req, res, next) => {
  try {
    if (!validId(req.body?.userId)) return res.status(400).json({ message: 'Valid userId is required' });
    const user = await User.findOne({ _id: req.body.userId, role: 'real_estate_agent', isActive: true }).lean();
    if (!user) return res.status(409).json({ message: 'An active real-estate-agent user is required' });
    const referralCode = clean(req.body?.referralCode, 30).toUpperCase() || `AGENT-${String(user._id).slice(-8).toUpperCase()}`;
    const profile = await RealEstateAgentProfile.findOneAndUpdate({ userId: user._id }, { $set: { displayName: clean(req.body?.displayName, 160) || `${user.firstName} ${user.lastName}`, brokerageName: clean(req.body?.brokerageName, 180), licenseNumber: clean(req.body?.licenseNumber, 80), referralCode, status: 'active' } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.status(201).json({ agent: { id: String(profile._id), userId: String(profile.userId), displayName: profile.displayName, brokerageName: profile.brokerageName, licenseNumber: profile.licenseNumber, referralCode: profile.referralCode, status: profile.status } });
  } catch (error) { next(error); }
});

router.post('/invitations', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    for (const key of ['agentUserId', 'customerId', 'propertyId']) if (!validId(req.body?.[key])) return res.status(400).json({ message: `Valid ${key} is required` });
    const closeDate = String(req.body?.closeDate || ''); const graceDays = req.body?.accessRule === 'close_plus_days' ? Number(req.body?.graceDays || 0) : 0; const accessEndsAt = calculateAccessExpiry(closeDate, graceDays);
    if (!accessEndsAt || accessEndsAt <= new Date()) return res.status(400).json({ message: 'Close date must provide future access' });
    const inviteDays = Math.min(14, Math.max(1, Number(req.body?.inviteExpiresInDays) || 7)); const expiresAt = new Date(Date.now() + inviteDays * 86400000);
    const rawToken = createInvitationToken(); const tokenHash = hashInvitationToken(rawToken); let created;
    await session.withTransaction(async () => {
      const [agent, profile, customer, property, owner] = await Promise.all([
        User.findOne({ _id: req.body.agentUserId, role: 'real_estate_agent', isActive: true }).session(session),
        RealEstateAgentProfile.findOne({ userId: req.body.agentUserId, status: 'active' }).session(session),
        Customer.findOne({ _id: req.body.customerId, status: 'active' }).session(session),
        Property.findOne({ _id: req.body.propertyId, ownerCustomerId: req.body.customerId, status: 'active' }).session(session),
        PropertyMembership.findOne({ customerId: req.body.customerId, propertyId: req.body.propertyId, relationship: 'owner', status: 'active' }).session(session)
      ]);
      if (!agent || !profile) throw Object.assign(new Error('Active agent identity is required'), { status: 409 });
      if (!customer || !property || !owner) throw Object.assign(new Error('Existing homeowner-owned customer and property records are required'), { status: 409 });
      const permissions = agentPermissions(req.body?.permissions);
      const transaction = await RealEstateTransaction.create([{ agentUserId: agent._id, customerId: customer._id, propertyId: property._id, label: clean(req.body?.label, 180) || property.label || property.addressLine1, closeDate: new Date(`${closeDate}T07:00:00.000Z`), accessRule: req.body?.accessRule === 'close_plus_days' ? 'close_plus_days' : 'at_close', graceDays, accessEndsAt, status: 'invited', permissions, createdBy: req.user.userId, accessHistory: [{ action: 'created', actorId: req.user.userId, newEndsAt: accessEndsAt }, { action: 'invited', actorId: req.user.userId, newEndsAt: accessEndsAt }] }], { session });
      const invitation = await AgentInvitation.create([{ tokenHash, agentUserId: agent._id, agentEmail: agent.email, transactionId: transaction[0]._id, customerId: customer._id, propertyId: property._id, status: 'pending', expiresAt, createdBy: req.user.userId, history: [{ action: 'created', actorId: req.user.userId }] }], { session });
      created = { invitation: invitation[0], transaction: transaction[0] };
    });
    res.status(201).json({ invitation: { id: String(created.invitation._id), transactionId: String(created.transaction._id), status: 'pending', expiresAt, accessEndsAt, acceptPath: `/pages/agent-portal.html#invitation=${encodeURIComponent(rawToken)}` } });
  } catch (error) { next(error); } finally { await session.endSession(); }
});

router.post('/transactions/:transactionId/extend', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    if (!validId(req.params.transactionId)) return res.status(400).json({ message: 'Invalid transaction id' });
    const rawAccessEndsAt = String(req.body?.accessEndsAt || ''); const newEndsAt = /^\d{4}-\d{2}-\d{2}$/.test(rawAccessEndsAt) ? new Date(`${rawAccessEndsAt}T07:00:00.000Z`) : new Date(rawAccessEndsAt); const reason = clean(req.body?.reason, 1000);
    if (Number.isNaN(newEndsAt.getTime()) || newEndsAt <= new Date() || reason.length < 10) return res.status(400).json({ message: 'A future access end and meaningful reason are required' });
    let result;
    await session.withTransaction(async () => {
      const transaction = await RealEstateTransaction.findOne({ _id: req.params.transactionId, status: 'active', acceptedAt: { $exists: true, $ne: null }, revokedAt: { $exists: false } }).session(session);
      if (!transaction) throw Object.assign(new Error('Active accepted transaction not found'), { status: 404 });
      const maximumAccessEndsAt = calculateAccessExpiry(transaction.closeDate, 30);
      if (!maximumAccessEndsAt || newEndsAt > maximumAccessEndsAt) throw Object.assign(new Error(`Access cannot extend beyond ${maximumAccessEndsAt?.toISOString() || 'the 30-day limit'}`), { status: 400, code: 'AGENT_EXTENSION_LIMIT', exposeDetails: { maximumAccessEndsAt } });
      if (newEndsAt <= transaction.accessEndsAt) throw Object.assign(new Error('The extension must be later than the current access end'), { status: 400 });
      const existingMembership = await PropertyMembership.findOne({ userId: transaction.agentUserId, propertyId: transaction.propertyId, customerId: transaction.customerId, relationship: 'agent', sourceTransactionId: transaction._id, status: 'active' }).session(session);
      if (!existingMembership) throw Object.assign(new Error('An active accepted agent membership is required before extension'), { status: 409 });
      const now = new Date(); const previousEndsAt = transaction.accessEndsAt; transaction.accessEndsAt = newEndsAt; transaction.extendedAt = now; transaction.accessRule = 'close_plus_days'; transaction.graceDays = Math.min(30, Math.max(0, Math.ceil((newEndsAt - calculateAccessExpiry(transaction.closeDate, 0)) / 86400000)));
      transaction.accessHistory.push({ action: 'extended', actorId: req.user.userId, previousEndsAt, newEndsAt, reason, occurredAt: now }); await transaction.save({ session });
      existingMembership.endsAt = newEndsAt; existingMembership.accessExtendedAt = now; existingMembership.accessApprovedBy = req.user.userId; existingMembership.permissions = membershipPermissions(transaction.permissions); await existingMembership.save({ session });
      result = { id: String(transaction._id), status: transaction.status, accessEndsAt: transaction.accessEndsAt, maximumAccessEndsAt };
    });
    res.json({ transaction: result });
  } catch (error) { next(error); } finally { await session.endSession(); }
});

router.post('/transactions/:transactionId/revoke', async (req, res, next) => {
  try {
    if (!validId(req.params.transactionId)) return res.status(400).json({ message: 'Invalid transaction id' }); const reason = clean(req.body?.reason, 1000); if (reason.length < 10) return res.status(400).json({ message: 'A meaningful revocation reason is required' }); const now = new Date();
    const transaction = await RealEstateTransaction.findById(req.params.transactionId); if (!transaction || transaction.status === 'revoked') return res.status(404).json({ message: 'Transaction not found' });
    const previousEndsAt = transaction.accessEndsAt; transaction.status = 'revoked'; transaction.revokedAt = now; transaction.accessEndsAt = now; transaction.accessHistory.push({ action: 'revoked', actorId: req.user.userId, previousEndsAt, newEndsAt: now, reason }); await transaction.save();
    await Promise.all([PropertyMembership.updateOne({ userId: transaction.agentUserId, propertyId: transaction.propertyId, sourceTransactionId: transaction._id, relationship: 'agent' }, { $set: { status: 'revoked', revokedAt: now, endsAt: now } }), AgentInvitation.updateOne({ transactionId: transaction._id, status: { $in: ['pending', 'processing'] } }, { $set: { status: 'revoked', revokedAt: now, revokedBy: req.user.userId }, $push: { history: { action: 'revoked', actorId: req.user.userId, reason } } }), AgentClientInvitation.updateOne({ transactionId: transaction._id, status: 'accepted' }, { $set: { status: 'revoked', revokedAt: now, revokedBy: req.user.userId, revocationReason: reason }, $push: { history: { action: 'revoked', actorId: req.user.userId, reason } } })]);
    res.json({ transaction: { id: String(transaction._id), status: 'revoked', revokedAt: now } });
  } catch (error) { next(error); }
});

router.post('/invitations/:invitationId/revoke', async (req, res, next) => { try { if (!validId(req.params.invitationId)) return res.status(400).json({ message: 'Invalid invitation id' }); const reason = clean(req.body?.reason, 1000); if (reason.length < 10) return res.status(400).json({ message: 'A meaningful revocation reason is required' }); const now = new Date(); const invitation = await AgentInvitation.findOneAndUpdate({ _id: req.params.invitationId, status: 'pending' }, { $set: { status: 'revoked', revokedAt: now, revokedBy: req.user.userId }, $push: { history: { action: 'revoked', actorId: req.user.userId, reason } } }, { new: true }); if (!invitation) return res.status(404).json({ message: 'Pending invitation not found' }); await RealEstateTransaction.updateOne({ _id: invitation.transactionId, status: 'invited' }, { $set: { status: 'revoked', revokedAt: now, accessEndsAt: now }, $push: { accessHistory: { action: 'revoked', actorId: req.user.userId, reason, newEndsAt: now } } }); res.json({ invitation: { id: String(invitation._id), status: invitation.status, revokedAt: invitation.revokedAt } }); } catch (error) { next(error); } });

router.post('/client-invitations/:invitationId/revoke', async (req, res, next) => {
  try {
    if (!validId(req.params.invitationId)) return res.status(400).json({ message: 'Invalid invitation id' });
    const reason = clean(req.body?.reason, 1000); if (reason.length < 10) return res.status(400).json({ message: 'A meaningful revocation reason is required' });
    const now = new Date();
    const invitation = await AgentClientInvitation.findOneAndUpdate({ _id: req.params.invitationId, status: 'pending' }, { $set: { status: 'revoked', revokedAt: now, revokedBy: req.user.userId, revocationReason: reason }, $push: { history: { action: 'revoked', actorId: req.user.userId, reason } } }, { new: true });
    if (!invitation) return res.status(404).json({ message: 'Pending homeowner invitation not found' });
    res.json({ invitation: { id: String(invitation._id), status: invitation.status, revokedAt: invitation.revokedAt } });
  } catch (error) { next(error); }
});

router.use((error, _req, res, _next) => {
  console.error('Agent admin error:', error?.name || 'Error', error?.message || '');
  const payload = { message: error.message || 'Agent administration request failed' };
  if (error?.code === 'AGENT_EXTENSION_LIMIT') {
    payload.code = error.code;
    payload.maximumAccessEndsAt = error.exposeDetails?.maximumAccessEndsAt || null;
  }
  res.status(error.status || (['ValidationError', 'CastError'].includes(error.name) ? 400 : 500)).json(payload);
});
module.exports = router;
