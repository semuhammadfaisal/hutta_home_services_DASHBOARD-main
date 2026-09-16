const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const VendorInvoice = require('../models/VendorInvoice');
const VendorPayout = require('../models/VendorPayout');
const { normalizeInvoiceLines, normalizeInvoiceNumber, serializeVendorInvoice } = require('../utils/vendorBilling');
const { summary } = require('../utils/vendorPerformance');

const root = path.resolve(__dirname, '..', '..'); const read = file => fs.readFileSync(path.join(root, file), 'utf8'); const oid = () => new mongoose.Types.ObjectId();

test('invoice line totals are calculated on the server with cent-safe validation', () => {
  const result = normalizeInvoiceLines([{ description: 'Labor', quantity: 1.5, unit: 'hour', unitPrice: 99.99, amount: 149.98 }, { description: 'Part', quantity: 2, unit: 'each', unitPrice: 10.005, amount: 20.02 }], { verifyAmounts: true });
  assert.equal(result.amount, 170.01); assert.ok(result.errors.some(item => /Line 1 total/.test(item)));
  assert.equal(normalizeInvoiceNumber(' inv   100 '), 'INV 100');
});

test('vendor invoice is immutable-assignment scoped with duplicate protections and private storage fields', () => {
  const indexes = VendorInvoice.schema.indexes();
  assert.equal(VendorInvoice.schema.path('assignmentId').options.unique, true);
  assert.equal(VendorInvoice.schema.path('sourceDocument.fileId').options.select, false);
  assert.equal(VendorInvoice.schema.path('sourceDocument.sha256').options.select, false);
  assert.ok(indexes.some(([keys, options]) => keys.vendorId === 1 && keys.normalizedInvoiceNumber === 1 && options.unique));
  assert.ok(indexes.some(([keys, options]) => keys['sourceDocument.sha256'] === 1 && options.unique));
});

test('invoice validation requires a valid period, line items, and supporting document', async () => {
  const invoice = new VendorInvoice({ assignmentId: oid(), orderId: oid(), vendorId: oid(), jobCompletionId: oid(), invoiceNumber: 'INV-1', normalizedInvoiceNumber: 'INV-1', billingLane: 'smplfix_direct', servicePeriodStart: new Date('2026-10-02'), servicePeriodEnd: new Date('2026-10-01'), lineItems: [], amount: 0, submittedBy: oid() });
  await assert.rejects(invoice.validate(), error => Boolean(error.errors.servicePeriodEnd && error.errors.lineItems && error.errors.sourceDocument));
});

test('owner-billed invoices show no SMPLfix payout queue', () => {
  const invoice = { _id: oid(), assignmentId: oid(), orderId: oid(), invoiceNumber: 'OWNER-1', amount: 250, billingLane: 'owner_billed', servicePeriodStart: new Date(), servicePeriodEnd: new Date(), lineItems: [], status: 'approved', mismatchFlags: [], sourceDocument: { documentId: 'doc', name: 'invoice.pdf', mimeType: 'application/pdf', size: 50 } };
  const payload = serializeVendorInvoice(invoice, { _id: oid(), status: 'paid', providerReference: 'po_should_not_show' });
  assert.equal(payload.paymentLabel, 'Billed to owner'); assert.equal(payload.payout, null); assert.doesNotMatch(JSON.stringify(payload), /po_should_not_show|accountId|bank|routing/i);
});

test('direct-lane payout serializer supports every vendor status without bank details', () => {
  for (const status of ['pending', 'approved', 'scheduled', 'paid', 'failed', 'disputed']) {
    const payload = serializeVendorInvoice({ _id: oid(), assignmentId: oid(), orderId: oid(), invoiceNumber: `INV-${status}`, amount: 100, billingLane: 'smplfix_direct', servicePeriodStart: new Date(), servicePeriodEnd: new Date(), lineItems: [], status: 'approved', mismatchFlags: [] }, { _id: oid(), status, amount: 100, providerReference: 'po_123', failureMessage: 'Retry', disputeMessage: 'Review' });
    assert.equal(payload.payout.status, status); assert.equal(payload.payout.reference, 'po_123'); assert.doesNotMatch(JSON.stringify(payload), /accountId|bankAccount|routingNumber/i);
  }
  assert.equal(VendorPayout.schema.path('providerReference').options.select, false);
});

test('performance summary exposes fair recorded metrics and no rankings or financial data', () => {
  const vendor = { documents: [], huttasContractSigned: false, stripeConnect: {}, workersCompProfile: {}, licensedTrade: false };
  const performance = summary({ vendor, events: [{ type: 'bid_submitted_on_time' }, { type: 'bid_submitted_late' }], invitations: [{ respondedAt: new Date('2026-09-01'), responseDueAt: new Date('2026-09-02') }], schedules: [{ status: 'accepted' }, { status: 'changes_requested' }], completions: [{ status: 'completed', completionNotes: 'Finished work', beforePhotos: [{}], afterPhotos: [{}] }] });
  assert.equal(performance.responseTimeliness.rate, 100); assert.equal(performance.estimateSubmission.rate, 50); assert.equal(performance.scheduleReliability.rate, 50); assert.equal(performance.completionDocumentation.rate, 100);
  assert.doesNotMatch(JSON.stringify(performance), /margin|profit|vendorCost|ranking|customerRating|performanceScore/i);
});

test('invoice routes enforce membership permission, assignment ownership, completion eligibility, and mismatch review', () => {
  const route = read('backend/routes/vendorPortal.js'); const admin = read('backend/routes/vendorPortalAdmin.js');
  assert.match(route, /assignments\/:assignmentId\/invoices', requireVendorPermission\('invoices'\)/);
  assert.match(route, /scopedAssignment\(req\)/); assert.match(route, /completion_submitted/); assert.match(route, /A completed assignment record is required/);
  assert.match(route, /amount_mismatch/); assert.match(route, /service_period_mismatch/); assert.match(route, /line_total_mismatch/);
  assert.match(route, /req\.vendorRecord\.licensedTrade \? 'owner_billed'/); assert.match(route, /billingLane === 'smplfix_direct'/);
  assert.match(admin, /vendor_invoice_/); assert.match(admin, /vendor_payout_/); assert.match(admin, /Stripe Connect payout reference is required/);
});

test('invoice uploads are signature checked, size limited, private, and vendor scoped', () => {
  const route = read('backend/routes/vendorPortal.js');
  assert.match(route, /15 \* 1024 \* 1024/); assert.match(route, /validEstimateFile\(req\.file\)/); assert.match(route, /sourceDocument\.sha256/);
  assert.match(route, /_id: req\.params\.invoiceId, vendorId: req\.vendorRecord\._id/); assert.match(route, /private, no-store/);
});

test('responsive portal includes invoices, reminders, performance, status references, and accessible controls', () => {
  const html = read('pages/vendor-portal.html'); const js = read('assets/js/vendor-portal.js'); const css = read('assets/css/vendor-billing.css'); const api = read('assets/js/api-service.js'); const admin = read('pages/admin-dashboard.html'); const dashboard = read('assets/js/dashboard-script.js');
  assert.match(html, /Invoices &amp; payouts/); assert.match(html, /Performance summary/); assert.match(js, /Billed to owner/); assert.match(js, /Stripe Connect reference/); assert.match(js, /data-assignment-invoice/); assert.match(js, /lineItems/);
  assert.match(css, /@media \(max-width: 700px\)/); assert.match(js, /aria-label=/); assert.match(api, /submitVendorInvoice/); assert.match(api, /getVendorPerformance/);
  assert.match(admin, /orderAssignmentBillingLane/); assert.match(dashboard, /billingLane: document\.getElementById\('orderAssignmentBillingLane'\)/); assert.match(dashboard, /data-licensed/);
});

test('demo data is opt-in and release checklist covers financial authorization and mobile QA', () => {
  const seed = read('backend/seed-vendor-billing-demo.js'); const checklist = read('backend/VENDOR_PORTAL_RELEASE_CHECKLIST.md'); const migration = read('backend/migrate-vendor-assignments.js');
  assert.match(seed, /process\.argv\.includes\('--apply'\)/); assert.match(seed, /--vendor-email/); assert.match(seed, /demoData: true/);
  assert.match(checklist, /Financial authorization/); assert.match(checklist, /320 px/); assert.match(checklist, /one invoice/i);
  assert.match(migration, /VendorInvoice\.createIndexes/); assert.match(migration, /VendorPayout\.createIndexes/); assert.doesNotMatch(migration, /deleteMany|dropDatabase/);
});
