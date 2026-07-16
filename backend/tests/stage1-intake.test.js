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
  signatureFor,
  validatePayload,
  verifyWebhookSignature
} = require('../utils/websiteIntake');

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
