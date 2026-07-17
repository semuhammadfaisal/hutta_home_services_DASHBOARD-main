const crypto = require('crypto');
const Counter = require('../models/Counter');

const TIMEZONE = 'America/Phoenix';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DECISION_BODY_BYTES = 8 * 1024;

function cleanText(value, max = 5000) {
  return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}
function sha256(value) { return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex'); }
function generateToken() { return crypto.randomBytes(32).toString('base64url'); }
function hashToken(value) { return sha256(value); }
function encryptionKey() {
  const secret = String(process.env.QUOTE_TOKEN_ENCRYPTION_SECRET || process.env.TAX_ID_ENCRYPTION_KEY || process.env.HUTTAS_WEBHOOK_SECRET || '');
  if (secret.length < 32) throw new Error('A token encryption secret of at least 32 characters is required');
  return crypto.createHash('sha256').update(`scheduling-token:${secret}`).digest();
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
const nextScheduleReference = session => nextReference('job-schedule', 'SCH', session);
const nextWorkOrderReference = session => nextReference('vendor-work-order', 'WO', session);
function parseProposal(body = {}) {
  const startText = cleanText(body.proposedStart, 80); const endText = cleanText(body.proposedEnd, 80);
  const zoned = value => /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? new Date(value) : null;
  const proposedStart = zoned(startText); const proposedEnd = zoned(endText);
  const payload = { proposedStart, proposedEnd, accessInstructions: cleanText(body.accessInstructions), internalNotes: cleanText(body.internalNotes), conflictAcknowledged: body.conflictAcknowledged === true };
  const errors = [];
  if (!proposedStart || Number.isNaN(proposedStart.getTime())) errors.push('A timezone-qualified proposed start is required');
  if (!proposedEnd || Number.isNaN(proposedEnd.getTime())) errors.push('A timezone-qualified proposed end is required');
  if (proposedStart && proposedStart <= new Date()) errors.push('Proposed start must be in the future');
  if (proposedStart && proposedEnd && proposedEnd <= proposedStart) errors.push('Proposed end must be after proposed start');
  return { payload, errors };
}
function parseDecision(body = {}) {
  const action = cleanText(body.action, 40); const typedName = cleanText(body.typedName, 160); const changeRequestMessage = cleanText(body.changeRequestMessage, 3000);
  const errors = [];
  if (!['accept', 'request_changes'].includes(action)) errors.push('Choose accept or request changes');
  if (typedName.length < 2) errors.push('Full name is required');
  if (action === 'request_changes' && changeRequestMessage.length < 10) errors.push('Change request must contain at least 10 characters');
  return { payload: { action, typedName, changeRequestMessage }, errors };
}
function scheduleSnapshot(schedule) {
  return { scheduleReference: schedule.scheduleReference, revisionNumber: schedule.revisionNumber, orderId: String(schedule.orderId), proposedStart: new Date(schedule.proposedStart).toISOString(), proposedEnd: new Date(schedule.proposedEnd).toISOString(), timezone: schedule.timezone, accessInstructions: schedule.accessInstructions || '', customerSnapshot: schedule.customerSnapshot || {}, vendorSnapshot: schedule.vendorSnapshot || {}, jobSnapshot: schedule.jobSnapshot || {} };
}
function scheduleSnapshotHash(schedule) { return sha256(JSON.stringify(scheduleSnapshot(schedule))); }
function workOrderSnapshotHash(value) { return sha256(JSON.stringify({ workOrderReference: value.workOrderReference, revisionNumber: value.revisionNumber, customerSnapshot: value.customerSnapshot, vendorSnapshot: value.vendorSnapshot, jobSnapshot: value.jobSnapshot, scheduledStart: new Date(value.scheduledStart).toISOString(), scheduledEnd: new Date(value.scheduledEnd).toISOString(), timezone: value.timezone, accessInstructions: value.accessInstructions || '' })); }
function publicSchedule(schedule, decision) {
  return { scheduleReference: schedule.scheduleReference, revisionNumber: schedule.revisionNumber, status: schedule.status, proposedStart: schedule.proposedStart, proposedEnd: schedule.proposedEnd, timezone: schedule.timezone, accessInstructions: schedule.accessInstructions, customer: schedule.customerSnapshot, vendor: { name: schedule.vendorSnapshot?.name }, job: schedule.jobSnapshot, decision: decision ? { decision: decision.decision, typedName: decision.typedName, changeRequestMessage: decision.changeRequestMessage, decisionAt: decision.decisionAt } : null };
}

module.exports = { TIMEZONE, TOKEN_TTL_MS, MAX_DECISION_BODY_BYTES, cleanText, sha256, generateToken, hashToken, encryptToken, decryptToken, nextScheduleReference, nextWorkOrderReference, parseProposal, parseDecision, scheduleSnapshot, scheduleSnapshotHash, workOrderSnapshotHash, publicSchedule };
