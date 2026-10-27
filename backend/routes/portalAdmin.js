const express = require('express');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const User = require('../models/User');
const Customer = require('../models/Customer');
const Property = require('../models/Property');
const PropertyMembership = require('../models/PropertyMembership');
const ResidentialAccountProfile = require('../models/ResidentialAccountProfile');
const Order = require('../models/Order');
const Counter = require('../models/Counter');
const CustomerInvoice = require('../models/CustomerInvoice');
const OutgoingQuote = require('../models/OutgoingQuote');
const PortalActivity = require('../models/PortalActivity');
const ResidentialMessage = require('../models/ResidentialMessage');
const CommercialOrganization = require('../models/CommercialOrganization');
const CommercialPortfolio = require('../models/CommercialPortfolio');
const CommercialLocation = require('../models/CommercialLocation');
const CommercialMembership = require('../models/CommercialMembership');
const CommercialPropertyMembership = require('../models/CommercialPropertyMembership');
const CommercialServiceAgreement = require('../models/CommercialServiceAgreement');
const CommercialWarrantyClaim = require('../models/CommercialWarrantyClaim');
const CommercialAuditEvent = require('../models/CommercialAuditEvent');
const RealEstateAgentProfile = require('../models/RealEstateAgentProfile');
const RealEstateTransaction = require('../models/RealEstateTransaction');
const AgentClientInvitation = require('../models/AgentClientInvitation');
const AgentReferralAttribution = require('../models/AgentReferralAttribution');
const Vendor = require('../models/Vendor');
const VendorPortalMembership = require('../models/VendorPortalMembership');
const QuoteInvitation = require('../models/QuoteInvitation');
const IncomingQuote = require('../models/IncomingQuote');
const VendorInvoice = require('../models/VendorInvoice');
const VendorPayout = require('../models/VendorPayout');
const VendorPerformanceEvent = require('../models/VendorPerformanceEvent');
const SecurityAuditEvent = require('../models/SecurityAuditEvent');
const { complianceChecklist } = require('../utils/vendorCompliance');
const { calculateAccessExpiry } = require('../utils/agentAccess');
const { homeownerOnboarding, publicOnboarding } = require('../utils/agentOnboarding');
const { synchronizeWorkflowOrder } = require('../utils/workflowSync');
const { invalidateDashboardStatsCache } = require('../utils/dashboardStatsCache');
const memCache = require('../utils/memoryCache');

const router = express.Router();
const MANAGE_ROLES = new Set(['admin', 'manager']);
const writes = rateLimit({ windowMs: 15 * 60 * 1000, max: 80, standardHeaders: true, legacyHeaders: false, keyGenerator: req => String(req.user.userId), message: { message: 'Too many portal-account updates. Please wait and try again.' } });
const validId = value => mongoose.Types.ObjectId.isValid(String(value || ''));
const clean = (value, max = 1000) => String(value || '').trim().slice(0, max);
const id = value => value == null ? null : String(value);
const nowActive = { status: 'active', startsAt: { $lte: new Date() }, $or: [{ endsAt: null }, { endsAt: { $exists: false } }, { endsAt: { $gt: new Date() } }] };

function requireManager(req, res, next) {
  if (!MANAGE_ROLES.has(req.user.role)) return res.status(403).json({ message: 'Administrator or manager access is required' });
  next();
}

function safeUser(user) {
  if (!user) return null;
  return { id: id(user._id), firstName: user.firstName, lastName: user.lastName, name: [user.firstName, user.lastName].filter(Boolean).join(' '), email: user.email, phone: user.phone, role: user.role, isActive: user.isActive, createdAt: user.createdAt };
}

function safeProperty(property) {
  if (!property) return null;
  return { id: id(property._id), ownerCustomerId: id(property.ownerCustomerId), label: property.label, addressLine1: property.addressLine1, addressLine2: property.addressLine2, city: property.city, state: property.state, postalCode: property.postalCode, propertyType: property.propertyType, status: property.status, createdAt: property.createdAt };
}

function safeDocument(document, source, parentId) {
  return { id: document.documentId, name: document.name, type: document.type, size: document.size, uploadedAt: document.uploadedAt, status: document.status, source, parentId: id(parentId) };
}

function safeOrder(order) {
  return { id: id(order._id), orderId: order.orderId, workOrderNumber: order.workOrderNumber, requestReference: order.requestReference, customerId: id(order.customerId), propertyId: id(order.propertyId), service: order.service, description: order.description, source: order.source, status: order.status, workflowStatus: order.workflowStatus, priority: order.priority, pricingStatus: order.pricingStatus, amount: order.amount, scheduledStart: order.scheduledStart, scheduledEnd: order.scheduledEnd, completedAt: order.completedAt, transactionId: id(order.residentialRequest?.transactionId), organizationId: id(order.commercialContext?.organizationId), locationId: id(order.commercialContext?.locationId), purchaseOrderNumber: order.commercialContext?.purchaseOrderNumber, createdAt: order.createdAt };
}

function safeInvoice(invoice) {
  return { id: id(invoice._id), invoiceNumber: invoice.invoiceNumber, orderId: id(invoice.orderId), amount: invoice.amount, issuedAt: invoice.issuedAt, dueDate: invoice.dueDate, paymentStatus: invoice.paymentId ? 'paid' : 'open', commercialKind: invoice.commercialBilling?.invoiceKind, organizationId: id(invoice.commercialBilling?.organizationId) };
}

function safeMembership(membership, user) {
  return { id: id(membership._id), user: safeUser(user), role: membership.role || membership.relationship, relationship: membership.relationship, status: membership.status, permissions: membership.permissions, propertyAccess: membership.propertyAccess, propertyId: id(membership.propertyId), organizationId: id(membership.organizationId), startsAt: membership.startsAt, endsAt: membership.endsAt, createdAt: membership.createdAt };
}

function safeCustomer(customer) {
  return { id: id(customer._id), name: customer.name, email: customer.email, phone: customer.phone, customerType: customer.customerType, status: customer.status, totalOrders: customer.totalOrders, totalSpent: customer.totalSpent, createdAt: customer.createdAt };
}

function safeOrganization(org) {
  return { id: id(org._id), organizationCode: org.organizationCode, name: org.name, legalName: org.legalName, primaryCustomerId: id(org.primaryCustomerId), status: org.status, createdAt: org.createdAt };
}

function safeVendor(vendor) {
  return { id: id(vendor._id), name: vendor.name, companyName: vendor.companyName, legalBusinessName: vendor.legalBusinessName, email: vendor.email, phone: vendor.phone, category: vendor.category, rating: vendor.rating, serviceArea: vendor.serviceArea, trades: vendor.trades, licensedTrade: vendor.licensedTrade, rocLicenseNumber: vendor.rocLicenseNumber, rocLicenseTypeClassification: vendor.rocLicenseTypeClassification, rocLicenseExpirationDate: vendor.rocLicenseExpirationDate, insuranceExpirationDate: vendor.insuranceExpirationDate, onboardingStatus: vendor.onboardingStatus, portalStatus: vendor.portalStatus, isActive: vendor.isActive, createdAt: vendor.createdAt };
}

async function nextCounter(name, session) {
  const counter = await Counter.findOneAndUpdate({ _id: name }, { $inc: { value: 1 } }, { new: true, upsert: true, session, setDefaultsOnInsert: true });
  return counter.value;
}

function propertyAddress(property) {
  return [property.addressLine1, property.addressLine2, property.city, property.state, property.postalCode].filter(Boolean).join(', ');
}

function baseOrderPayload({ orderSequence, requestSequence, customer, property, service, description, priority }) {
  const year = new Date().getUTCFullYear();
  return { orderId: `ORD-${String(orderSequence).padStart(6, '0')}`, workOrderNumber: `WO-S-${String(orderSequence).padStart(6, '0')}`, requestReference: `REQ-${year}-${String(requestSequence).padStart(6, '0')}`, customerId: customer._id, propertyId: property._id, customer: { name: customer.name, email: customer.email, phone: customer.phone, address: propertyAddress(property) }, service, description, amount: null, pricingStatus: 'unquoted', source: 'manual', status: 'new', workflowStatus: 'request_received', priority };
}

async function audit(req, payload) {
  return SecurityAuditEvent.create({ action: payload.action, userId: req.user.userId, userEmail: req.user.email, entityType: payload.entityType, entityId: id(payload.entityId), ipAddress: req.ip, userAgent: clean(req.get('user-agent'), 500), metadata: payload.metadata || {} });
}

router.get('/overview', async (_req, res, next) => {
  try {
    const now = new Date(); const soon = new Date(now.getTime() + 30 * 86400000);
    const residentialUserIds = await User.distinct('_id', { role: 'residential', isActive: true });
    const residentialCustomerIds = await PropertyMembership.distinct('customerId', { userId: { $in: residentialUserIds }, relationship: { $in: ['owner', 'household_member'] }, status: 'active' });
    const [residential, commercial, agents, vendors, pendingUsers, setupRequests, vendorWarnings, agentExpiring, accountsWithoutProperties, activeMembers, unassignedOrders, recentPortalOrders] = await Promise.all([
      Customer.countDocuments({ status: 'active', $or: [{ _id: { $in: residentialCustomerIds } }, { customerType: 'residential' }] }),
      CommercialOrganization.countDocuments({ status: { $ne: 'archived' } }),
      User.countDocuments({ role: 'real_estate_agent', isActive: true }),
      Vendor.countDocuments({ portalStatus: { $exists: true }, isActive: true }),
      User.countDocuments({ role: 'pending', isActive: true }),
      require('../models/CommercialSetupRequest').countDocuments({ status: 'pending' }),
      Vendor.countDocuments({ isActive: true, $or: [{ insuranceExpirationDate: { $lte: soon } }, { rocLicenseExpirationDate: { $lte: soon } }, { portalStatus: 'compliance_incomplete' }] }),
      RealEstateTransaction.countDocuments({ status: 'active', accessEndsAt: { $gt: now, $lte: soon } }),
      Customer.countDocuments({ status: 'active', _id: { $in: residentialCustomerIds, $nin: await Property.distinct('ownerCustomerId', { status: 'active' }) } }),
      PropertyMembership.countDocuments(nowActive),
      Order.countDocuments({ status: { $nin: ['completed', 'cancelled'] }, $and: [{ $or: [{ vendorAssignments: { $exists: false } }, { vendorAssignments: { $size: 0 } }] }, { $or: [{ vendor: null }, { vendor: { $exists: false } }] }] }),
      Order.find({ source: { $in: ['residential_portal', 'agent_portal', 'commercial_portal'] } }).select('_id orderId requestReference customerId propertyId service source status workflowStatus priority createdAt').sort({ createdAt: -1 }).limit(12).lean()
    ]);
    res.json({ totals: { residential, commercial, agents, vendors, activeMembers }, attention: { pendingApprovals: pendingUsers, commercialSetupRequests: setupRequests, vendorComplianceWarnings: vendorWarnings, agentAccessExpiringSoon: agentExpiring, accountsWithoutProperties, unassignedOrders }, recentPortalOrders: recentPortalOrders.map(safeOrder), capabilities: { canManage: MANAGE_ROLES.has(_req.user.role) } });
  } catch (error) { next(error); }
});

router.get('/accounts', async (req, res, next) => {
  try {
    const type = clean(req.query.type, 30) || 'all'; const q = clean(req.query.q, 160); const status = clean(req.query.status, 30); const rx = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
    const result = { residential: [], commercial: [], agents: [], vendors: [] };
    const related = { customerIds: [], organizationIds: [], agentIds: [], vendorIds: [] };
    if (rx) {
      const [matchedProperties, matchedOrders] = await Promise.all([
        Property.find({ $or: [{ label: rx }, { addressLine1: rx }, { addressLine2: rx }, { city: rx }, { state: rx }, { postalCode: rx }] }).select('_id ownerCustomerId').limit(500).lean(),
        Order.find({ $or: [{ orderId: rx }, { workOrderNumber: rx }, { requestReference: rx }, { service: rx }, { 'customer.name': rx }, { 'customer.email': rx }, { 'commercialContext.purchaseOrderNumber': rx }] }).select('_id customerId propertyId residentialRequest.transactionId commercialContext.organizationId vendor vendorAssignments.vendor').limit(500).lean()
      ]);
      related.customerIds = [...new Set([...matchedProperties.map(x => id(x.ownerCustomerId)), ...matchedOrders.map(x => id(x.customerId))].filter(Boolean))];
      const propertyIds = [...new Set([...matchedProperties.map(x => id(x._id)), ...matchedOrders.map(x => id(x.propertyId))].filter(Boolean))];
      const transactionIds = matchedOrders.map(x => x.residentialRequest?.transactionId).filter(Boolean);
      const [locations, transactions] = await Promise.all([
        CommercialLocation.find({ propertyId: { $in: propertyIds } }).select('organizationId').lean(),
        RealEstateTransaction.find({ $or: [{ _id: { $in: transactionIds } }, { propertyId: { $in: propertyIds } }, { customerId: { $in: related.customerIds } }] }).select('agentUserId').lean()
      ]);
      related.organizationIds = [...new Set([...locations.map(x => id(x.organizationId)), ...matchedOrders.map(x => id(x.commercialContext?.organizationId))].filter(Boolean))];
      related.agentIds = [...new Set(transactions.map(x => id(x.agentUserId)).filter(Boolean))];
      related.vendorIds = [...new Set(matchedOrders.flatMap(x => [id(x.vendor), ...(x.vendorAssignments || []).map(a => id(a.vendor))]).filter(Boolean))];
    }
    if (['all', 'residential'].includes(type)) {
      const residentialUserIds = await User.distinct('_id', { role: 'residential' });
      const residentialCustomerIds = await PropertyMembership.distinct('customerId', { userId: { $in: residentialUserIds }, relationship: { $in: ['owner', 'household_member'] } });
      const customerFilters = [{ $or: [{ _id: { $in: residentialCustomerIds } }, { customerType: 'residential' }] }];
      if (status) customerFilters.push({ status });
      if (rx) customerFilters.push({ $or: [{ name: rx }, { email: rx }, { phone: rx }, { _id: { $in: related.customerIds } }] });
      const customers = await Customer.find({ $and: customerFilters }).select('_id name email phone customerType status totalOrders totalSpent createdAt').sort({ updatedAt: -1 }).limit(250).lean();
      const customerIds = customers.map(item => item._id); const [propertyCounts, memberCounts, orderCounts] = await Promise.all([Property.aggregate([{ $match: { ownerCustomerId: { $in: customerIds }, status: 'active' } }, { $group: { _id: '$ownerCustomerId', count: { $sum: 1 } } }]), PropertyMembership.aggregate([{ $match: { customerId: { $in: customerIds }, status: 'active' } }, { $group: { _id: '$customerId', count: { $sum: 1 } } }]), Order.aggregate([{ $match: { customerId: { $in: customerIds } } }, { $group: { _id: '$customerId', count: { $sum: 1 } } }])]);
      const pc = new Map(propertyCounts.map(x => [id(x._id), x.count])); const mc = new Map(memberCounts.map(x => [id(x._id), x.count])); const oc = new Map(orderCounts.map(x => [id(x._id), x.count]));
      result.residential = customers.map(item => ({ ...safeCustomer(item), propertyCount: pc.get(id(item._id)) || 0, memberCount: mc.get(id(item._id)) || 0, orderCount: oc.get(id(item._id)) || 0, needsAttention: !(pc.get(id(item._id)) && mc.get(id(item._id))) }));
    }
    if (['all', 'commercial'].includes(type)) {
      const orgs = await CommercialOrganization.find({ ...(status ? { status } : {}), ...(rx ? { $or: [{ name: rx }, { legalName: rx }, { organizationCode: rx }, { _id: { $in: related.organizationIds } }] } : {}) }).sort({ updatedAt: -1 }).limit(250).lean(); const orgIds = orgs.map(x => x._id);
      const [locations, members, orders] = await Promise.all([CommercialLocation.aggregate([{ $match: { organizationId: { $in: orgIds }, status: 'active' } }, { $group: { _id: '$organizationId', count: { $sum: 1 } } }]), CommercialMembership.aggregate([{ $match: { organizationId: { $in: orgIds }, status: 'active' } }, { $group: { _id: '$organizationId', count: { $sum: 1 } } }]), Order.aggregate([{ $match: { 'commercialContext.organizationId': { $in: orgIds } } }, { $group: { _id: '$commercialContext.organizationId', count: { $sum: 1 } } }])]); const lm = new Map(locations.map(x => [id(x._id), x.count])); const mm = new Map(members.map(x => [id(x._id), x.count])); const om = new Map(orders.map(x => [id(x._id), x.count]));
      result.commercial = orgs.map(item => ({ ...safeOrganization(item), locationCount: lm.get(id(item._id)) || 0, memberCount: mm.get(id(item._id)) || 0, orderCount: om.get(id(item._id)) || 0, needsAttention: !(lm.get(id(item._id)) && mm.get(id(item._id))) }));
    }
    if (['all', 'agent', 'agents'].includes(type)) {
      const profileMatches = rx ? await RealEstateAgentProfile.find({ $or: [{ displayName: rx }, { brokerageName: rx }, { licenseNumber: rx }, { referralCode: rx }] }).select('userId').lean() : [];
      const profileAgentIds = [...new Set([...related.agentIds, ...profileMatches.map(x => id(x.userId))])];
      const users = await User.find({ role: 'real_estate_agent', ...(status ? { isActive: status === 'active' } : {}), ...(rx ? { $or: [{ firstName: rx }, { lastName: rx }, { email: rx }, { _id: { $in: profileAgentIds } }] } : {}) }).select('_id firstName lastName email phone role isActive createdAt').sort({ updatedAt: -1 }).limit(250).lean(); const ids = users.map(x => x._id); const profiles = await RealEstateAgentProfile.find({ userId: { $in: ids } }).select('userId displayName brokerageName licenseNumber referralCode status').lean(); const transactions = await RealEstateTransaction.aggregate([{ $match: { agentUserId: { $in: ids } } }, { $group: { _id: '$agentUserId', count: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } } } }]); const pm = new Map(profiles.map(x => [id(x.userId), x])); const tm = new Map(transactions.map(x => [id(x._id), x]));
      result.agents = users.map(user => ({ ...safeUser(user), profile: pm.get(id(user._id)) ? { displayName: pm.get(id(user._id)).displayName, brokerageName: pm.get(id(user._id)).brokerageName, licenseNumber: pm.get(id(user._id)).licenseNumber, referralCode: pm.get(id(user._id)).referralCode, status: pm.get(id(user._id)).status } : null, transactionCount: tm.get(id(user._id))?.count || 0, activeTransactionCount: tm.get(id(user._id))?.active || 0, needsAttention: !pm.get(id(user._id)) }));
    }
    if (['all', 'vendor', 'vendors'].includes(type)) {
      const vendors = await Vendor.find({ ...(status ? { portalStatus: status } : {}), ...(rx ? { $or: [{ name: rx }, { companyName: rx }, { legalBusinessName: rx }, { email: rx }, { category: rx }, { rocLicenseNumber: rx }, { _id: { $in: related.vendorIds } }] } : {}) }).sort({ updatedAt: -1 }).limit(250).lean(); const ids = vendors.map(x => x._id); const [members, assignments] = await Promise.all([VendorPortalMembership.aggregate([{ $match: { vendorId: { $in: ids }, status: 'active' } }, { $group: { _id: '$vendorId', count: { $sum: 1 } } }]), Order.aggregate([{ $unwind: '$vendorAssignments' }, { $match: { 'vendorAssignments.vendor': { $in: ids } } }, { $group: { _id: '$vendorAssignments.vendor', count: { $sum: 1 } } }])]); const mm = new Map(members.map(x => [id(x._id), x.count])); const am = new Map(assignments.map(x => [id(x._id), x.count]));
      result.vendors = vendors.map(item => ({ ...safeVendor(item), memberCount: mm.get(id(item._id)) || 0, assignmentCount: am.get(id(item._id)) || 0, incompleteCompliance: complianceChecklist(item).filter(x => !x.complete).map(x => x.key), needsAttention: item.portalStatus !== 'approved_active' || !mm.get(id(item._id)) }));
    }
    res.json({ data: result, capabilities: { canManage: MANAGE_ROLES.has(req.user.role) } });
  } catch (error) { next(error); }
});

router.get('/residential/:customerId/workspace', async (req, res, next) => {
  try {
    if (!validId(req.params.customerId)) return res.status(404).json({ message: 'Residential account not found' }); const customer = await Customer.findById(req.params.customerId).select('_id name email phone customerType status totalOrders totalSpent documents createdAt').lean(); if (!customer) return res.status(404).json({ message: 'Residential account not found' });
    const properties = await Property.find({ ownerCustomerId: customer._id }).select('_id ownerCustomerId label addressLine1 addressLine2 city state postalCode propertyType status documents createdAt').lean(); const propertyIds = properties.map(x => x._id); const memberships = await PropertyMembership.find({ customerId: customer._id }).lean(); const userIds = memberships.map(x => x.userId); const [users, orders, accountProfile, activity, messages] = await Promise.all([User.find({ _id: { $in: userIds } }).select('_id firstName lastName email phone role isActive createdAt').lean(), Order.find({ customerId: customer._id }).sort({ createdAt: -1 }).limit(300).lean(), ResidentialAccountProfile.findOne({ customerId: customer._id }).select('-preferences').lean(), PortalActivity.find({ customerId: customer._id }).select('_id userId customerId propertyId orderId type title summary occurredAt').sort({ occurredAt: -1 }).limit(100).lean(), ResidentialMessage.find({ customerId: customer._id, status: 'sent' }).select('_id orderId propertyId senderType body createdAt').sort({ createdAt: -1 }).limit(100).lean()]); const orderIds = orders.map(x => x._id); const [quotes, invoices] = await Promise.all([OutgoingQuote.find({ orderId: { $in: orderIds }, status: { $in: ['sent', 'superseded'] } }).select('_id orderId quoteReference status customerDecisionStatus customerTotal sentAt validUntil').lean(), CustomerInvoice.find({ customerId: customer._id }).select('_id invoiceNumber orderId customerId amount issuedAt dueDate paymentId commercialBilling').sort({ issuedAt: -1 }).lean()]); const userMap = new Map(users.map(x => [id(x._id), x]));
    const documents = [...(customer.documents || []).map(d => safeDocument(d, 'customer', customer._id)), ...properties.flatMap(p => (p.documents || []).map(d => safeDocument(d, 'property', p._id))), ...orders.flatMap(o => (o.documents || []).map(d => safeDocument(d, 'order', o._id)))];
    res.json({ account: safeCustomer(customer), profile: accountProfile ? { preferredName: accountProfile.account?.preferredName, phone: accountProfile.account?.phone, timezone: accountProfile.account?.timezone, createdAt: accountProfile.createdAt, updatedAt: accountProfile.updatedAt } : null, properties: properties.map(safeProperty), members: memberships.map(m => safeMembership(m, userMap.get(id(m.userId)))), orders: orders.map(safeOrder), estimates: quotes.map(x => ({ id: id(x._id), orderId: id(x.orderId), reference: x.quoteReference, status: x.status, decisionStatus: x.customerDecisionStatus, customerTotal: x.customerTotal, sentAt: x.sentAt, validUntil: x.validUntil })), invoices: invoices.map(safeInvoice), documents, messages: messages.map(x => ({ id: id(x._id), orderId: id(x.orderId), propertyId: id(x.propertyId), senderType: x.senderType, body: x.body, createdAt: x.createdAt })), activity, capabilities: { canManage: MANAGE_ROLES.has(req.user.role), canCreateOrder: MANAGE_ROLES.has(req.user.role) } });
  } catch (error) { next(error); }
});

router.get('/commercial/:organizationId/workspace', async (req, res, next) => {
  try {
    if (!validId(req.params.organizationId)) return res.status(404).json({ message: 'Commercial organization not found' }); const org = await CommercialOrganization.findById(req.params.organizationId).lean(); if (!org) return res.status(404).json({ message: 'Commercial organization not found' }); const oid = org._id;
    const [portfolios, locations, members, propertyMembers, agreements, orders, invoices, claims, events] = await Promise.all([CommercialPortfolio.find({ organizationId: oid }).lean(), CommercialLocation.find({ organizationId: oid }).lean(), CommercialMembership.find({ organizationId: oid }).lean(), CommercialPropertyMembership.find({ organizationId: oid }).lean(), CommercialServiceAgreement.find({ organizationId: oid }).lean(), Order.find({ 'commercialContext.organizationId': oid }).sort({ createdAt: -1 }).limit(500).lean(), CustomerInvoice.find({ 'commercialBilling.organizationId': oid }).select('_id invoiceNumber orderId amount issuedAt dueDate paymentId commercialBilling').sort({ issuedAt: -1 }).limit(300).lean(), CommercialWarrantyClaim.find({ organizationId: oid }).select('_id propertyId orderId vendorId claimReference title summary status coverage openedAt resolvedAt').sort({ openedAt: -1 }).limit(200).lean(), CommercialAuditEvent.find({ organizationId: oid }).select('_id portfolioId propertyId orderId actorUserId subjectUserId action summary createdAt').sort({ createdAt: -1 }).limit(150).lean()]);
    const properties = await Property.find({ _id: { $in: locations.map(x => x.propertyId) } }).select('_id ownerCustomerId label addressLine1 addressLine2 city state postalCode propertyType status createdAt').lean();
    const users = await User.find({ _id: { $in: [...members, ...propertyMembers].map(x => x.userId) } }).select('_id firstName lastName email phone role isActive createdAt').lean(); const pm = new Map(properties.map(x => [id(x._id), x])); const um = new Map(users.map(x => [id(x._id), x]));
    res.json({ organization: safeOrganization(org), portfolios: portfolios.map(x => ({ id: id(x._id), name: x.name, code: x.portfolioCode, description: x.description, status: x.status })), locations: locations.map(x => ({ id: id(x._id), organizationId: id(x.organizationId), portfolioId: id(x.portfolioId), propertyId: id(x.propertyId), ownerCustomerId: id(x.ownerCustomerId), code: x.locationCode, label: x.ownerLabel, status: x.status, property: safeProperty(pm.get(id(x.propertyId))) })), members: members.map(x => safeMembership(x, um.get(id(x.userId)))), propertyMembers: propertyMembers.map(x => safeMembership(x, um.get(id(x.userId)))), agreements: agreements.map(x => ({ id: id(x._id), propertyId: id(x.propertyId), portfolioId: id(x.portfolioId), agreementNumber: x.agreementNumber, tier: x.tier, billingRules: x.billingRules, purchaseOrder: x.purchaseOrder, entitlements: x.entitlements, effectiveFrom: x.effectiveFrom, effectiveTo: x.effectiveTo, status: x.status })), orders: orders.map(safeOrder), invoices: invoices.map(safeInvoice), warrantyClaims: claims.map(x => ({ id: id(x._id), propertyId: id(x.propertyId), orderId: id(x.orderId), reference: x.claimReference, title: x.title, summary: x.summary, status: x.status, coverage: x.coverage, openedAt: x.openedAt, resolvedAt: x.resolvedAt })), activity: events, capabilities: { canManage: MANAGE_ROLES.has(req.user.role), canCreateOrder: MANAGE_ROLES.has(req.user.role) } });
  } catch (error) { next(error); }
});

router.get('/agents/:agentUserId/workspace', async (req, res, next) => {
  try {
    if (!validId(req.params.agentUserId)) return res.status(404).json({ message: 'Agent not found' }); const user = await User.findOne({ _id: req.params.agentUserId, role: 'real_estate_agent' }).select('_id firstName lastName email phone role isActive createdAt').lean(); if (!user) return res.status(404).json({ message: 'Agent not found' }); const aid = user._id;
    const [profile, transactions, invitations, referrals] = await Promise.all([RealEstateAgentProfile.findOne({ userId: aid }).select('userId displayName brokerageName licenseNumber referralCode referralProgram status createdAt updatedAt').lean(), RealEstateTransaction.find({ agentUserId: aid }).sort({ closeDate: -1 }).limit(300).lean(), AgentClientInvitation.find({ agentUserId: aid }).select('_id customerId propertyId transactionId homeownerName homeownerEmail transactionLabel closeDate status expiresAt acceptedAt revokedAt createdAt').sort({ createdAt: -1 }).limit(300).lean(), AgentReferralAttribution.find({ agentUserId: aid }).select('_id customerId propertyId transactionId source convertedAt completedJobCount createdAt').sort({ createdAt: -1 }).limit(300).lean()]);
    const customerIds = [...new Set(transactions.map(x => id(x.customerId)).filter(Boolean))]; const propertyIds = [...new Set(transactions.map(x => id(x.propertyId)).filter(Boolean))];
    const [customers, properties, orders, activities] = await Promise.all([Customer.find({ _id: { $in: customerIds } }).select('_id name email phone customerType status createdAt').lean(), Property.find({ _id: { $in: propertyIds } }).select('_id ownerCustomerId label addressLine1 addressLine2 city state postalCode propertyType status createdAt').lean(), Order.find({ 'residentialRequest.transactionId': { $in: transactions.map(x => x._id) } }).sort({ createdAt: -1 }).limit(500).lean(), PortalActivity.find({ userId: aid }).select('_id customerId propertyId orderId type title summary occurredAt').sort({ occurredAt: -1 }).limit(150).lean()]);
    const cm = new Map(customers.map(x => [id(x._id), x])); const pm = new Map(properties.map(x => [id(x._id), x])); const orderIds = orders.map(x => x._id);
    const [messages, invoices, onboardingEntries] = await Promise.all([ResidentialMessage.find({ orderId: { $in: orderIds }, status: 'sent' }).select('_id orderId propertyId senderType body createdAt').sort({ createdAt: -1 }).limit(150).lean(), CustomerInvoice.find({ orderId: { $in: orderIds } }).select('_id invoiceNumber orderId amount issuedAt dueDate paymentId').lean(), Promise.all(transactions.slice(0, 100).map(async transaction => [id(transaction._id), publicOnboarding(await homeownerOnboarding(transaction))]))]);
    const onboardingMap = new Map(onboardingEntries);
    res.json({ user: safeUser(user), profile: profile ? { id: id(profile._id), displayName: profile.displayName, brokerageName: profile.brokerageName, licenseNumber: profile.licenseNumber, referralCode: profile.referralCode, status: profile.status, createdAt: profile.createdAt, updatedAt: profile.updatedAt } : null, transactions: transactions.map(x => ({ id: id(x._id), label: x.label, customer: safeCustomer(cm.get(id(x.customerId))), property: safeProperty(pm.get(id(x.propertyId))), closeDate: x.closeDate, accessEndsAt: x.accessEndsAt, maximumAccessEndsAt: calculateAccessExpiry(x.closeDate, 30), status: x.status, permissions: x.permissions, onboarding: onboardingMap.get(id(x._id)) || null, accessHistory: x.accessHistory, createdAt: x.createdAt })), invitations: invitations.map(x => ({ id: id(x._id), homeownerName: x.homeownerName, homeownerEmail: x.homeownerEmail, transactionLabel: x.transactionLabel, closeDate: x.closeDate, status: x.status, expiresAt: x.expiresAt, acceptedAt: x.acceptedAt, revokedAt: x.revokedAt, createdAt: x.createdAt })), orders: orders.map(safeOrder), referrals: referrals.map(x => ({ id: id(x._id), customerId: id(x.customerId), propertyId: id(x.propertyId), transactionId: id(x.transactionId), source: x.source, convertedAt: x.convertedAt, completedJobCount: x.completedJobCount, createdAt: x.createdAt })), invoices: invoices.map(safeInvoice), messages: messages.map(x => ({ id: id(x._id), orderId: id(x.orderId), senderType: x.senderType, body: x.body, createdAt: x.createdAt })), activity: activities, capabilities: { canManage: MANAGE_ROLES.has(req.user.role), canLinkOrder: MANAGE_ROLES.has(req.user.role) } });
  } catch (error) { next(error); }
});

router.get('/vendors/:vendorId/workspace', async (req, res, next) => {
  try {
    if (!validId(req.params.vendorId)) return res.status(404).json({ message: 'Vendor not found' }); const vendor = await Vendor.findById(req.params.vendorId).lean(); if (!vendor) return res.status(404).json({ message: 'Vendor not found' }); const vid = vendor._id;
    const [members, orders, opportunities, quotes, invoices, payouts, performance] = await Promise.all([VendorPortalMembership.find({ vendorId: vid }).lean(), Order.find({ $or: [{ vendor: vid }, { 'vendorAssignments.vendor': vid }] }).sort({ createdAt: -1 }).limit(500).lean(), QuoteInvitation.find({ vendorId: vid }).select('_id quoteId orderId status expiresAt respondedAt declineReasonCode createdAt').sort({ createdAt: -1 }).limit(300).lean(), IncomingQuote.find({ vendorId: vid }).select('_id orderId quoteReference status total submittedAt earliestAvailableDate createdAt').sort({ createdAt: -1 }).limit(300).lean(), VendorInvoice.find({ vendorId: vid }).select('_id assignmentId orderId vendorId invoiceNumber billingLane amount status mismatchFlags submittedAt reviewedAt createdAt').sort({ submittedAt: -1 }).limit(300).lean(), VendorPayout.find({ vendorId: vid }).select('_id vendorInvoiceId assignmentId orderId vendorId amount provider status scheduledFor paidAt failureMessage disputeMessage createdAt').sort({ createdAt: -1 }).limit(300).lean(), VendorPerformanceEvent.find({ vendorId: vid }).select('_id type responseTimeMs occurredAt createdAt').sort({ occurredAt: -1 }).limit(150).lean()]); const users = await User.find({ _id: { $in: members.map(x => x.userId) } }).select('_id firstName lastName email phone role isActive createdAt').lean(); const um = new Map(users.map(x => [id(x._id), x])); const assignments = orders.flatMap(order => (order.vendorAssignments || []).filter(a => id(a.vendor) === id(vid)).map(a => ({ id: id(a._id), orderId: id(order._id), reference: order.requestReference || order.orderId, service: a.service, scope: a.scope, status: a.status, billingLane: a.billingLane, scheduledStart: a.scheduledStart, scheduledEnd: a.scheduledEnd })));
    res.json({ vendor: safeVendor(vendor), compliance: complianceChecklist(vendor), team: members.map(x => safeMembership(x, um.get(id(x.userId)))), assignments, orders: orders.map(safeOrder), opportunities: opportunities.map(x => ({ id: id(x._id), quoteId: id(x.quoteId), orderId: id(x.orderId), status: x.status, expiresAt: x.expiresAt, respondedAt: x.respondedAt, response: x.declineReasonCode, createdAt: x.createdAt })), estimates: quotes.map(x => ({ id: id(x._id), orderId: id(x.orderId), reference: x.quoteReference, status: x.status, amount: x.total, submittedAt: x.submittedAt, validUntil: x.earliestAvailableDate })), invoices: invoices.map(x => ({ id: id(x._id), assignmentId: id(x.assignmentId), orderId: id(x.orderId), invoiceNumber: x.invoiceNumber, billingLane: x.billingLane, amount: x.amount, status: x.status, mismatchFlags: x.mismatchFlags, submittedAt: x.submittedAt, reviewedAt: x.reviewedAt })), payouts: payouts.map(x => ({ id: id(x._id), invoiceId: id(x.vendorInvoiceId), assignmentId: id(x.assignmentId), orderId: id(x.orderId), amount: x.amount, provider: x.provider, status: x.status, scheduledFor: x.scheduledFor, paidAt: x.paidAt, failureMessage: x.failureMessage, disputeMessage: x.disputeMessage })), documents: (vendor.documents || []).map(x => safeDocument(x, 'vendor', vendor._id)), performance: performance.map(x => ({ id: id(x._id), type: x.type, responseTimeMs: x.responseTimeMs, occurredAt: x.occurredAt })), capabilities: { canManage: MANAGE_ROLES.has(req.user.role), canAssignOrder: MANAGE_ROLES.has(req.user.role) } });
  } catch (error) { next(error); }
});

router.post('/residential/:customerId/orders', writes, requireManager, async (req, res, next) => {
  let session;
  try {
    const customerId = req.params.customerId; const propertyId = req.body?.propertyId; const service = clean(req.body?.service, 500); const description = clean(req.body?.description, 10000); const priority = ['low', 'medium', 'high'].includes(req.body?.priority) ? req.body.priority : 'medium';
    if (!validId(customerId) || !validId(propertyId) || !service || !description) return res.status(400).json({ message: 'Customer, authorized property, service, and scope are required' });
    const [customer, property, ownerMembership] = await Promise.all([Customer.findById(customerId), Property.findOne({ _id: propertyId, ownerCustomerId: customerId, status: 'active' }), PropertyMembership.findOne({ customerId, propertyId, relationship: 'owner', status: 'active' })]); if (!customer || !property || !ownerMembership) return res.status(409).json({ message: 'The property is not actively authorized for this residential account' });
    session = await mongoose.startSession(); let order;
    await session.withTransaction(async () => { const now = new Date(); const orderSequence = await nextCounter('orders', session); const requestSequence = await nextCounter(`website-request:${now.getUTCFullYear()}`, session); [order] = await Order.create([{ ...baseOrderPayload({ orderSequence, requestSequence, customer, property, service, description, priority }), residentialStaffReview: { reviewedAt: now, reviewedBy: req.user.userId, scope: description }, customerIntake: { preferredTiming: clean(req.body?.preferredTiming, 500), accessInstructions: clean(req.body?.accessInstructions, 1000), completedAt: now }, residentialRequest: { serviceCategory: service, urgency: priority === 'high' ? 'urgent' : priority === 'medium' ? 'soon' : 'routine', preferredTiming: clean(req.body?.preferredTiming, 500), accessInstructions: clean(req.body?.accessInstructions, 1000), targetCompletionDeadline: req.body?.targetCompletionDeadline || undefined } }], { session }); await synchronizeWorkflowOrder(order, 'request_received', { session }); await PortalActivity.create([{ userId: req.user.userId, customerId: customer._id, propertyId: property._id, orderId: order._id, type: 'staff_residential_order_created', title: 'Staff created residential order', summary: `${service} · ${order.requestReference}` }], { session }); await SecurityAuditEvent.create([{ action: 'portal_admin_residential_order_created', userId: req.user.userId, userEmail: req.user.email, entityType: 'Order', entityId: id(order._id), metadata: { customerId, propertyId, source: 'manual' }, ipAddress: req.ip }], { session }); }); memCache.del('orders:stats:v2'); invalidateDashboardStatsCache(); res.status(201).json({ order: safeOrder(order) });
  } catch (error) { next(error); } finally { if (session) await session.endSession(); }
});

router.post('/commercial/:organizationId/orders', writes, requireManager, async (req, res, next) => {
  let session;
  try {
    const organizationId = req.params.organizationId; const locationId = req.body?.locationId; const service = clean(req.body?.service, 500); const description = clean(req.body?.description, 10000); const priority = ['low', 'medium', 'high'].includes(req.body?.priority) ? req.body.priority : 'medium'; if (!validId(organizationId) || !validId(locationId) || !service || !description) return res.status(400).json({ message: 'Organization, active location, service, and scope are required' });
    const location = await CommercialLocation.findOne({ _id: locationId, organizationId, status: 'active' }); if (!location) return res.status(409).json({ message: 'The location is not active for this organization' }); const [org, property, customer, agreement] = await Promise.all([CommercialOrganization.findOne({ _id: organizationId, status: 'active' }), Property.findOne({ _id: location.propertyId, ownerCustomerId: location.ownerCustomerId, status: 'active' }), Customer.findById(location.ownerCustomerId), CommercialServiceAgreement.findOne({ organizationId, propertyId: location.propertyId, status: 'active', effectiveFrom: { $lte: new Date() }, $or: [{ effectiveTo: null }, { effectiveTo: { $exists: false } }, { effectiveTo: { $gt: new Date() } }] })]); if (!org || !property || !customer || !agreement) return res.status(409).json({ message: 'An active organization, property owner, and service agreement are required' }); const po = clean(req.body?.purchaseOrderNumber, 120); if (agreement.purchaseOrder?.required && !po) return res.status(400).json({ message: `${agreement.purchaseOrder.label || 'PO number'} is required` });
    session = await mongoose.startSession(); let order;
    await session.withTransaction(async () => { const now = new Date(); const orderSequence = await nextCounter('orders', session); const requestSequence = await nextCounter(`website-request:${now.getUTCFullYear()}`, session); [order] = await Order.create([{ ...baseOrderPayload({ orderSequence, requestSequence, customer, property, service, description, priority }), workOrderNumber: `WO-C-${String(orderSequence).padStart(6, '0')}`, customerIntake: { preferredTiming: clean(req.body?.preferredTiming, 500), accessInstructions: clean(req.body?.accessInstructions, 1000), completedAt: now }, commercialContext: { organizationId: org._id, portfolioId: location.portfolioId, locationId: location._id, serviceAgreementId: agreement._id, ownerCustomerId: customer._id, billingContact: location.billingContactOverride || {}, purchaseOrderNumber: po || undefined, targetCompletionDeadline: req.body?.targetCompletionDeadline || undefined, accessInstructions: clean(req.body?.accessInstructions, 1000) } }], { session }); await synchronizeWorkflowOrder(order, 'request_received', { session }); await CommercialAuditEvent.create([{ organizationId: org._id, portfolioId: location.portfolioId, propertyId: property._id, orderId: order._id, actorUserId: req.user.userId, action: 'staff_order_created', summary: `${order.requestReference} created by staff for ${location.locationCode}.`, metadata: { agreementId: agreement._id, tier: agreement.tier, source: 'manual' } }], { session }); await SecurityAuditEvent.create([{ action: 'portal_admin_commercial_order_created', userId: req.user.userId, userEmail: req.user.email, entityType: 'Order', entityId: id(order._id), metadata: { organizationId, locationId, serviceAgreementId: agreement._id, source: 'manual' }, ipAddress: req.ip }], { session }); }); memCache.del('orders:stats:v2'); invalidateDashboardStatsCache(); res.status(201).json({ order: safeOrder(order) });
  } catch (error) { next(error); } finally { if (session) await session.endSession(); }
});

async function activeTransaction(transactionId) {
  const transaction = await RealEstateTransaction.findOne({ _id: transactionId, status: 'active', accessEndsAt: { $gt: new Date() } }); if (!transaction) return null; const membership = await PropertyMembership.findOne({ sourceTransactionId: transaction._id, userId: transaction.agentUserId, customerId: transaction.customerId, propertyId: transaction.propertyId, relationship: 'agent', status: 'active', endsAt: { $gt: new Date() } }); return membership ? { transaction, membership } : null;
}

router.post('/agents/transactions/:transactionId/link-order', writes, requireManager, async (req, res, next) => {
  try {
    if (!validId(req.params.transactionId) || !validId(req.body?.orderId)) return res.status(400).json({ message: 'Valid transaction and order are required' }); const active = await activeTransaction(req.params.transactionId); if (!active) return res.status(409).json({ message: 'An active matching transaction and agent membership are required' }); const order = await Order.findById(req.body.orderId); if (!order || id(order.customerId) !== id(active.transaction.customerId) || id(order.propertyId) !== id(active.transaction.propertyId)) return res.status(409).json({ message: 'Order customer and property must match the transaction' }); if (order.residentialRequest?.transactionId && id(order.residentialRequest.transactionId) !== id(active.transaction._id)) return res.status(409).json({ message: 'Order is already linked to another transaction' }); order.residentialRequest = { ...(order.residentialRequest?.toObject?.() || order.residentialRequest || {}), transactionId: active.transaction._id }; await order.save(); await Promise.all([audit(req, { action: 'portal_admin_agent_order_linked', entityType: 'Order', entityId: order._id, metadata: { transactionId: active.transaction._id, preservedSource: order.source, preservedSubmittedBy: order.residentialRequest?.submittedBy || null } }), PortalActivity.create({ userId: active.transaction.agentUserId, customerId: order.customerId, propertyId: order.propertyId, orderId: order._id, type: 'staff_transaction_order_linked', title: 'Order linked to transaction', summary: `${order.requestReference || order.orderId} linked by SMPLfix staff.` })]); res.json({ order: safeOrder(order) });
  } catch (error) { next(error); }
});

router.post('/agents/transactions/:transactionId/orders', writes, requireManager, async (req, res, next) => {
  let session;
  try {
    if (!validId(req.params.transactionId)) return res.status(400).json({ message: 'Valid transaction is required' }); const active = await activeTransaction(req.params.transactionId); if (!active) return res.status(409).json({ message: 'An active matching transaction and agent membership are required' }); const service = clean(req.body?.service, 500); const description = clean(req.body?.description, 10000); if (!service || !description) return res.status(400).json({ message: 'Service and scope are required' }); const [customer, property] = await Promise.all([Customer.findById(active.transaction.customerId), Property.findOne({ _id: active.transaction.propertyId, ownerCustomerId: active.transaction.customerId, status: 'active' })]); if (!customer || !property) return res.status(409).json({ message: 'Transaction customer or property is unavailable' });
    session = await mongoose.startSession(); let order; await session.withTransaction(async () => { const now = new Date(); const orderSequence = await nextCounter('orders', session); const requestSequence = await nextCounter(`website-request:${now.getUTCFullYear()}`, session); [order] = await Order.create([{ ...baseOrderPayload({ orderSequence, requestSequence, customer, property, service, description, priority: ['low', 'medium', 'high'].includes(req.body?.priority) ? req.body.priority : 'medium' }), residentialStaffReview: { reviewedAt: now, reviewedBy: req.user.userId, scope: description }, residentialRequest: { serviceCategory: service, urgency: req.body?.priority === 'high' ? 'urgent' : 'routine', targetCompletionDeadline: req.body?.targetCompletionDeadline || undefined, transactionId: active.transaction._id } }], { session }); await synchronizeWorkflowOrder(order, 'request_received', { session }); await PortalActivity.create([{ userId: active.transaction.agentUserId, customerId: customer._id, propertyId: property._id, orderId: order._id, type: 'staff_transaction_order_created', title: 'SMPLfix created transaction work', summary: `${service} · ${order.requestReference}` }], { session }); await SecurityAuditEvent.create([{ action: 'portal_admin_agent_transaction_order_created', userId: req.user.userId, userEmail: req.user.email, entityType: 'Order', entityId: id(order._id), metadata: { transactionId: active.transaction._id, source: 'manual' }, ipAddress: req.ip }], { session }); }); memCache.del('orders:stats:v2'); invalidateDashboardStatsCache(); res.status(201).json({ order: safeOrder(order) });
  } catch (error) { next(error); } finally { if (session) await session.endSession(); }
});

router.post('/residential/:customerId/members', writes, requireManager, async (req, res, next) => {
  try { const propertyId = req.body?.propertyId; const email = clean(req.body?.email, 254).toLowerCase(); const relationship = req.body?.relationship === 'household_member' ? 'household_member' : 'owner'; if (!validId(req.params.customerId) || !validId(propertyId) || !email) return res.status(400).json({ message: 'Customer, property, and residential user email are required' }); const [property, user] = await Promise.all([Property.findOne({ _id: propertyId, ownerCustomerId: req.params.customerId, status: 'active' }), User.findOne({ email, role: 'residential', isActive: true })]); if (!property || !user) return res.status(404).json({ message: 'Authorized property and active residential login are required' }); const permissions = { view: true, requestService: req.body?.permissions?.requestService !== false, approveEstimates: req.body?.permissions?.approveEstimates !== false, manageBilling: req.body?.permissions?.manageBilling !== false, manageProperty: relationship === 'owner' && req.body?.permissions?.manageProperty !== false }; const member = await PropertyMembership.findOneAndUpdate({ userId: user._id, propertyId }, { $set: { customerId: req.params.customerId, relationship, permissions, status: 'active', startsAt: new Date(), createdBy: req.user.userId }, $unset: { revokedAt: 1, endsAt: 1 } }, { upsert: true, new: true, runValidators: true }); await audit(req, { action: 'portal_admin_residential_membership_saved', entityType: 'PropertyMembership', entityId: member._id, metadata: { customerId: req.params.customerId, propertyId, subjectUserId: user._id, relationship } }); res.status(201).json({ member: safeMembership(member, user) }); } catch (error) { next(error); }
});

router.patch('/residential/members/:membershipId', writes, requireManager, async (req, res, next) => {
  try { if (!validId(req.params.membershipId)) return res.status(404).json({ message: 'Membership not found' }); const member = await PropertyMembership.findById(req.params.membershipId); if (!member || member.relationship === 'agent') return res.status(404).json({ message: 'Membership not found' }); const nextStatus = req.body?.status === 'revoked' ? 'revoked' : 'active'; member.status = nextStatus; member.revokedAt = nextStatus === 'revoked' ? new Date() : undefined; if (req.body?.permissions) member.permissions = { ...member.permissions.toObject(), ...req.body.permissions, view: true }; await member.save(); await audit(req, { action: 'portal_admin_residential_membership_updated', entityType: 'PropertyMembership', entityId: member._id, metadata: { status: nextStatus, customerId: member.customerId, propertyId: member.propertyId } }); res.json({ member: safeMembership(member) }); } catch (error) { next(error); }
});

router.post('/commercial/:organizationId/members', writes, requireManager, async (req, res, next) => {
  try {
    const email = clean(req.body?.email, 254).toLowerCase(); const roles = ['owner', 'organization_admin', 'billing_admin', 'operations_manager', 'viewer']; const role = roles.includes(req.body?.role) ? req.body.role : 'viewer'; const selected = req.body?.propertyAccess === 'selected';
    if (!validId(req.params.organizationId) || !email || (selected && !validId(req.body?.locationId))) return res.status(400).json({ message: 'Organization, commercial user email, and selected location are required' });
    const [org, user, location] = await Promise.all([CommercialOrganization.findById(req.params.organizationId), User.findOne({ email, role: 'commercial', isActive: true }), selected ? CommercialLocation.findOne({ _id: req.body.locationId, organizationId: req.params.organizationId, status: 'active' }) : Promise.resolve(null)]);
    if (!org || !user || (selected && !location)) return res.status(404).json({ message: 'Organization, active commercial login, and authorized location are required' });
    const defaults = { owner: { viewPortfolio: true, requestService: true, approveEstimates: true, viewInvoices: true, makePayments: true, manageUsers: true, viewReports: true }, organization_admin: { viewPortfolio: true, requestService: true, approveEstimates: true, viewInvoices: true, makePayments: false, manageUsers: true, viewReports: true }, billing_admin: { viewPortfolio: true, requestService: false, approveEstimates: true, viewInvoices: true, makePayments: true, manageUsers: false, viewReports: true }, operations_manager: { viewPortfolio: true, requestService: true, approveEstimates: true, viewInvoices: true, makePayments: false, manageUsers: false, viewReports: true }, viewer: { viewPortfolio: true } };
    const permissions = { ...defaults[role], ...(req.body?.permissions || {}) };
    const member = await CommercialMembership.findOneAndUpdate({ userId: user._id, organizationId: org._id }, { $set: { role, propertyAccess: selected ? 'selected' : 'all', permissions, permissionMode: req.body?.permissions ? 'custom' : 'role_default', status: 'active', startsAt: new Date(), createdBy: req.user.userId }, $unset: { revokedAt: 1, endsAt: 1 } }, { upsert: true, new: true, runValidators: true });
    let propertyMember = null;
    if (selected) {
      const propertyRoles = { owner: 'property_admin', organization_admin: 'property_admin', billing_admin: 'billing', operations_manager: 'coordinator', viewer: 'viewer' };
      propertyMember = await CommercialPropertyMembership.findOneAndUpdate({ userId: user._id, organizationId: org._id, propertyId: location.propertyId }, { $set: { locationId: location._id, role: propertyRoles[role], permissions: { view: true, requestService: permissions.requestService === true, approveEstimates: permissions.approveEstimates === true, viewInvoices: permissions.viewInvoices === true, makePayments: permissions.makePayments === true, viewReports: permissions.viewReports === true, manageUsers: permissions.manageUsers === true }, permissionMode: 'custom', status: 'active', startsAt: new Date(), createdBy: req.user.userId }, $unset: { revokedAt: 1, endsAt: 1 } }, { upsert: true, new: true, runValidators: true });
    }
    await Promise.all([CommercialAuditEvent.create({ organizationId: org._id, propertyId: location?.propertyId, actorUserId: req.user.userId, subjectUserId: user._id, action: 'staff_membership_saved', summary: `${user.email} was granted ${role} access.` }), audit(req, { action: 'portal_admin_commercial_membership_saved', entityType: 'CommercialMembership', entityId: member._id, metadata: { organizationId: org._id, subjectUserId: user._id, role, locationId: location?._id } })]);
    res.status(201).json({ member: safeMembership(member, user), propertyMember: propertyMember ? safeMembership(propertyMember, user) : null });
  } catch (error) { next(error); }
});

router.patch('/commercial/members/:membershipId', writes, requireManager, async (req, res, next) => {
  try { if (!validId(req.params.membershipId)) return res.status(404).json({ message: 'Membership not found' }); const member = await CommercialMembership.findById(req.params.membershipId); if (!member) return res.status(404).json({ message: 'Membership not found' }); const nextStatus = req.body?.status === 'revoked' ? 'revoked' : 'active'; member.status = nextStatus; member.revokedAt = nextStatus === 'revoked' ? new Date() : undefined; if (req.body?.permissions) { member.permissions = { ...member.permissions.toObject(), ...req.body.permissions, viewPortfolio: true }; member.permissionMode = 'custom'; } await member.save(); await Promise.all([CommercialAuditEvent.create({ organizationId: member.organizationId, actorUserId: req.user.userId, subjectUserId: member.userId, action: 'staff_membership_updated', summary: `Commercial membership changed to ${nextStatus}.` }), audit(req, { action: 'portal_admin_commercial_membership_updated', entityType: 'CommercialMembership', entityId: member._id, metadata: { organizationId: member.organizationId, status: nextStatus } })]); res.json({ member: safeMembership(member) }); } catch (error) { next(error); }
});

router.patch('/commercial/property-members/:membershipId', writes, requireManager, async (req, res, next) => {
  try { if (!validId(req.params.membershipId)) return res.status(404).json({ message: 'Property access not found' }); const member = await CommercialPropertyMembership.findById(req.params.membershipId); if (!member) return res.status(404).json({ message: 'Property access not found' }); const nextStatus = req.body?.status === 'revoked' ? 'revoked' : 'active'; member.status = nextStatus; member.revokedAt = nextStatus === 'revoked' ? new Date() : undefined; await member.save(); await Promise.all([CommercialAuditEvent.create({ organizationId: member.organizationId, propertyId: member.propertyId, actorUserId: req.user.userId, subjectUserId: member.userId, action: 'staff_property_access_updated', summary: `Commercial property access changed to ${nextStatus}.` }), audit(req, { action: 'portal_admin_commercial_property_access_updated', entityType: 'CommercialPropertyMembership', entityId: member._id, metadata: { organizationId: member.organizationId, propertyId: member.propertyId, status: nextStatus } })]); res.json({ member: safeMembership(member) }); } catch (error) { next(error); }
});

module.exports = router;
module.exports.__test = { safeUser, safeCustomer, safeProperty, safeOrder, safeInvoice, safeVendor, requireManager };
