const ACTIVE_DOCUMENT_TYPES = Object.freeze({
  agreement: 'huttasContract',
  w9: 'w9',
  coi: 'certificateOfInsurance',
  workers_comp: 'workersCompInsurance',
  roc_license: 'rocLicense'
});

function activeDocument(vendor, type) {
  const complianceType = ACTIVE_DOCUMENT_TYPES[type] || type;
  return (vendor.documents || []).find(item => item.status !== 'archived' && item.complianceDocumentType === complianceType);
}

function complianceChecklist(vendor) {
  const agreement = Boolean(vendor.huttasContractSigned && vendor.agreementAudit?.acceptedAt && vendor.agreementAudit?.signerName);
  // The encrypted value is select:false; last4 is the non-sensitive proof that an encrypted TIN exists.
  const w9 = Boolean(vendor.w9OnFile && vendor.einTaxIdLast4 && vendor.w9Profile?.signedAt);
  const coi = Boolean(vendor.certificateOfInsuranceOnFile && activeDocument(vendor, 'coi') && vendor.coiProfile?.carrier && vendor.coiProfile?.policyNumber && vendor.coiProfile?.expirationDate);
  const additionalInsured = Boolean(vendor.huttasAdditionalInsured && vendor.coiProfile?.additionalInsuredConfirmedAt);
  const workersComp = vendor.workersCompProfile?.required === false
    ? Boolean(vendor.workersCompProfile?.exemptionReason)
    : Boolean(vendor.workersCompInsuranceOnFile && activeDocument(vendor, 'workers_comp') && vendor.workersCompProfile?.expirationDate);
  const stripe = Boolean(vendor.stripeConnect?.accountId && vendor.stripeConnect?.detailsSubmitted && vendor.stripeConnect?.payoutsEnabled);
  const roc = !vendor.licensedTrade || Boolean(vendor.rocLicenseNumber);
  return [
    { key: 'agreement', complete: agreement },
    { key: 'w9', complete: w9 },
    { key: 'coi', complete: coi },
    { key: 'additional_insured', complete: additionalInsured },
    { key: 'workers_comp', complete: workersComp },
    { key: 'stripe_connect', complete: stripe },
    { key: 'roc_license', complete: roc }
  ];
}

function nextPortalStatus(vendor) {
  if (['rejected', 'suspended', 'approved_active'].includes(vendor.portalStatus)) return vendor.portalStatus;
  return complianceChecklist(vendor).every(item => item.complete) ? 'under_review' : 'compliance_incomplete';
}

function applyComputedPortalStatus(vendor) {
  const next = nextPortalStatus(vendor);
  if (vendor.portalStatus !== next) {
    vendor.portalStatus = next;
    vendor.portalStatusUpdatedAt = new Date();
  }
  vendor.isActive = next === 'approved_active';
  return next;
}

module.exports = { ACTIVE_DOCUMENT_TYPES, activeDocument, applyComputedPortalStatus, complianceChecklist, nextPortalStatus };
