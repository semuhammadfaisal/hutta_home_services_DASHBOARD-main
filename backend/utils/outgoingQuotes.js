const crypto = require('crypto');
const Counter = require('../models/Counter');

function cleanText(value, max = 10000) {
  return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

function cents(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) : NaN;
}

function dollars(value) {
  return Math.round(value) / 100;
}

function calculatePricing(vendorCost, markupType, markupValue) {
  const cost = cents(vendorCost);
  const value = Number(markupValue);
  if (!Number.isFinite(cost) || cost < 0) throw Object.assign(new Error('Vendor cost must be zero or greater'), { status: 400 });
  if (!Number.isFinite(value) || value < 0) throw Object.assign(new Error('Markup must be zero or greater'), { status: 400 });
  if (!['percentage', 'fixed'].includes(markupType)) throw Object.assign(new Error('Markup type must be percentage or fixed'), { status: 400 });
  const markup = markupType === 'percentage' ? Math.round(cost * value / 100) : cents(value);
  return { vendorCost: dollars(cost), markupAmount: dollars(markup), customerTotal: dollars(cost + markup) };
}

function legalDisclosure(vendor) {
  const company = cleanText(vendor.companyName || vendor.name, 300);
  const roc = cleanText(vendor.rocNumber || vendor.rocLicenseNumber, 100);
  return `Trade and specialty work performed by ${company}, ROC #${roc}, a licensed and insured contractor operating independently and solely responsible for the performance and quality of their work.`;
}

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function encryptionKey() {
  const secret = String(process.env.QUOTE_TOKEN_ENCRYPTION_SECRET || process.env.TAX_ID_ENCRYPTION_KEY || process.env.HUTTAS_WEBHOOK_SECRET || '');
  if (secret.length < 32) throw new Error('A token encryption secret of at least 32 characters is required');
  return crypto.createHash('sha256').update(`outgoing-quote-token:${secret}`).digest();
}

function encryptToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(String(token), 'utf8'), cipher.final()]);
  return { data: data.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}

function decryptToken(value) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(value.data, 'base64')), decipher.final()]).toString('utf8');
}

async function nextOutgoingQuoteReference(session) {
  const year = new Date().getUTCFullYear();
  const counter = await Counter.findOneAndUpdate(
    { _id: `outgoing-quote:${year}` },
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true, session }
  );
  return `OQ-${year}-${String(counter.value).padStart(6, '0')}`;
}

function publicQuote(quote, decision = null, consentText = '') {
  return {
    quoteReference: quote.quoteReference,
    revisionNumber: quote.revisionNumber,
    customer: { name: quote.customerSnapshot?.name, address: quote.customerSnapshot?.address },
    job: quote.jobSnapshot,
    scopeOfWork: quote.scopeOfWork,
    estimatedDuration: quote.estimatedDuration,
    earliestAvailableDate: quote.earliestAvailableDate,
    siteAccessRequired: quote.siteAccessRequired,
    accessNotes: quote.accessNotes,
    exclusionsConditions: quote.exclusionsConditions,
    customerTotal: quote.customerTotal,
    termsAndConditions: quote.termsAndConditions,
    vendorDisclosure: {
      licensedContractorName: quote.vendorSnapshot?.licensedContractorName,
      licenseType: quote.vendorSnapshot?.licenseType,
      rocNumber: quote.vendorSnapshot?.rocNumber,
      legalDisclosure: quote.legalDisclosure
    },
    validUntil: quote.validUntil,
    sentAt: quote.sentAt,
    customerDecisionStatus: quote.customerDecisionStatus || 'pending',
    customerDecision: decision,
    approvalConsentText: consentText
  };
}

module.exports = { calculatePricing, cleanText, decryptToken, encryptToken, generateToken, hashToken, legalDisclosure, nextOutgoingQuoteReference, publicQuote };
