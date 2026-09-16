const express = require('express');
const mongoose = require('mongoose');
const AgentInvitation = require('../models/AgentInvitation');
const AgentClientInvitation = require('../models/AgentClientInvitation');
const Customer = require('../models/Customer');
const Property = require('../models/Property');
const PropertyMembership = require('../models/PropertyMembership');
const RealEstateAgentProfile = require('../models/RealEstateAgentProfile');
const RealEstateTransaction = require('../models/RealEstateTransaction');
const User = require('../models/User');
const { agentPermissions, calculateAccessExpiry, createInvitationToken, hashInvitationToken, membershipPermissions } = require('../utils/agentAccess');

const router = express.Router();
const VendorAvailabilitySlot = require('../models/VendorAvailabilitySlot');
const Vendor = require('../models/Vendor');
const { activeCompliance, tradeMatches, serviceAreaMatches } = require('../utils/vendorLeadDistribution');
const { SERVICE_CATEGORIES } = require('../utils/residentialRequests');
const validId = value => mongoose.Types.ObjectId.isValid(String(value || ''));
const clean = (value, max) => String(value || '').trim().slice(0, max);
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
  try {
    if (!validId(req.params.transactionId)) return res.status(400).json({ message: 'Invalid transaction id' });
    const newEndsAt = new Date(req.body?.accessEndsAt); const reason = clean(req.body?.reason, 1000);
    if (Number.isNaN(newEndsAt.getTime()) || newEndsAt <= new Date() || reason.length < 10) return res.status(400).json({ message: 'A future access end and meaningful reason are required' });
    const transaction = await RealEstateTransaction.findById(req.params.transactionId); if (!transaction || !['active', 'closed'].includes(transaction.status)) return res.status(404).json({ message: 'Transaction not found' });
    const existingMembership = await PropertyMembership.findOne({ userId: transaction.agentUserId, propertyId: transaction.propertyId, customerId: transaction.customerId, relationship: 'agent', sourceTransactionId: transaction._id });
    if (!existingMembership) return res.status(409).json({ message: 'Agent membership must be accepted before extension' });
    const previousEndsAt = transaction.accessEndsAt; transaction.accessEndsAt = newEndsAt; transaction.extendedAt = new Date(); transaction.status = 'active'; transaction.accessHistory.push({ action: 'extended', actorId: req.user.userId, previousEndsAt, newEndsAt, reason }); await transaction.save();
    await PropertyMembership.updateOne({ _id: existingMembership._id }, { $set: { endsAt: newEndsAt, status: 'active', revokedAt: null, accessExtendedAt: new Date(), accessApprovedBy: req.user.userId, permissions: membershipPermissions(transaction.permissions) } });
    res.json({ transaction: { id: String(transaction._id), status: transaction.status, accessEndsAt: transaction.accessEndsAt } });
  } catch (error) { next(error); }
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

router.use((error, _req, res, _next) => { console.error('Agent admin error:', error?.name || 'Error', error?.message || ''); res.status(error.status || (['ValidationError', 'CastError'].includes(error.name) ? 400 : 500)).json({ message: error.message || 'Agent administration request failed' }); });
module.exports = router;
