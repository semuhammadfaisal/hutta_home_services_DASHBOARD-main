const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const JobCompletion = require('../models/JobCompletion');
const CustomerInvoice = require('../models/CustomerInvoice');
const CustomerSatisfactionDecision = require('../models/CustomerSatisfactionDecision');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const EmailOutbox = require('../models/EmailOutbox');
const {
  generateToken,
  hashToken,
  completionSnapshotHash,
  invoiceSnapshotHash,
  parseSatisfaction,
  FOLLOWUP_DELAY_MS
} = require('../utils/closeout');
const { createCustomerInvoicePdf } = require('../utils/invoicePdf');
const { buildPublicUrl } = require('../utils/publicAppUrl');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Stage 6 schemas expose completion, invoice, satisfaction, Order, and Payment states', () => {
  assert.deepEqual(JobCompletion.schema.path('status').enumValues, ['pending', 'completed', 'voided']);
  assert.equal(CustomerInvoice.schema.path('amount').options.immutable, true);
  assert.equal(CustomerSatisfactionDecision.schema.path('decision').options.immutable, true);
  for (const state of ['completed', 'closeout_issue_reported']) {
    assert.ok(Order.schema.path('workflowStatus').enumValues.includes(state));
  }
  for (const field of ['jobCompletionId', 'customerInvoiceId', 'satisfactionDecisionId', 'completedAt', 'completedBy', 'satisfactionStatus', 'satisfactionFollowupSentAt']) {
    assert.ok(Order.schema.path(field), `Order.${field} should exist`);
  }
  assert.deepEqual(Payment.schema.path('source').enumValues, ['manual', 'stage6_invoice']);
  for (const field of ['customerInvoiceId', 'jobCompletionId', 'outgoingQuoteId', 'invoiceIssuedAt']) {
    assert.ok(Payment.schema.path(field), `Payment.${field} should exist`);
  }
});

test('Stage 6 tokens and immutable hashes are deterministic and content-sensitive', () => {
  const token = generateToken();
  assert.ok(token.length >= 40);
  assert.notEqual(hashToken(token), token);
  const completion = {
    completionReference: 'CMP-2026-000001',
    orderId: '507f1f77bcf86cd799439011',
    jobScheduleId: '507f1f77bcf86cd799439012',
    outgoingQuoteId: '507f1f77bcf86cd799439013',
    source: 'vendor',
    completionNotes: 'Finished',
    completedAt: '2026-07-23T12:00:00.000Z',
    beforePhotos: [],
    afterPhotos: [],
    customerSnapshot: { name: 'Customer' },
    vendorSnapshot: { name: 'Vendor' },
    scheduleSnapshot: { scheduledStart: '2026-07-23T10:00:00.000Z' },
    jobSnapshot: { service: 'Landscaping' },
    approvedTotal: 250
  };
  assert.equal(completionSnapshotHash(completion), completionSnapshotHash({ ...completion }));
  assert.notEqual(completionSnapshotHash(completion), completionSnapshotHash({ ...completion, completionNotes: 'Changed' }));
  const invoice = {
    invoiceNumber: 'INV-2026-000001',
    orderId: completion.orderId,
    jobCompletionId: '507f1f77bcf86cd799439014',
    amount: 250,
    issuedAt: completion.completedAt,
    dueDate: completion.completedAt,
    terms: 'Due on receipt',
    companySnapshot: { name: 'Hutta Home Services' },
    customerSnapshot: { name: 'Customer' },
    jobSnapshot: { service: 'Landscaping' },
    quoteSnapshot: { quoteReference: 'OQ-1' }
  };
  assert.equal(invoiceSnapshotHash(invoice), invoiceSnapshotHash({ ...invoice }));
  assert.notEqual(invoiceSnapshotHash(invoice), invoiceSnapshotHash({ ...invoice, amount: 251 }));
});

test('satisfaction validation supports satisfied or a meaningful reported issue', () => {
  assert.equal(parseSatisfaction({ action: 'satisfied' }).errors.length, 0);
  assert.equal(parseSatisfaction({ action: 'report_issue', issueMessage: 'The gate was left open.' }).errors.length, 0);
  assert.match(parseSatisfaction({ action: 'report_issue', issueMessage: 'short' }).errors.join(' '), /10 characters/);
  assert.equal(FOLLOWUP_DELAY_MS, 48 * 60 * 60 * 1000);
});

test('outbox supports every Stage 6 delivery type and delayed cancellation state', () => {
  const types = [
    'vendor_completion_link',
    'vendor_completion_confirmation',
    'customer_completion_satisfaction',
    'customer_satisfaction_followup',
    'customer_satisfaction_confirmation',
    'customer_issue_confirmation',
    'staff_completion_alert',
    'staff_satisfaction_alert',
    'staff_closeout_issue_alert',
    'staff_closeout_issue_resolved'
  ];
  for (const type of types) assert.ok(EmailOutbox.schema.path('type').enumValues.includes(type));
  assert.ok(EmailOutbox.schema.path('status').enumValues.includes('cancelled'));
});

test('completion transaction is mounted publicly before auth and creates one invoice and Payment', () => {
  const server = read('backend/server.js');
  const route = read('backend/routes/closeout.js');
  assert.ok(server.indexOf("app.use('/api/closeout'") < server.indexOf("app.use('/api', authenticateToken)"));
  assert.ok(route.indexOf("router.post('/public/completion'") < route.indexOf('router.use(authenticateToken,staffRoles)'));
  assert.match(route, /session\.withTransaction/);
  assert.match(route, /CustomerInvoice\.create/);
  assert.match(route, /Payment\.create/);
  assert.match(route, /source:'stage6_invoice'/);
  assert.match(route, /synchronizeWorkflowOrder\(order,'completed'/);
  assert.doesNotMatch(route, /cannot be completed before the confirmed start time/i);
  assert.match(route, /nextAttemptAt:new Date\(now\.getTime\(\)\+FOLLOWUP_DELAY_MS\)/);
  assert.match(route, /customer_satisfaction_followup/);
  const worker = read('backend/utils/intakeEmailWorker.js');
  assert.match(worker, /cleanupCloseoutOrphans/);
  assert.match(worker, /'metadata\.linkStatus': 'pending'/);
  assert.match(worker, /24 \* 60 \* 60 \* 1000/);
});

test('public closeout pages keep tokens in fragments and use request headers', () => {
  const completionPage = read('pages/vendor-completion.html');
  const completionJs = read('assets/js/vendor-completion.js');
  const satisfactionPage = read('pages/customer-satisfaction.html');
  const satisfactionJs = read('assets/js/customer-satisfaction.js');
  assert.match(completionPage, /Before photos/);
  assert.match(completionPage, /After photos/);
  assert.match(completionJs, /location\.hash/);
  assert.match(completionJs, /X-Vendor-Completion-Token/);
  assert.doesNotMatch(completionJs, /\?token=/);
  assert.match(satisfactionPage, /I’m Satisfied/);
  assert.match(satisfactionPage, /Report an Issue/);
  assert.match(satisfactionJs, /X-Customer-Satisfaction-Token/);
  assert.doesNotMatch(satisfactionJs, /\?token=/);
});

test('Workflow Center renders six stages and the full closeout workspace', () => {
  const html = read('pages/admin-dashboard.html');
  const hub = read('assets/js/workflow-hub.js');
  const ui = read('assets/js/closeout.js');
  const css = read('assets/css/workflow-reference.css');
  assert.match(html, /id="closeout"/);
  assert.match(html, /Completion &amp; Closeout/);
  assert.match(html, /id="closeoutStaffForm"/);
  assert.match(hub, /stage: 6/);
  assert.match(hub, /workflow-reference-tabs/);
  assert.match(css, /workflow-reference-tabs/);
  assert.match(css, /workflow-tab/);
  assert.match(ui, /completeCloseoutOrder/);
  assert.match(ui, /resolveCloseoutIssue/);
});

test('invoice PDF is generated from the immutable invoice snapshot', async () => {
  const pdf = await createCustomerInvoicePdf({
    invoiceNumber: 'INV-2026-000001',
    amount: 251.99,
    issuedAt: new Date('2026-07-23T12:00:00.000Z'),
    dueDate: new Date('2026-07-23T12:00:00.000Z'),
    terms: 'Due on receipt',
    companySnapshot: { name: 'Hutta Home Services', email: 'sales@huttas.com' },
    customerSnapshot: { name: 'Customer', email: 'customer@example.com', address: '123 Main St' },
    jobSnapshot: { service: 'Landscaping', scopeOfWork: 'Approved scope' },
    quoteSnapshot: { quoteReference: 'OQ-2026-000001', revisionNumber: 1 }
  });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 1000);
});

test('Stage 6 email links always use deployed HTTPS fragments and reject localhost', () => {
  const previous = { PUBLIC_APP_URL: process.env.PUBLIC_APP_URL, FRONTEND_URL: process.env.FRONTEND_URL };
  try {
    process.env.PUBLIC_APP_URL = 'https://hutta-home-services-dashboard-main.onrender.com';
    delete process.env.FRONTEND_URL;
    assert.equal(
      buildPublicUrl('/pages/vendor-completion.html', 'token=secret'),
      'https://hutta-home-services-dashboard-main.onrender.com/pages/vendor-completion.html#token=secret'
    );
    process.env.PUBLIC_APP_URL = 'http://localhost:10000';
    assert.throws(() => buildPublicUrl('/pages/customer-satisfaction.html', 'token=secret'), /public HTTPS/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
