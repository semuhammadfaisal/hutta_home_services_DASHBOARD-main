const Vendor = require('../models/Vendor');
const VendorPortalMembership = require('../models/VendorPortalMembership');

const ROLE_PERMISSIONS = Object.freeze({
  owner: ['profile', 'compliance', 'team', 'assignments', 'invoices'],
  admin: ['profile', 'compliance', 'team', 'assignments', 'invoices'],
  member: ['assignments']
});

function hasPermission(membership, permission) {
  if (!membership || membership.status !== 'active') return false;
  return ROLE_PERMISSIONS[membership.role]?.includes(permission) && membership.permissions?.[permission] === true;
}

async function loadVendorAccess(req, res, next) {
  try {
    const membership = await VendorPortalMembership.findOne({ userId: req.user.userId, status: 'active' });
    if (!membership) return res.status(403).json({ message: 'No active vendor portal membership is assigned to this login' });
    const vendor = await Vendor.findById(membership.vendorId).select('+stripeConnect.accountId');
    if (!vendor) return res.status(403).json({ message: 'The authorized vendor record is unavailable' });
    req.vendorMembership = membership;
    req.vendorRecord = vendor;
    next();
  } catch (error) { next(error); }
}

function requireVendorPermission(permission) {
  return (req, res, next) => hasPermission(req.vendorMembership, permission)
    ? next()
    : res.status(403).json({ message: `Vendor ${permission} permission is required` });
}

module.exports = { ROLE_PERMISSIONS, hasPermission, loadVendorAccess, requireVendorPermission };
