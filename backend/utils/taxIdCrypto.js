const crypto = require('crypto');

function encryptionKey() {
  const configured = String(process.env.TAX_ID_ENCRYPTION_KEY || '').trim();
  if (!configured) throw new Error('TAX_ID_ENCRYPTION_KEY is required');
  if (/^[a-f0-9]{64}$/i.test(configured)) return Buffer.from(configured, 'hex');
  const decoded = Buffer.from(configured, 'base64');
  if (decoded.length === 32) return decoded;
  throw new Error('TAX_ID_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters or base64');
}

function normalizeTaxId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function encryptTaxId(value) {
  const normalized = normalizeTaxId(value);
  if (!normalized) return null;
  if (normalized.length < 4 || normalized.length > 20) throw new Error('Invalid EIN or Tax ID');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    last4: normalized.slice(-4)
  };
}

function decryptTaxId(payload) {
  if (!payload?.encrypted || !payload?.iv || !payload?.tag) return null;
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.encrypted, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

function maskedTaxId(last4) {
  return last4 ? `***-**-${last4}` : '';
}

module.exports = { encryptTaxId, decryptTaxId, maskedTaxId, normalizeTaxId };
