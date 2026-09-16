const PRIVATE_PORTAL_KEYS = new Set([
  'vendorcost',
  'processingfee',
  'processingcost',
  'profit',
  'margin',
  'markuptype',
  'markupvalue',
  'markupamount',
  'coordinationfee',
  'coordinationfeepercentage',
  'internalnotes',
  'conflictsnapshot',
  'publictokenhash',
  'satisfactiontokenhash',
  'resettoken',
  'resetpasswordtoken',
  'fileid',
  'publicid',
  'history',
  'noteshistory',
  'metadata'
]);
const { requestCapabilities } = require('./residentialRequests');

function plain(value) {
  if (!value) return {};
  return typeof value.toObject === 'function' ? value.toObject() : value;
}

function id(value) {
  if (value == null) return null;
  const candidate = value._id || value;
  return candidate == null ? null : String(candidate);
}

function compact(value) {
  if (Array.isArray(value)) return value.map(compact);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .map(([key, item]) => [key, compact(item)]));
}

function assertNoPrivatePortalFields(value, path = 'response') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPrivatePortalFields(item, `${path}[${index}]`));
    return value;
  }
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  Object.entries(value).forEach(([key, item]) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (PRIVATE_PORTAL_KEYS.has(normalized) || normalized.includes('token')) {
      throw new Error(`Private portal field blocked at ${path}.${key}`);
    }
    assertNoPrivatePortalFields(item, `${path}.${key}`);
  });
  return value;
}

function seal(value) {
  const result = compact(value);
  assertNoPrivatePortalFields(result);
  return result;
}

function safeAttachment(document, downloadUrl) {
  const item = plain(document);
  return seal({
    documentId: item.documentId,
    name: item.name,
    type: item.type,
    size: item.size,
    uploadedAt: item.uploadedAt,
    downloadUrl
  });
}

function serializeProperty(property, membership) {
  const item = plain(property);
  const propertyId = id(item);
  const relation = plain(membership);
  return seal({
    id: propertyId,
    label: item.label,
    address: {
      line1: item.addressLine1,
      line2: item.addressLine2,
      city: item.city,
      state: item.state,
      postalCode: item.postalCode,
      country: item.country
    },
    propertyType: item.propertyType,
    status: item.status,
    relationship: relation.relationship,
    permissions: relation.permissions ? {
      view: relation.permissions.view === true,
      requestService: relation.permissions.requestService === true,
      approveEstimates: relation.permissions.approveEstimates === true,
      manageBilling: relation.permissions.manageBilling === true,
      manageProperty: relation.permissions.manageProperty === true
    } : undefined,
    documents: (item.documents || [])
      .filter(document => document.status !== 'archived')
      .map(document => safeAttachment(document, `/api/residential/properties/${propertyId}/documents/${encodeURIComponent(document.documentId)}`)),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  });
}

function safeVendor(vendor) {
  const item = plain(vendor);
  if (!item || (!item._id && !item.name && !item.companyName)) return null;
  return seal({
    id: id(item),
    name: item.companyName || item.name,
    trade: item.category,
    licensedContractorName: item.licensedContractorName,
    rocNumber: item.rocNumber || item.rocLicenseNumber,
    licenseClassification: item.rocLicenseTypeClassification
  });
}

function serializeOrder(order) {
  const item = plain(order);
  const orderId = id(item);
  return seal({
    id: orderId,
    orderReference: item.orderId,
    workOrderNumber: item.workOrderNumber,
    requestReference: item.requestReference,
    propertyId: id(item.propertyId),
    service: item.service,
    description: item.description,
    clientAmount: item.amount,
    pricingStatus: item.pricingStatus,
    status: item.status,
    workflowStatus: item.workflowStatus,
    priority: item.priority,
    scheduledStart: item.scheduledStart || item.scheduleDate,
    scheduledEnd: item.scheduledEnd,
    completedAt: item.completedAt,
    orderType: item.orderType,
    recurringFrequency: item.recurringFrequency,
    request: item.residentialRequest ? {
      serviceCategory: item.residentialRequest.serviceCategory,
      issueChips: item.residentialRequest.issueChips || [],
      urgency: item.residentialRequest.urgency,
      preferredTiming: item.residentialRequest.preferredTiming,
      accessInstructions: item.residentialRequest.accessInstructions,
      isEmergency: item.residentialRequest.isEmergency === true
    } : undefined,
    actions: requestCapabilities(item),
    vendor: safeVendor(item.vendor),
    documents: (item.documents || [])
      .filter(document => document.status !== 'archived')
      .map(document => safeAttachment(document, `/api/residential/orders/${orderId}/documents/${encodeURIComponent(document.documentId)}`)),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  });
}

function contractorFromVendor(vendor) {
  const item = plain(vendor);
  if (!item || (!item._id && !item.name && !item.legalBusinessName)) return undefined;
  return {
    name: item.legalBusinessName || item.name,
    licenseType: item.rocLicenseTypeClassification,
    rocNumber: item.rocLicenseNumber || item.rocNumber || item.contractorLicenseNumber
  };
}

function serializeEstimate(quote, vendor) {
  const item = plain(quote);
  return seal({
    id: id(item),
    orderId: id(item.orderId),
    quoteReference: item.quoteReference,
    revisionNumber: item.revisionNumber,
    status: item.status,
    decisionStatus: item.customerDecisionStatus,
    job: {
      requestReference: item.jobSnapshot?.requestReference,
      orderReference: item.jobSnapshot?.orderReference,
      service: item.jobSnapshot?.service,
      description: item.jobSnapshot?.description
    },
    scopeOfWork: item.scopeOfWork,
    estimatedDuration: item.estimatedDuration,
    earliestAvailableDate: item.earliestAvailableDate,
    siteAccessRequired: item.siteAccessRequired,
    accessNotes: item.accessNotes,
    exclusionsConditions: item.exclusionsConditions,
    clientTotal: item.customerTotal,
    termsAndConditions: item.termsAndConditions,
    contractor: { ...contractorFromVendor(vendor), disclosure: item.legalDisclosure },
    validUntil: item.validUntil,
    sentAt: item.sentAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  });
}

function serializeSchedule(schedule, vendor) {
  const item = plain(schedule);
  return seal({
    id: id(item),
    orderId: id(item.orderId),
    scheduleReference: item.scheduleReference,
    revisionNumber: item.revisionNumber,
    status: item.status,
    proposedStart: item.proposedStart,
    proposedEnd: item.proposedEnd,
    timezone: item.timezone,
    accessInstructions: item.accessInstructions,
    vendor: contractorFromVendor(vendor),
    job: item.jobSnapshot ? {
      requestReference: item.jobSnapshot.requestReference,
      orderReference: item.jobSnapshot.orderReference,
      service: item.jobSnapshot.service,
      description: item.jobSnapshot.description,
      scopeOfWork: item.jobSnapshot.scopeOfWork
    } : undefined,
    sentAt: item.sentAt,
    acceptedAt: item.acceptedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  });
}

function serializePayment(payment) {
  const item = plain(payment);
  if (!item || !item._id) return null;
  return seal({
    id: id(item),
    paymentReference: item.paymentId,
    status: item.status,
    amount: item.amount,
    paymentMethod: item.paymentMethod,
    paymentDate: item.paymentDate,
    dueDate: item.dueDate,
    receiptNumber: item.receiptNumber
  });
}

function safePaymentInstructions(value = {}) {
  return {
    paymentMethods: Array.isArray(value.paymentMethods)
      ? value.paymentMethods.filter(method => method?.enabled !== false).map(method => ({ label: method.label, instructions: method.instructions }))
      : [],
    remittanceContact: value.remittanceContact,
    proofUploadInstructions: value.proofUploadInstructions
  };
}

function serializeInvoice(invoice, payment, vendor) {
  const item = plain(invoice);
  const invoiceId = id(item);
  return seal({
    id: invoiceId,
    orderId: id(item.orderId),
    invoiceNumber: item.invoiceNumber,
    amount: item.amount,
    issuedAt: item.issuedAt,
    dueDate: item.dueDate,
    terms: item.terms,
    company: item.companySnapshot ? {
      name: item.companySnapshot.name,
      email: item.companySnapshot.email,
      phone: item.companySnapshot.phone,
      address: item.companySnapshot.address,
      rocNumber: item.companySnapshot.rocNumber || item.companySnapshot.licenseNumber
    } : undefined,
    job: item.jobSnapshot ? {
      requestReference: item.jobSnapshot.requestReference,
      orderReference: item.jobSnapshot.orderReference,
      service: item.jobSnapshot.service,
      description: item.jobSnapshot.description,
      scopeOfWork: item.jobSnapshot.scopeOfWork
    } : undefined,
    paymentInstructions: safePaymentInstructions(item.paymentInstructionsSnapshot),
    payment: serializePayment(payment),
    contractor: contractorFromVendor(vendor),
    pdfUrl: `/api/residential/invoices/${invoiceId}/pdf`,
    receiptPdfUrl: payment && ['received', 'completed'].includes(payment.status)
      ? `/api/residential/payments/${id(payment)}/receipt.pdf`
      : undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  });
}

function workflowTracker(order, related = {}) {
  const item = plain(order);
  const normalized = String(item.status || '').toLowerCase().replace(/[\s-]+/g, '_');
  const workflow = String(item.workflowStatus || 'request_received');
  const hasEstimate = Boolean(related.estimate || item.currentOutgoingQuoteId || item.approvedOutgoingQuoteId);
  const approved = Boolean(item.customerApprovedAt || item.approvedOutgoingQuoteId || ['customer_approved', 'schedule_pending_vendor', 'schedule_changes_requested', 'scheduled', 'awaiting_customer_closeout', 'completed'].includes(workflow));
  const scheduled = Boolean(related.schedule?.acceptedAt || item.scheduleConfirmedAt || item.confirmedJobScheduleId || ['scheduled', 'awaiting_customer_closeout', 'completed'].includes(workflow));
  const enRouteSupported = ['en_route', 'in_progress'].includes(normalized);
  const inProgress = normalized === 'in_progress';
  const completed = Boolean(related.completion?.completedAt || item.completedAt || ['awaiting_customer_closeout', 'completed'].includes(workflow));
  const invoiced = Boolean(related.invoice || item.customerInvoiceId);
  const paid = ['received', 'completed'].includes(String(related.payment?.status || '').toLowerCase());
  const facts = [
    ['request_received', workflow === 'request_received' ? 'Request received — SMPLfix reviewing' : 'Request received', true, true],
    ['quote_collection', 'Collecting vendor estimates', workflow !== 'request_received', true],
    ['estimate', 'Estimate', hasEstimate, true],
    ['approved', 'Approved', approved, true],
    ['scheduled', 'Scheduled', scheduled, true],
    ['en_route', 'En route', normalized === 'en_route' || inProgress, enRouteSupported],
    ['in_progress', 'In progress', inProgress || completed, enRouteSupported || completed],
    ['completed', 'Completed', completed, true],
    ['invoiced', 'Invoiced', invoiced, true],
    ['paid', 'Paid', paid, true]
  ];
  const firstIncomplete = facts.findIndex(([, , complete, supported]) => supported && !complete);
  return facts.map(([key, label, complete, supported], index) => ({
    key, label,
    state: !supported ? 'unavailable' : complete ? 'complete' : index === firstIncomplete ? 'current' : 'upcoming'
  }));
}

function serializeCompletion(completion) {
  const item = plain(completion);
  const orderId = id(item.orderId);
  const photos = (items, phase) => (items || [])
    .filter(document => document.status !== 'archived')
    .map(document => safeAttachment(document, `/api/residential/orders/${orderId}/completion-photos/${phase}/${encodeURIComponent(document.documentId)}`));
  return seal({
    id: id(item),
    orderId,
    completionReference: item.completionReference,
    status: item.status,
    completionNotes: item.completionNotes,
    completedAt: item.completedAt,
    schedule: item.scheduleSnapshot ? {
      scheduleReference: item.scheduleSnapshot.scheduleReference,
      scheduledStart: item.scheduleSnapshot.scheduledStart,
      scheduledEnd: item.scheduleSnapshot.scheduledEnd,
      timezone: item.scheduleSnapshot.timezone,
      accessInstructions: item.scheduleSnapshot.accessInstructions
    } : undefined,
    job: item.jobSnapshot ? {
      requestReference: item.jobSnapshot.requestReference,
      orderReference: item.jobSnapshot.orderReference,
      service: item.jobSnapshot.service,
      description: item.jobSnapshot.description,
      scopeOfWork: item.jobSnapshot.scopeOfWork
    } : undefined,
    contractor: { name: item.vendorSnapshot?.name },
    clientTotal: item.approvedTotal,
    beforePhotos: photos(item.beforePhotos, 'before'),
    afterPhotos: photos(item.afterPhotos, 'after'),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  });
}

function serializeActivity(activity) {
  const item = plain(activity);
  return seal({
    id: id(item),
    type: item.type,
    title: item.title,
    summary: item.summary || item.message,
    propertyId: id(item.propertyId),
    orderId: id(item.orderId),
    occurredAt: item.occurredAt || item.createdAt,
    isRead: typeof item.isRead === 'boolean' ? item.isRead : undefined,
    priority: item.priority
  });
}

module.exports = {
  PRIVATE_PORTAL_KEYS,
  assertNoPrivatePortalFields,
  safeAttachment,
  serializeActivity,
  serializeCompletion,
  serializeEstimate,
  serializeInvoice,
  serializeOrder,
  serializePayment,
  serializeProperty,
  serializeSchedule,
  workflowTracker
};
