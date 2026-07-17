const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CustomerQuoteDecision = require('../models/CustomerQuoteDecision');
const OutgoingQuote = require('../models/OutgoingQuote');
const Order = require('../models/Order');
const EmailOutbox = require('../models/EmailOutbox');
const {
  APPROVAL_CONSENT_TEXT,
  parseDecisionPayload,
  quoteSnapshotHash,
  sha256
} = require('../utils/customerQuoteDecisions');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Stage 4 schemas expose immutable decisions and workflow states', () => {
  assert.deepEqual(CustomerQuoteDecision.schema.path('decision').enumValues, ['approved', 'changes_requested']);
  assert.equal(CustomerQuoteDecision.schema.path('typedName').options.immutable, true);
  assert.equal(CustomerQuoteDecision.schema.path('termsHash').options.immutable, true);
  assert.equal(CustomerQuoteDecision.schema.path('quoteSnapshotHash').options.immutable, true);
  assert.ok(CustomerQuoteDecision.schema.indexes().some(([fields, options]) => fields.outgoingQuoteId === 1 && options.unique));
  assert.deepEqual(OutgoingQuote.schema.path('customerDecisionStatus').enumValues, ['not_requested', 'pending', 'approved', 'changes_requested']);
  assert.ok(Order.schema.path('workflowStatus').enumValues.includes('quote_changes_requested'));
  assert.ok(Order.schema.path('workflowStatus').enumValues.includes('customer_approved'));
  assert.ok(Order.schema.path('approvedOutgoingQuoteId'));
});

test('approval and change-request validation enforces required evidence', () => {
  assert.match(APPROVAL_CONSENT_TEXT, /conduct this transaction electronically/);
  assert.equal(parseDecisionPayload({ action: 'approve', typedName: 'Customer Name', termsAccepted: true }).errors.length, 0);
  assert.match(parseDecisionPayload({ action: 'approve', typedName: 'Customer Name', termsAccepted: false }).errors.join(' '), /Terms agreement/);
  assert.equal(parseDecisionPayload({ action: 'request_changes', typedName: 'Customer Name', changeRequestMessage: 'Please update the scope.' }).errors.length, 0);
  assert.match(parseDecisionPayload({ action: 'request_changes', typedName: 'Customer Name', changeRequestMessage: 'short' }).errors.join(' '), /10 characters/);
});

test('protected quote and terms hashes are deterministic and content-sensitive', () => {
  const quote = { quoteReference: 'OQ-2026-1', revisionNumber: 1, customerSnapshot: { name: 'Customer' }, customerTotal: 125, termsAndConditions: 'Terms A', validUntil: '2026-12-01', sentAt: '2026-07-17' };
  assert.equal(sha256('Terms A'), sha256('Terms A'));
  assert.notEqual(sha256('Terms A'), sha256('Terms B'));
  assert.equal(quoteSnapshotHash(quote), quoteSnapshotHash({ ...quote }));
  assert.notEqual(quoteSnapshotHash(quote), quoteSnapshotHash({ ...quote, customerTotal: 126 }));
});

test('public decision route precedes CRM authentication and atomically records decisions', () => {
  const route = read('backend/routes/outgoingQuotes.js');
  assert.ok(route.indexOf("router.post('/public/decision'") < route.indexOf('router.use(authenticateToken, staffRoles)'));
  assert.match(route, /session\.withTransaction/);
  assert.match(route, /currentOutgoingQuoteId: quote\._id/);
  assert.match(route, /workflowStatus: 'quote_sent'/);
  assert.match(route, /order\.workflowStatus = 'customer_approved'/);
  assert.match(route, /order\.workflowStatus = 'quote_changes_requested'/);
  assert.match(route, /status: 409/);
  assert.doesNotMatch(route, /require\('\.\.\/models\/(Payment|Invoice|Schedule)'\)|Payment\.create|Invoice\.create/);
});

test('Stage 4 outbox types and dedicated recipient fallback are connected', () => {
  const worker = read('backend/utils/intakeEmailWorker.js');
  const email = read('backend/utils/emailService.js');
  const route = read('backend/routes/outgoingQuotes.js');
  for (const type of ['customer_quote_approval_confirmation', 'staff_quote_approval_alert', 'customer_quote_change_confirmation', 'staff_quote_change_alert']) {
    assert.ok(EmailOutbox.schema.path('type').enumValues.includes(type));
    assert.match(worker, new RegExp(type));
  }
  assert.match(route, /QUOTE_APPROVAL_NOTIFICATION_EMAILS/);
  assert.match(route, /INTAKE_NOTIFICATION_EMAILS/);
  assert.match(email, /approval does not confirm scheduling/i);
});

test('customer page provides approval, change request, and locked success states without internal pricing', () => {
  const html = read('pages/customer-quote.html');
  const js = read('assets/js/customer-quote.js');
  assert.match(html, /Full name/);
  assert.match(html, /Approve Quote/);
  assert.match(html, /Request Changes/);
  assert.match(js, /termsAccepted/);
  assert.match(js, /changeRequestMessage/);
  assert.match(js, /public\/decision/);
  assert.doesNotMatch(html + js, /vendorCost|markupAmount|markupValue/);
});

test('Workflow Center includes Customer Approvals, audit evidence, revisions, and email retry', () => {
  const html = read('pages/admin-dashboard.html');
  const js = read('assets/js/customer-approvals.js');
  const api = read('assets/js/api-service.js');
  assert.match(html, /id="customer-approvals"/);
  assert.match(html, /Customer Approvals/);
  assert.match(js, /Immutable customer decision/);
  assert.match(js, /Create Revision/);
  assert.match(js, /Retry Email/);
  assert.match(api, /getCustomerApprovals/);
  assert.match(api, /retryCustomerApprovalEmail/);
});

test('approved sent quotes cannot be revised, resent, or voided', () => {
  const route = read('backend/routes/outgoingQuotes.js');
  const ui = read('assets/js/outgoing-quotes.js');
  assert.match(route, /customerDecisionStatus: \{ \$ne: 'approved' \}/);
  assert.match(route, /customerDecisionStatus: 'pending'/);
  assert.match(ui, /customerDecisionStatus === 'approved'/);
  assert.match(ui, /customerDecisionStatus === 'changes_requested'/);
});
