const { complianceChecklist } = require('./vendorCompliance');

const PRIVATE_KEYS = new Set([
  'eintaxid', 'eintaxidencrypted', 'eintaxidiv', 'eintaxidtag', 'accountid', 'ipaddress', 'useragent',
  'notes', 'noteshistory', 'reviewmessage', 'onboardingemailerror', 'updaterecipientnotificationerror',
  'vendorcost', 'markup', 'margin', 'profit', 'token', 'tokenhash', 'bankaccount', 'routingnumber'
]);

function id(value) { return value == null ? null : String(value); }
function cleanArray(values, limit = 100) { return (Array.isArray(values) ? values : []).map(value => String(value || '').trim()).filter(Boolean).slice(0, limit); }
function safeDocument(document) {
  return {
    id: String(document.documentId),
    name: String(document.name || 'Document'),
    type: String(document.type || 'application/octet-stream'),
    size: Number(document.size || 0),
    complianceType: document.complianceDocumentType || null,
    uploadedAt: document.uploadedAt || null,
    downloadUrl: `/api/vendor-portal/documents/${encodeURIComponent(document.documentId)}`
  };
}

function serializeVendor(vendor) {
  const source = vendor?.toObject ? vendor.toObject({ virtuals: true }) : vendor || {};
  return {
    id: id(source._id),
    companyName: source.name || '',
    legalBusinessName: source.legalBusinessName || '',
    contact: { name: source.primaryOwnerName || '', email: source.email || '', phone: source.phone || '' },
    businessAddress: source.businessAddress || source.address || '',
    entityType: source.businessEntityType || '',
    tradeClassifications: cleanArray(source.tradeClassifications?.length ? source.tradeClassifications : [source.category]),
    serviceArea: {
      basePostalCode: source.serviceArea?.basePostalCode || '',
      radiusMiles: Number(source.serviceArea?.radiusMiles || 0),
      counties: cleanArray(source.serviceArea?.counties),
      postalCodes: cleanArray(source.serviceArea?.postalCodes)
    },
    licensedTrade: Boolean(source.licensedTrade),
    roc: {
      number: source.rocLicenseNumber || '',
      classification: source.rocLicenseTypeClassification || '',
      expirationDate: source.rocLicenseExpirationDate || null,
      verificationStatus: source.rocVerification?.status || 'not_requested',
      staffReviewRequired: Boolean(source.rocVerification?.staffReviewRequired)
    },
    status: source.portalStatus || 'pending',
    statusReason: source.portalStatusReason || '',
    compliance: complianceChecklist(source),
    taxIdMasked: source.einTaxIdLast4 ? `***-**-${source.einTaxIdLast4}` : '',
    insurance: {
      carrier: source.coiProfile?.carrier || '', policyNumber: source.coiProfile?.policyNumber || '',
      effectiveDate: source.coiProfile?.effectiveDate || null, expirationDate: source.coiProfile?.expirationDate || null,
      additionalInsuredConfirmed: Boolean(source.huttasAdditionalInsured)
    },
    workersComp: {
      required: source.workersCompProfile?.required !== false,
      carrier: source.workersCompProfile?.carrier || '',
      expirationDate: source.workersCompProfile?.expirationDate || null
    },
    stripeConnect: {
      configured: Boolean(source.stripeConnect?.accountId),
      detailsSubmitted: Boolean(source.stripeConnect?.detailsSubmitted),
      payoutsEnabled: Boolean(source.stripeConnect?.payoutsEnabled)
    },
    documents: (source.documents || []).filter(document => document.status !== 'archived').map(safeDocument)
  };
}

function serializeMembership(membership) {
  const source = membership?.toObject ? membership.toObject() : membership || {};
  return { id: id(source._id), userId: id(source.userId), role: source.role, permissions: { ...(source.permissions || {}) }, status: source.status };
}

function assertNoVendorPrivateData(payload) {
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (PRIVATE_KEYS.has(String(key).replace(/[^a-z0-9]/gi, '').toLowerCase())) throw new Error(`Private vendor field leaked: ${key}`);
      visit(child);
    }
  };
  visit(payload);
  return payload;
}

module.exports = { assertNoVendorPrivateData, safeDocument, serializeMembership, serializeVendor };
