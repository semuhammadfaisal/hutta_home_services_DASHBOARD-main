const express = require('express');
const mongoose = require('mongoose');
const CommercialAuditEvent = require('../models/CommercialAuditEvent');
const CommercialLocation = require('../models/CommercialLocation');
const CommercialMembership = require('../models/CommercialMembership');
const CommercialOrganization = require('../models/CommercialOrganization');
const CommercialPortfolio = require('../models/CommercialPortfolio');
const CommercialPropertyMembership = require('../models/CommercialPropertyMembership');
const CommercialServiceAgreement = require('../models/CommercialServiceAgreement');
const CommercialSetupRequest = require('../models/CommercialSetupRequest');
const Customer = require('../models/Customer');
const Notification = require('../models/Notification');
const Property = require('../models/Property');
const User = require('../models/User');

const router = express.Router();
const validId = value => mongoose.Types.ObjectId.isValid(String(value || ''));
const clean = (value, max = 1000) => String(value || '').trim().slice(0, max);
const compactCode = value => clean(value, 80).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28);
const propertyAddress = property => [property.addressLine1, property.addressLine2, property.city, property.state, property.postalCode].filter(Boolean).join(', ');

function requestPayload(request, user, organization) {
  return {
    id: String(request._id), reference: request.requestReference, status: request.status,
    requestedAt: request.requestedAt, reviewedAt: request.reviewedAt,
    user: user ? { id: String(user._id), name: `${user.firstName || ''} ${user.lastName || ''}`.trim(), email: user.email, phone: user.phone || '' } : null,
    organization: organization ? { id: String(organization._id), code: organization.organizationCode, name: organization.name, legalName: organization.legalName || '' } : null,
    portfolioId: request.portfolioId ? String(request.portfolioId) : null,
    propertyIds: (request.propertyIds || []).map(String), rejectionReason: request.rejectionReason || ''
  };
}

async function hydrateRequests(requests) {
  const [users, organizations] = await Promise.all([
    User.find({ _id: { $in: requests.map(item => item.userId) } }).select('firstName lastName email phone').lean(),
    CommercialOrganization.find({ _id: { $in: requests.map(item => item.organizationId) } }).select('organizationCode name legalName status').lean()
  ]);
  const userMap = new Map(users.map(item => [String(item._id), item]));
  const orgMap = new Map(organizations.map(item => [String(item._id), item]));
  return requests.map(item => requestPayload(item, userMap.get(String(item.userId)), orgMap.get(String(item.organizationId))));
}

async function importLegacySetupNotifications() {
  const legacy = await Notification.find({ title: 'Commercial workspace setup requested', 'metadata.setupRequestId': { $exists: false } }).select('_id userId message').limit(500);
  for (const notification of legacy) {
    const match = String(notification.message || '').match(/Commercial user ([a-f\d]{24}) requested location setup for organization ([a-f\d]{24})/i);
    if (!match) continue;
    const [, commercialUserId, organizationId] = match;
    const membership = await CommercialMembership.exists({ userId: commercialUserId, organizationId, status: 'active' });
    if (!membership) continue;
    let request = await CommercialSetupRequest.findOne({ userId: commercialUserId, organizationId }).sort({ requestedAt: -1 });
    if (!request) {
      try {
        request = await CommercialSetupRequest.create({
          requestReference: `CSET-${new mongoose.Types.ObjectId().toString().slice(-10).toUpperCase()}`,
          userId: commercialUserId, organizationId, activeKey: `${commercialUserId}:${organizationId}`,
          history: [{ action: 'legacy_notification_imported', note: 'Imported from the original commercial setup notification.' }]
        });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        request = await CommercialSetupRequest.findOne({ activeKey: `${commercialUserId}:${organizationId}` });
      }
    }
    if (!request) continue;
    notification.actionUrl = `/pages/admin-dashboard.html#commercial-setup/${request._id}`;
    notification.metadata = { ...(notification.metadata || {}), setupRequestId: request._id, organizationId, commercialUserId };
    await notification.save();
  }
}

router.get('/setup-requests', async (req, res, next) => {
  try {
    await importLegacySetupNotifications();
    const status = clean(req.query.status, 20) || 'pending';
    const allowed = ['pending', 'processing', 'completed', 'rejected', 'all'];
    if (!allowed.includes(status)) return res.status(400).json({ message: 'Invalid setup request status' });
    const query = status === 'all' ? {} : { status };
    const requests = await CommercialSetupRequest.find(query).sort({ requestedAt: -1 }).limit(200).lean();
    const counts = await CommercialSetupRequest.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
    res.json({ data: await hydrateRequests(requests), summary: Object.fromEntries(counts.map(item => [item._id, item.count])) });
  } catch (error) { next(error); }
});

router.get('/setup-requests/:requestId/workspace', async (req, res, next) => {
  try {
    if (!validId(req.params.requestId)) return res.status(404).json({ message: 'Setup request not found' });
    const request = await CommercialSetupRequest.findById(req.params.requestId).lean();
    if (!request) return res.status(404).json({ message: 'Setup request not found' });
    const [user, organization, membership, portfolios, properties, locations] = await Promise.all([
      User.findById(request.userId).select('firstName lastName email phone role isActive').lean(),
      CommercialOrganization.findById(request.organizationId).lean(),
      CommercialMembership.findOne({ userId: request.userId, organizationId: request.organizationId, status: 'active' }).lean(),
      CommercialPortfolio.find({ organizationId: request.organizationId, status: 'active' }).sort({ name: 1 }).lean(),
      Property.find({ status: 'active' }).select('ownerCustomerId label addressLine1 addressLine2 city state postalCode propertyType').sort({ updatedAt: -1 }).limit(500).lean(),
      CommercialLocation.find({ status: 'active' }).select('organizationId portfolioId propertyId locationCode').lean()
    ]);
    if (!user || !organization || !membership) return res.status(409).json({ message: 'The commercial user, organization, or active membership is no longer available.' });
    const owners = await Customer.find({ _id: { $in: properties.map(item => item.ownerCustomerId) } }).select('name email customerType status').lean();
    const ownerMap = new Map(owners.map(item => [String(item._id), item]));
    const locationsByProperty = new Map();
    locations.forEach(item => { if (!locationsByProperty.has(String(item.propertyId))) locationsByProperty.set(String(item.propertyId), []); locationsByProperty.get(String(item.propertyId)).push(item); });
    res.json({
      request: requestPayload(request, user, organization),
      membership: { role: membership.role, propertyAccess: membership.propertyAccess },
      portfolios: portfolios.map(item => ({ id: String(item._id), code: item.portfolioCode, name: item.name })),
      properties: properties.map(property => {
        const owner = ownerMap.get(String(property.ownerCustomerId));
        const assigned = locationsByProperty.get(String(property._id)) || [];
        const current = assigned.find(item => String(item.organizationId) === String(request.organizationId));
        const conflict = assigned.find(item => String(item.organizationId) !== String(request.organizationId));
        return {
          id: String(property._id), label: property.label || 'Property', address: propertyAddress(property), propertyType: property.propertyType || '',
          owner: owner ? { id: String(owner._id), name: owner.name, email: owner.email || '', type: owner.customerType, status: owner.status } : null,
          currentLocation: current ? { id: String(current._id), portfolioId: String(current.portfolioId), code: current.locationCode } : null,
          unavailableReason: conflict ? 'This property is already assigned to another active commercial organization.' : null
        };
      })
    });
  } catch (error) { next(error); }
});

router.post('/setup-requests/:requestId/complete', async (req, res, next) => {
  let claimed = false;
  try {
    if (!validId(req.params.requestId)) return res.status(404).json({ message: 'Setup request not found' });
    const entries = Array.isArray(req.body?.properties) ? req.body.properties : [];
    if (!entries.length || entries.length > 100) return res.status(400).json({ message: 'Select at least one property (maximum 100).' });
    const normalized = entries.map(entry => ({
      propertyId: clean(entry.propertyId, 40), tier: clean(entry.tier, 20),
      purchaseOrderRequired: entry.purchaseOrderRequired === true,
      purchaseOrderLabel: clean(entry.purchaseOrderLabel, 80) || 'PO number'
    }));
    if (normalized.some(entry => !validId(entry.propertyId) || !['tier_1', 'tier_2', 'tier_3'].includes(entry.tier))) return res.status(400).json({ message: 'Every selected property requires a valid service tier.' });
    if (new Set(normalized.map(item => item.propertyId)).size !== normalized.length) return res.status(400).json({ message: 'Each property may only be selected once.' });

    const request = await CommercialSetupRequest.findOneAndUpdate(
      { _id: req.params.requestId, status: 'pending' },
      { $set: { status: 'processing', reviewedBy: req.user.userId }, $push: { history: { action: 'processing', actorUserId: req.user.userId, note: 'Staff began commercial workspace provisioning.' } } },
      { new: true }
    );
    if (!request) {
      const existing = await CommercialSetupRequest.findById(req.params.requestId).lean();
      return res.status(existing ? 409 : 404).json({ message: existing ? `This setup request is already ${existing.status}.` : 'Setup request not found' });
    }
    claimed = true;
    const [organization, user, membership, properties, conflictingLocations] = await Promise.all([
      CommercialOrganization.findOne({ _id: request.organizationId, status: 'active' }),
      User.findOne({ _id: request.userId, role: 'commercial', isActive: true }),
      CommercialMembership.findOne({ userId: request.userId, organizationId: request.organizationId, status: 'active' }),
      Property.find({ _id: { $in: normalized.map(item => item.propertyId) }, status: 'active' }),
      CommercialLocation.find({ propertyId: { $in: normalized.map(item => item.propertyId) }, organizationId: { $ne: request.organizationId }, status: 'active' }).lean()
    ]);
    if (!organization || !user || !membership) throw Object.assign(new Error('The active commercial user, organization, or membership is no longer available.'), { status: 409 });
    if (properties.length !== normalized.length) throw Object.assign(new Error('One or more selected properties are unavailable.'), { status: 409 });
    if (conflictingLocations.length) throw Object.assign(new Error('One or more properties already belong to another active commercial organization.'), { status: 409 });

    let portfolio;
    const portfolioId = clean(req.body?.portfolioId, 40);
    const portfolioName = clean(req.body?.portfolioName, 160);
    if (portfolioId) {
      if (!validId(portfolioId)) throw Object.assign(new Error('Invalid portfolio selection.'), { status: 400 });
      portfolio = await CommercialPortfolio.findOne({ _id: portfolioId, organizationId: request.organizationId, status: 'active' });
      if (!portfolio) throw Object.assign(new Error('Portfolio not found.'), { status: 404 });
    } else {
      if (!portfolioName) throw Object.assign(new Error('Enter a name for the new portfolio.'), { status: 400 });
      const suffix = String(request._id).slice(-8).toUpperCase();
      portfolio = await CommercialPortfolio.findOneAndUpdate(
        { organizationId: request.organizationId, portfolioCode: `${compactCode(portfolioName) || 'PORTFOLIO'}-${suffix}` },
        { $setOnInsert: { organizationId: request.organizationId, name: portfolioName, portfolioCode: `${compactCode(portfolioName) || 'PORTFOLIO'}-${suffix}`, status: 'active', createdBy: req.user.userId } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    const propertyMap = new Map(properties.map(item => [String(item._id), item]));
    const locationIds = [];
    for (const entry of normalized) {
      const property = propertyMap.get(entry.propertyId);
      const location = await CommercialLocation.findOneAndUpdate(
        { organizationId: request.organizationId, propertyId: property._id },
        { $set: { portfolioId: portfolio._id, ownerCustomerId: property.ownerCustomerId, status: 'active' }, $setOnInsert: { organizationId: request.organizationId, propertyId: property._id, locationCode: `LOC-${String(property._id).slice(-10).toUpperCase()}`, ownerLabel: property.label || 'Property', createdBy: req.user.userId } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      locationIds.push(location._id);
      let agreement = await CommercialServiceAgreement.findOne({ organizationId: request.organizationId, propertyId: property._id, status: 'active' });
      if (!agreement) agreement = new CommercialServiceAgreement({ organizationId: request.organizationId, propertyId: property._id, agreementNumber: `AGR-${String(request.organizationId).slice(-6)}-${String(property._id).slice(-8)}`.toUpperCase(), createdBy: req.user.userId });
      agreement.portfolioId = portfolio._id;
      agreement.tier = entry.tier;
      agreement.billingRules = { invoiceMode: entry.tier === 'tier_1' ? 'coordination_fee_only' : 'consolidated_period', billingPeriod: entry.tier === 'tier_1' ? 'per_order' : 'monthly', vendorBillsClientDirectly: entry.tier === 'tier_1', consolidatedInvoice: entry.tier !== 'tier_1' };
      agreement.purchaseOrder = { required: entry.purchaseOrderRequired, label: entry.purchaseOrderLabel };
      agreement.approvalRules = { allowedRoles: ['owner', 'organization_admin', 'billing_admin', 'operations_manager', 'portfolio_admin', 'property_admin', 'approver'] };
      agreement.paymentRules = { allowedRoles: ['owner', 'organization_admin', 'billing_admin', 'portfolio_admin', 'property_admin', 'billing'] };
      agreement.status = 'active';
      await agreement.save();
      if (membership.propertyAccess !== 'all') {
        await CommercialPropertyMembership.findOneAndUpdate(
          { userId: user._id, organizationId: organization._id, propertyId: property._id },
          { $set: { locationId: location._id, role: 'property_admin', permissionMode: 'role_default', status: 'active', revokedAt: null }, $setOnInsert: { userId: user._id, organizationId: organization._id, propertyId: property._id, startsAt: new Date(), createdBy: req.user.userId } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
      await CommercialAuditEvent.create({ organizationId: organization._id, portfolioId: portfolio._id, propertyId: property._id, actorUserId: req.user.userId, subjectUserId: user._id, action: 'commercial_location_provisioned', summary: `${property.label || 'Property'} was provisioned as ${entry.tier.replace('_', ' ')}.` });
    }
    const note = clean(req.body?.notes, 1000);
    request.status = 'completed'; request.reviewedAt = new Date(); request.portfolioId = portfolio._id; request.propertyIds = normalized.map(item => item.propertyId); request.notes = note;
    request.history.push({ action: 'completed', actorUserId: req.user.userId, note: note || `${normalized.length} location(s) provisioned.` });
    await request.save();
    await CommercialSetupRequest.updateOne({ _id: request._id }, { $unset: { activeKey: 1 } });
    await Notification.updateOne(
      { dedupeKey: `commercial-setup-completed:${request._id}` },
      { $setOnInsert: { userId: user._id, title: 'Commercial workspace is ready', message: `${normalized.length} location${normalized.length === 1 ? '' : 's'} can now be managed in your commercial portal.`, type: 'success', priority: 'high', actionUrl: '/pages/commercial-portal.html#overview', dedupeKey: `commercial-setup-completed:${request._id}`, metadata: { setupRequestId: request._id, organizationId: organization._id } } },
      { upsert: true }
    );
    res.json({ message: 'Commercial workspace setup completed', request: requestPayload(request.toObject(), user.toObject(), organization.toObject()), portfolio: { id: String(portfolio._id), name: portfolio.name }, locationCount: locationIds.length });
  } catch (error) {
    if (claimed) await CommercialSetupRequest.updateOne({ _id: req.params.requestId, status: 'processing' }, { $set: { status: 'pending' }, $push: { history: { action: 'processing_failed', actorUserId: req.user.userId, note: clean(error.message, 1000) } } }).catch(() => {});
    next(error);
  }
});

router.post('/setup-requests/:requestId/reject', async (req, res, next) => {
  try {
    if (!validId(req.params.requestId)) return res.status(404).json({ message: 'Setup request not found' });
    const reason = clean(req.body?.reason, 1000);
    if (reason.length < 10) return res.status(400).json({ message: 'Enter a clear rejection reason (at least 10 characters).' });
    const request = await CommercialSetupRequest.findOneAndUpdate(
      { _id: req.params.requestId, status: 'pending' },
      { $set: { status: 'rejected', reviewedAt: new Date(), reviewedBy: req.user.userId, rejectionReason: reason }, $unset: { activeKey: 1 }, $push: { history: { action: 'rejected', actorUserId: req.user.userId, note: reason } } },
      { new: true }
    );
    if (!request) return res.status(409).json({ message: 'This request is no longer pending.' });
    await Notification.create({ userId: request.userId, title: 'Commercial setup needs more information', message: reason, type: 'warning', priority: 'high', actionUrl: '/pages/commercial-portal.html#account', dedupeKey: `commercial-setup-rejected:${request._id}` });
    res.json({ message: 'Setup request rejected' });
  } catch (error) { next(error); }
});

module.exports = router;
