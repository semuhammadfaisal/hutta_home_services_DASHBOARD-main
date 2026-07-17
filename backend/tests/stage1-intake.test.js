const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const EmailOutbox = require('../models/EmailOutbox');
const IntakeSubmission = require('../models/IntakeSubmission');
const Order = require('../models/Order');
const {
  MAX_BODY_BYTES,
  SIGNATURE_TOLERANCE_MS,
  isForminatorConnectionProbe,
  mapForminatorPayload,
  safeSecretEqual,
  signatureFor,
  validatePayload,
  verifyWebhookSignature
} = require('../utils/websiteIntake');

test('Forminator native payload maps configured field IDs and creates a stable identifier', () => {
  const rawBody = Buffer.from('{"form_id":"1029","entry_id":"44","name-1":"Jane Customer","phone-1":"4801234567","email-1":"jane@example.com","textarea-1":"Landscaping","consent-1":"on"}');
  const mapped = mapForminatorPayload(JSON.parse(rawBody), rawBody, new Date('2026-07-17T10:00:00.000Z'));
  assert.equal(mapped.externalSubmissionId, 'forminator-1029-44');
  assert.equal(mapped.name, 'Jane Customer');
  assert.equal(mapped.phone, '4801234567');
  assert.equal(mapped.email, 'jane@example.com');
  assert.equal(mapped.serviceDetails, 'Landscaping');
  assert.equal(mapped.marketingSmsConsent, true);
});

test('Forminator mapping supports nested field arrays and body-fingerprint fallback', () => {
  const body = { fields: [
    { name: 'name-1', value: 'Nested Customer' },
    { name: 'phone-1', value: '480 555 1212' },
    { name: 'email-1', value: 'nested@example.com' }
  ] };
  const first = mapForminatorPayload(body, Buffer.from(JSON.stringify(body)));
  const second = mapForminatorPayload(body, Buffer.from(JSON.stringify(body)));
  assert.equal(first.name, 'Nested Customer');
  assert.equal(first.externalSubmissionId, second.externalSubmissionId);
});

test('Forminator native underscore field IDs map to the Stage 1 contract', () => {
  const body = {
    name_1: 'Native Customer',
    phone_1: '(480) 555-0199',
    email_1: 'native@example.com',
    textarea_1: 'Native webhook request',
    consent_1: '1',
    entry_time: '2026-07-17 06:25:00'
  };
  const mapped = mapForminatorPayload(body, Buffer.from(JSON.stringify(body)));
  assert.equal(mapped.name, 'Native Customer');
  assert.equal(mapped.phone, '(480) 555-0199');
  assert.equal(mapped.email, 'native@example.com');
  assert.equal(mapped.serviceDetails, 'Native webhook request');
  assert.equal(mapped.marketingSmsConsent, true);
  assert.equal(mapped.submittedAt, '2026-07-17 06:25:00');
});

test('Forminator webhook key uses constant-time equality semantics', () => {
  assert.equal(safeSecretEqual('separate-long-secret', 'separate-long-secret'), true);
  assert.equal(safeSecretEqual('wrong', 'separate-long-secret'), false);
  assert.equal(safeSecretEqual('', ''), false);
});

test('Forminator connection probes are acknowledged without treating partial submissions as probes', () => {
  assert.equal(isForminatorConnectionProbe('true'), true);
  assert.equal(isForminatorConnectionProbe('TRUE'), true);
  assert.equal(isForminatorConnectionProbe(undefined), false);
});

test('website payload validation normalizes customer data and keeps consent separate', () => {
  const { payload, errors } = validatePayload({
    externalSubmissionId: 'request-12345678',
    submittedAt: '2026-07-15T11:06:00.000Z',
    name: '  Jane Customer  ',
    phone: '+1 (480) 123-4567',
    email: ' JANE@EXAMPLE.COM ',
    serviceDetails: '  Landscaping request  ',
    marketingSmsConsent: true
  });
  assert.deepEqual(errors, []);
  assert.equal(payload.name, 'Jane Customer');
  assert.equal(payload.phone, '4801234567');
  assert.equal(payload.email, 'jane@example.com');
  assert.equal(payload.marketingSmsConsent, true);
});

test('website payload rejects missing and malformed required fields', () => {
  const { errors } = validatePayload({ externalSubmissionId: 'short', submittedAt: 'bad', email: 'bad' });
  assert.ok(errors.length >= 5);
  assert.equal(MAX_BODY_BYTES, 32 * 1024);
});

test('HMAC verification accepts exact current bytes and rejects tampering and replay', () => {
  const secret = 'a-secure-test-secret-that-is-long-enough';
  const timestamp = '1770000000';
  const now = Number(timestamp) * 1000;
  const body = Buffer.from('{"name":"Jane"}');
  const signature = signatureFor(body, timestamp, secret);
  assert.equal(verifyWebhookSignature({ rawBody: body, timestamp, signature, secret, now }), true);
  assert.equal(verifyWebhookSignature({ rawBody: Buffer.from('{"name":"John"}'), timestamp, signature, secret, now }), false);
  assert.equal(verifyWebhookSignature({ rawBody: body, timestamp, signature, secret, now: now + SIGNATURE_TOLERANCE_MS + 1 }), false);
});

test('Order schema supports unquoted website requests while manual defaults remain quoted', () => {
  const websiteOrder = new Order({
    orderId: 'ORD-000001', customer: { name: 'Jane' }, service: 'Unclassified Website Request',
    amount: null, source: 'website', pricingStatus: 'unquoted', workflowStatus: 'request_received'
  });
  assert.equal(websiteOrder.validateSync(), undefined);
  assert.equal(websiteOrder.amount, null);
  assert.equal(websiteOrder.pricingStatus, 'unquoted');

  const manualOrder = new Order({ orderId: 'ORD-000002', customer: { name: 'Manual' }, service: 'Plumbing', amount: 100 });
  assert.equal(manualOrder.validateSync(), undefined);
  assert.equal(manualOrder.source, 'manual');
  assert.equal(manualOrder.pricingStatus, 'quoted');
});

test('intake and outbox schemas enforce idempotency and durable delivery states', () => {
  assert.ok(IntakeSubmission.schema.indexes().some(([fields, options]) => fields.externalSubmissionId === 1 && options.unique));
  assert.ok(EmailOutbox.schema.indexes().some(([fields, options]) => fields.dedupeKey === 1 && options.unique));
  assert.ok(EmailOutbox.schema.path('status').enumValues.includes('permanently_failed'));
});

test('public webhook is mounted before the authenticated API boundary and does not create payments', () => {
  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const intake = fs.readFileSync(path.join(__dirname, '../utils/websiteIntake.js'), 'utf8');
  assert.ok(server.indexOf("app.use('/api/integrations'") < server.indexOf("app.use('/api', authenticateToken)"));
  assert.doesNotMatch(intake, /models\/Payment|new Payment|Payment\.create/);
  assert.match(intake, /workflowStatus: 'request_received'/);
  assert.match(intake, /pricingStatus: 'unquoted'/);
});

test('Workflow Center exposes website source and unquoted UI states', () => {
  const dashboard = fs.readFileSync(path.join(__dirname, '../../assets/js/dashboard-script.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../../pages/admin-dashboard.html'), 'utf8');
  assert.match(html, /id="workflow-center"/);
  assert.match(html, />Request Received</);
  assert.match(dashboard, /pricingStatus === 'unquoted' \? 'Unquoted'/);
  assert.match(dashboard, /loadWorkflowCenter/);
});
