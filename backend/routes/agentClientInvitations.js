const express = require('express');
const mongoose = require('mongoose');
const AgentClientInvitation = require('../models/AgentClientInvitation');
const AgentReferralAttribution = require('../models/AgentReferralAttribution');
const Customer = require('../models/Customer');
const Notification = require('../models/Notification');
const PortalActivity = require('../models/PortalActivity');
const Property = require('../models/Property');
const PropertyMembership = require('../models/PropertyMembership');
const RealEstateAgentProfile = require('../models/RealEstateAgentProfile');
const RealEstateTransaction = require('../models/RealEstateTransaction');
const { hashInvitationToken, membershipPermissions, propertyFingerprint } = require('../utils/agentAccess');
const { serializeClientInvitation, serializeTransaction } = require('../utils/agentSerializers');

const router = express.Router();
const CONSENT_VERSION = 'agent-property-access-v1';
const CONSENT_TEXT = 'I confirm this property information and authorize the named real estate agent to request service, view status and authorized documents, and message through SMPLfix for this transaction until access expires. I retain estimate approval, payment authority, and ownership of my account.';
const clean = (value, max) => String(value || '').trim().slice(0, max);
const ownerPermissions = () => ({ view: true, requestService: true, approveEstimates: true, manageBilling: true, manageProperty: true });

function tokenFrom(req) { return String(req.get('x-invitation-token') || req.body?.token || ''); }
function validToken(value) { return /^[A-Za-z0-9_-]{32,100}$/.test(value); }
function emailMatches(customer, email) { return [customer?.email, ...(customer?.emails || []).map(item => item.address)].filter(Boolean).some(value => String(value).trim().toLowerCase() === email); }
function effectivePermissions(invited, approved) {
  return {
    viewStatus: invited?.viewStatus === true && approved?.viewStatus === true,
    requestService: invited?.requestService === true && approved?.requestService === true,
    uploadInspection: invited?.uploadInspection === true && approved?.uploadInspection === true,
    viewDocuments: invited?.viewDocuments === true && approved?.viewDocuments === true,
    message: invited?.message === true && approved?.message === true
  };
}

router.get('/access', async (req, res, next) => {
  try {
    const ownerMemberships = await PropertyMembership.find({
      userId: req.user.userId,
      relationship: 'owner',
      status: 'active',
      'permissions.manageProperty': true
    }).select('customerId propertyId').lean();
    if (!ownerMemberships.length) return res.json({ data: [] });
    const allowed = new Set(ownerMemberships.map(item => `${item.customerId}:${item.propertyId}`));
    const transactions = await RealEstateTransaction.find({
      customerId: { $in: ownerMemberships.map(item => item.customerId) },
      propertyId: { $in: ownerMemberships.map(item => item.propertyId) },
      status: { $in: ['active', 'revoked', 'closed'] }
    }).sort({ updatedAt: -1 }).limit(100).lean();
    const scoped = transactions.filter(item => allowed.has(`${item.customerId}:${item.propertyId}`));
    const [agents, properties] = await Promise.all([
      RealEstateAgentProfile.find({ userId: { $in: scoped.map(item => item.agentUserId) } }).select('userId displayName brokerageName').lean(),
      Property.find({ _id: { $in: scoped.map(item => item.propertyId) } }).select('label addressLine1 addressLine2 city state postalCode propertyType status').lean()
    ]);
    const agentMap = new Map(agents.map(item => [String(item.userId), item]));
    const propertyMap = new Map(properties.map(item => [String(item._id), item]));
    res.set('Cache-Control', 'private, no-store').json({ data: scoped.map(item => ({
      transaction: serializeTransaction(item, { property: propertyMap.get(String(item.propertyId)) }),
      agent: {
        displayName: agentMap.get(String(item.agentUserId))?.displayName || 'Real estate agent',
        brokerageName: agentMap.get(String(item.agentUserId))?.brokerageName || ''
      },
      capabilities: { canRevoke: item.status === 'active', agentCanApproveEstimates: false, agentCanManageBilling: false }
    })) });
  } catch (error) { next(error); }
});

router.get('/preview', async (req, res, next) => {
  try {
    const token = tokenFrom(req); if (!validToken(token)) return res.status(400).json({ message: 'A valid invitation token is required' });
    const hash = hashInvitationToken(token); const email = String(req.user.email || '').toLowerCase(); const now = new Date();
    let invitation = await AgentClientInvitation.findOne({ tokenHash: hash, homeownerEmail: email }).lean();
    if (!invitation) return res.status(404).json({ message: 'Invitation not found for this account' });
    if (invitation.status === 'pending' && invitation.expiresAt <= now) {
      invitation = await AgentClientInvitation.findOneAndUpdate({ _id: invitation._id, status: 'pending' }, { $set: { status: 'expired' }, $push: { history: { action: 'expired', actorId: req.user.userId } } }, { new: true }).lean();
    }
    const agent = await RealEstateAgentProfile.findOne({ userId: invitation.agentUserId }).select('displayName brokerageName').lean();
    if (invitation.status !== 'pending') return res.status(410).json({ message: `This invitation is ${invitation.status}.`, status: invitation.status });
    await AgentClientInvitation.updateOne({ _id: invitation._id, status: 'pending', 'history.action': { $ne: 'viewed' } }, { $push: { history: { action: 'viewed', actorId: req.user.userId } } });
    res.set('Cache-Control', 'private, no-store').json({ invitation: serializeClientInvitation(invitation, { includeEmail: false }), agent: { displayName: agent?.displayName || 'Your real estate agent', brokerageName: agent?.brokerageName }, consent: { version: CONSENT_VERSION, text: CONSENT_TEXT }, accountEmail: email });
  } catch (error) { next(error); }
});

router.post('/accept', async (req, res, next) => {
  const token = tokenFrom(req);
  if (!validToken(token)) return res.status(400).json({ message: 'A valid invitation token is required' });
  if (req.body?.propertyConfirmed !== true || req.body?.consentAccepted !== true || clean(req.body?.typedName, 160).length < 2) return res.status(400).json({ message: 'Property confirmation, explicit consent, and typed name are required' });
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const now = new Date(); const email = String(req.user.email || '').toLowerCase(); const tokenHash = hashInvitationToken(token);
      const invitation = await AgentClientInvitation.findOneAndUpdate({ tokenHash, homeownerEmail: email, status: 'pending', expiresAt: { $gt: now } }, { $set: { status: 'processing' } }, { new: true, session });
      if (!invitation) throw Object.assign(new Error('This invitation is expired, revoked, already accepted, or belongs to another account'), { status: 410 });
      const permissions = effectivePermissions(invitation.permissions, req.body?.permissions);
      if (!permissions.viewStatus) throw Object.assign(new Error('Status access must be approved to connect the transaction'), { status: 400 });

      let customer;
      if (invitation.existingCustomerId) {
        customer = await Customer.findById(invitation.existingCustomerId).session(session);
        if (!customer || !emailMatches(customer, email)) throw Object.assign(new Error('Property ownership could not be confirmed'), { status: 409 });
      } else {
        const customers = await Customer.find({ $or: [{ email }, { 'emails.address': email }] }).collation({ locale: 'en', strength: 2 }).session(session);
        if (customers.length > 1) throw Object.assign(new Error('Multiple customer records require staff review before access can be granted'), { status: 409 });
        customer = customers[0] || (await Customer.create([{ name: clean(req.user.firstName + ' ' + req.user.lastName, 160) || invitation.homeownerName || email, email, customerType: 'residential', status: 'active' }], { session }))[0];
      }

      let property;
      if (invitation.existingPropertyId) {
        property = await Property.findOne({ _id: invitation.existingPropertyId, ownerCustomerId: customer._id, status: 'active' }).session(session);
        if (!property) throw Object.assign(new Error('The selected property ownership conflicts with this account'), { status: 409 });
      } else {
        const proposedFingerprint = propertyFingerprint(invitation.proposedProperty);
        const matchingProperties = await Property.find({
          status: 'active',
          city: invitation.proposedProperty.city,
          state: invitation.proposedProperty.state
        }).collation({ locale: 'en', strength: 2 }).session(session);
        property = matchingProperties.find(item => propertyFingerprint(item) === proposedFingerprint);
        if (property && String(property.ownerCustomerId) !== String(customer._id)) throw Object.assign(new Error('This property is owned by another customer record and requires staff review'), { status: 409 });
        if (!property) property = (await Property.create([{ ownerCustomerId: customer._id, label: invitation.proposedProperty.label, addressLine1: invitation.proposedProperty.addressLine1, addressLine2: invitation.proposedProperty.addressLine2, city: invitation.proposedProperty.city, state: invitation.proposedProperty.state, postalCode: invitation.proposedProperty.postalCode, propertyType: invitation.proposedProperty.propertyType, source: 'manual' }], { session }))[0];
      }

      const existingOwner = await PropertyMembership.findOne({ propertyId: property._id, relationship: 'owner', status: 'active' }).session(session);
      if (existingOwner && (String(existingOwner.userId) !== String(req.user.userId) || String(existingOwner.customerId) !== String(customer._id))) throw Object.assign(new Error('This property is owned by another portal account and requires staff review'), { status: 409 });
      await PropertyMembership.findOneAndUpdate({ userId: req.user.userId, propertyId: property._id }, { $set: { customerId: customer._id, relationship: 'owner', permissions: ownerPermissions(), status: 'active', startsAt: now, endsAt: null, revokedAt: null }, $setOnInsert: { createdBy: req.user.userId } }, { upsert: true, new: true, session, setDefaultsOnInsert: true });

      const existingAgentAccess = await PropertyMembership.exists({ userId: invitation.agentUserId, propertyId: property._id, relationship: 'agent', status: 'active', endsAt: { $gt: now } }).session(session);
      if (existingAgentAccess) throw Object.assign(new Error('This agent is already linked to the property'), { status: 409 });
      const transaction = (await RealEstateTransaction.create([{ agentUserId: invitation.agentUserId, customerId: customer._id, propertyId: property._id, label: invitation.transactionLabel, closeDate: invitation.closeDate, accessRule: invitation.accessRule, graceDays: invitation.graceDays, accessEndsAt: invitation.accessEndsAt, status: 'active', permissions, acceptedAt: now, createdBy: invitation.agentUserId, accessHistory: [{ action: 'created', actorId: invitation.agentUserId, newEndsAt: invitation.accessEndsAt }, { action: 'invited', actorId: invitation.agentUserId, newEndsAt: invitation.accessEndsAt }, { action: 'accepted', actorId: req.user.userId, newEndsAt: invitation.accessEndsAt }] }], { session }))[0];
      await PropertyMembership.findOneAndUpdate({ userId: invitation.agentUserId, propertyId: property._id }, { $set: { customerId: customer._id, relationship: 'agent', permissions: membershipPermissions(permissions), status: 'active', startsAt: now, endsAt: invitation.accessEndsAt, revokedAt: null, sourceTransactionId: transaction._id, accessApprovedBy: req.user.userId }, $setOnInsert: { createdBy: invitation.agentUserId } }, { upsert: true, new: true, session, setDefaultsOnInsert: true });

      invitation.status = 'accepted'; invitation.acceptedAt = now; invitation.acceptedByUserId = req.user.userId; invitation.acceptedCustomerId = customer._id; invitation.acceptedPropertyId = property._id; invitation.transactionId = transaction._id; invitation.consent = { version: CONSENT_VERSION, text: CONSENT_TEXT, typedName: clean(req.body.typedName, 160), propertyConfirmed: true, permissions, acceptedAt: now, ipAddress: clean(req.ip, 80) }; invitation.history.push({ action: 'accepted', actorId: req.user.userId }); await invitation.save({ session });
      await AgentReferralAttribution.updateOne({ transactionId: transaction._id }, { $setOnInsert: { agentUserId: invitation.agentUserId, customerId: customer._id, propertyId: property._id, source: 'agent_invitation', status: 'attributed', attributedAt: now } }, { upsert: true, session });
      await PortalActivity.create([{ userId: req.user.userId, customerId: customer._id, propertyId: property._id, type: 'agent_relationship_approved', title: 'Agent access approved', summary: `${invitation.transactionLabel} is connected until ${invitation.accessEndsAt.toISOString()}.` }, { userId: invitation.agentUserId, customerId: customer._id, propertyId: property._id, type: 'client_invitation_accepted', title: 'Homeowner accepted invitation', summary: `${invitation.transactionLabel} was added to your portfolio.` }], { session });
      await Notification.insertMany([{ userId: req.user.userId, title: 'Agent access approved', message: `${invitation.transactionLabel} is connected. You retain estimate approval and payment authority.`, type: 'success', metadata: { transactionId: transaction._id, propertyId: property._id } }, { userId: invitation.agentUserId, title: 'Homeowner accepted your invitation', message: `${invitation.transactionLabel} is now active in your portfolio.`, type: 'success', metadata: { transactionId: transaction._id, propertyId: property._id } }], { session });
      result = { invitation, transaction };
    });
    res.status(201).json({ invitation: serializeClientInvitation(result.invitation, { includeEmail: false }), transaction: serializeTransaction(result.transaction), capabilities: { homeownerOwnsAccount: true, agentCanApproveEstimates: false, agentCanManageBilling: false } });
  } catch (error) { next(error); } finally { await session.endSession(); }
});

router.post('/transactions/:transactionId/revoke', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(String(req.params.transactionId || ''))) return res.status(400).json({ message: 'Invalid transaction id' });
    const reason = clean(req.body?.reason, 1000); if (reason.length < 5) return res.status(400).json({ message: 'A revocation reason is required' });
    const transaction = await RealEstateTransaction.findOne({ _id: req.params.transactionId, status: 'active' });
    if (!transaction) return res.status(404).json({ message: 'Agent access not found' });
    const owner = await PropertyMembership.findOne({ userId: req.user.userId, customerId: transaction.customerId, propertyId: transaction.propertyId, relationship: 'owner', status: 'active', 'permissions.manageProperty': true }).lean();
    if (!owner) return res.status(404).json({ message: 'Agent access not found' });
    const now = new Date(); const previousEndsAt = transaction.accessEndsAt;
    transaction.status = 'revoked'; transaction.revokedAt = now; transaction.accessEndsAt = now; transaction.accessHistory.push({ action: 'revoked', actorId: req.user.userId, previousEndsAt, newEndsAt: now, reason }); await transaction.save();
    await Promise.all([
      PropertyMembership.updateOne({ userId: transaction.agentUserId, propertyId: transaction.propertyId, sourceTransactionId: transaction._id, relationship: 'agent' }, { $set: { status: 'revoked', revokedAt: now, endsAt: now } }),
      AgentClientInvitation.updateOne({ transactionId: transaction._id, status: 'accepted' }, { $set: { status: 'revoked', revokedAt: now, revokedBy: req.user.userId, revocationReason: reason }, $push: { history: { action: 'revoked', actorId: req.user.userId, reason } } }),
      PortalActivity.create({ userId: req.user.userId, customerId: transaction.customerId, propertyId: transaction.propertyId, type: 'agent_access_revoked', title: 'Agent access revoked', summary: transaction.label }),
      PortalActivity.create({ userId: transaction.agentUserId, customerId: transaction.customerId, propertyId: transaction.propertyId, type: 'agent_access_revoked', title: 'Homeowner revoked transaction access', summary: transaction.label }),
      Notification.create({ userId: transaction.agentUserId, title: 'Transaction access revoked', message: `The homeowner revoked your access to ${transaction.label}.`, type: 'warning', metadata: { transactionId: transaction._id } })
    ]);
    res.json({ transaction: { id: String(transaction._id), status: 'revoked', revokedAt: now }, capabilities: { agentCanApproveEstimates: false, agentCanManageBilling: false } });
  } catch (error) { next(error); }
});

router.use((error, _req, res, _next) => { console.error('Agent client invitation error:', error?.name || 'Error', error?.message || ''); res.status(error.status || (['ValidationError', 'CastError'].includes(error.name) ? 400 : 500)).json({ message: error.status ? error.message : 'Invitation request failed' }); });
module.exports = router;
module.exports.CONSENT_TEXT = CONSENT_TEXT;
module.exports.CONSENT_VERSION = CONSENT_VERSION;
