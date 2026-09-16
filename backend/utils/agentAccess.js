const crypto = require('crypto');

const DAY_MS = 24 * 60 * 60 * 1000;

function createInvitationToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashInvitationToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function parseCloseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 7));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

function calculateAccessExpiry(closeDate, graceDays = 0) {
  const start = closeDate instanceof Date ? closeDate : parseCloseDate(closeDate);
  const days = Number(graceDays);
  if (!start || Number.isNaN(start.getTime()) || !Number.isInteger(days) || days < 0 || days > 30) return null;
  return new Date(start.getTime() + (days + 1) * DAY_MS);
}

function agentPermissions(input = {}) {
  return {
    viewStatus: input.viewStatus !== false,
    requestService: input.requestService !== false,
    uploadInspection: input.uploadInspection !== false,
    viewDocuments: input.viewDocuments !== false,
    message: input.message !== false
  };
}

function membershipPermissions(transactionPermissions = {}) {
  return {
    view: transactionPermissions.viewStatus !== false,
    requestService: transactionPermissions.requestService !== false,
    approveEstimates: false,
    manageBilling: false,
    manageProperty: false
  };
}

function propertyFingerprint(property = {}) {
  return [property.addressLine1, property.addressLine2, property.city, property.state, property.postalCode]
    .map(value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''))
    .join('|');
}

module.exports = { calculateAccessExpiry, createInvitationToken, hashInvitationToken, agentPermissions, membershipPermissions, propertyFingerprint };
