const VendorRequirementApproval = require('../models/VendorRequirementApproval');
const SecurityAuditEvent = require('../models/SecurityAuditEvent');
const OutgoingQuote = require('../models/OutgoingQuote');

function sameId(left, right) {
  return Boolean(left && right && String(left) === String(right));
}

function hasEmbeddedVendorComplianceOverride(order, vendorId) {
  return Boolean((order?.vendorComplianceOverrides || []).some(item => item.active !== false && sameId(item.vendorId, vendorId)));
}

async function hasVendorComplianceOverride(order, vendorId, session = null) {
  if (!order || !vendorId) return false;
  if (hasEmbeddedVendorComplianceOverride(order, vendorId)) return true;
  const orderId = order._id || order;
  const legacyApproval = await VendorRequirementApproval.exists({
    orderId,
    vendorIds: vendorId,
    status: { $in: ['approved', 'executed'] }
  }).session(session);
  if (legacyApproval) return true;
  const auditedOverride = await SecurityAuditEvent.exists({
    action: 'outgoing_quote_compliance_override',
    'metadata.orderId': String(orderId),
    'metadata.vendorId': String(vendorId)
  }).session(session);
  if (auditedOverride) return true;
  return Boolean(await OutgoingQuote.exists({
    orderId,
    vendorId,
    history: {
      $elemMatch: {
        action: { $in: ['sent_with_compliance_override', 'sent_under_order_compliance_override'] }
      }
    }
  }).session(session));
}

function applyVendorComplianceOverride(order, { vendorId, approvedBy, approvedByEmail, source, approvalId, requirements = [] }) {
  if (!order || !vendorId) return order;
  const existing = order.vendorComplianceOverrides || [];
  order.vendorComplianceOverrides = existing.filter(item => !sameId(item.vendorId, vendorId));
  order.vendorComplianceOverrides.push({
    vendorId,
    approvedAt: new Date(),
    approvedBy,
    approvedByEmail,
    source,
    approvalId,
    requirements: [...new Set((requirements || []).map(String).filter(Boolean))],
    active: true
  });
  return order;
}

module.exports = { applyVendorComplianceOverride, hasEmbeddedVendorComplianceOverride, hasVendorComplianceOverride };
