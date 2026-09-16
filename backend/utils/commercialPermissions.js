const crypto = require('crypto');

const KEYS = ['view', 'requestService', 'approveEstimates', 'viewInvoices', 'makePayments', 'viewReports', 'manageUsers'];
const ROLE_DEFAULTS = Object.freeze({
  organization_admin: { view:true,requestService:true,approveEstimates:true,viewInvoices:true,makePayments:true,viewReports:true,manageUsers:true },
  billing_admin: { view:true,requestService:false,approveEstimates:true,viewInvoices:true,makePayments:true,viewReports:true,manageUsers:false },
  operations_manager: { view:true,requestService:true,approveEstimates:true,viewInvoices:true,makePayments:false,viewReports:true,manageUsers:false },
  portfolio_admin: { view:true,requestService:true,approveEstimates:true,viewInvoices:true,makePayments:true,viewReports:true,manageUsers:true },
  property_admin: { view:true,requestService:true,approveEstimates:true,viewInvoices:true,makePayments:true,viewReports:true,manageUsers:true },
  approver: { view:true,requestService:true,approveEstimates:true,viewInvoices:true,makePayments:false,viewReports:false,manageUsers:false },
  billing: { view:true,requestService:false,approveEstimates:false,viewInvoices:true,makePayments:true,viewReports:true,manageUsers:false },
  coordinator: { view:true,requestService:true,approveEstimates:false,viewInvoices:false,makePayments:false,viewReports:false,manageUsers:false },
  viewer: { view:true,requestService:false,approveEstimates:false,viewInvoices:false,makePayments:false,viewReports:false,manageUsers:false }
});
const ROLES = { organization: ['organization_admin','billing_admin','operations_manager','viewer'], portfolio: ['portfolio_admin','approver','billing','coordinator','viewer'], property: ['property_admin','approver','billing','coordinator','viewer'] };
function cleanPermissions(role, requested = {}, grantor = {}) {
  const ceiling = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.viewer;
  return Object.fromEntries(KEYS.map(key => [key, ceiling[key] === true && grantor[key] === true && requested[key] === true]));
}
function validateRole(scopeType, role) { return ROLES[scopeType]?.includes(role); }
function createToken() { return crypto.randomBytes(32).toString('base64url'); }
function hashToken(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }
function scopeKey(scopeType, scopeId) { return `${scopeType}:${String(scopeId)}`; }
module.exports = { KEYS, ROLE_DEFAULTS, cleanPermissions, createToken, hashToken, scopeKey, validateRole };
