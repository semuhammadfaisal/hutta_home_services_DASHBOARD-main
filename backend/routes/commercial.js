const express = require('express');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const { GridFSBucket, ObjectId } = require('mongodb');
const checkRole = require('../middleware/rbac');
const CommercialLocation = require('../models/CommercialLocation');
const CommercialAuditEvent = require('../models/CommercialAuditEvent');
const CommercialMembership = require('../models/CommercialMembership');
const CommercialPortfolioMembership = require('../models/CommercialPortfolioMembership');
const CommercialUserInvitation = require('../models/CommercialUserInvitation');
const CommercialOrganization = require('../models/CommercialOrganization');
const CommercialPortfolio = require('../models/CommercialPortfolio');
const CommercialPortalPreference = require('../models/CommercialPortalPreference');
const CommercialPropertyMembership = require('../models/CommercialPropertyMembership');
const CommercialServiceAgreement = require('../models/CommercialServiceAgreement');
const CommercialWarrantyClaim = require('../models/CommercialWarrantyClaim');
const CustomerInvoice = require('../models/CustomerInvoice');
const Customer = require('../models/Customer');
const Counter = require('../models/Counter');
const CustomerQuoteDecision = require('../models/CustomerQuoteDecision');
const Notification = require('../models/Notification');
const Order = require('../models/Order');
const JobCompletion = require('../models/JobCompletion');
const Vendor = require('../models/Vendor');
const { redactContact } = require('../utils/agentSerializers');
const { reportCsv, reportPdf } = require('../utils/commercialReportExport');
const OutgoingQuote = require('../models/OutgoingQuote');
const Payment = require('../models/Payment');
const PortalActivity = require('../models/PortalActivity');
const Property = require('../models/Property');
const User = require('../models/User');
const { invalidateDashboardStatsCache } = require('../utils/dashboardStatsCache');
const memCache = require('../utils/memoryCache');
const { APPROVAL_CONSENT_TEXT, parseDecisionPayload, quoteSnapshotHash, sha256 } = require('../utils/customerQuoteDecisions');
const { cleanPermissions, createToken, hashToken, scopeKey, validateRole } = require('../utils/commercialPermissions');
const { deliverEmail } = require('../utils/emailService');
const { buildPublicUrl } = require('../utils/publicAppUrl');
const { SERVICE_CATEGORIES } = require('../utils/residentialRequests');
const { synchronizeWorkflowOrder } = require('../utils/workflowSync');
const { createCommercialInvoicePdf } = require('../utils/invoicePdf');
const { allocationFor, billedPropertyIds, dateRange, invoiceVisibility, paymentSummary, phoenixPeriod, reconcileInvoice } = require('../utils/commercialBilling');
const { activeWindow, capabilities, organizationAccess, organizationPermissions, propertyAccess, resolvePropertyAccess, tierEntitlements } = require('../utils/commercialAccess');
const { seal, serializeActivity, serializeAgreement, serializeEstimate, serializeInvoice, serializeLocation, serializeMember, serializeNotification, serializeOrder, serializeOrganization, serializePortfolio, serializeWarrantyClaim } = require('../utils/commercialSerializers');

const router = express.Router();
router.use(checkRole(['commercial']));
const writes = rateLimit({ windowMs: 15 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false, keyGenerator: req => String(req.user.userId), message: { message: 'Too many commercial account updates. Please wait and try again.' } });

const validId = value => mongoose.Types.ObjectId.isValid(String(value || ''));
const safeName = value => String(value || 'document').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120);
const pageOptions = query => { const page = Math.max(1, Number.parseInt(query.page, 10) || 1); const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 25)); return { page, limit, skip: (page - 1) * limit }; };
const clean = (value, max = 1000) => String(value || '').trim().slice(0, max);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function safeDocument(document, downloadUrl, source, propertyId, orderId) {
  return seal({ id: document.documentId, source, propertyId: String(propertyId), orderId: orderId ? String(orderId) : undefined, name: document.name, type: document.type, size: document.size, uploadedAt: document.uploadedAt, downloadUrl });
}
function preferencePayload(preference = {}) {
  return seal({ timezone: preference.timezone || 'America/Phoenix', notifications: preference.notifications || { portal: true, email: true, orderUpdates: true, billingUpdates: true, warrantyUpdates: true, reportReady: true }, monthlyReports: { enabled: preference.monthlyReports?.enabled === true, deliveryDay: preference.monthlyReports?.deliveryDay || 1, format: preference.monthlyReports?.format || 'pdf', propertyIds: (preference.monthlyReports?.propertyIds || []).map(String), lastDeliveryPeriodKey: preference.monthlyReports?.lastDeliveryPeriodKey, lastDeliveryStatus: preference.monthlyReports?.lastDeliveryStatus, lastDeliveredAt: preference.monthlyReports?.lastDeliveredAt }, display: { compactTables: preference.display?.compactTables === true } });
}
function streamCommercialDocument(document, res, next) {
  if (!document || document.status === 'archived' || !document.fileId || !ObjectId.isValid(String(document.fileId))) return res.status(404).json({ message: 'Document not found' });
  if (!mongoose.connection.db) return res.status(503).json({ message: 'File storage is not ready' });
  res.set({ 'Content-Type': document.type || 'application/octet-stream', 'Content-Disposition': `inline; filename="${safeName(document.name)}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' }).openDownloadStream(new ObjectId(String(document.fileId))).once('error', next).pipe(res);
}

async function nextCounter(name, session) { const counter = await Counter.findOneAndUpdate({ _id: name }, { $inc: { value: 1 } }, { new: true, upsert: true, session, setDefaultsOnInsert: true }); return counter.value; }
function actorGrant(permissions = {}) { return { view: permissions.view === true || permissions.viewPortfolio === true, requestService: permissions.requestService === true, approveEstimates: permissions.approveEstimates === true, viewInvoices: permissions.viewInvoices === true, makePayments: permissions.makePayments === true, viewReports: permissions.viewReports === true, manageUsers: permissions.manageUsers === true }; }
async function scopeAccess(userId, organizationId, scopeType, id) {
  const organization = await organizationAccess(userId, organizationId); if (!organization) return null;
  const orgPermissions = organizationPermissions(organization);
  if (scopeType === 'organization') return String(id) === String(organizationId) && orgPermissions.manageUsers ? { organization, permissions: actorGrant(orgPermissions) } : null;
  const locations = scopeType === 'portfolio' ? await CommercialLocation.find({ organizationId, portfolioId: id, status: 'active' }).lean() : await CommercialLocation.find({ organizationId, propertyId: id, status: 'active' }).lean();
  if (!locations.length) return null;
  const locationIds = new Set(locations.map(item => String(item._id)));
  const accesses = (await visiblePropertyAccess(userId)).filter(item => String(item.location.organizationId) === String(organizationId) && locationIds.has(String(item.location._id)));
  if (!accesses.length || (scopeType === 'portfolio' && accesses.length !== locations.length) || !accesses.every(item => capabilities(item).canManageUsers)) return null;
  const grants = accesses.map(item => actorGrant(item.permissions));
  return { organization, accesses, permissions: Object.fromEntries(Object.keys(grants[0]).map(key => [key, grants.every(item => item[key])])) };
}
function invitationPayload(item) { return seal({ id: String(item._id), email: item.email, organizationId: String(item.organizationId), scopeType: item.scopeType, scopeId: String(item.scopeId), role: item.role, permissions: item.permissions, status: item.status, expiresAt: item.expiresAt, acceptedAt: item.acceptedAt, createdAt: item.createdAt }); }

async function scopedOrganization(req, res) {
  if (!validId(req.params.organizationId)) { res.status(400).json({ message: 'Invalid organization id' }); return null; }
  const membership = await organizationAccess(req.user.userId, req.params.organizationId);
  if (!membership) { res.status(404).json({ message: 'Organization not found' }); return null; }
  const organization = await CommercialOrganization.findOne({ _id: req.params.organizationId, status: 'active' }).lean();
  if (!organization) { res.status(404).json({ message: 'Organization not found' }); return null; }
  return { organization, membership, permissions: organizationPermissions(membership) };
}

async function scopedProperty(req, res) {
  if (!validId(req.params.organizationId) || !validId(req.params.propertyId)) { res.status(400).json({ message: 'Invalid organization or property id' }); return null; }
  const access = await propertyAccess(req.user.userId, req.params.organizationId, req.params.propertyId);
  if (!access) { res.status(404).json({ message: 'Property not found' }); return null; }
  const [organization, property, portfolio] = await Promise.all([
    CommercialOrganization.findOne({ _id: req.params.organizationId, status: 'active' }).lean(),
    Property.findOne({ _id: req.params.propertyId, status: 'active' }).lean(),
    CommercialPortfolio.findOne({ _id: access.location.portfolioId, organizationId: req.params.organizationId, status: 'active' }).lean()
  ]);
  if (!organization || !property || !portfolio || String(property.ownerCustomerId) !== String(access.location.ownerCustomerId)) { res.status(404).json({ message: 'Property not found' }); return null; }
  const entitlement = tierEntitlements(access.agreement?.tier);
  return { ...access, organization, property, portfolio, entitlements: entitlement, capabilities: capabilities(access) };
}

async function visiblePropertyAccess(userId) {
  const organizationMemberships = await CommercialMembership.find({ userId, ...activeWindow() }).lean();
  if (!organizationMemberships.length) return [];
  const organizationIds = organizationMemberships.map(item => item.organizationId);
  const now = new Date();
  const [selectedMemberships, portfolioMemberships, locations] = await Promise.all([
    CommercialPropertyMembership.find({ userId, organizationId: { $in: organizationIds }, ...activeWindow(now) }).lean(),
    CommercialPortfolioMembership.find({ userId, organizationId: { $in: organizationIds }, ...activeWindow(now) }).lean(),
    CommercialLocation.find({ organizationId: { $in: organizationIds }, status: 'active' }).lean()
  ]);
  const selectedKeys = new Map(selectedMemberships.map(item => [`${item.organizationId}:${item.propertyId}`, item]));
  const portfolioKeys = new Map(portfolioMemberships.map(item => [`${item.organizationId}:${item.portfolioId}`, item]));
  const organizationMap = new Map(organizationMemberships.map(item => [String(item.organizationId), item]));
  const allOrganizations = new Set(organizationMemberships.filter(item => item.propertyAccess === 'all').map(item => String(item.organizationId)));
  const permittedLocations = locations.filter(location => allOrganizations.has(String(location.organizationId)) || portfolioKeys.has(`${location.organizationId}:${location.portfolioId}`) || selectedKeys.has(`${location.organizationId}:${location.propertyId}`));
  const agreements = permittedLocations.length ? await CommercialServiceAgreement.find({ propertyId: { $in: permittedLocations.map(item => item.propertyId) }, organizationId: { $in: organizationIds }, status: 'active', effectiveFrom: { $lte: now }, $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gt: now } }] }).sort({ effectiveFrom: -1 }).lean() : [];
  const agreementMap = new Map(); for (const agreement of agreements) { const key = `${agreement.organizationId}:${agreement.propertyId}`; if (!agreementMap.has(key)) agreementMap.set(key, agreement); }
  return permittedLocations.map(location => {
    const key = `${location.organizationId}:${location.propertyId}`;
    const access = resolvePropertyAccess({ organizationMembership: organizationMap.get(String(location.organizationId)), portfolioMembership: portfolioKeys.get(`${location.organizationId}:${location.portfolioId}`), propertyMembership: selectedKeys.get(key), location, agreement: agreementMap.get(key) });
    return access ? { ...access, key } : null;
  }).filter(Boolean);
}

async function selectedAccesses(req, res) {
  let accesses = await visiblePropertyAccess(req.user.userId);
  const organizationId = String(req.query.organizationId || '');
  const portfolioId = String(req.query.portfolioId || '');
  const propertyId = String(req.query.propertyId || '');
  if (organizationId) {
    if (!validId(organizationId)) { res.status(400).json({ message: 'Invalid organization id' }); return null; }
    if (!accesses.some(item => String(item.location.organizationId) === organizationId)) { res.status(404).json({ message: 'Organization not found' }); return null; }
    accesses = accesses.filter(item => String(item.location.organizationId) === organizationId);
  }
  if (portfolioId) {
    if (!validId(portfolioId)) { res.status(400).json({ message: 'Invalid portfolio id' }); return null; }
    if (!accesses.some(item => String(item.location.portfolioId) === portfolioId)) { res.status(404).json({ message: 'Portfolio not found' }); return null; }
    accesses = accesses.filter(item => String(item.location.portfolioId) === portfolioId);
  }
  if (propertyId) {
    if (!validId(propertyId)) { res.status(400).json({ message: 'Invalid property id' }); return null; }
    if (!accesses.some(item => String(item.location.propertyId) === propertyId)) { res.status(404).json({ message: 'Property not found' }); return null; }
    accesses = accesses.filter(item => String(item.location.propertyId) === propertyId);
  }
  return accesses;
}

async function commercialBillingRows(req, selected, range = {}) {
  const allAccesses = await visiblePropertyAccess(req.user.userId);
  const allInvoiceAccess = new Map(allAccesses.filter(item => capabilities(item).canViewInvoices).map(item => [`${item.location.organizationId}:${item.location.propertyId}`, item]));
  const selectedPropertyIds = new Set(selected.map(item => String(item.location.propertyId)));
  const organizationIds = [...new Set(selected.map(item => item.location.organizationId))];
  const match = { 'commercialBilling.organizationId': { $in: organizationIds } };
  if (range.from || range.to) match.issuedAt = { ...(range.from ? { $gte: range.from } : {}), ...(range.to ? { $lte: range.to } : {}) };
  const invoices = await CustomerInvoice.find(match).sort({ issuedAt: -1 }).lean();
  const legacyOrderIds = invoices.filter(item => !billedPropertyIds(item).length).map(item => item.orderId);
  const [orders, payments] = await Promise.all([
    legacyOrderIds.length ? Order.find({ _id: { $in: legacyOrderIds } }).select('_id propertyId commercialContext.organizationId').lean() : [],
    invoices.length ? Payment.find({ $or: [{ customerInvoiceId: { $in: invoices.map(item => item._id) } }, { _id: { $in: invoices.map(item => item.paymentId).filter(Boolean) } }] }).select('_id customerInvoiceId amount status paymentDate').lean() : []
  ]);
  const orderMap = new Map(orders.map(item => [String(item._id), item]));
  const paymentById = new Map(payments.map(item => [String(item._id), item]));
  const paymentMap = new Map(payments.filter(item => item.customerInvoiceId).map(item => [String(item.customerInvoiceId), item]));
  return invoices.map(invoice => {
    if (!invoiceVisibility(invoice)) return null;
    const propertyIds = billedPropertyIds(invoice);
    if (propertyIds.length) {
      const organizationId = String(invoice.commercialBilling.organizationId);
      if (!propertyIds.every(propertyId => allInvoiceAccess.has(`${organizationId}:${propertyId}`))) return null;
      if (!propertyIds.some(propertyId => selectedPropertyIds.has(propertyId))) return null;
      if (!reconcileInvoice(invoice).reconciled) return null;
    } else {
      const order = orderMap.get(String(invoice.orderId));
      if (!order || !selectedPropertyIds.has(String(order.propertyId)) || !allInvoiceAccess.has(`${order.commercialContext?.organizationId}:${order.propertyId}`)) return null;
    }
    return { invoice, payment: paymentMap.get(String(invoice._id)) || paymentById.get(String(invoice.paymentId)), propertyIds };
  }).filter(Boolean);
}

function navigationFor(accesses) {
  const allCapabilities = accesses.map(capabilities);
  const items = ['overview', 'properties', 'orders', 'activity'];
  if (allCapabilities.some(item => item.canViewInvoices)) items.push('invoices');
  if (allCapabilities.some(item => item.canViewReports)) items.push('reports');
  if (allCapabilities.some(item => item.canManageUsers)) items.push('users');
  if (accesses.some(item => tierEntitlements(item.agreement?.tier).warrantyClaims)) items.push('warranty');
  items.push('documents', 'notifications', 'account');
  return items;
}

router.get('/me', async (req, res, next) => {
  try {
    const memberships = await CommercialMembership.find({ userId: req.user.userId, ...activeWindow() }).lean();
    const organizations = memberships.length ? await CommercialOrganization.find({ _id: { $in: memberships.map(item => item.organizationId) }, status: 'active' }).sort({ name: 1 }).lean() : [];
    const byOrganization = new Map(memberships.map(item => [String(item.organizationId), item]));
    const accesses = await visiblePropertyAccess(req.user.userId);
    res.json(seal({ user: { id: req.user.userId, email: req.user.email, firstName: req.user.firstName, lastName: req.user.lastName, phone: req.user.phone, role: 'commercial' }, navigation: navigationFor(accesses), organizations: organizations.map(item => { const membership = byOrganization.get(String(item._id)); const permissions = organizationPermissions(membership); return { ...serializeOrganization(item), membership: { role: membership.role, propertyAccess: membership.propertyAccess, permissions } }; }) }));
  } catch (error) { next(error); }
});

router.post('/setup-request', writes, async (req, res, next) => {
  try {
    const organizationId = clean(req.body?.organizationId, 40);
    if (organizationId && (!validId(organizationId) || !await organizationAccess(req.user.userId, organizationId))) {
      return res.status(404).json({ message: 'Organization not found' });
    }
    const title = 'Commercial workspace setup requested';
    const actionUrl = '/pages/admin-dashboard.html#users';
    const message = `Commercial user ${req.user.userId} requested ${organizationId ? `location setup for organization ${organizationId}` : 'organization and location setup'}. Verify ownership and billing before granting access.`;
    const staff = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
    if (!staff.length) return res.status(503).json({ message: 'No account administrator is available. Please contact SMPLfix support.' });
    for (const user of staff) {
      const recent = await Notification.exists({ userId: user._id, title, message, createdAt: { $gte: new Date(Date.now() - 86400000) } });
      if (!recent) await Notification.create({ userId: user._id, title, message, type: 'info', actionUrl });
    }
    res.status(202).json({ message: 'Workspace setup requested' });
  } catch (error) { next(error); }
});

router.get('/dashboard', async (req, res, next) => {
  try {
    const accesses = await selectedAccesses(req, res); if (!accesses) return;
    if (!accesses.length) return res.json({ navigation: navigationFor([]), summary: { propertyCount: 0, openOrders: 0, currentPeriodSpend: 0, urgentItems: 0, estimatesRequiringAction: 0 }, properties: [], openOrders: [], estimates: [], upcomingVisits: [], recentActivity: [] });
    const propertyIds = accesses.map(item => item.location.propertyId);
    const scopes = accesses.map(item => ({ propertyId: item.location.propertyId, 'commercialContext.organizationId': item.location.organizationId }));
    const [properties, portfolios, orders, activities] = await Promise.all([
      Property.find({ _id: { $in: propertyIds }, status: 'active' }).lean(),
      CommercialPortfolio.find({ _id: { $in: accesses.map(item => item.location.portfolioId) }, status: 'active' }).lean(),
      Order.find({ $or: scopes }).sort({ createdAt: -1 }).lean(),
      PortalActivity.find({ propertyId: { $in: propertyIds } }).select('_id propertyId orderId type title summary occurredAt').sort({ occurredAt: -1 }).limit(16).lean()
    ]);
    const orderIds = orders.map(item => item._id);
    const [billingRows, estimates] = await Promise.all([
      commercialBillingRows(req, accesses.filter(item => capabilities(item).canViewInvoices), {}),
      orderIds.length ? OutgoingQuote.find({ orderId: { $in: orderIds }, status: 'sent', customerDecisionStatus: 'pending' }).sort({ sentAt: -1 }).lean() : []
    ]);
    const propertyMap = new Map(properties.map(item => [String(item._id), item]));
    const portfolioMap = new Map(portfolios.map(item => [String(item._id), item]));
    const accessMap = new Map(accesses.map(item => [`${item.location.organizationId}:${item.location.propertyId}`, item]));
    const orderMap = new Map(orders.map(item => [String(item._id), item]));
    const visibleInvoices = billingRows.map(({ invoice, payment }) => serializeInvoice(invoice, payment)).filter(Boolean);
    const startOfPeriod = phoenixPeriod(new Date(), 'monthly').start;
    const closedStatuses = new Set(['completed', 'paid', 'cancelled', 'canceled', 'closed']);
    const openOrders = orders.filter(item => !closedStatuses.has(String(item.status || '').toLowerCase()) && !['completed'].includes(item.workflowStatus));
    const propertySummaries = accesses.map(access => {
      const key = String(access.location.propertyId); const property = propertyMap.get(key); if (!property) return null;
      const locationOrders = orders.filter(item => String(item.propertyId) === key);
      const locationInvoices = billingRows.filter(item => item.invoice.issuedAt && new Date(item.invoice.issuedAt) >= startOfPeriod && (item.propertyIds.length ? item.propertyIds.includes(key) : String(item.invoice.orderId) && locationOrders.some(order => String(order._id) === String(item.invoice.orderId))));
      const upcoming = locationOrders.filter(item => item.scheduledStart && new Date(item.scheduledStart) >= new Date()).sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart))[0];
      return { ...serializeLocation(access.location, property, access, tierEntitlements(access.agreement?.tier), capabilities(access)), portfolioName: portfolioMap.get(String(access.location.portfolioId))?.name, openOrderCount: locationOrders.filter(item => openOrders.includes(item)).length, currentPeriodSpend: locationInvoices.reduce((sum, item) => sum + (item.propertyIds.length ? allocationFor(item.invoice, [key]) : Number(item.invoice.amount || 0)), 0), upcomingVisit: upcoming ? { orderId: String(upcoming._id), service: upcoming.service, scheduledStart: upcoming.scheduledStart, scheduledEnd: upcoming.scheduledEnd } : null };
    }).filter(Boolean);
    const safeOrders = openOrders.slice(0, 30).map(order => { const access = accessMap.get(`${order.commercialContext?.organizationId}:${order.propertyId}`); return serializeOrder(order, access?.agreement, capabilities(access)); });
    const safeEstimates = estimates.map(estimate => { const order = orderMap.get(String(estimate.orderId)); const access = order && accessMap.get(`${order.commercialContext?.organizationId}:${order.propertyId}`); return access ? serializeEstimate(estimate, order, capabilities(access).canApproveEstimates) : null; }).filter(item => item?.canApprove);
    const upcomingVisits = orders.filter(item => item.scheduledStart && new Date(item.scheduledStart) >= new Date()).sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart)).slice(0, 8).map(order => { const access = accessMap.get(`${order.commercialContext?.organizationId}:${order.propertyId}`); return serializeOrder(order, access?.agreement, capabilities(access)); });
    const currentPeriodSpend = visibleInvoices.filter(item => item.issuedAt && new Date(item.issuedAt) >= startOfPeriod).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    res.json(seal({ navigation: navigationFor(accesses), period: { startsAt: startOfPeriod }, summary: { propertyCount: propertySummaries.length, openOrders: openOrders.length, currentPeriodSpend, urgentItems: openOrders.filter(item => ['high', 'urgent', 'emergency'].includes(String(item.priority).toLowerCase())).length, estimatesRequiringAction: safeEstimates.length }, properties: propertySummaries, openOrders: safeOrders, estimates: safeEstimates, upcomingVisits, recentActivity: activities.map(serializeActivity) }));
  } catch (error) { next(error); }
});

router.get('/invoices', async (req, res, next) => {
  try {
    const accesses = await selectedAccesses(req, res); if (!accesses) return;
    const allowed = accesses.filter(item => capabilities(item).canViewInvoices);
    if (!allowed.length) return res.status(403).json({ message: 'Invoice permission required' });
    const range = dateRange(req.query);
    const rows = await commercialBillingRows(req, allowed, range);
    res.json(seal({ data: rows.map(({ invoice, payment }) => serializeInvoice(invoice, payment)), filters: { dateFrom: range.from, dateTo: range.to } }));
  } catch (error) { next(error); }
});

router.get('/reports', async (req, res, next) => {
  try {
    const accesses = await selectedAccesses(req, res); if (!accesses) return;
    const allowed = accesses.filter(item => capabilities(item).canViewReports);
    if (!allowed.length) return res.status(403).json({ message: 'Report permission required' });
    const range = dateRange(req.query);
    const rows = (await commercialBillingRows(req, allowed, range)).filter(item => item.invoice.commercialBilling?.invoiceKind === 'consolidated_period');
    const months = new Map();
    for (const { invoice, payment } of rows) {
      const monthParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit' }).formatToParts(new Date(invoice.issuedAt));
      const month = `${monthParts.find(part => part.type === 'year').value}-${monthParts.find(part => part.type === 'month').value}`;
      const settlement = paymentSummary(invoice, payment ? [payment] : []);
      const key = `${invoice.commercialBilling.organizationId}:${month}`;
      if (!months.has(key)) months.set(key, { id: key, organizationId: String(invoice.commercialBilling.organizationId), period: month, invoiceCount: 0, total: 0, paid: 0, balanceDue: 0, properties: new Map() });
      const report = months.get(key); report.invoiceCount += 1; report.total += Number(invoice.amount || 0); report.paid += settlement.paidAmount; report.balanceDue += settlement.balanceDue;
      for (const property of invoice.commercialBilling.propertyBreakdown || []) {
        const propertyId = String(property.propertyId); const current = report.properties.get(propertyId) || { propertyId, propertyLabel: property.propertyLabel, total: 0 };
        current.total += Number(property.billedAmount || 0); report.properties.set(propertyId, current);
      }
    }
    const data = [...months.values()].map(item => ({ ...item, total: Number(item.total.toFixed(2)), paid: Number(item.paid.toFixed(2)), balanceDue: Number(item.balanceDue.toFixed(2)), properties: [...item.properties.values()].map(row => ({ ...row, total: Number(row.total.toFixed(2)) })) }));
    const selected = req.query.period ? data.filter(item => item.period === req.query.period) : data;
    if (req.query.format === 'csv') return res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="commercial-summary.csv"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }).send(reportCsv(selected));
    if (req.query.format === 'pdf') return res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="commercial-summary.pdf"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }).send(await reportPdf(selected));
    res.json(seal({ data: selected, filters: { dateFrom: range.from, dateTo: range.to } }));
  } catch (error) { next(error); }
});

router.get('/warranty-claims', async (req, res, next) => {
  try {
    const accesses = await selectedAccesses(req, res); if (!accesses) return;
    const allowed = accesses.filter(item => tierEntitlements(item.agreement?.tier).warrantyClaims);
    if (!allowed.length) return res.status(403).json({ message: 'Warranty claims require a Tier 3 service agreement' });
    const claims = await CommercialWarrantyClaim.find({ $or: allowed.map(item => ({ organizationId: item.location.organizationId, propertyId: item.location.propertyId })) }).sort({ openedAt: -1 }).lean();
    res.json({ data: claims.map(serializeWarrantyClaim) });
  } catch (error) { next(error); }
});

router.get('/warranty-claims/:claimId', async (req, res, next) => {
  try {
    if (!validId(req.params.claimId)) return res.status(400).json({ message: 'Invalid warranty claim id' });
    const claim = await CommercialWarrantyClaim.findById(req.params.claimId).lean();
    if (!claim) return res.status(404).json({ message: 'Warranty claim not found' });
    const access = await propertyAccess(req.user.userId, claim.organizationId, claim.propertyId);
    if (!access || !tierEntitlements(access.agreement?.tier).warrantyClaims) return res.status(404).json({ message: 'Warranty claim not found' });
    res.json({ claim: serializeWarrantyClaim(claim) });
  } catch (error) { next(error); }
});

router.get('/warranty-claims/:claimId/documents/:documentId', async (req, res, next) => {
  try {
    if (!validId(req.params.claimId)) return res.status(400).json({ message: 'Invalid warranty claim id' });
    const claim = await CommercialWarrantyClaim.findById(req.params.claimId).select('organizationId propertyId documents').lean();
    const access = claim && await propertyAccess(req.user.userId, claim.organizationId, claim.propertyId);
    if (!access || !tierEntitlements(access.agreement?.tier).warrantyClaims) return res.status(404).json({ message: 'Document not found' });
    return streamCommercialDocument((claim.documents || []).find(item => item.documentId === req.params.documentId), res, next);
  } catch (error) { next(error); }
});

router.get('/activity', async (req, res, next) => {
  try {
    const accesses = await selectedAccesses(req, res); if (!accesses) return;
    const { page, limit, skip } = pageOptions(req.query); const propertyIds = accesses.map(item => item.location.propertyId);
    const match = { propertyId: { $in: propertyIds } };
    const [total, activities] = await Promise.all([PortalActivity.countDocuments(match), PortalActivity.find(match).select('_id propertyId orderId type title summary occurredAt').sort({ occurredAt: -1 }).skip(skip).limit(limit).lean()]);
    res.json(seal({ data: activities.map(serializeActivity), page, limit, total }));
  } catch (error) { next(error); }
});

router.get('/documents', async (req, res, next) => {
  try {
    const accesses = await selectedAccesses(req, res); if (!accesses) return;
    const propertyIds = accesses.map(item => item.location.propertyId); const scopes = accesses.map(item => ({ propertyId: item.location.propertyId, 'commercialContext.organizationId': item.location.organizationId }));
    const tierThreeKeys = new Set(accesses.filter(item => tierEntitlements(item.agreement?.tier).warrantyClaims).map(item => `${item.location.organizationId}:${item.location.propertyId}`));
    const [properties, orders, claims] = await Promise.all([
      Property.find({ _id: { $in: propertyIds } }).select('_id documents').lean(),
      scopes.length ? Order.find({ $or: scopes }).select('_id propertyId documents').lean() : [],
      tierThreeKeys.size ? CommercialWarrantyClaim.find({ $or: [...tierThreeKeys].map(key => { const [organizationId, propertyId] = key.split(':'); return { organizationId, propertyId }; }) }).select('_id organizationId propertyId documents').lean() : []
    ]);
    const data = [];
    properties.forEach(property => (property.documents || []).filter(item => item.status !== 'archived').forEach(document => data.push(safeDocument(document, `/api/commercial/properties/${property._id}/documents/${encodeURIComponent(document.documentId)}`, 'property', property._id))));
    orders.forEach(order => (order.documents || []).filter(item => item.status !== 'archived').forEach(document => data.push(safeDocument(document, `/api/commercial/orders/${order._id}/documents/${encodeURIComponent(document.documentId)}`, 'order', order.propertyId, order._id))));
    claims.forEach(claim => (claim.documents || []).filter(item => item.status !== 'archived').forEach(document => data.push(safeDocument(document, `/api/commercial/warranty-claims/${claim._id}/documents/${encodeURIComponent(document.documentId)}`, 'warranty', claim.propertyId))));
    res.json(seal({ data }));
  } catch (error) { next(error); }
});

router.get('/properties/:propertyId/documents/:documentId', async (req, res, next) => {
  try { if (!validId(req.params.propertyId)) return res.status(400).json({ message: 'Invalid property id' }); const accesses = await visiblePropertyAccess(req.user.userId); const access = accesses.find(item => String(item.location.propertyId) === req.params.propertyId); if (!access) return res.status(404).json({ message: 'Document not found' }); const property = await Property.findById(req.params.propertyId).select('documents').lean(); return streamCommercialDocument((property?.documents || []).find(item => item.documentId === req.params.documentId), res, next); } catch (error) { next(error); }
});

router.get('/orders/:orderId/documents/:documentId', async (req, res, next) => {
  try { if (!validId(req.params.orderId)) return res.status(400).json({ message: 'Invalid order id' }); const order = await Order.findById(req.params.orderId).select('propertyId commercialContext.organizationId documents').lean(); const access = order && await propertyAccess(req.user.userId, order.commercialContext?.organizationId, order.propertyId); if (!access) return res.status(404).json({ message: 'Document not found' }); return streamCommercialDocument((order.documents || []).find(item => item.documentId === req.params.documentId), res, next); } catch (error) { next(error); }
});

router.get('/notifications', async (req, res, next) => {
  try {
    const accesses = await visiblePropertyAccess(req.user.userId); const organizationIds = [...new Set(accesses.map(item => item.location.organizationId))]; const propertyIds = accesses.map(item => item.location.propertyId);
    const notifications = await Notification.find({ userId: req.user.userId, $or: [{ 'metadata.organizationId': { $in: organizationIds } }, { 'metadata.propertyId': { $in: propertyIds } }] }).select('_id title message type priority isRead createdAt').sort({ createdAt: -1 }).limit(100).lean();
    res.json({ data: notifications.map(serializeNotification), unreadCount: notifications.filter(item => !item.isRead).length });
  } catch (error) { next(error); }
});

router.get('/organizations', async (req, res, next) => {
  try {
    const memberships = await CommercialMembership.find({ userId: req.user.userId, ...activeWindow() }).lean();
    const organizations = memberships.length ? await CommercialOrganization.find({ _id: { $in: memberships.map(item => item.organizationId) }, status: 'active' }).sort({ name: 1 }).lean() : [];
    res.json({ data: organizations.map(serializeOrganization) });
  } catch (error) { next(error); }
});

router.get('/organizations/:organizationId', async (req, res, next) => {
  try { const found = await scopedOrganization(req, res); if (!found) return; const organizationWide = found.membership.propertyAccess === 'all'; const isAdministrator = ['owner', 'organization_admin'].includes(found.membership.role); res.json({ organization: serializeOrganization(found.organization, { includeContacts: organizationWide && isAdministrator, includeBillingContacts: organizationWide && found.permissions.viewInvoices }), membership: { role: found.membership.role, propertyAccess: found.membership.propertyAccess, permissions: found.permissions } }); } catch (error) { next(error); }
});

router.get('/organizations/:organizationId/preferences', async (req, res, next) => {
  try {
    const found = await scopedOrganization(req, res); if (!found) return;
    const preference = await CommercialPortalPreference.findOne({ userId: req.user.userId, organizationId: found.organization._id }).lean();
    res.json({ preferences: preferencePayload(preference) });
  } catch (error) { next(error); }
});

router.patch('/organizations/:organizationId/preferences', writes, async (req, res, next) => {
  try {
    const found = await scopedOrganization(req, res); if (!found) return;
    const body = req.body || {}; const report = body.monthlyReports || {}; const propertyIds = Array.isArray(report.propertyIds) ? [...new Set(report.propertyIds.map(String))] : [];
    if (propertyIds.some(id => !validId(id))) return res.status(400).json({ message: 'Invalid report property selection' });
    const accesses = (await visiblePropertyAccess(req.user.userId)).filter(item => String(item.location.organizationId) === String(found.organization._id)); const byProperty = new Map(accesses.map(item => [String(item.location.propertyId), item]));
    if (propertyIds.some(id => !byProperty.has(id))) return res.status(404).json({ message: 'Property not found' });
    if (report.enabled === true && (!propertyIds.length || propertyIds.some(id => !capabilities(byProperty.get(id)).canViewReports || !tierEntitlements(byProperty.get(id).agreement?.tier).monthlyReports))) return res.status(403).json({ message: 'Scheduled reports require report access to Tier 2 or Tier 3 properties' });
    const update = { timezone: 'America/Phoenix', notifications: { portal: body.notifications?.portal !== false, email: body.notifications?.email !== false, orderUpdates: body.notifications?.orderUpdates !== false, billingUpdates: body.notifications?.billingUpdates !== false, warrantyUpdates: body.notifications?.warrantyUpdates !== false, reportReady: body.notifications?.reportReady !== false }, monthlyReports: { enabled: report.enabled === true, deliveryDay: Math.max(1, Math.min(28, Number.parseInt(report.deliveryDay, 10) || 1)), format: ['pdf', 'csv', 'both'].includes(report.format) ? report.format : 'pdf', propertyIds }, display: { compactTables: body.display?.compactTables === true } };
    const preference = await CommercialPortalPreference.findOneAndUpdate({ userId: req.user.userId, organizationId: found.organization._id }, { $set: update }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
    await CommercialAuditEvent.create({ organizationId: found.organization._id, actorUserId: req.user.userId, action: 'portal_preferences_updated', summary: 'Commercial portal preferences updated.', metadata: { scheduledReports: update.monthlyReports.enabled, propertyCount: propertyIds.length } });
    res.json({ preferences: preferencePayload(preference) });
  } catch (error) { next(error); }
});

router.patch('/account', writes, async (req, res, next) => {
  try {
    const firstName = clean(req.body?.firstName, 80); const lastName = clean(req.body?.lastName, 80); const phone = clean(req.body?.phone, 40);
    if (!firstName || !lastName) return res.status(400).json({ message: 'First and last name are required' });
    const user = await User.findOneAndUpdate({ _id: req.user.userId, role: 'commercial', isActive: true }, { $set: { firstName, lastName, phone } }, { new: true, runValidators: true }).select('_id email firstName lastName phone').lean();
    if (!user) return res.status(404).json({ message: 'Commercial account not found' });
    res.json(seal({ user: { id: String(user._id), email: user.email, firstName: user.firstName, lastName: user.lastName, phone: user.phone } }));
  } catch (error) { next(error); }
});

router.get('/organizations/:organizationId/users', async (req, res, next) => {
  try {
    const found = await scopedOrganization(req, res); if (!found) return;
    let scopedUserIds = null;
    if (!found.permissions.manageUsers) {
      const managed = (await visiblePropertyAccess(req.user.userId)).filter(item => String(item.location.organizationId) === String(found.organization._id) && capabilities(item).canManageUsers);
      if (!managed.length) return res.status(403).json({ message: 'User-management permission required' });
      const [propertyUsers, portfolioUsers] = await Promise.all([
        CommercialPropertyMembership.find({ organizationId: found.organization._id, propertyId: { $in: managed.map(item => item.location.propertyId) }, ...activeWindow() }).distinct('userId'),
        CommercialPortfolioMembership.find({ organizationId: found.organization._id, portfolioId: { $in: managed.map(item => item.location.portfolioId) }, ...activeWindow() }).distinct('userId')
      ]);
      scopedUserIds = [...new Set([...propertyUsers, ...portfolioUsers].map(String))];
    }
    const membershipQuery = { organizationId: found.organization._id, status: 'active' }; if (scopedUserIds) membershipQuery.userId = { $in: scopedUserIds };
    const memberships = await CommercialMembership.find(membershipQuery).sort({ role: 1, createdAt: 1 }).lean();
    const userIds = memberships.map(item => item.userId);
    const [users, propertyMemberships, portfolioMemberships] = await Promise.all([
      User.find({ _id: { $in: userIds }, isActive: true }).select('_id firstName lastName email').lean(),
      CommercialPropertyMembership.find({ organizationId: found.organization._id, userId: { $in: userIds }, status: 'active' }).select('userId propertyId locationId role permissions status').lean(),
      CommercialPortfolioMembership.find({ organizationId: found.organization._id, userId: { $in: userIds }, status: 'active' }).select('userId portfolioId role permissions status').lean()
    ]);
    const userMap = new Map(users.map(user => [String(user._id), user]));
    const propertyRolesByUser = new Map();
    propertyMemberships.forEach(item => { const key = String(item.userId); if (!propertyRolesByUser.has(key)) propertyRolesByUser.set(key, []); propertyRolesByUser.get(key).push(item); });
    const portfolioRolesByUser = new Map(); portfolioMemberships.forEach(item => { const key=String(item.userId); if(!portfolioRolesByUser.has(key)) portfolioRolesByUser.set(key,[]); portfolioRolesByUser.get(key).push(item); });
    res.json({ data: memberships.map(item => serializeMember(userMap.get(String(item.userId)), item, propertyRolesByUser.get(String(item.userId)) || [], portfolioRolesByUser.get(String(item.userId)) || [])).filter(item => item.user.id) });
  } catch (error) { next(error); }
});

router.get('/organizations/:organizationId/portfolios', async (req, res, next) => {
  try {
    const found = await scopedOrganization(req, res); if (!found) return;
    const query = { organizationId: found.organization._id, status: 'active' };
    if (found.membership.propertyAccess !== 'all') {
      const propertyMemberships = await CommercialPropertyMembership.find({ userId: req.user.userId, organizationId: found.organization._id, ...activeWindow() }).select('locationId').lean();
      const portfolioMemberships = await CommercialPortfolioMembership.find({ userId: req.user.userId, organizationId: found.organization._id, ...activeWindow() }).select('portfolioId').lean();
      const locations = await CommercialLocation.find({ _id: { $in: propertyMemberships.map(item => item.locationId) }, organizationId: found.organization._id, status: 'active' }).select('portfolioId').lean();
      query._id = { $in: [...locations.map(item => item.portfolioId), ...portfolioMemberships.map(item => item.portfolioId)] };
    }
    const portfolios = await CommercialPortfolio.find(query).sort({ name: 1 }).lean();
    res.json({ data: portfolios.map(serializePortfolio) });
  } catch (error) { next(error); }
});

router.get('/organizations/:organizationId/properties', async (req, res, next) => {
  try {
    const found = await scopedOrganization(req, res); if (!found) return;
    const locationQuery = { organizationId: found.organization._id, status: 'active' };
    if (found.membership.propertyAccess !== 'all') {
      const memberships = await CommercialPropertyMembership.find({ userId: req.user.userId, organizationId: found.organization._id, ...activeWindow() }).select('propertyId').lean();
      const portfolioMemberships = await CommercialPortfolioMembership.find({ userId: req.user.userId, organizationId: found.organization._id, ...activeWindow() }).select('portfolioId').lean();
      locationQuery.$or = [{ propertyId: { $in: memberships.map(item => item.propertyId) } }, { portfolioId: { $in: portfolioMemberships.map(item => item.portfolioId) } }];
    }
    const locations = await CommercialLocation.find(locationQuery).sort({ locationCode: 1 }).lean();
    const properties = await Property.find({ _id: { $in: locations.map(item => item.propertyId) }, status: 'active' }).lean();
    const propertyMap = new Map(properties.map(item => [String(item._id), item]));
    const data = [];
    for (const location of locations) {
      const access = await propertyAccess(req.user.userId, found.organization._id, location.propertyId);
      const property = propertyMap.get(String(location.propertyId));
      if (access && property) data.push(serializeLocation(location, property, access, tierEntitlements(access.agreement?.tier), capabilities(access)));
    }
    res.json({ data });
  } catch (error) { next(error); }
});

router.get('/organizations/:organizationId/properties/:propertyId', async (req, res, next) => {
  try { const found = await scopedProperty(req, res); if (!found) return; res.json({ property: serializeLocation(found.location, found.property, found, found.entitlements, found.capabilities), portfolio: serializePortfolio(found.portfolio), agreement: found.agreement ? serializeAgreement(found.agreement, found.entitlements) : null }); } catch (error) { next(error); }
});

router.get('/organizations/:organizationId/properties/:propertyId/agreement', async (req, res, next) => {
  try { const found = await scopedProperty(req, res); if (!found) return; if (!found.agreement) return res.status(404).json({ message: 'Active service agreement not found' }); res.json({ agreement: serializeAgreement(found.agreement, found.entitlements), capabilities: found.capabilities }); } catch (error) { next(error); }
});

router.get('/organizations/:organizationId/properties/:propertyId/orders', async (req, res, next) => {
  try {
    const found = await scopedProperty(req, res); if (!found) return; const { page, limit, skip } = pageOptions(req.query);
    const query = { propertyId: found.property._id, 'commercialContext.organizationId': found.organization._id };
    const [total, orders] = await Promise.all([Order.countDocuments(query), Order.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean()]);
    res.json({ data: orders.map(item => serializeOrder(item, found.agreement, found.capabilities)), pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (error) { next(error); }
});

router.get('/orders', async (req, res, next) => {
  try {
    const accesses = await visiblePropertyAccess(req.user.userId); const { page, limit, skip } = pageOptions(req.query);
    const scopes = accesses.map(item => ({ propertyId: item.location.propertyId, 'commercialContext.organizationId': item.location.organizationId }));
    if (!scopes.length) return res.json({ data: [], pagination: { page, limit, total: 0, pages: 1 } });
    const [total, orders] = await Promise.all([Order.countDocuments({ $or: scopes }), Order.find({ $or: scopes }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean()]);
    const accessMap = new Map(accesses.map(item => [item.key, item]));
    res.json({ data: orders.map(order => { const access = accessMap.get(`${order.commercialContext?.organizationId}:${order.propertyId}`); return serializeOrder(order, access?.agreement, capabilities(access)); }), pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (error) { next(error); }
});

async function scopedCommercialOrder(req, res) {
  if (!validId(req.params.orderId)) { res.status(400).json({ message: 'Invalid order ID' }); return null; }
  const order = await Order.findById(req.params.orderId).lean();
  if (!order?.propertyId || !order.commercialContext?.organizationId) { res.status(404).json({ message: 'Order not found' }); return null; }
  const access = await propertyAccess(req.user.userId, order.commercialContext.organizationId, order.propertyId);
  if (!access) { res.status(404).json({ message: 'Order not found' }); return null; }
  return { order, access };
}

router.get('/orders/:orderId/completion', async (req, res, next) => {
  try {
    const found = await scopedCommercialOrder(req, res); if (!found) return;
    const records = await JobCompletion.find({ orderId: found.order._id, status: 'completed' }).sort({ completedAt: -1 }).select('completionReference completedAt completionNotes beforePhotos afterPhotos').lean();
    const completions = records.map(completion => {
      const photos = phase => (completion[`${phase}Photos`] || []).filter(item => item.status !== 'archived').map(item => ({ id: item.documentId, name: redactContact(item.name), url: `/api/commercial/orders/${found.order._id}/completion-photos/${phase}/${encodeURIComponent(item.documentId)}` }));
      return { reference: completion.completionReference, completedAt: completion.completedAt, serviceNotes: redactContact(completion.completionNotes), beforePhotos: photos('before'), afterPhotos: photos('after') };
    });
    res.set('Cache-Control', 'private, no-store').json({ completion: completions[0] || null, completions });
  } catch (error) { next(error); }
});
router.get('/orders/:orderId/completion-photos/:phase/:documentId', async (req, res, next) => {
  try {
    const found = await scopedCommercialOrder(req, res); if (!found) return;
    if (!['before', 'after'].includes(req.params.phase)) return res.status(400).json({ message: 'Invalid photo phase' });
    const completion = await JobCompletion.findOne({ orderId: found.order._id, status: 'completed', [`${req.params.phase}Photos.documentId`]: req.params.documentId }).lean();
    const document = (completion?.[`${req.params.phase}Photos`] || []).find(item => item.documentId === req.params.documentId && item.status !== 'archived');
    if (!document?.fileId || !ObjectId.isValid(String(document.fileId))) return res.status(404).json({ message: 'Photo not found' });
    res.set({ 'Content-Type': document.type || 'application/octet-stream', 'Content-Disposition': `inline; filename="${safeName(document.name)}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' }).openDownloadStream(new ObjectId(String(document.fileId))).once('error', next).pipe(res);
  } catch (error) { next(error); }
});
router.get('/orders/:orderId/estimates/:quoteId', async (req, res, next) => {
  try {
    const found = await scopedCommercialOrder(req, res); if (!found) return;
    if (!validId(req.params.quoteId)) return res.status(400).json({ message: 'Invalid estimate ID' });
    const quote = await OutgoingQuote.findOne({ _id: req.params.quoteId, orderId: found.order._id, status: 'sent' }).select('orderId quoteReference scopeOfWork customerTotal customerDecisionStatus validUntil sentAt termsAndConditions exclusionsConditions').lean();
    if (!quote) return res.status(404).json({ message: 'Estimate not found' });
    const vendor = found.order.vendor ? await Vendor.findById(found.order.vendor).select('name legalBusinessName rocLicenseNumber rocNumber').lean() : null;
    const allowed = capabilities(found.access).canApproveEstimates && quote.customerDecisionStatus === 'pending' && new Date(quote.validUntil) > new Date() && [found.order.currentOutgoingQuoteId, found.order.approvedOutgoingQuoteId].some(id => String(id) === String(quote._id));
    res.set('Cache-Control', 'private, no-store').json(seal({ estimate: { ...serializeEstimate(quote, found.order, allowed), terms: quote.termsAndConditions, exclusions: quote.exclusionsConditions, consentText: APPROVAL_CONSENT_TEXT, contractor: vendor ? { name: vendor.legalBusinessName || vendor.name, rocNumber: vendor.rocLicenseNumber || vendor.rocNumber } : null } }));
  } catch (error) { next(error); }
});

router.get('/orders/:orderId', async (req, res, next) => {
  try {
    if (!validId(req.params.orderId)) return res.status(400).json({ message: 'Invalid order id' });
    const order = await Order.findById(req.params.orderId).lean();
    if (!order?.propertyId || !order.commercialContext?.organizationId) return res.status(404).json({ message: 'Order not found' });
    const access = await propertyAccess(req.user.userId, order.commercialContext.organizationId, order.propertyId);
    if (!access) return res.status(404).json({ message: 'Order not found' });
    res.json({ order: serializeOrder(order, access.agreement, capabilities(access)) });
  } catch (error) { next(error); }
});

router.post('/organizations/:organizationId/requests', writes, async (req, res, next) => {
  let session;
  try {
    const propertyId = clean(req.body?.propertyId, 40); const agreementId = clean(req.body?.serviceAgreementId, 40);
    if (!validId(req.params.organizationId) || !validId(propertyId) || !validId(agreementId)) return res.status(400).json({ message: 'A valid organization, property, and service agreement are required' });
    const access = await propertyAccess(req.user.userId, req.params.organizationId, propertyId);
    if (!access) return res.status(404).json({ message: 'Property not found' });
    const allowed = capabilities(access); if (!allowed.canRequestService) return res.status(403).json({ message: 'Service-request permission required' });
    if (!access.agreement || String(access.agreement._id) !== agreementId) return res.status(409).json({ message: 'Select the active service agreement for this property' });
    const service = clean(req.body?.serviceCategory, 120); const description = clean(req.body?.description, 5000); const urgency = clean(req.body?.urgency, 20); const preferredTiming = clean(req.body?.preferredTiming, 500); const po = clean(req.body?.purchaseOrderNumber, 120);
    const errors = [];
    if (!SERVICE_CATEGORIES.includes(service)) errors.push('Select a valid service category');
    if (description.length < 10) errors.push('Description must contain at least 10 characters');
    if (!['routine','soon','urgent','emergency'].includes(urgency)) errors.push('Select a valid urgency');
    if (preferredTiming.length < 2) errors.push('Preferred timing is required');
    if (access.agreement.purchaseOrder?.required && !po) errors.push(`${access.agreement.purchaseOrder.label || 'PO number'} is required`);
    if (po && access.agreement.purchaseOrder?.pattern) { try { if (!new RegExp(access.agreement.purchaseOrder.pattern).test(po)) errors.push(`${access.agreement.purchaseOrder.label || 'PO number'} has an invalid format`); } catch (_error) { return res.status(409).json({ message: 'The service agreement has an invalid PO validation rule' }); } }
    const idempotencyKey = clean(req.get('Idempotency-Key'), 100); if (!/^[A-Za-z0-9._:-]{16,100}$/.test(idempotencyKey)) errors.push('A valid Idempotency-Key is required');
    if (errors.length) return res.status(400).json({ message: errors[0], errors });
    const submissionKey = `commercial:${req.user.userId}:${idempotencyKey}`;
    const existing = await Order.findOne({ portalSubmissionKey: submissionKey }).lean();
    if (existing && (String(existing.propertyId) !== propertyId || String(existing.commercialContext?.organizationId) !== req.params.organizationId || existing.service !== service || existing.description !== description)) return res.status(409).json({ message: 'Submission key is already used for a different request' });
    if (existing) return res.status(200).json({ order: serializeOrder(existing, access.agreement, allowed), duplicate: true });
    const [property, owner] = await Promise.all([Property.findOne({ _id: propertyId, ownerCustomerId: access.location.ownerCustomerId, status: 'active' }).lean(), Customer.findById(access.location.ownerCustomerId).lean()]);
    if (!property || !owner) return res.status(409).json({ message: 'Property owner attribution is incomplete' });
    session = await mongoose.startSession(); let created;
    await session.withTransaction(async () => {
      const duplicate = await Order.findOne({ portalSubmissionKey: submissionKey }).session(session);
      if (duplicate) {
        if (String(duplicate.propertyId) !== propertyId || String(duplicate.commercialContext?.organizationId) !== req.params.organizationId || duplicate.service !== service || duplicate.description !== description) throw Object.assign(new Error('Submission key belongs to a different request'), { status: 409 });
        created = duplicate; return;
      }
      const now = new Date(); const orderSequence = await nextCounter('orders', session); const requestSequence = await nextCounter(`website-request:${now.getUTCFullYear()}`, session);
      [created] = await Order.create([{ orderId:`ORD-${String(orderSequence).padStart(6,'0')}`, workOrderNumber:`WO-C-${String(orderSequence).padStart(6,'0')}`, customerId:owner._id, propertyId:property._id, customer:{ name:owner.name, email:owner.email, phone:owner.phone, address:[property.addressLine1,property.addressLine2,property.city,property.state,property.postalCode].filter(Boolean).join(', ') }, service, description, amount:null, pricingStatus:'unquoted', source:'commercial_portal', status:'new', workflowStatus:'request_received', requestReference:`REQ-${now.getUTCFullYear()}-${String(requestSequence).padStart(6,'0')}`, priority:['urgent','emergency'].includes(urgency)?'high':urgency==='soon'?'medium':'low', customerIntake:{ preferredTiming, completedAt:now }, commercialContext:{ organizationId:access.location.organizationId, portfolioId:access.location.portfolioId, locationId:access.location._id, serviceAgreementId:access.agreement._id, ownerCustomerId:owner._id, billingContact:access.location.billingContactOverride || {}, purchaseOrderNumber:po || undefined, submittedBy:req.user.userId }, portalSubmissionKey:submissionKey }], { session });
      await synchronizeWorkflowOrder(created, 'request_received', { session });
      await CommercialAuditEvent.create([{ organizationId:access.location.organizationId, portfolioId:access.location.portfolioId, propertyId:property._id, orderId:created._id, actorUserId:req.user.userId, action:'service_request_created', summary:`${created.requestReference} created for ${property.label || access.location.locationCode}.`, metadata:{ agreementId:access.agreement._id, tier:access.agreement.tier, purchaseOrderProvided:Boolean(po) } }], { session });
      await PortalActivity.create([{ userId:req.user.userId, customerId:owner._id, propertyId:property._id, orderId:created._id, type:'commercial_request_submitted', title:'Commercial service requested', summary:`${service} · ${created.requestReference}` }], { session });
      const staff = await User.find({ isActive:true, role:{ $in:['admin','manager','account_rep'] } }).select('_id').session(session).lean();
      await Notification.insertMany([{ userId:req.user.userId,title:'Service request received',message:`${created.requestReference} was created for ${property.label || access.location.locationCode}.`,type:'order',priority:created.priority==='high'?'high':'medium',actionUrl:'#orders',metadata:{orderId:created._id,propertyId:property._id}},...staff.map(item=>({userId:item._id,title:'New commercial service request',message:`${created.requestReference} · ${service}`,type:'order',priority:created.priority==='high'?'high':'medium',actionUrl:'#service-requests/overview',metadata:{orderId:created._id,organizationId:access.location.organizationId}}))],{session});
    });
    memCache.del('orders:stats:v2'); invalidateDashboardStatsCache();
    res.status(201).json({ order: serializeOrder(created, access.agreement, allowed), duplicate:false });
  } catch (error) { if (error?.code === 11000) { const found = await Order.findOne({ portalSubmissionKey:`commercial:${req.user.userId}:${clean(req.get('Idempotency-Key'),100)}` }).lean(); if (found) return res.json({ order:found, duplicate:true }); } next(error); } finally { if (session) await session.endSession(); }
});

router.post('/orders/:orderId/estimates/:quoteId/decision', writes, async (req, res, next) => {
  let session;
  try {
    if (!validId(req.params.orderId) || !validId(req.params.quoteId)) return res.status(400).json({ message:'Invalid order or estimate id' });
    const order = await Order.findById(req.params.orderId).lean(); if (!order?.commercialContext?.organizationId) return res.status(404).json({ message:'Order not found' });
    const access = await propertyAccess(req.user.userId, order.commercialContext.organizationId, order.propertyId); if (!access) return res.status(404).json({ message:'Order not found' });
    if (!capabilities(access).canApproveEstimates) return res.status(403).json({ message:'Estimate-approval permission required' });
    const parsed = parseDecisionPayload(req.body); if (parsed.errors.length) return res.status(400).json({ message:parsed.errors[0], errors:parsed.errors });
    session = await mongoose.startSession(); let result;
    await session.withTransaction(async()=>{ const quote=await OutgoingQuote.findOne({_id:req.params.quoteId,orderId:order._id,status:'sent',validUntil:{$gt:new Date()}}).session(session); if(!quote) throw Object.assign(new Error('Estimate is expired or unavailable'),{status:409}); const wanted=parsed.payload.action==='approve'?'approved':'changes_requested'; const existing=await CustomerQuoteDecision.findOne({outgoingQuoteId:quote._id}).session(session); if(existing){if(existing.decision!==wanted)throw Object.assign(new Error('A different decision is already recorded'),{status:409});result=existing;return;} if(quote.customerDecisionStatus!=='pending')throw Object.assign(new Error('Estimate is no longer pending'),{status:409}); const current=await Order.findOne({_id:order._id,currentOutgoingQuoteId:quote._id,workflowStatus:'quote_sent'}).session(session); if(!current)throw Object.assign(new Error('Estimate is no longer current'),{status:409}); [result]=await CustomerQuoteDecision.create([{outgoingQuoteId:quote._id,orderId:current._id,customerId:current.customerId,decision:wanted,typedName:parsed.payload.typedName,termsAccepted:wanted==='approved'&&parsed.payload.termsAccepted,changeRequestMessage:wanted==='changes_requested'?parsed.payload.changeRequestMessage:undefined,decisionAt:new Date(),quoteReference:quote.quoteReference,revisionNumber:quote.revisionNumber,consentText:APPROVAL_CONSENT_TEXT,termsHash:sha256(quote.termsAndConditions),quoteSnapshotHash:quoteSnapshotHash(quote),ipAddress:clean(req.ip,128),userAgent:clean(req.get('user-agent'),1000),source:'commercial_portal'}],{session}); quote.customerDecisionStatus=wanted; quote.history.push({action:wanted==='approved'?'customer_approved':'customer_changes_requested',actorId:req.user.userId,actorEmail:req.user.email,message:parsed.payload.typedName}); await quote.save({session}); if(wanted==='approved'){current.approvedOutgoingQuoteId=quote._id;current.customerApprovedAt=result.decisionAt;} await synchronizeWorkflowOrder(current,wanted==='approved'?'customer_approved':'quote_changes_requested',{session}); await CommercialAuditEvent.create([{organizationId:access.location.organizationId,portfolioId:access.location.portfolioId,propertyId:order.propertyId,orderId:order._id,actorUserId:req.user.userId,action:`estimate_${wanted}`,summary:`${quote.quoteReference} ${wanted.replace('_',' ')}.`}],{session}); await PortalActivity.create([{userId:req.user.userId,customerId:current.customerId,propertyId:current.propertyId,orderId:current._id,type:'commercial_estimate_decision',title:'Commercial estimate decision saved',summary:`${quote.quoteReference} ${wanted.replace('_',' ')}.`}],{session}); const staff=await User.find({isActive:true,role:{$in:['admin','manager','account_rep']}}).select('_id').session(session).lean(); await Notification.insertMany([{userId:req.user.userId,title:'Estimate decision saved',message:`${quote.quoteReference} ${wanted.replace('_',' ')}.`,type:'order',actionUrl:'#orders'},...staff.map(item=>({userId:item._id,title:'Commercial estimate decision',message:`${quote.quoteReference} ${wanted.replace('_',' ')}.`,type:'order',actionUrl:'#service-requests/stage-4/order/'+String(current._id),metadata:{orderId:current._id,propertyId:current.propertyId}}))],{session}); });
    res.json({ decision:{ id:String(result._id), decision:result.decision, decisionAt:result.decisionAt } });
  } catch(error){ res.status(error.status||500).json({message:error.status?error.message:'Estimate decision failed'}); } finally { if(session)await session.endSession(); }
});

router.get('/organizations/:organizationId/invitations', async (req,res,next)=>{try{const found=await scopedOrganization(req,res);if(!found)return;let query={organizationId:found.organization._id};if(!found.permissions.manageUsers){const managed=(await visiblePropertyAccess(req.user.userId)).filter(item=>String(item.location.organizationId)===String(found.organization._id)&&capabilities(item).canManageUsers);if(!managed.length)return res.status(403).json({message:'User-management permission required'});query.$or=[{scopeType:'portfolio',scopeId:{$in:managed.map(item=>item.location.portfolioId)}},{scopeType:'property',scopeId:{$in:managed.map(item=>item.location.propertyId)}}];}await CommercialUserInvitation.updateMany({...query,status:'pending',expiresAt:{$lte:new Date()}},{$set:{status:'expired'},$push:{history:{action:'expired'}}});const items=await CommercialUserInvitation.find(query).sort({createdAt:-1}).limit(250).lean();res.json({data:items.map(invitationPayload)});}catch(error){next(error);}});

router.post('/organizations/:organizationId/invitations', writes, async (req,res,next)=>{try{const organizationId=req.params.organizationId;const scopeType=clean(req.body?.scopeType,20);const scopeId=clean(req.body?.scopeId,40);const role=clean(req.body?.role,40);const email=clean(req.body?.email,254).toLowerCase();if(!validId(organizationId)||!validId(scopeId)||!emailPattern.test(email)||!validateRole(scopeType,role))return res.status(400).json({message:'Valid email, scope, and role are required'});const grantor=await scopeAccess(req.user.userId,organizationId,scopeType,scopeId);if(!grantor)return res.status(403).json({message:'You cannot manage users in this scope'});const permissions=cleanPermissions(role,req.body?.permissions,grantor.permissions);if(!permissions.view)return res.status(400).json({message:'View permission is required'});await CommercialUserInvitation.updateMany({organizationId,email,scopeKey:scopeKey(scopeType,scopeId),status:'pending',expiresAt:{$lte:new Date()}},{$set:{status:'expired'},$push:{history:{action:'expired'}}});const duplicate=await CommercialUserInvitation.exists({organizationId,email,scopeKey:scopeKey(scopeType,scopeId),status:{$in:['pending','processing']},expiresAt:{$gt:new Date()}});if(duplicate)return res.status(409).json({message:'An active invitation already exists for this email and scope'});const rawToken=createToken();const invitation=await CommercialUserInvitation.create({tokenHash:hashToken(rawToken),email,organizationId,scopeType,scopeId,scopeKey:scopeKey(scopeType,scopeId),role,permissions,expiresAt:new Date(Date.now()+7*86400000),createdBy:req.user.userId,history:[{action:'created',actorId:req.user.userId}]});await CommercialAuditEvent.create({organizationId,portfolioId:scopeType==='portfolio'?scopeId:undefined,propertyId:scopeType==='property'?scopeId:undefined,actorUserId:req.user.userId,action:'user_invited',summary:`Invitation created for ${email}.`,metadata:{scopeType,role,permissions}});const url=buildPublicUrl('/pages/commercial-invitation.html',`invitation=${encodeURIComponent(rawToken)}`);await deliverEmail({to:[email],subject:'You were invited to the SMPLfix Commercial Portal',text:`You were invited to a commercial workspace. Sign in or create your account: ${url}`,html:`<p>You were invited to a SMPLfix commercial workspace.</p><p><a href="${url}">Review invitation</a></p><p>This single-use link expires in 7 days.</p>`});res.status(201).json({invitation:invitationPayload(invitation),inviteUrl:url});}catch(error){next(error);}});

router.post('/invitations/accept', writes, async (req,res,next)=>{let session;try{const token=clean(req.body?.token,100);if(!/^[A-Za-z0-9_-]{32,100}$/.test(token))return res.status(400).json({message:'Invitation token is required'});session=await mongoose.startSession();let invitation;await session.withTransaction(async()=>{invitation=await CommercialUserInvitation.findOneAndUpdate({tokenHash:hashToken(token),email:req.user.email.toLowerCase(),status:'pending',expiresAt:{$gt:new Date()}},{$set:{status:'processing'}},{new:true,session}).select('+tokenHash');if(!invitation)throw Object.assign(new Error('Invitation is invalid, expired, revoked, used, or belongs to another email'),{status:410});const orgGrant={role:invitation.scopeType==='organization'?invitation.role:'viewer',propertyAccess:invitation.scopeType==='organization'?'all':'selected',permissionMode:'custom',permissions:invitation.scopeType==='organization'?{viewPortfolio:invitation.permissions.view,requestService:invitation.permissions.requestService,approveEstimates:invitation.permissions.approveEstimates,viewInvoices:invitation.permissions.viewInvoices,makePayments:invitation.permissions.makePayments,viewReports:invitation.permissions.viewReports,manageUsers:invitation.permissions.manageUsers}:{viewPortfolio:true},status:'active',startsAt:new Date(),createdBy:invitation.createdBy};const currentOrgMembership=await CommercialMembership.findOne({userId:req.user.userId,organizationId:invitation.organizationId}).session(session);if(!currentOrgMembership||invitation.scopeType==='organization'||currentOrgMembership.status!=='active')await CommercialMembership.updateOne({userId:req.user.userId,organizationId:invitation.organizationId},{$set:orgGrant,$unset:{endsAt:1,revokedAt:1}},{upsert:true,session});if(invitation.scopeType==='portfolio')await CommercialPortfolioMembership.updateOne({userId:req.user.userId,organizationId:invitation.organizationId,portfolioId:invitation.scopeId},{$set:{role:invitation.role,permissionMode:'custom',permissions:invitation.permissions,status:'active',startsAt:new Date(),createdBy:invitation.createdBy},$unset:{endsAt:1,revokedAt:1}},{upsert:true,session});if(invitation.scopeType==='property'){const location=await CommercialLocation.findOne({organizationId:invitation.organizationId,propertyId:invitation.scopeId,status:'active'}).session(session);if(!location)throw Object.assign(new Error('Invited property is unavailable'),{status:409});await CommercialPropertyMembership.updateOne({userId:req.user.userId,organizationId:invitation.organizationId,propertyId:invitation.scopeId},{$set:{locationId:location._id,role:invitation.role,permissionMode:'custom',permissions:invitation.permissions,status:'active',startsAt:new Date(),createdBy:invitation.createdBy},$unset:{endsAt:1,revokedAt:1}},{upsert:true,session});}invitation.status='accepted';invitation.acceptedAt=new Date();invitation.acceptedBy=req.user.userId;invitation.tokenHash=hashToken(createToken());invitation.history.push({action:'accepted',actorId:req.user.userId});await invitation.save({session});await CommercialAuditEvent.create([{organizationId:invitation.organizationId,portfolioId:invitation.scopeType==='portfolio'?invitation.scopeId:undefined,propertyId:invitation.scopeType==='property'?invitation.scopeId:undefined,actorUserId:req.user.userId,subjectUserId:req.user.userId,action:'invitation_accepted',summary:`${req.user.email} accepted commercial access.`}],{session});await Notification.create([{userId:req.user.userId,title:'Commercial access activated',message:'Your assigned commercial workspace is ready.',type:'success',actionUrl:'#overview'}],{session});});res.json({invitation:invitationPayload(invitation),destination:'/pages/commercial-portal.html'});}catch(error){res.status(error.status||500).json({message:error.status?error.message:'Invitation acceptance failed'});}finally{if(session)await session.endSession();}});

router.post('/organizations/:organizationId/invitations/:invitationId/revoke', writes, async(req,res,next)=>{try{if(!validId(req.params.invitationId))return res.status(400).json({message:'Invalid invitation id'});const invitation=await CommercialUserInvitation.findOne({_id:req.params.invitationId,organizationId:req.params.organizationId,status:'pending'}).lean();if(!invitation)return res.status(404).json({message:'Pending invitation not found'});const grantor=await scopeAccess(req.user.userId,invitation.organizationId,invitation.scopeType,invitation.scopeId);if(!grantor)return res.status(403).json({message:'You cannot manage this invitation'});const updated=await CommercialUserInvitation.findOneAndUpdate({_id:invitation._id,status:'pending'},{$set:{status:'revoked',revokedAt:new Date()},$push:{history:{action:'revoked',actorId:req.user.userId,reason:clean(req.body?.reason,500)}}},{new:true}).lean();await CommercialAuditEvent.create({organizationId:invitation.organizationId,actorUserId:req.user.userId,action:'invitation_revoked',summary:`Invitation for ${invitation.email} revoked.`});res.json({invitation:invitationPayload(updated)});}catch(error){next(error);}});

router.patch('/organizations/:organizationId/users/:userId/access', writes, async(req,res,next)=>{try{if(String(req.params.userId)===String(req.user.userId))return res.status(403).json({message:'You cannot edit your own access'});if(!validId(req.params.organizationId)||!validId(req.params.userId))return res.status(400).json({message:'Invalid organization or user id'});if(String(req.params.userId)===String(req.user.userId))return res.status(403).json({message:'You cannot change your own access'});const scopeType=clean(req.body?.scopeType,20);const scopeId=clean(req.body?.scopeId,40);const role=clean(req.body?.role,40);if(!validId(scopeId)||!validateRole(scopeType,role))return res.status(400).json({message:'Valid scope and role are required'});const grantor=await scopeAccess(req.user.userId,req.params.organizationId,scopeType,scopeId);if(!grantor)return res.status(403).json({message:'You cannot manage users in this scope'});const target=await User.findOne({_id:req.params.userId,role:'commercial',isActive:true}).lean();if(!target)return res.status(404).json({message:'Commercial user not found'});const permissions=cleanPermissions(role,req.body?.permissions,grantor.permissions);if(!permissions.view)return res.status(400).json({message:'View permission is required'});if(scopeType==='organization')await CommercialMembership.updateOne({userId:target._id,organizationId:req.params.organizationId},{$set:{role,propertyAccess:'all',permissionMode:'custom',permissions:{viewPortfolio:permissions.view,...permissions},status:'active',startsAt:new Date(),createdBy:req.user.userId}},{upsert:true});else if(scopeType==='portfolio')await CommercialPortfolioMembership.updateOne({userId:target._id,organizationId:req.params.organizationId,portfolioId:scopeId},{$set:{role,permissionMode:'custom',permissions,status:'active',startsAt:new Date(),createdBy:req.user.userId}},{upsert:true});else{const location=await CommercialLocation.findOne({organizationId:req.params.organizationId,propertyId:scopeId,status:'active'}).lean();if(!location)return res.status(404).json({message:'Property not found'});await CommercialPropertyMembership.updateOne({userId:target._id,organizationId:req.params.organizationId,propertyId:scopeId},{$set:{locationId:location._id,role,permissionMode:'custom',permissions,status:'active',startsAt:new Date(),createdBy:req.user.userId}},{upsert:true});}await CommercialAuditEvent.create({organizationId:req.params.organizationId,portfolioId:scopeType==='portfolio'?scopeId:undefined,propertyId:scopeType==='property'?scopeId:undefined,actorUserId:req.user.userId,subjectUserId:target._id,action:'user_access_updated',summary:`Access updated for ${target.email}.`,metadata:{scopeType,role,permissions}});await Notification.create({userId:target._id,title:'Commercial access updated',message:'An administrator updated your commercial workspace permissions.',type:'info',actionUrl:'#account'});res.json({userId:String(target._id),scopeType,scopeId,role,permissions});}catch(error){next(error);}});

router.get('/organizations/:organizationId/properties/:propertyId/invoices', async (req, res, next) => {
  try {
    const found = await scopedProperty(req, res); if (!found) return;
    if (!found.capabilities.canViewInvoices) return res.status(403).json({ message: 'Invoice permission required' });
    const rows = await commercialBillingRows(req, [found], dateRange(req.query));
    res.json(seal({ data: rows.map(({ invoice, payment }) => serializeInvoice(invoice, payment)) }));
  } catch (error) { next(error); }
});

router.get('/invoices/:invoiceId/pdf', async (req, res, next) => {
  try {
    if (!validId(req.params.invoiceId)) return res.status(400).json({ message: 'Invalid invoice id' });
    const invoice = await CustomerInvoice.findById(req.params.invoiceId).lean();
    if (!invoice?.commercialBilling?.organizationId) return res.status(404).json({ message: 'Invoice not found' });
    const allAccesses = (await visiblePropertyAccess(req.user.userId)).filter(item => String(item.location.organizationId) === String(invoice.commercialBilling.organizationId));
    const rows = await commercialBillingRows(req, allAccesses, {});
    const authorized = rows.find(item => String(item.invoice._id) === String(invoice._id));
    if (!authorized) return res.status(404).json({ message: 'Invoice not found' });
    const safeInvoice = serializeInvoice(invoice, authorized.payment); if (!safeInvoice) return res.status(404).json({ message: 'Invoice not found' });
    const pdf = await createCommercialInvoicePdf(invoice, paymentSummary(invoice, authorized.payment ? [authorized.payment] : []));
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${safeName(invoice.invoiceNumber)}.pdf"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    res.send(pdf);
  } catch (error) { next(error); }
});

module.exports = router;
