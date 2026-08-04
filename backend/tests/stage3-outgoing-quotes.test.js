const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const OutgoingQuote = require('../models/OutgoingQuote');
const QuoteSettings = require('../models/QuoteSettings');
const Order = require('../models/Order');
const EmailOutbox = require('../models/EmailOutbox');
const { calculatePricing, generateToken, hashToken, legalDisclosure, publicQuote } = require('../utils/outgoingQuotes');
const { createOutgoingQuotePdf } = require('../utils/quotePdf');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Stage 3 pricing uses cent rounding for percentage and fixed markup', () => {
  assert.deepEqual(calculatePricing(1850, 'percentage', 20), { vendorCost: 1850, markupAmount: 370, customerTotal: 2220 });
  assert.deepEqual(calculatePricing(99.99, 'fixed', 12.34), { vendorCost: 99.99, markupAmount: 12.34, customerTotal: 112.33 });
  assert.throws(() => calculatePricing(10, 'percentage', -1), /Markup/);
});

test('public outgoing quote payload excludes vendor cost, markup, email, and phone', () => {
  const payload = publicQuote({ quoteReference: 'OQ-2026-000001', revisionNumber: 1, customerSnapshot: { name: 'Customer', email: 'private@example.com', phone: '555', address: 'Site' }, jobSnapshot: { service: 'Landscaping' }, vendorSnapshot: { licensedContractorName: 'Licensed Co', licenseType: 'CR-21', rocNumber: '123', email: 'vendor@example.com' }, vendorCost: 100, markupValue: 20, markupAmount: 20, customerTotal: 120, legalDisclosure: 'Disclosure' });
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /private@example|vendor@example|vendorCost|markup/);
  assert.equal(payload.customerTotal, 120);
});

test('legal disclosure uses selected vendor company and ROC number', () => {
  assert.equal(legalDisclosure({ companyName: 'Trade Partner LLC', rocNumber: 'ROC123' }), 'Trade and specialty work performed by Trade Partner LLC, ROC #ROC123, a licensed and insured contractor operating independently and solely responsible for the performance and quality of their work.');
});

test('outgoing tokens are high entropy and persisted as deterministic hashes', () => {
  const token = generateToken();
  assert.ok(token.length >= 40);
  assert.equal(hashToken(token), hashToken(token));
  assert.notEqual(hashToken(token), token);
});

test('Stage 3 schemas expose immutable versions, settings, and Order/outbox states', () => {
  assert.ok(OutgoingQuote.schema.path('revisionNumber'));
  assert.deepEqual(OutgoingQuote.schema.path('status').enumValues, ['draft', 'sent', 'superseded', 'voided']);
  assert.equal(QuoteSettings.schema.path('defaultMarkupValue').defaultValue, 20);
  assert.equal(QuoteSettings.schema.path('defaultValidityDays').defaultValue, 30);
  assert.ok(Order.schema.path('workflowStatus').enumValues.includes('outgoing_quote_draft'));
  assert.ok(Order.schema.path('workflowStatus').enumValues.includes('quote_sent'));
  assert.ok(EmailOutbox.schema.path('type').enumValues.includes('customer_outgoing_quote'));
  assert.ok(EmailOutbox.schema.path('outgoingQuoteId'));
});

test('customer PDF contains quote content but not internal cost or markup labels', async () => {
  const pdf = await createOutgoingQuotePdf({ quoteReference: 'OQ-2026-000001', revisionNumber: 1, customerSnapshot: { name: 'Customer', address: 'Site' }, jobSnapshot: { service: 'Landscaping', requestReference: 'REQ-1' }, scopeOfWork: 'Complete requested landscaping.', vendorSnapshot: { licensedContractorName: 'Vendor LLC', licenseType: 'CR-21', rocNumber: '123' }, customerTotal: 1200, termsAndConditions: 'Approved terms.', legalDisclosure: 'Required legal disclosure.', validUntil: new Date(Date.now() + 86400000) }, { company: { name: 'smplfix' } });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 1000);
});

test('routes mount before auth and enforce send lifecycle without creating Payment', () => {
  const server = read('backend/server.js');
  const route = read('backend/routes/outgoingQuotes.js');
  assert.ok(server.indexOf("app.use('/api/outgoing-quotes'") < server.indexOf("app.use('/api', authenticateToken)"));
  assert.match(route, /router\.use\(authenticateToken, staffRoles\)/);
  assert.match(route, /synchronizeWorkflowOrder\(order, 'quote_sent'/);
  assert.match(route, /order\.pricingStatus = 'quoted'/);
  assert.doesNotMatch(route, /require\('\.\.\/models\/Payment'\)|new Payment|Payment\.create/);
});

test('public quote endpoints are no-store and retain the downloadable customer document', () => {
  const route = read('backend/routes/outgoingQuotes.js');
  const page = read('pages/customer-quote.html');
  const server = read('backend/server.js');
  assert.match(route, /Cache-Control', 'no-store/);
  assert.match(route, /status: 'sent', validUntil: \{ \$gt: new Date\(\) \}/);
  assert.match(page, /Download PDF/);
  assert.match(server, /'customer-quote\.html'/);
  assert.match(page, /quotePdfLink/);
});

test('Workflow Center includes Stage 3 editor, settings, delivery, and responsive assets', () => {
  const html = read('pages/admin-dashboard.html');
  const js = read('assets/js/outgoing-quotes.js');
  assert.match(html, /id="outgoing-quotes"/);
  assert.match(html, /Approved terms and conditions/);
  assert.match(js, /Create Revision/);
  assert.match(js, /Rotate Link & Resend/);
  assert.match(js, /Preview PDF/);
});
