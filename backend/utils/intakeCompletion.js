const crypto = require('crypto');

const INTAKE_COMPLETION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function cleanText(value, max = 5000) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function tokenEncryptionKey() {
  const secret = String(process.env.INTAKE_COMPLETION_TOKEN_SECRET || process.env.QUOTE_TOKEN_ENCRYPTION_SECRET || process.env.TAX_ID_ENCRYPTION_KEY || process.env.HUTTAS_WEBHOOK_SECRET || '');
  if (secret.length < 32) throw new Error('An intake completion token secret of at least 32 characters is required');
  return crypto.createHash('sha256').update(`intake-completion-token:${secret}`).digest();
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

function parseCompletionPayload(body = {}) {
  const payload = {
    serviceCategory: cleanText(body.serviceCategory, 160),
    serviceAddress: cleanText(body.serviceAddress, 500),
    serviceDetails: cleanText(body.serviceDetails, 5000),
    propertyType: cleanText(body.propertyType, 80),
    preferredTiming: cleanText(body.preferredTiming, 500),
    accessInstructions: cleanText(body.accessInstructions, 2000)
  };
  const errors = [];
  if (!payload.serviceCategory) errors.push('Service category is required');
  if (!payload.serviceAddress) errors.push('Service address is required');
  if (payload.serviceDetails.length < 5) errors.push('Please provide service details');
  return { payload, errors };
}

module.exports = {
  INTAKE_COMPLETION_TTL_MS,
  cleanText,
  decryptToken,
  encryptToken,
  generateToken,
  hashToken,
  parseCompletionPayload
};
