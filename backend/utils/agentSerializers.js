const PRIVATE_KEYS = new Set(['vendorcost', 'processingfee', 'processingcost', 'profit', 'margin', 'markup', 'markupamount', 'coordinationfee', 'internalnotes', 'notes', 'customeremail', 'customerphone', 'vendoremail', 'vendorphone', 'payment', 'paymentmethod', 'token', 'tokenhash', 'history', 'metadata']);
const plain = value => value?.toObject ? value.toObject() : (value || {});
const id = value => value == null ? null : String(value._id || value);
const redactContact = value => String(value || '')
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[contact hidden]')
  .replace(/(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[contact hidden]');

function seal(value, path = 'response') {
  if (Array.isArray(value)) return value.map((item, index) => seal(item, `${path}[${index}]`));
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue;
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (PRIVATE_KEYS.has(normalized) || normalized.includes('token')) throw new Error(`Private agent field blocked at ${path}.${key}`);
    output[key] = seal(item, `${path}.${key}`);
  }
  return output;
}

function serializeAgentProfile(profile, user) {
  const item = plain(profile); const identity = plain(user);
  return seal({ id: id(item), displayName: item.displayName, brokerageName: item.brokerageName, licenseNumber: item.licenseNumber, referralCode: item.referralCode, referralProgram: item.referralProgram ? { enabled: item.referralProgram.enabled === true, rewardLabel: item.referralProgram.rewardLabel, unitsPerCompletedJob: item.referralProgram.unitsPerCompletedJob } : undefined, status: item.status, email: identity.email });
}

function serializeClient(customer) {
  const item = plain(customer);
  return seal({ id: id(item), displayName: item.name, status: item.status });
}

function serializeProperty(property) {
  const item = plain(property);
  return seal({ id: id(item), label: item.label, address: { line1: item.addressLine1, line2: item.addressLine2, city: item.city, state: item.state, postalCode: item.postalCode }, propertyType: item.propertyType, status: item.status });
}

function serializeTransaction(transaction, related = {}) {
  const item = plain(transaction);
  return seal({ id: id(item), label: item.label, closeDate: item.closeDate, accessEndsAt: item.accessEndsAt, status: item.status, daysUntilClose: Math.ceil((new Date(item.closeDate).getTime() - Date.now()) / 86400000), permissions: item.permissions, capabilities: { canViewStatus: item.permissions?.viewStatus === true, canRequestService: item.permissions?.requestService === true, canUploadInspection: item.permissions?.uploadInspection === true, canViewDocuments: item.permissions?.viewDocuments === true, canMessage: item.permissions?.message === true, canApproveEstimates: false, canManageBilling: false }, client: related.customer ? serializeClient(related.customer) : undefined, property: related.property ? serializeProperty(related.property) : undefined, documents: (item.documents || []).filter(document => document.status !== 'archived').map(document => ({ id: document.documentId, name: redactContact(document.name), type: document.type, size: document.size, uploadedAt: document.uploadedAt, downloadUrl: `/api/agent/transactions/${id(item)}/documents/${encodeURIComponent(document.documentId)}` })), createdAt: item.createdAt, updatedAt: item.updatedAt });
}

function serializeOrder(order, related = {}) {
  const item = plain(order);
  const quote = plain(related.quote);
  const schedule = plain(related.confirmedSchedule);
  return seal({ id: id(item), orderReference: item.orderId, requestReference: item.requestReference, propertyId: id(item.propertyId), service: item.service, description: redactContact(item.description), status: item.status, workflowStatus: item.workflowStatus, priority: item.priority, request: item.residentialRequest ? { urgency: item.residentialRequest.urgency, targetCompletionDeadline: item.residentialRequest.targetCompletionDeadline, preferredTiming: item.residentialRequest.preferredTiming, submittedByRole: item.residentialRequest.submittedByRole } : undefined, estimateStatus: related.quote ? { quoteReference: quote.quoteReference, status: quote.status, decisionStatus: quote.customerDecisionStatus, sentAt: quote.sentAt, validUntil: quote.validUntil, earliestAvailableDate: quote.earliestAvailableDate, capabilities: { canView: true, canApprove: false, canRequestChanges: false } } : null, confirmedSchedule: related.confirmedSchedule ? { status: schedule.status, start: schedule.proposedStart, end: schedule.proposedEnd, timezone: schedule.timezone } : null, deadlineRisk: related.deadlineRisk, scheduledStart: schedule.proposedStart || item.scheduledStart || item.scheduleDate, scheduledEnd: schedule.proposedEnd || item.scheduledEnd, completedAt: item.completedAt, vendor: item.vendor ? { name: item.vendor.legalBusinessName || item.vendor.name || item.vendor.companyName, trade: item.vendor.category, rocNumber: item.vendor.rocLicenseNumber || item.vendor.rocNumber } : undefined, documents: (item.documents || []).filter(require('./agentDocumentPolicy').clientDocumentAllowed).map(document => ({ id: document.documentId, name: redactContact(document.name), type: document.type, documentType: document.portalDocumentType, size: document.size, uploadedAt: document.uploadedAt, downloadUrl: `/api/agent/orders/${id(item)}/documents/${encodeURIComponent(document.documentId)}` })), capabilities: { canRequestService: true, canMessage: true, canApproveEstimates: false, canManageBilling: false }, createdAt: item.createdAt, updatedAt: item.updatedAt });
}

function serializeMessage(message) {
  const item = plain(message);
  const labels = { agent: 'You', client: 'Homeowner', vendor: 'Service professional', staff: 'SMPLfix team' };
  return seal({ id: id(item), sender: labels[item.senderType] || 'SMPLfix team', body: redactContact(item.body), createdAt: item.createdAt });
}

function serializeReferral(item, related = {}) {
  const value = plain(item);
  return seal({ id: id(value), transactionId: id(value.transactionId), status: related.status || value.status, attributedAt: value.attributedAt, convertedAt: related.convertedAt || value.convertedAt, convertedJobCount: related.convertedJobCount ?? value.convertedJobCount ?? 0, completedJobCount: related.completedJobCount ?? value.completedJobCount ?? 0, rewardStatus: related.rewardStatus || value.rewardStatus, rewardUnits: related.rewardUnits ?? value.rewardUnits ?? 0, transaction: related.transaction ? { label: related.transaction.label, closeDate: related.transaction.closeDate, status: related.transaction.status, archived: related.transaction.status !== 'active', protectedAccessAvailable: false } : undefined, propertyLabel: related.property?.label });
}

function serializeClientInvitation(invitation, { includeEmail = true } = {}) {
  const item = plain(invitation);
  return seal({
    id: id(item), homeownerEmail: includeEmail ? item.homeownerEmail : undefined,
    homeownerName: item.homeownerName, status: item.status, deliveryStatus: item.deliveryStatus,
    transactionLabel: item.transactionLabel, closeDate: item.closeDate, accessEndsAt: item.accessEndsAt,
    expiresAt: item.expiresAt, permissions: item.permissions,
    property: item.proposedProperty ? { id: id(item.existingPropertyId), label: item.proposedProperty.label, address: { line1: item.proposedProperty.addressLine1, line2: item.proposedProperty.addressLine2, city: item.proposedProperty.city, state: item.proposedProperty.state, postalCode: item.proposedProperty.postalCode }, propertyType: item.proposedProperty.propertyType } : undefined,
    existingPropertyId: id(item.existingPropertyId), transactionId: id(item.transactionId),
    acceptedAt: item.acceptedAt, revokedAt: item.revokedAt, createdAt: item.createdAt
  });
}

module.exports = { redactContact, seal, serializeAgentProfile, serializeClient, serializeClientInvitation, serializeMessage, serializeOrder, serializeProperty, serializeReferral, serializeTransaction };
