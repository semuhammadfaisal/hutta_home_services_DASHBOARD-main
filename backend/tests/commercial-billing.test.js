const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const CustomerInvoice = require('../models/CustomerInvoice');
const serializers = require('../utils/commercialSerializers');
const { buildBillingSnapshot, dateRange, invoiceVisibility, paymentSummary, phoenixPeriod, reconcileInvoice } = require('../utils/commercialBilling');
const { createCommercialInvoicePdf } = require('../utils/invoicePdf');
const oid = () => new mongoose.Types.ObjectId();

function managedSnapshot(overrides = {}) {
  const organization = { _id: oid(), name: 'Mesa Property Group' };
  const agreement = { _id: oid(), agreementNumber: 'AGR-22', billingRules: { invoiceMode: 'consolidated_period', billingPeriod: 'monthly' } };
  return buildBillingSnapshot({ organization, agreement, issuedAt: new Date('2026-09-15T12:00:00Z'), lines: [
    { propertyId: oid(), portfolioId: oid(), propertyLabel: 'North Office', tierAtService: 'tier_2', billedAmount: 10.005, orderIds: [oid()] },
    { propertyId: oid(), portfolioId: oid(), propertyLabel: 'South Office', tierAtService: 'tier_3', billedAmount: 20.004, orderIds: [oid()] }
  ], ...overrides });
}

test('consolidated billing rounds in cents and reconciles property totals', () => {
  const result = managedSnapshot();
  assert.equal(result.amount, 30.01);
  assert.equal(result.commercialBilling.tierAtIssue, 'mixed_managed');
  assert.equal(reconcileInvoice({ amount: result.amount, commercialBilling: result.commercialBilling }).reconciled, true);
  assert.deepEqual(result.commercialBilling.propertyBreakdown.map(row => row.billedAmount), [10.01, 20]);
  assert.ok(result.commercialBilling.propertyBreakdown.every(row => row.chargeType === 'client_service'));
});

test('Tier 1 snapshots force per-order coordination-only billing', () => {
  const result = buildBillingSnapshot({ organization: { _id: oid(), name: 'Client' }, agreement: { _id: oid(), agreementNumber: 'T1', billingRules: { invoiceMode: 'coordination_fee_only', billingPeriod: 'monthly' } }, lines: [{ propertyId: oid(), propertyLabel: 'Store', tierAtService: 'tier_1', billedAmount: 19.99 }] });
  assert.equal(result.commercialBilling.invoiceKind, 'coordination_fee');
  assert.equal(result.commercialBilling.billingPeriodAtIssue, 'per_order');
  assert.equal(result.commercialBilling.propertyBreakdown[0].chargeType, 'coordination_service');
  assert.equal(result.commercialBilling.periodKey, undefined);
});

test('Phoenix monthly and weekly periods use exact half-open boundaries', () => {
  const monthly = phoenixPeriod('2026-09-01T06:59:59.999Z', 'monthly');
  assert.equal(monthly.start.toISOString(), '2026-08-01T07:00:00.000Z');
  assert.equal(monthly.end.toISOString(), '2026-09-01T07:00:00.000Z');
  assert.equal(monthly.periodKey, '2026-08');
  const weekly = phoenixPeriod('2026-09-14T07:00:00.000Z', 'weekly');
  assert.equal(weekly.start.toISOString(), '2026-09-14T07:00:00.000Z');
  assert.equal(weekly.end.toISOString(), '2026-09-21T07:00:00.000Z');
});

test('canonical payments drive open, partial, overdue, and paid invoice status', () => {
  const invoice = { _id: oid(), amount: 100, dueDate: new Date('2026-09-01T00:00:00Z') };
  assert.equal(paymentSummary(invoice, [], new Date('2026-09-02')).status, 'overdue');
  assert.deepEqual(paymentSummary(invoice, [{ customerInvoiceId: invoice._id, amount: 25, status: 'received' }], new Date('2026-09-02')), { status: 'partial', paidAmount: 25, balanceDue: 75, paidAt: undefined });
  assert.equal(paymentSummary(invoice, [{ customerInvoiceId: invoice._id, amount: 100, status: 'completed' }]).status, 'paid');
  assert.equal(paymentSummary(invoice, [{ customerInvoiceId: invoice._id, amount: 100, status: 'failed' }]).paidAmount, 0);
});

test('issue-time snapshots survive tier transitions and fail closed on wrong invoice kinds', () => {
  const organizationId = oid();
  const oldTierOne = { _id: oid(), invoiceNumber: 'INV-T1', amount: 44, issuedAt: new Date(), commercialBilling: { organizationId, tierAtIssue: 'tier_1', invoiceModeAtIssue: 'coordination_fee_only', invoiceKind: 'coordination_fee' } };
  assert.equal(invoiceVisibility(oldTierOne), true);
  assert.equal(serializers.serializeInvoice(oldTierOne).invoiceType, 'coordination_fee');
  assert.equal(serializers.serializeInvoice(oldTierOne, { tier: 'tier_3' }).invoiceType, 'coordination_fee');
  assert.equal(invoiceVisibility({ ...oldTierOne, commercialBilling: { ...oldTierOne.commercialBilling, invoiceKind: 'consolidated_period' } }), false);
});

test('invoice model rejects unreconciled immutable commercial snapshots', async () => {
  const snapshot = managedSnapshot(); snapshot.commercialBilling.propertyBreakdown[0].billedAmount = 1;
  const invoice = new CustomerInvoice({ invoiceNumber: 'INV-BAD', orderId: oid(), jobCompletionId: oid(), outgoingQuoteId: oid(), amount: snapshot.amount, issuedAt: new Date(), dueDate: new Date(), companySnapshot: {}, customerSnapshot: {}, jobSnapshot: {}, quoteSnapshot: {}, snapshotHash: 'a'.repeat(64), commercialBilling: snapshot.commercialBilling });
  await assert.rejects(invoice.validate(), /breakdown must reconcile/);
  assert.equal(CustomerInvoice.schema.path('commercialBilling.tierAtIssue').options.immutable, true);
});

test('commercial PDF is generated only from client-safe invoice snapshots', async () => {
  const snapshot = managedSnapshot();
  const pdf = await createCommercialInvoicePdf({ invoiceNumber: 'INV-SAFE', issuedAt: new Date(), dueDate: new Date(), customerSnapshot: { name: 'Client' }, ...snapshot }, { status: 'open' });
  assert.ok(Buffer.isBuffer(pdf)); assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  const source = fs.readFileSync(path.join(__dirname, '../utils/invoicePdf.js'), 'utf8');
  assert.doesNotMatch(source.slice(source.indexOf('function createCommercialInvoicePdf')), /vendorCost|markupAmount|rawVendorInvoice|profit|margin/i);
});

test('billing filters validate range and commercial routes require all-property PDF authorization', () => {
  assert.throws(() => dateRange({ dateFrom: '2026-10-01', dateTo: '2026-09-01' }), /Invalid date range/);
  assert.throws(() => dateRange({ dateFrom: '2020-01-01', dateTo: '2026-01-01' }), /three years/);
  assert.equal(dateRange({ dateFrom: '2026-09-01', dateTo: '2026-09-01' }).from.toISOString(), '2026-09-01T07:00:00.000Z');
  assert.equal(dateRange({ dateFrom: '2026-09-01', dateTo: '2026-09-01' }).to.toISOString(), '2026-09-02T06:59:59.999Z');
  const route = fs.readFileSync(path.join(__dirname, '../routes/commercial.js'), 'utf8');
  assert.match(route, /propertyIds\.every\(propertyId => allInvoiceAccess\.has/);
  assert.match(route, /Payment\.find\(\{ \$or:/);
  assert.match(route, /createCommercialInvoicePdf/);
  assert.doesNotMatch(route, /serializeInvoice\(invoice, access\.agreement\)/);
});

test('consolidated invoice uniqueness is scoped to organization, consolidation key, period, and kind', () => {
  const index = CustomerInvoice.schema.indexes().find(([, options]) => options.name === 'one_consolidated_commercial_invoice_per_scope_period');
  assert.ok(index); assert.equal(index[1].unique, true);
  assert.deepEqual(Object.keys(index[0]), ['commercialBilling.organizationId', 'commercialBilling.consolidationKey', 'commercialBilling.periodKey', 'commercialBilling.invoiceKind']);
});
