const CommercialLocation = require('../models/CommercialLocation');
const CommercialMembership = require('../models/CommercialMembership');
const CommercialPropertyMembership = require('../models/CommercialPropertyMembership');
const CommercialPortfolioMembership = require('../models/CommercialPortfolioMembership');
const CommercialServiceAgreement = require('../models/CommercialServiceAgreement');

const ORG_ROLE_PERMISSIONS = Object.freeze({
  owner: { viewPortfolio: true, requestService: true, approveEstimates: true, viewInvoices: true, makePayments: true, manageUsers: true, viewReports: true },
  organization_admin: { viewPortfolio: true, requestService: true, approveEstimates: true, viewInvoices: true, makePayments: true, manageUsers: true, viewReports: true },
  billing_admin: { viewPortfolio: true, requestService: false, approveEstimates: true, viewInvoices: true, makePayments: true, manageUsers: false, viewReports: true },
  operations_manager: { viewPortfolio: true, requestService: true, approveEstimates: true, viewInvoices: true, makePayments: false, manageUsers: false, viewReports: true },
  viewer: { viewPortfolio: true, requestService: false, approveEstimates: false, viewInvoices: false, makePayments: false, manageUsers: false, viewReports: false }
});

const PROPERTY_ROLE_PERMISSIONS = Object.freeze({
  property_admin: { view: true, requestService: true, approveEstimates: true, viewInvoices: true, makePayments: true, viewReports: true, manageUsers: true },
  approver: { view: true, requestService: true, approveEstimates: true, viewInvoices: true, makePayments: false, viewReports: false },
  billing: { view: true, requestService: false, approveEstimates: false, viewInvoices: true, makePayments: true, viewReports: true },
  coordinator: { view: true, requestService: true, approveEstimates: false, viewInvoices: false, makePayments: false, viewReports: false },
  viewer: { view: true, requestService: false, approveEstimates: false, viewInvoices: false, makePayments: false, viewReports: false, manageUsers: false }
});
const PORTFOLIO_ROLE_PERMISSIONS = Object.freeze({ portfolio_admin: PROPERTY_ROLE_PERMISSIONS.property_admin, approver: PROPERTY_ROLE_PERMISSIONS.approver, billing: PROPERTY_ROLE_PERMISSIONS.billing, coordinator: PROPERTY_ROLE_PERMISSIONS.coordinator, viewer: PROPERTY_ROLE_PERMISSIONS.viewer });

function activeWindow(now = new Date()) {
  return { status: 'active', startsAt: { $lte: now }, $or: [{ endsAt: { $exists: false } }, { endsAt: null }, { endsAt: { $gt: now } }] };
}

function permissionSet(role, stored, defaults, mode = 'role_default') {
  const base = defaults[role] || {};
  const explicit = stored?.toObject ? stored.toObject() : (stored || {});
  return Object.fromEntries(Object.keys(base).map(key => [key, mode === 'custom' ? explicit[key] === true : base[key] === true || explicit[key] === true]));
}

function organizationPermissions(membership) {
  return permissionSet(membership?.role, membership?.permissions, ORG_ROLE_PERMISSIONS, membership?.permissionMode);
}

function propertyPermissions(membership) {
  return permissionSet(membership?.role, membership?.permissions, PROPERTY_ROLE_PERMISSIONS, membership?.permissionMode);
}

function portfolioPermissions(membership) {
  return permissionSet(membership?.role, membership?.permissions, PORTFOLIO_ROLE_PERMISSIONS, membership?.permissionMode);
}

function resolvePropertyAccess({ organizationMembership, portfolioMembership, propertyMembership, location, agreement }) {
  if (!organizationMembership || !location) return null;
  if (organizationMembership.propertyAccess !== 'all' && !portfolioMembership && !propertyMembership) return null;
  const orgPermissions = organizationPermissions(organizationMembership);
  const effectivePermissions = propertyMembership
    ? { ...propertyPermissions(propertyMembership), manageUsers: propertyPermissions(propertyMembership).manageUsers || orgPermissions.manageUsers }
    : portfolioMembership
      ? portfolioPermissions(portfolioMembership)
      : { view: orgPermissions.viewPortfolio, requestService: orgPermissions.requestService, approveEstimates: orgPermissions.approveEstimates, viewInvoices: orgPermissions.viewInvoices, makePayments: orgPermissions.makePayments, viewReports: orgPermissions.viewReports, manageUsers: orgPermissions.manageUsers };
  if (!effectivePermissions.view) return null;
  return { organizationMembership, portfolioMembership, propertyMembership, location, agreement, permissions: effectivePermissions };
}

function tierEntitlements(tier) {
  if (tier === 'tier_1') return { invoiceMode: 'coordination_fee_only', monthlyReports: false, consolidatedInvoices: false, warrantyClaims: false, vendorBillsClientDirectly: true };
  if (tier === 'tier_2') return { invoiceMode: 'consolidated_period', monthlyReports: true, consolidatedInvoices: true, warrantyClaims: false, vendorBillsClientDirectly: false };
  if (tier === 'tier_3') return { invoiceMode: 'consolidated_period', monthlyReports: true, consolidatedInvoices: true, warrantyClaims: true, vendorBillsClientDirectly: false };
  return { invoiceMode: null, monthlyReports: false, consolidatedInvoices: false, warrantyClaims: false, vendorBillsClientDirectly: false };
}

async function organizationAccess(userId, organizationId, now = new Date()) {
  return CommercialMembership.findOne({ userId, organizationId, ...activeWindow(now) }).lean();
}

async function propertyAccess(userId, organizationId, propertyId, now = new Date()) {
  const [organizationMembership, propertyMembership, location, agreement] = await Promise.all([
    organizationAccess(userId, organizationId, now),
    CommercialPropertyMembership.findOne({ userId, organizationId, propertyId, ...activeWindow(now) }).lean(),
    CommercialLocation.findOne({ organizationId, propertyId, status: 'active' }).lean(),
    CommercialServiceAgreement.findOne({ organizationId, propertyId, status: 'active', effectiveFrom: { $lte: now }, $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gt: now } }] }).sort({ effectiveFrom: -1 }).lean()
  ]);
  const portfolioMembership = location?.portfolioId && organizationMembership?.propertyAccess !== 'all' && !propertyMembership
    ? await CommercialPortfolioMembership.findOne({ userId, organizationId, portfolioId: location.portfolioId, ...activeWindow(now) }).lean()
    : null;
  return resolvePropertyAccess({ organizationMembership, portfolioMembership, propertyMembership, location, agreement });
}

function capabilities(access) {
  const role = access?.propertyMembership?.role || access?.portfolioMembership?.role || access?.organizationMembership?.role;
  const agreement = access?.agreement;
  const approvalRoles = agreement?.approvalRules?.allowedRoles || [];
  const paymentRoles = agreement?.paymentRules?.allowedRoles || [];
  const permissions = access?.permissions || {};
  return {
    canRequestService: permissions.requestService === true,
    canApproveEstimates: permissions.approveEstimates === true && approvalRoles.includes(role),
    canViewInvoices: permissions.viewInvoices === true,
    canMakePayments: permissions.makePayments === true && paymentRoles.includes(role),
    canViewReports: permissions.viewReports === true,
    canManageUsers: permissions.manageUsers === true
  };
}

module.exports = { ORG_ROLE_PERMISSIONS, PORTFOLIO_ROLE_PERMISSIONS, PROPERTY_ROLE_PERMISSIONS, activeWindow, capabilities, organizationAccess, organizationPermissions, portfolioPermissions, propertyAccess, propertyPermissions, resolvePropertyAccess, tierEntitlements };
