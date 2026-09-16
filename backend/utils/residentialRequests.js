const crypto = require('crypto');

const SERVICE_CATEGORIES = Object.freeze([
  'Appliance', 'Electrical', 'General Handyman', 'HVAC', 'Landscaping',
  'Pest Control', 'Plumbing', 'Pool', 'Roofing', 'Other'
]);
const URGENCIES = Object.freeze(['routine', 'soon', 'urgent', 'emergency']);
const CANCELLABLE_WORKFLOWS = new Set([
  'request_received', 'quote_collection', 'vendor_selected', 'outgoing_quote_draft',
  'quote_sent', 'quote_changes_requested', 'customer_approved',
  'schedule_pending_vendor', 'schedule_changes_requested', 'scheduled'
]);
const RESCHEDULABLE_WORKFLOWS = new Set([
  'schedule_pending_vendor', 'schedule_changes_requested', 'scheduled'
]);
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

function cleanText(value, maxLength) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

function uniqueChips(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(values.map(item => cleanText(item, 120)).filter(Boolean))].slice(0, 8);
}

function validateRequestPayload(body = {}, emergency = false) {
  const payload = {
    propertyId: cleanText(body.propertyId, 80),
    serviceCategory: cleanText(body.serviceCategory, 120),
    issueChips: uniqueChips(body.issueChips),
    description: cleanText(body.description, 3000),
    urgency: emergency ? 'emergency' : cleanText(body.urgency, 30).toLowerCase(),
    preferredTiming: cleanText(body.preferredTiming, 500),
    accessInstructions: cleanText(body.accessInstructions, 1000),
    emergencyDisclaimerAccepted: body.emergencyDisclaimerAccepted === true || body.emergencyDisclaimerAccepted === 'true'
  };
  const errors = [];
  if (!payload.propertyId) errors.push('Property is required');
  if (!SERVICE_CATEGORIES.includes(payload.serviceCategory)) errors.push('Select a valid service category');
  if (!payload.description && !payload.issueChips.length) errors.push('Choose an issue or describe the work needed');
  if (!URGENCIES.includes(payload.urgency)) errors.push('Select a valid urgency');
  if (!payload.preferredTiming) errors.push('Preferred timing is required');
  if (emergency && !payload.emergencyDisclaimerAccepted) errors.push('Emergency request acknowledgement is required');
  return { payload, errors };
}

function validateIdempotencyKey(value) {
  const key = cleanText(value, 128);
  return IDEMPOTENCY_PATTERN.test(key) ? key : null;
}

function requestCapabilities(order = {}) {
  const workflow = String(order.workflowStatus || '').toLowerCase();
  const cancellationPending = order.cancellationRequest?.status === 'pending';
  const reschedulePending = order.rescheduleRequest?.status === 'pending';
  return {
    canCancel: CANCELLABLE_WORKFLOWS.has(workflow) && !cancellationPending,
    canReschedule: RESCHEDULABLE_WORKFLOWS.has(workflow) && !reschedulePending && !cancellationPending,
    cancellationPending,
    reschedulePending,
    canBookAgain: workflow === 'completed'
  };
}

function validateOrderAction(order, action, body = {}) {
  const capabilities = requestCapabilities(order);
  if (action === 'cancel') {
    const reason = cleanText(body.reason, 1000);
    if (!capabilities.canCancel) return { error: 'This order can no longer be cancelled from the portal' };
    if (reason.length < 3) return { error: 'Please provide a cancellation reason' };
    return { payload: { reason } };
  }
  if (action === 'reschedule') {
    const preferredTiming = cleanText(body.preferredTiming, 500);
    const reason = cleanText(body.reason, 1000);
    if (!capabilities.canReschedule) return { error: 'This order cannot be rescheduled from the portal right now' };
    if (!preferredTiming) return { error: 'Preferred timing is required' };
    return { payload: { preferredTiming, reason } };
  }
  return { error: 'Unsupported order action' };
}

function submissionKey(userId, idempotencyKey) {
  return `${String(userId)}:${idempotencyKey}`;
}

function externalReference(prefix = 'portal') {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

module.exports = {
  CANCELLABLE_WORKFLOWS,
  IDEMPOTENCY_PATTERN,
  RESCHEDULABLE_WORKFLOWS,
  SERVICE_CATEGORIES,
  URGENCIES,
  cleanText,
  externalReference,
  requestCapabilities,
  submissionKey,
  uniqueChips,
  validateIdempotencyKey,
  validateOrderAction,
  validateRequestPayload
};
