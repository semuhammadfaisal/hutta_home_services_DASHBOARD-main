const crypto = require('crypto');
const limits = { label: 120, addressLine1: 240, addressLine2: 240, city: 120, state: 80, postalCode: 24, country: 80, propertyType: 80 };
function validateProperty(body = {}) {
  const data = {}; const errors = [];
  for (const [field, limit] of Object.entries(limits)) {
    if (body[field] != null && typeof body[field] !== 'string') errors.push(`${field} must be text`);
    data[field] = typeof body[field] === 'string' ? body[field].trim().replace(/\s+/g, ' ') : '';
    if (data[field].length > limit) errors.push(`${field} is too long`);
  }
  data.country = data.country || 'US'; data.label = data.label || 'My property';
  for (const field of ['addressLine1', 'city', 'state', 'postalCode']) if (!data[field]) errors.push(`${field} is required`);
  if (body.confirmAuthority !== true) errors.push('Confirm that you own this property or are authorized to manage it');
  const address = ['addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country'].map(field => data[field].toLowerCase());
  return { data, errors, addressKey: crypto.createHash('sha256').update(JSON.stringify(address)).digest('hex') };
}
function exactText(value) { return new RegExp(`^\\s*${String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}\\s*$`, 'i'); }
module.exports = { validateProperty, exactText };
