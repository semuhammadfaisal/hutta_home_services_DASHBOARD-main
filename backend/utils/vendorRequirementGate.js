const crypto = require('crypto');
const { complianceForVendor } = require('./incomingQuotes');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((output, key) => {
      if (!['requirementApprovalId'].includes(key)) output[key] = canonical(value[key]);
      return output;
    }, {});
  }
  return value;
}

function approvalPayloadHash(action, orderId, vendorIds, payload, idempotencyKey = '') {
  const body = JSON.stringify(canonical({
    action,
    orderId: String(orderId),
    vendorIds: [...vendorIds].map(String).sort(),
    payload,
    idempotencyKey: String(idempotencyKey || '')
  }));
  return crypto.createHash('sha256').update(body).digest('hex');
}

function vendorRequirementIssues(vendor) {
  const compliance = complianceForVendor(vendor);
  if (compliance.status === 'current') return [];
  return compliance.warnings || [];
}

function safeApproval(approval) {
  const value = approval?.toObject ? approval.toObject() : { ...approval };
  delete value.payloadHash;
  return value;
}

module.exports = { approvalPayloadHash, safeApproval, vendorRequirementIssues };
