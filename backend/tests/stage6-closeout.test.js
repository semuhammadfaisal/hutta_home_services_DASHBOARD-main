const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const JobCompletion = require('../models/JobCompletion');
const CustomerInvoice = require('../models/CustomerInvoice');
const CustomerSatisfactionDecision = require('../models/CustomerSatisfactionDecision');
const CloseoutSettings = require('../models/CloseoutSettings');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const PaymentProofSubmission = require('../models/PaymentProofSubmission');
const EmailOutbox = require('../models/EmailOutbox');
const {
  generateToken,
  hashToken,
  completionSnapshotHash,
  invoiceSnapshotHash,
  evidenceSnapshotHash,
  parseSatisfaction,
  FOLLOWUP_DELAY_MS
} = require('../utils/closeout');
const { createCustomerInvoicePdf } = require('../utils/invoicePdf');
const { createPaymentReceiptPdf } = require('../utils/receiptPdf');
const { buildPublicUrl } = require('../utils/publicAppUrl');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Stage 6 schemas expose completion, invoice, satisfaction, Order, and Payment states', () => {
  assert.deepEqual(JobCompletion.schema.path('status').enumValues, ['pending', 'completed', 'voided']);
  assert.equal(CustomerInvoice.schema.path('amount').options.immutable, true);
  assert.equal(CustomerSatisfactionDecision.schema.path('decision').options.immutable, true);
  for (const state of ['awaiting_customer_closeout', 'completed', 'closeout_issue_reported']) {
    assert.ok(Order.schema.path('workflowStatus').enumValues.includes(state));
  }
  for (const field of ['jobCompletionId', 'customerInvoiceId', 'satisfactionDecisionId', 'paymentProofSubmissionId', 'closeoutRequestedAt', 'completedAt', 'completedBy', 'satisfactionStatus', 'satisfactionFollowupSentAt']) {
    assert.ok(Order.schema.path(field), `Order.${field} should exist`);
  }
  for (const field of ['closeoutFirstViewedAt', 'closeoutLastViewedAt', 'closeoutViewCount']) {
    assert.ok(JobCompletion.schema.path(field), `JobCompletion.${field} should exist`);
  }
  assert.deepEqual(Payment.schema.path('source').enumValues, ['manual', 'stage6_invoice']);
  for (const field of ['customerInvoiceId', 'jobCompletionId', 'outgoingQuoteId', 'invoiceIssuedAt']) {
    assert.ok(Payment.schema.path(field), `Payment.${field} should exist`);
  }
  assert.deepEqual(PaymentProofSubmission.schema.path('status').enumValues, ['pending_review', 'verified', 'rejected', 'superseded']);
  assert.ok(CloseoutSettings.schema.path('paymentMethods'));
  assert.ok(CustomerInvoice.schema.path('paymentInstructionsSnapshot'));
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
    companySnapshot: { name: 'smplfix' },
    customerSnapshot: { name: 'Customer' },
    jobSnapshot: { service: 'Landscaping' },
    quoteSnapshot: { quoteReference: 'OQ-1' }
  };
  assert.equal(invoiceSnapshotHash(invoice), invoiceSnapshotHash({ ...invoice }));
  assert.notEqual(invoiceSnapshotHash(invoice), invoiceSnapshotHash({ ...invoice, amount: 251 }));
  const evidence = { ...completion, completionSnapshotHash: completionSnapshotHash(completion) };
  assert.equal(evidenceSnapshotHash(evidence), evidenceSnapshotHash({ ...evidence }));
});

test('customer closeout validation requires identity, confirmation, or a meaningful issue', () => {
  assert.equal(parseSatisfaction({ action: 'satisfied', typedName: 'Customer Name', completionConfirmed: true }).errors.length, 0);
  assert.equal(parseSatisfaction({ action: 'report_issue', typedName: 'Customer Name', issueMessage: 'The gate was left open.' }).errors.length, 0);
  assert.match(parseSatisfaction({ action: 'satisfied', typedName: '', completionConfirmed: false }).errors.join(' '), /full name/i);
  assert.match(parseSatisfaction({ action: 'report_issue', typedName: 'Customer Name', issueMessage: 'short' }).errors.join(' '), /10 characters/);
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
    'staff_closeout_issue_resolved',
    'customer_closeout_review',
    'customer_closeout_followup',
    'customer_closeout_confirmation',
    'customer_closeout_issue_confirmation',
    'customer_closeout_issue_resolved',
    'customer_payment_proof_received',
    'staff_payment_proof_alert',
    'customer_payment_proof_verified',
    'customer_payment_proof_rejected'
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
  assert.match(route, /synchronizeWorkflowOrder\(order,'awaiting_customer_closeout'/);
  assert.doesNotMatch(route, /cannot be completed before the confirmed start time/i);
  assert.match(route, /nextAttemptAt:new Date\(now\.getTime\(\)\+FOLLOWUP_DELAY_MS\)/);
  assert.match(route, /customer_closeout_followup/);
  assert.match(route, /router\.post\('\/public\/payment-proof'/);
  assert.match(route, /router\.get\('\/public\/evidence\/:documentId'/);
  assert.match(route, /synchronizePaymentStage/);
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
  const satisfactionCss = read('assets/css/customer-closeout.css');
  assert.match(completionPage, /Before photos/);
  assert.match(completionPage, /After photos/);
  assert.match(completionJs, /location\.hash/);
  assert.match(completionJs, /X-Vendor-Completion-Token/);
  assert.doesNotMatch(completionJs, /\?token=/);
  assert.match(satisfactionPage, /Confirm Work Complete/);
  assert.match(satisfactionPage, /Report an Issue/);
  assert.match(satisfactionPage, /Invoice &amp; payment/);
  assert.match(satisfactionPage, /id="paymentProofForm"/);
  assert.match(satisfactionPage, /closeout-public-hero-copy/);
  assert.match(satisfactionJs, /X-Customer-Satisfaction-Token/);
  assert.doesNotMatch(satisfactionJs, /\?token=/);
  assert.match(satisfactionCss, /grid-template-columns:minmax\(0,1\.2fr\) minmax\(350px,.8fr\)/);
  assert.match(satisfactionCss, /#confirm-work\{grid-column:1/);
  assert.match(satisfactionCss, /#invoice-payment\{grid-column:2/);
});

test('customer closeout email sends working Resend inline evidence attachments', () => {
  const worker = read('backend/utils/intakeEmailWorker.js');
  const email = read('backend/utils/emailService.js');
  assert.match(worker, /inlineContentId:contentId/);
  assert.match(worker, /contentType:'image\/jpeg'/);
  assert.doesNotMatch(worker, /return \{filename:`\$\{label\}\.jpg`,content,contentId\}/);
  assert.match(email, /item\.inlineContentId === 'before-evidence'/);
  assert.match(email, /item\.inlineContentId === 'after-evidence'/);
  assert.match(email, /src="cid:before-evidence"/);
  assert.match(email, /src="cid:after-evidence"/);
});

test('Workflow Center renders six stages and the full closeout workspace', () => {
  const html = read('pages/admin-dashboard.html');
  const hub = read('assets/js/workflow-hub.js');
  const ui = read('assets/js/closeout.js');
  const css = read('assets/css/workflow-reference.css');
  assert.match(html, /id="closeout"/);
  assert.match(html, /Completion &amp; Closeout/);
  assert.match(html, /id="closeoutStaffForm"/);
  assert.match(html, /id="closeoutPaymentProofPanel"/);
  assert.match(hub, /stage: 6/);
  assert.match(hub, /workflow-reference-tabs/);
  assert.match(css, /workflow-reference-tabs/);
  assert.match(css, /workflow-tab/);
  assert.match(ui, /completeCloseoutOrder/);
  assert.match(ui, /resolveCloseoutIssue/);
  assert.match(ui, /verifyPaymentProof/);
  assert.match(ui, /openCloseoutSettings/);
});

test('Stage 6 payment settings use an accessible customer-facing configuration workspace', () => {
  const html = read('pages/admin-dashboard.html');
  const ui = read('assets/js/closeout.js');
  const css = read('assets/css/closeout.css');
  assert.match(html, /closeout\.css\?v=20260806-workflow-monochrome/);
  assert.match(ui, /aria-labelledby/);
  assert.match(ui, /closeout-settings-notice/);
  assert.match(ui, /closeout-method-card/);
  assert.match(ui, /data-enabled-count/);
  assert.match(ui, /Every enabled payment method needs a customer label and instructions/);
  assert.match(css, /\.closeout-method-switch/);
  assert.match(css, /\.closeout-copy-card/);
  assert.match(css, /@media\(max-width:700px\)/);
});

test('Stage 6 records secure-page engagement and displays customer submissions to staff', () => {
  const route = read('backend/routes/closeout.js');
  const ui = read('assets/js/closeout.js');
  const css = read('assets/css/closeout.css');
  assert.match(route, /\$min:\{closeoutFirstViewedAt:viewedAt\}/);
  assert.match(route, /\$set:\{closeoutLastViewedAt:viewedAt\}/);
  assert.match(route, /\$inc:\{closeoutViewCount:1\}/);
  assert.match(ui, /Review and checkout progress/);
  assert.match(ui, /Customer opened the secure closeout page/);
  assert.match(ui, /Customer submitted/);
  assert.match(ui, /Payment proof/);
  assert.match(ui, /proof\.payerName/);
  assert.match(ui, /proof\.transactionReference/);
  assert.match(ui, /proof\.proofImages/);
  assert.match(css, /\.closeout-engagement-grid/);
});

test('invoice PDF is generated from the immutable invoice snapshot', async () => {
  const pdf = await createCustomerInvoicePdf({
    invoiceNumber: 'INV-2026-000001',
    amount: 251.99,
    issuedAt: new Date('2026-07-23T12:00:00.000Z'),
    dueDate: new Date('2026-07-23T12:00:00.000Z'),
    terms: 'Due on receipt',
    companySnapshot: { name: 'smplfix', email: 'sales@smplfix.com' },
    customerSnapshot: { name: 'Customer', email: 'customer@example.com', address: '123 Main St' },
    jobSnapshot: { service: 'Landscaping', scopeOfWork: 'Approved scope' },
    quoteSnapshot: { quoteReference: 'OQ-2026-000001', revisionNumber: 1 },
    paymentInstructionsSnapshot: {
      paymentMethods: [{ key: 'bank_transfer', label: 'Bank transfer', instructions: 'Use the invoice number as the reference.', enabled: true }],
      remittanceContact: 'sales@smplfix.com',
      proofUploadInstructions: 'Upload transaction proof through the secure closeout page.'
    }
  });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 1000);
});

test('payment receipt PDF uses received payment data', async () => {
  const pdf = await createPaymentReceiptPdf({
    paymentId: 'PAY-0042',
    receiptNumber: 'RCPT-2026-0042',
    invoiceNumber: 'INV-2026-000001',
    amount: 251.99,
    status: 'received',
    paymentMethod: 'bank-transfer',
    paymentDate: new Date('2026-07-23T12:00:00.000Z'),
    transactionId: 'BANK-123',
    description: 'Landscaping service',
    customer: { name: 'Customer', email: 'customer@example.com' },
    order: { orderId: 'ORD-0042', service: 'Landscaping' }
  });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 1000);
});

test('received payments expose the receipt PDF endpoint', () => {
  const route = read('backend/routes/payments.js');
  const ui = read('assets/js/dashboard-script.js');
  assert.match(route, /router\.get\('\/:id\/receipt\.pdf'/);
  assert.match(route, /createPaymentReceiptPdf/);
  assert.match(route, /\['received', 'completed'\]\.includes\(payment\.status\)/);
  assert.match(ui, /Download Receipt/);
  assert.match(ui, /receipt\.pdf/);
});

test('Stage 6 email links always use deployed HTTPS fragments and reject localhost', () => {
  const previous = { PUBLIC_APP_URL: process.env.PUBLIC_APP_URL, FRONTEND_URL: process.env.FRONTEND_URL };
  try {
    process.env.PUBLIC_APP_URL = 'https://app.smplfix.com';
    delete process.env.FRONTEND_URL;
    assert.equal(
      buildPublicUrl('/pages/vendor-completion.html', 'token=secret'),
      'https://app.smplfix.com/pages/vendor-completion.html#token=secret'
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

test('Stage 6 customer closeout migration manages only its new or changed indexes', () => {
  const migration = read('backend/migrate-stage6-customer-closeout.js');
  assert.match(migration, /CloseoutSettings,\s*PaymentProofSubmission,\s*CustomerSatisfactionDecision/);
  assert.doesNotMatch(migration, /JobCompletion,\s*Order,\s*Payment,\s*EmailOutbox/);
  assert.match(migration, /dropIndex\(legacyUnique\.name\)/);
});
