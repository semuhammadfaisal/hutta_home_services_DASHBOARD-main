const crypto = require('crypto');
const Counter = require('../models/Counter');

const COMPLETION_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const SATISFACTION_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FOLLOWUP_DELAY_MS = 48 * 60 * 60 * 1000;
const MAX_FILES_PER_CATEGORY = 10;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_PUBLIC_BODY_BYTES = 110 * 1024 * 1024;

const cleanText = (value, max = 5000) => String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
const sha256 = value => crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
const generateToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = value => sha256(value);
function encryptionKey() {
  const secret = String(process.env.CLOSEOUT_TOKEN_SECRET || process.env.QUOTE_TOKEN_ENCRYPTION_SECRET || process.env.TAX_ID_ENCRYPTION_KEY || process.env.HUTTAS_WEBHOOK_SECRET || '');
  if (secret.length < 32) throw new Error('A closeout token encryption secret of at least 32 characters is required');
  return crypto.createHash('sha256').update(`closeout-token:${secret}`).digest();
}
function encryptToken(token) {
  const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(String(token), 'utf8'), cipher.final()]);
  return { data: data.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}
function decryptToken(value) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(value.data, 'base64')), decipher.final()]).toString('utf8');
}
async function nextReference(kind, prefix, session) {
  const year = new Date().getUTCFullYear();
  const counter = await Counter.findOneAndUpdate({ _id: `${kind}:${year}` }, { $inc: { value: 1 } }, { new: true, upsert: true, session, setDefaultsOnInsert: true });
  return `${prefix}-${year}-${String(counter.value).padStart(6, '0')}`;
}
const nextCompletionReference = session => nextReference('job-completion', 'CMP', session);
const nextInvoiceNumber = session => nextReference('customer-invoice', 'INV', session);
const nextPaymentId = session => nextReference('stage6-payment', 'PAY', session);
function completionSnapshot(value) {
  return {
    completionReference: value.completionReference,
    orderId: String(value.orderId),
    jobScheduleId: String(value.jobScheduleId),
    outgoingQuoteId: String(value.outgoingQuoteId),
    source: value.source,
    completionNotes: value.completionNotes || '',
    completedAt: new Date(value.completedAt).toISOString(),
    vendorEnteredName: value.vendorEnteredName || '',
    beforePhotos: (value.beforePhotos || []).map(file => ({ documentId: file.documentId, name: file.name, type: file.type, size: file.size })),
    afterPhotos: (value.afterPhotos || []).map(file => ({ documentId: file.documentId, name: file.name, type: file.type, size: file.size })),
    customerSnapshot: value.customerSnapshot,
    vendorSnapshot: value.vendorSnapshot,
    scheduleSnapshot: value.scheduleSnapshot,
    jobSnapshot: value.jobSnapshot,
    approvedTotal: value.approvedTotal
  };
}
const completionSnapshotHash = value => sha256(JSON.stringify(completionSnapshot(value)));
function invoiceSnapshotHash(value) {
  return sha256(JSON.stringify({
    invoiceNumber: value.invoiceNumber,
    orderId: String(value.orderId),
    jobCompletionId: String(value.jobCompletionId),
    amount: value.amount,
    issuedAt: new Date(value.issuedAt).toISOString(),
    dueDate: new Date(value.dueDate).toISOString(),
    terms: value.terms,
    companySnapshot: value.companySnapshot,
    customerSnapshot: value.customerSnapshot,
    jobSnapshot: value.jobSnapshot,
    quoteSnapshot: value.quoteSnapshot
  }));
}
function parseSatisfaction(body = {}) {
  const action = cleanText(body.action, 40); const issueMessage = cleanText(body.issueMessage, 3000); const errors = [];
  if (!['satisfied', 'report_issue'].includes(action)) errors.push('Choose satisfied or report issue');
  if (action === 'report_issue' && issueMessage.length < 10) errors.push('Issue details must contain at least 10 characters');
  return { payload: { decision: action === 'report_issue' ? 'issue_reported' : 'satisfied', issueMessage }, errors };
}
module.exports = { COMPLETION_TOKEN_TTL_MS, SATISFACTION_TOKEN_TTL_MS, FOLLOWUP_DELAY_MS, MAX_FILES_PER_CATEGORY, MAX_FILE_BYTES, MAX_PUBLIC_BODY_BYTES, cleanText, sha256, generateToken, hashToken, encryptToken, decryptToken, nextCompletionReference, nextInvoiceNumber, nextPaymentId, completionSnapshotHash, invoiceSnapshotHash, parseSatisfaction };
