const crypto = require('crypto');

const APPROVAL_CONSENT_TEXT = 'I agree to conduct this transaction electronically. I have read and agree to this quote, its terms and conditions, and contractor disclosure. I understand that approval does not confirm scheduling.';
const MAX_DECISION_BODY_BYTES = 8 * 1024;

function cleanDecisionText(value, max) {
  return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function quoteSnapshotForHash(quote) {
  return {
    quoteReference: quote.quoteReference,
    revisionNumber: quote.revisionNumber,
    customerSnapshot: quote.customerSnapshot || {},
    jobSnapshot: quote.jobSnapshot || {},
    scopeOfWork: quote.scopeOfWork || '',
    estimatedDuration: quote.estimatedDuration || {},
    earliestAvailableDate: quote.earliestAvailableDate ? new Date(quote.earliestAvailableDate).toISOString() : null,
    siteAccessRequired: Boolean(quote.siteAccessRequired),
    accessNotes: quote.accessNotes || '',
    exclusionsConditions: quote.exclusionsConditions || '',
    customerTotal: Number(quote.customerTotal || 0),
    termsAndConditions: quote.termsAndConditions || '',
    vendorSnapshot: quote.vendorSnapshot || {},
    legalDisclosure: quote.legalDisclosure || '',
    validUntil: quote.validUntil ? new Date(quote.validUntil).toISOString() : null,
    sentAt: quote.sentAt ? new Date(quote.sentAt).toISOString() : null
  };
}

function quoteSnapshotHash(quote) {
  return sha256(JSON.stringify(quoteSnapshotForHash(quote)));
}

function parseDecisionPayload(body) {
  const action = cleanDecisionText(body?.action, 40);
  const typedName = cleanDecisionText(body?.typedName, 160);
  const changeRequestMessage = cleanDecisionText(body?.changeRequestMessage, 3000);
  const termsAccepted = body?.termsAccepted === true;
  const errors = [];
  if (!['approve', 'request_changes'].includes(action)) errors.push('Choose approve or request changes');
  if (typedName.length < 2) errors.push('Full name is required');
  if (action === 'approve' && !termsAccepted) errors.push('Terms agreement is required');
  if (action === 'request_changes' && changeRequestMessage.length < 10) errors.push('Change request must contain at least 10 characters');
  return { payload: { action, typedName, termsAccepted, changeRequestMessage }, errors };
}

function parseApprovalRecipients(primary, fallback) {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const configured = String(primary || '').trim() || String(fallback || '').trim();
  return [...new Set(configured.split(',').map(value => value.trim().toLowerCase()).filter(value => emailPattern.test(value)))];
}

function publicDecision(decision) {
  if (!decision) return null;
  return {
    decision: decision.decision,
    status: decision.decision,
    typedName: decision.typedName,
    decisionAt: decision.decisionAt,
    changeRequestMessage: decision.decision === 'changes_requested' ? decision.changeRequestMessage : undefined
  };
}

module.exports = {
  APPROVAL_CONSENT_TEXT,
  MAX_DECISION_BODY_BYTES,
  cleanDecisionText,
  parseApprovalRecipients,
  parseDecisionPayload,
  publicDecision,
  quoteSnapshotForHash,
  quoteSnapshotHash,
  sha256
};
