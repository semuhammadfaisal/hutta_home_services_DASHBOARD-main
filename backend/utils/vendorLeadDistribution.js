const crypto = require('crypto');
const { complianceChecklist } = require('./vendorCompliance');

function normalize(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function addressPostalCode(property, order) {
  if (property?.postalCode) return normalize(property.postalCode).replace(/\s/g, '');
  const match = String(order?.customer?.address || '').match(/\b\d{5}(?:-\d{4})?\b/);
  return match ? match[0].toLowerCase() : '';
}
function tradeMatches(vendor, order) {
  const wanted = normalize(order?.service);
  const trades = [...(vendor?.tradeClassifications || []), vendor?.category].map(normalize).filter(Boolean);
  return Boolean(wanted && trades.some(trade => trade === wanted || trade.includes(wanted) || wanted.includes(trade)));
}
function serviceAreaMatches(vendor, order, property) {
  const area = vendor?.serviceArea || {};
  const postal = addressPostalCode(property, order);
  const explicit = (area.postalCodes || []).map(value => normalize(value).replace(/\s/g, ''));
  if (explicit.length) return Boolean(postal && explicit.includes(postal));
  const base = normalize(area.basePostalCode).replace(/\s/g, '');
  // A radius cannot be verified without geocoding. Exact base-ZIP matches remain safe;
  // all other radius-only cases are blocked until a distance provider is configured.
  if (base) return Boolean(postal && postal === base);
  return false;
}
function activeCompliance(vendor, now = new Date()) {
  if (!vendor?.isActive || vendor?.portalStatus !== 'approved_active') return false;
  if (vendor.rocVerification?.staffReviewRequired || vendor.rocVerification?.status === 'mismatch') return false;
  if (vendor.insuranceExpirationDate && new Date(vendor.insuranceExpirationDate) <= now) return false;
  if (vendor.coiProfile?.expirationDate && new Date(vendor.coiProfile.expirationDate) <= now) return false;
  if (vendor.workersCompProfile?.required !== false && vendor.workersCompProfile?.expirationDate && new Date(vendor.workersCompProfile.expirationDate) <= now) return false;
  if (vendor.rocLicenseExpirationDate && new Date(vendor.rocLicenseExpirationDate) <= now) return false;
  return complianceChecklist(vendor).every(item => item.complete);
}
function evaluateVendorLeadEligibility(vendor, order, property, rules = {}, now = new Date()) {
  const minimumRating = Number(vendor?.leadDistribution?.minimumLeadRatingOverride || rules.minimumRating || 3);
  const minimumPerformanceScore = Number(rules.minimumPerformanceScore || 50);
  const tradeMatched = tradeMatches(vendor, order);
  const serviceAreaMatched = serviceAreaMatches(vendor, order, property);
  const complianceCurrent = activeCompliance(vendor, now);
  const rating = Number(vendor?.rating || 0);
  const performanceScore = Number(vendor?.leadDistribution?.performanceScore ?? 100);
  const reasons = [];
  if (!tradeMatched) reasons.push('Trade classification does not match the order service');
  if (!serviceAreaMatched) reasons.push('Property is outside the configured service area');
  if (!complianceCurrent) reasons.push('Vendor compliance is not active and current');
  if (vendor?.leadDistribution?.paused) reasons.push('Lead distribution is paused');
  if (rating < minimumRating) reasons.push('Vendor rating is below the distribution threshold');
  if (performanceScore < minimumPerformanceScore) reasons.push('Vendor performance score is below the distribution threshold');
  return { eligible: reasons.length === 0, reasons, snapshot: { tradeMatched, serviceAreaMatched, complianceStatus: complianceCurrent ? 'current' : 'blocked', rating, performanceScore, evaluatedAt: now } };
}
function distributionKey(orderId, vendorId, idempotencyKey) { return crypto.createHash('sha256').update(`${orderId}:${vendorId}:${idempotencyKey}`).digest('hex'); }

module.exports = { activeCompliance, addressPostalCode, distributionKey, evaluateVendorLeadEligibility, serviceAreaMatches, tradeMatches };
