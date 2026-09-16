function normalize(value) { return String(value || '').trim().toLowerCase().replace(/\s+/g, ' '); }

class DisabledRocProvider {
  constructor() { this.name = 'disabled'; }
  async lookup() { return { configured: false }; }
}

class HttpJsonRocProvider {
  constructor({ endpoint, apiKey, fetchImpl = fetch }) { this.name = 'http_json'; this.endpoint = endpoint; this.apiKey = apiKey; this.fetchImpl = fetchImpl; }
  async lookup(licenseNumber) {
    const response = await this.fetchImpl(`${this.endpoint}?license=${encodeURIComponent(licenseNumber)}`, { headers: { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' } });
    if (!response.ok) throw new Error('ROC verification provider request failed');
    return { configured: true, ...(await response.json()) };
  }
}

function configuredProvider() {
  const endpoint = String(process.env.AZ_ROC_VERIFICATION_URL || '').trim();
  const apiKey = String(process.env.AZ_ROC_VERIFICATION_API_KEY || '').trim();
  return endpoint && apiKey ? new HttpJsonRocProvider({ endpoint, apiKey }) : new DisabledRocProvider();
}

async function verifyVendorRoc(vendor, provider = configuredProvider()) {
  if (!vendor.licensedTrade) return { provider: provider.name, status: 'not_requested', staffReviewRequired: false, mismatchReasons: [] };
  if (!vendor.rocLicenseNumber) return { provider: provider.name, status: 'mismatch', staffReviewRequired: true, mismatchReasons: ['ROC license number is missing'] };
  const result = await provider.lookup(vendor.rocLicenseNumber);
  if (!result.configured) return { provider: provider.name, status: 'not_configured', staffReviewRequired: false, mismatchReasons: [] };
  const mismatchReasons = [];
  if (result.entityName && ![vendor.name, vendor.legalBusinessName].some(name => normalize(name) === normalize(result.entityName))) mismatchReasons.push('Legal entity name does not match the ROC record');
  if (result.classification && vendor.rocLicenseTypeClassification && normalize(result.classification) !== normalize(vendor.rocLicenseTypeClassification)) mismatchReasons.push('Trade classification does not match the ROC record');
  if (result.status && !['active', 'current', 'good standing'].includes(normalize(result.status))) mismatchReasons.push(`ROC license status is ${result.status}`);
  return {
    provider: provider.name,
    status: mismatchReasons.length ? 'mismatch' : 'verified',
    checkedAt: new Date(),
    matchedEntityName: result.entityName || '',
    matchedClassification: result.classification || '',
    matchedLicenseStatus: result.status || '',
    matchedExpirationDate: result.expirationDate || null,
    mismatchReasons,
    staffReviewRequired: mismatchReasons.length > 0
  };
}

module.exports = { DisabledRocProvider, HttpJsonRocProvider, configuredProvider, verifyVendorRoc };
