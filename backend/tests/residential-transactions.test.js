const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const CustomerQuoteDecision = require('../models/CustomerQuoteDecision');
const serializers = require('../utils/residentialSerializers');
const { safePaymentMethod } = require('../utils/paymentProvider');

const objectId = () => new mongoose.Types.ObjectId();

function collectKeys(value, output = []) {
  if (Array.isArray(value)) value.forEach(item => collectKeys(item, output));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => {
    output.push(key.toLowerCase().replace(/[^a-z0-9]/g, ''));
    collectKeys(item, output);
  });
  return output;
}

test('authenticated client decisions use an immutable residential portal source', () => {
  const decision = new CustomerQuoteDecision({
    outgoingQuoteId: objectId(), orderId: objectId(), customerId: objectId(),
    decision: 'approved', typedName: 'Alex Owner', termsAccepted: true,
    decisionAt: new Date(), quoteReference: 'Q-101', revisionNumber: 1,
    consentText: 'Accepted', termsHash: 'a'.repeat(64), quoteSnapshotHash: 'b'.repeat(64),
    source: 'residential_portal'
  });
  assert.equal(decision.validateSync(), undefined);
  assert.equal(decision.source, 'residential_portal');
});

test('workflow tracker derives transactional stages and explicitly marks unsupported live states', () => {
  const pending = serializers.workflowTracker({ workflowStatus: 'quote_sent', currentOutgoingQuoteId: objectId() }, { estimate: {} });
  assert.equal(pending.find(step => step.key === 'request_received').state, 'complete');
  assert.equal(pending.find(step => step.key === 'estimate').state, 'complete');
  assert.equal(pending.find(step => step.key === 'approved').state, 'current');
  assert.equal(pending.find(step => step.key === 'en_route').state, 'unavailable');

  const paid = serializers.workflowTracker(
    { workflowStatus: 'completed', customerApprovedAt: new Date(), scheduleConfirmedAt: new Date(), completedAt: new Date(), customerInvoiceId: objectId(), status: 'in_progress' },
    { payment: { status: 'completed' }, completion: { completedAt: new Date() }, invoice: {} }
  );
  assert.equal(paid.find(step => step.key === 'paid').state, 'complete');
  assert.equal(paid.find(step => step.key === 'in_progress').state, 'complete');
});

test('contractor identity comes from Vendor records and private pricing never reaches portal output', () => {
  const orderId = objectId();
  const vendor = { _id: objectId(), name: 'Verified Vendor LLC', legalBusinessName: 'Verified Legal Name', rocLicenseNumber: 'ROC-9988', rocLicenseTypeClassification: 'C-39' };
  const quote = {
    _id: objectId(), orderId, quoteReference: 'Q-200', status: 'sent', customerDecisionStatus: 'pending', customerTotal: 900,
    vendorSnapshot: { licensedContractorName: 'Typed Wrong Name', rocNumber: 'WRONG' },
    vendorCost: 500, markupAmount: 400, history: [{ actorEmail: 'internal@example.com' }]
  };
  const estimate = serializers.serializeEstimate(quote, vendor);
  assert.equal(estimate.contractor.name, 'Verified Legal Name');
  assert.equal(estimate.contractor.rocNumber, 'ROC-9988');
  assert.doesNotMatch(JSON.stringify(estimate), /Typed Wrong Name|WRONG|vendorCost|markupAmount|internal@example/);

  const invoice = serializers.serializeInvoice({ _id: objectId(), orderId, outgoingQuoteId: quote._id, amount: 900 }, {
    _id: objectId(), status: 'completed', amount: 900, vendorPaymentAmount: 500, transactionId: 'safe-display-reference'
  }, vendor);
  assert.equal(invoice.contractor.rocNumber, 'ROC-9988');
  const keys = collectKeys(invoice);
  serializers.PRIVATE_PORTAL_KEYS.forEach(key => assert.equal(keys.includes(key), false, `${key} leaked`));
  assert.equal(invoice.receiptPdfUrl.startsWith('/api/residential/payments/'), true);
});

test('estimate decisions are client-only, membership-authorized, and current-state constrained', () => {
  const route = read('backend/routes/residential.js');
  const section = route.slice(route.indexOf("router.post('/estimates/:quoteId/decision'"), route.indexOf("router.get('/billing'"));
  assert.match(section, /req\.user\.role !== 'residential'/);
  assert.match(section, /authorizedQuote\(req, res, \{ requireApproval: true \}\)/);
  assert.match(route, /'permissions\.approveEstimates': true/);
  assert.match(route, /membership\.relationship === 'agent'/);
  assert.match(route, /currentOutgoingQuoteId: quote\._id, workflowStatus: 'quote_sent'/);
  assert.match(route, /CustomerQuoteDecision\.create/);
  assert.match(route, /synchronizeWorkflowOrder\(order, wantedDecision === 'approved' \? 'customer_approved' : 'quote_changes_requested'/);
});

test('estimate, invoice, and receipt PDFs all verify residential ownership before generation', () => {
  const route = read('backend/routes/residential.js');
  const estimatePdf = route.slice(route.indexOf("router.get('/estimates/:quoteId/pdf'"), route.indexOf("router.post('/estimates/:quoteId/decision'"));
  const invoicePdf = route.slice(route.indexOf("router.get('/invoices/:invoiceId/pdf'"), route.indexOf("router.get('/payments/:paymentId/receipt.pdf'"));
  const receiptPdf = route.slice(route.indexOf("router.get('/payments/:paymentId/receipt.pdf'"), route.indexOf('router.use((error'));
  assert.match(estimatePdf, /authorizedQuote\(req, res\)/);
  assert.match(estimatePdf, /Vendor\.findById/);
  assert.match(invoicePdf, /Order\.exists\(\{ _id: invoice\.orderId, propertyId: \{ \$in: scope\.propertyIds \} \}\)/);
  assert.match(invoicePdf, /Vendor\.findById/);
  assert.match(receiptPdf, /scope\.membershipByProperty\.has\(String\(payment\.order\.propertyId\)\)/);
  assert.match(receiptPdf, /\['received', 'completed'\]\.includes\(payment\.status\)/);
});

test('hosted payment integration accepts no raw card data and returns only display-safe methods', () => {
  const provider = read('backend/utils/paymentProvider.js');
  const route = read('backend/routes/residential.js');
  const html = read('pages/residential-portal.html');
  const method = safePaymentMethod({ id: 'pm_123', card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030, checks: { cvc_check: 'pass' } } });
  assert.deepEqual(method, { id: 'pm_123', type: 'card', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030, isExpired: false });
  assert.match(provider, /mode: 'setup'/);
  assert.match(provider, /\/billing_portal\/sessions/);
  assert.match(route, /permissions\?\.manageBilling !== true/);
  assert.match(route, /checkout\|billing/);
  assert.match(route, /stripe\\\.com/);
  assert.doesNotMatch(route, /cardNumber|card_number|\bcvc\b|securityCode/i);
  assert.doesNotMatch(html, /autocomplete="cc-number"|name="cardNumber"|name="cvc"/i);
  assert.match(html, /never receives or stores your full card number/i);
});

test('transactional portal UI includes estimates, job tracking, completion evidence, invoices, receipts, and hosted billing', () => {
  const html = read('pages/residential-portal.html');
  const client = read('assets/js/residential-portal.js');
  const css = read('assets/css/residential-portal.css');
  for (const id of ['estimatesView', 'estimatesPageList', 'invoicesView', 'invoiceList', 'billingView', 'paymentMethodList', 'estimateDialog', 'estimateDecisionForm', 'jobDialog']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);
  }
  assert.match(client, /decideResidentialEstimate/);
  assert.match(client, /trackerMarkup/);
  assert.match(client, /state\.schedules\.find\(item => safeId\(item\.orderId\) === safeId\(order\.id\)\)/);
  assert.match(client, /order\.scheduledStart \|\| schedule\?\.proposedStart/);
  assert.match(client, /completion\.completionNotes/);
  assert.match(client, /completion\.beforePhotos/);
  assert.match(client, /completion\.afterPhotos/);
  assert.match(client, /invoice\.receiptPdfUrl/);
  assert.match(client, /createResidentialCardSetupSession/);
  assert.match(client, /checkout\|billing/);
  assert.match(client, /stripe\\\.com/);
  assert.match(css, /\.workflow-tracker/);
  assert.match(css, /\.completion-photos/);
});
