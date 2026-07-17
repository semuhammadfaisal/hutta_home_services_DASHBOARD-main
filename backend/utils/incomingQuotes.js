const crypto = require('crypto');
const Counter = require('../models/Counter');

const QUOTE_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ALLOWED_DURATION_UNITS = new Set(['hours', 'days', 'weeks']);

function cleanText(value, max = 10000) {
  return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function tokenEncryptionKey() {
  const secret = String(process.env.QUOTE_TOKEN_ENCRYPTION_SECRET || process.env.TAX_ID_ENCRYPTION_KEY || process.env.HUTTAS_WEBHOOK_SECRET || '');
  if (secret.length < 32) throw new Error('A token encryption secret of at least 32 characters is required');
  return crypto.createHash('sha256').update(`incoming-quote-token:${secret}`).digest();
}

function encryptToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', tokenEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(token), 'utf8'), cipher.final()]);
  return { data: encrypted.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}

function decryptToken(value) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', tokenEncryptionKey(), Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(value.data, 'base64')), decipher.final()]).toString('utf8');
}

async function nextQuoteReference(session) {
  const year = new Date().getUTCFullYear();
  const counter = await Counter.findOneAndUpdate(
    { _id: `incoming-quote:${year}` },
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true, session }
  );
  return `IQ-${year}-${String(counter.value).padStart(6, '0')}`;
}

function vendorPrimaryEmail(vendor) {
  return String(vendor?.emails?.find(item => item.isPrimary)?.address || vendor?.email || vendor?.emails?.[0]?.address || '').trim().toLowerCase();
}

function vendorPrimaryPhone(vendor) {
  return String(vendor?.phones?.find(item => item.isPrimary)?.number || vendor?.phone || vendor?.phones?.[0]?.number || '').trim();
}

function complianceForVendor(vendor, now = new Date()) {
  const warnings = [];
  const licenseExpiration = vendor?.rocLicenseExpirationDate ? new Date(vendor.rocLicenseExpirationDate) : null;
  const insuranceExpiration = vendor?.insuranceExpirationDate ? new Date(vendor.insuranceExpirationDate) : null;
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (!vendor?.contractorLicenseNumber) warnings.push('Contractor license number is missing');
  if (!vendor?.rocLicenseNumber) warnings.push('ROC number is missing');
  if (!vendor?.certificateOfInsuranceOnFile) warnings.push('Certificate of insurance is missing');
  if (!insuranceExpiration || Number.isNaN(insuranceExpiration.getTime())) warnings.push('Insurance expiration date is missing');
  if (licenseExpiration && licenseExpiration < now) warnings.push('ROC license is expired');
  if (insuranceExpiration && insuranceExpiration < now) warnings.push('Insurance is expired');

  let status = 'current';
  if (warnings.some(item => /expired/.test(item))) status = 'expired';
  else if (warnings.length) status = 'missing';
  else if ((licenseExpiration && licenseExpiration <= thirtyDays) || insuranceExpiration <= thirtyDays) status = 'expiring';

  if (status === 'expiring') {
    if (licenseExpiration && licenseExpiration <= thirtyDays) warnings.push('ROC license expires within 30 days');
    if (insuranceExpiration && insuranceExpiration <= thirtyDays) warnings.push('Insurance expires within 30 days');
  }
  return { status, warnings };
}

function vendorSnapshot(vendor) {
  const compliance = complianceForVendor(vendor);
  return {
    name: vendor.name,
    email: vendorPrimaryEmail(vendor),
    phone: vendorPrimaryPhone(vendor),
    contractorLicenseNumber: vendor.contractorLicenseNumber || '',
    rocLicenseNumber: vendor.rocLicenseNumber || '',
    rocLicenseTypeClassification: vendor.rocLicenseTypeClassification || '',
    rocLicenseExpirationDate: vendor.rocLicenseExpirationDate,
    certificateOfInsuranceOnFile: Boolean(vendor.certificateOfInsuranceOnFile),
    insuranceExpirationDate: vendor.insuranceExpirationDate,
    complianceStatus: compliance.status,
    complianceWarnings: compliance.warnings
  };
}

function parseQuotePayload(body = {}, { requireComplete = false } = {}) {
  const hasLabor = body.laborAmount !== undefined && body.laborAmount !== null && body.laborAmount !== '';
  const hasMaterials = body.materialsAmount !== undefined && body.materialsAmount !== null && body.materialsAmount !== '';
  const laborAmount = hasLabor ? Number(body.laborAmount) : 0;
  const materialsAmount = hasMaterials ? Number(body.materialsAmount) : 0;
  const durationValue = Number(body.estimatedDuration?.value ?? body.durationValue);
  const durationUnit = cleanText(body.estimatedDuration?.unit ?? body.durationUnit, 20).toLowerCase();
  const earliestAvailableDate = body.earliestAvailableDate ? new Date(body.earliestAvailableDate) : null;
  const siteAccessValue = body.siteAccessRequired;
  const payload = {
    scopeOfWork: cleanText(body.scopeOfWork),
    laborAmount: Number.isFinite(laborAmount) ? laborAmount : 0,
    materialsAmount: Number.isFinite(materialsAmount) ? materialsAmount : 0,
    estimatedDuration: {
      value: Number.isFinite(durationValue) ? durationValue : undefined,
      unit: ALLOWED_DURATION_UNITS.has(durationUnit) ? durationUnit : undefined
    },
    earliestAvailableDate,
    siteAccessRequired: siteAccessValue === true || siteAccessValue === 'true' ? true : siteAccessValue === false || siteAccessValue === 'false' ? false : undefined,
    accessNotes: cleanText(body.accessNotes, 3000),
    exclusionsConditions: cleanText(body.exclusionsConditions)
  };
  const errors = [];
  if ((hasLabor || requireComplete) && (laborAmount < 0 || !Number.isFinite(laborAmount))) errors.push('Labor amount must be zero or greater');
  if ((hasMaterials || requireComplete) && (materialsAmount < 0 || !Number.isFinite(materialsAmount))) errors.push('Materials amount must be zero or greater');
  if (requireComplete) {
    if (!payload.scopeOfWork) errors.push('Scope of work is required');
    if (!(payload.estimatedDuration.value > 0) || !payload.estimatedDuration.unit) errors.push('A valid estimated duration is required');
    if (!earliestAvailableDate || Number.isNaN(earliestAvailableDate.getTime())) errors.push('Earliest available date is required');
    if (payload.siteAccessRequired === undefined) errors.push('Site access selection is required');
    if (payload.siteAccessRequired && !payload.accessNotes) errors.push('Access notes are required when site access must be arranged');
  }
  if (earliestAvailableDate && Number.isNaN(earliestAvailableDate.getTime())) errors.push('Earliest available date is invalid');
  return { payload, errors };
}

function orderReadyForQuotes(order) {
  return Boolean(order && !order.missingData?.serviceCategory && !order.missingData?.serviceAddress && String(order.service || '').trim() && String(order.customer?.address || '').trim());
}

module.exports = {
  QUOTE_INVITE_TTL_MS,
  cleanText,
  complianceForVendor,
  decryptToken,
  encryptToken,
  generateToken,
  hashToken,
  nextQuoteReference,
  orderReadyForQuotes,
  parseQuotePayload,
  vendorPrimaryEmail,
  vendorSnapshot
};
