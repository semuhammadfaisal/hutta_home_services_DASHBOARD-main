const PRIVATE_KEYS = new Set(['vendorcost', 'rawvendorinvoice', 'processingfee', 'processingcost', 'profit', 'margin', 'markuptype', 'markupvalue', 'markupamount', 'coordinationfee', 'coordinationfeepercentage', 'internalnote', 'internalnotes', 'notes', 'noteshistory', 'history', 'publictokenhash', 'token', 'password', 'paymentinstructions', 'paymentcredential', 'vendorcontact']);

const plain = value => value?.toObject ? value.toObject() : (value || {});
const id = value => {
  if (value == null) return null;
  const candidate = value?._id || value;
  if (typeof candidate === 'object' && !candidate?._bsontype && candidate?.constructor?.name !== 'ObjectId') return null;
  return String(candidate);
};
function compact(value) {
  if (Array.isArray(value)) return value.map(compact);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, compact(item)]));
}
function assertNoPrivateCommercialFields(value, path = 'response') {
  if (Array.isArray(value)) { value.forEach((item, index) => assertNoPrivateCommercialFields(item, `${path}[${index}]`)); return value; }
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (PRIVATE_KEYS.has(normalized) || normalized.includes('token') || normalized.includes('vendorcost') || normalized.includes('margin')) throw new Error(`Private commercial field blocked at ${path}.${key}`);
    assertNoPrivateCommercialFields(item, `${path}.${key}`);
  }
  return value;
}
function seal(value) { const result = compact(value); assertNoPrivateCommercialFields(result); return result; }

function safeContact(contact) { const item = plain(contact); return { id: id(item), name: item.name, title: item.title, email: item.email, phone: item.phone, isPrimary: item.isPrimary === true }; }
function serializeOrganization(organization, options = {}) {
  const item = plain(organization);
  return seal({ id: id(item), organizationCode: item.organizationCode, name: item.name, legalName: item.legalName, status: item.status, ownerContacts: options.includeContacts ? (item.ownerContacts || []).map(safeContact) : undefined, billingContacts: options.includeBillingContacts ? (item.billingContacts || []).map(safeContact) : undefined });
}
function serializePortfolio(portfolio) { const item = plain(portfolio); return seal({ id: id(item), organizationId: id(item.organizationId), name: item.name, portfolioCode: item.portfolioCode, description: item.description, status: item.status }); }
function serializeAgreement(agreement, entitlements) {
  const item = plain(agreement);
  return seal({ id: id(item), agreementNumber: item.agreementNumber, organizationId: id(item.organizationId), portfolioId: id(item.portfolioId), propertyId: id(item.propertyId), tier: item.tier, billing: { invoiceMode: entitlements.invoiceMode, billingPeriod: item.billingRules?.billingPeriod, vendorBillsClientDirectly: entitlements.vendorBillsClientDirectly, consolidatedInvoice: entitlements.consolidatedInvoices }, purchaseOrder: { required: item.purchaseOrder?.required === true, label: item.purchaseOrder?.label || 'PO number', pattern: item.purchaseOrder?.pattern, instructions: item.purchaseOrder?.instructions }, entitlements: { monthlyReports: entitlements.monthlyReports, consolidatedInvoices: entitlements.consolidatedInvoices, warrantyClaims: entitlements.warrantyClaims }, effectiveFrom: item.effectiveFrom, effectiveTo: item.effectiveTo, status: item.status });
}
function serializeLocation(location, property, access, entitlements, capabilities) {
  const item = plain(location); const prop = plain(property);
  return seal({ id: id(item), organizationId: id(item.organizationId), portfolioId: id(item.portfolioId), propertyId: id(item.propertyId), locationCode: item.locationCode, label: prop.label, ownerLabel: item.ownerLabel, address: { line1: prop.addressLine1, line2: prop.addressLine2, city: prop.city, state: prop.state, postalCode: prop.postalCode, country: prop.country }, propertyType: prop.propertyType, role: access?.propertyMembership?.role || access?.portfolioMembership?.role || access?.organizationMembership?.role, tier: access?.agreement?.tier, entitlements, capabilities, status: item.status });
}
function serializeOrder(order, agreement, capabilities) {
  const item = plain(order); const tierOne = agreement?.tier === 'tier_1';
  return seal({ id: id(item), orderReference: item.orderId, workOrderNumber: item.workOrderNumber, requestReference: item.requestReference, propertyId: id(item.propertyId), service: item.service, description: item.description, clientAmount: tierOne ? undefined : item.amount, pricingStatus: item.pricingStatus, status: item.status, workflowStatus: item.workflowStatus, priority: item.priority, scheduledStart: item.scheduledStart || item.scheduleDate, scheduledEnd: item.scheduledEnd, completedAt: item.completedAt, purchaseOrderNumber: item.commercialContext?.purchaseOrderNumber, capabilities: { canRequestService: capabilities.canRequestService, canApproveEstimates: capabilities.canApproveEstimates }, createdAt: item.createdAt, updatedAt: item.updatedAt });
}
function serializeInvoice(invoice, payment) {
  const item = plain(invoice); const commercial = item.commercialBilling || {};
  const { invoiceVisibility, paymentSummary, reconcileInvoice } = require('./commercialBilling');
  if (!invoiceVisibility(item)) return null;
  const reconciliation = reconcileInvoice(item);
  if ((commercial.propertyBreakdown || []).length && !reconciliation.reconciled) return null;
  const settlement = paymentSummary(item, payment ? [payment] : []);
  return seal({
    id: id(item), orderId: id(item.orderId), invoiceNumber: item.invoiceNumber, invoiceType: commercial.invoiceKind,
    tierAtIssue: commercial.tierAtIssue, billingModeAtIssue: commercial.invoiceModeAtIssue,
    amount: item.amount, currency: commercial.currency || 'USD', issuedAt: item.issuedAt, dueDate: item.dueDate, terms: item.terms,
    status: settlement.status, paidAmount: settlement.paidAmount, balanceDue: settlement.balanceDue, paidAt: settlement.paidAt,
    periodStart: commercial.periodStart, periodEnd: commercial.periodEnd, purchaseOrderNumber: commercial.purchaseOrderNumber,
    properties: (commercial.propertyBreakdown || []).map(row => ({ propertyId: id(row.propertyId), portfolioId: id(row.portfolioId), propertyLabel: row.propertyLabel, locationCode: row.locationCode, billedAmount: row.billedAmount, purchaseOrderNumbers: row.purchaseOrderNumbers })),
    pdfUrl: `/api/commercial/invoices/${id(item)}/pdf`
  });
}
function serializeMember(user, membership, propertyMemberships = [], portfolioMemberships = []) { const account = plain(user); const member = plain(membership); return seal({ id: id(member), user: { id: id(account), displayName: [account.firstName, account.lastName].filter(Boolean).join(' '), email: account.email }, role: member.role, propertyAccess: member.propertyAccess, permissions: member.permissions, portfolioRoles: portfolioMemberships.map(value => { const item = plain(value); return { portfolioId: id(item.portfolioId), role: item.role, permissions: item.permissions, status: item.status }; }), propertyRoles: propertyMemberships.map(value => { const item = plain(value); return { propertyId: id(item.propertyId), locationId: id(item.locationId), role: item.role, permissions: item.permissions, status: item.status }; }), status: member.status }); }

function serializeEstimate(quote, order, canApprove) {
  const item = plain(quote); const work = plain(order);
  return seal({ id: id(item), orderId: id(item.orderId), quoteReference: item.quoteReference, orderReference: work.orderId, propertyId: id(work.propertyId), service: work.service, scopeOfWork: item.scopeOfWork, amount: item.customerTotal, decisionStatus: item.customerDecisionStatus, validUntil: item.validUntil, sentAt: item.sentAt, canApprove: canApprove === true });
}

function serializeActivity(activity) { const item = plain(activity); return seal({ id: id(item), propertyId: id(item.propertyId), orderId: id(item.orderId), type: item.type, title: item.title, summary: item.summary, occurredAt: item.occurredAt }); }
function serializeNotification(notification) { const item = plain(notification); return seal({ id: id(item), title: item.title, message: item.message, type: item.type, priority: item.priority, isRead: item.isRead === true, createdAt: item.createdAt }); }
function serializeWarrantyClaim(claim) {
  const item = plain(claim);
  return seal({
    id: id(item), organizationId: id(item.organizationId), propertyId: id(item.propertyId), orderId: id(item.orderId),
    vendor: item.vendorSnapshot?.name ? { name: item.vendorSnapshot.name, rocNumber: item.vendorSnapshot.rocNumber } : undefined,
    claimReference: item.claimReference, title: item.title, summary: item.summary, status: item.status,
    completionDate: item.completionDate, coverage: item.coverage,
    appointments: (item.appointments || []).map(value => ({ id: id(value), scheduledStart: value.scheduledStart, scheduledEnd: value.scheduledEnd, timezone: value.timezone, status: value.status, publicNote: value.publicNote })),
    documents: (item.documents || []).filter(value => value.status !== 'archived').map(value => ({ id: value.documentId, name: value.name, type: value.type, size: value.size, uploadedAt: value.uploadedAt, downloadUrl: `/api/commercial/warranty-claims/${id(item)}/documents/${encodeURIComponent(value.documentId)}` })),
    resolution: item.resolution ? { summary: item.resolution.summary, outcome: item.resolution.outcome, resolvedAt: item.resolution.resolvedAt || item.resolvedAt } : undefined,
    openedAt: item.openedAt, resolvedAt: item.resolution?.resolvedAt || item.resolvedAt
  });
}

module.exports = { assertNoPrivateCommercialFields, seal, serializeActivity, serializeAgreement, serializeEstimate, serializeInvoice, serializeLocation, serializeMember, serializeNotification, serializeOrder, serializeOrganization, serializePortfolio, serializeWarrantyClaim };
