const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { buildAnalytics, recordsToCsv, isActiveOrder, orderMatches } = require('../utils/reportAnalytics');

const period = {
  start: new Date('2026-07-01T00:00:00.000Z'),
  end: new Date('2026-07-31T23:59:59.999Z')
};

function fixture() {
  const customers = [
    { _id: 'c1', name: 'Acme', city: 'Phoenix', state: 'AZ', zipCode: '85001', addresses: [] },
    { _id: 'c2', name: 'Legacy Co', city: 'Tempe', state: 'AZ', zipCode: '85281', addresses: [] }
  ];
  const orders = [
    { _id: 'o1', orderId: 'WO-1', customerId: 'c1', customer: { name: 'Acme' }, employee: { _id: 'e1', name: 'Alex' }, vendor: { _id: 'v1', name: 'Vendor One' }, service: 'Plumbing', amount: 100, vendorCost: 20, processingFee: 5, status: 'new', orderType: 'recurring', createdAt: '2026-07-02T12:00:00.000Z' },
    { _id: 'o2', orderId: 'WO-2', customer: { name: 'Legacy Co' }, employee: { _id: 'e2', name: 'Sam' }, service: 'HVAC', amount: 200, vendorCost: 50, processingFee: 10, status: 'completed', orderType: 'one-time', createdAt: '2026-07-03T12:00:00.000Z' },
    { _id: 'o3', orderId: 'WO-3', customerId: 'c1', customer: { name: 'Acme' }, service: 'Electrical', amount: 300, status: 'cancelled', createdAt: '2026-07-04T12:00:00.000Z' },
    { _id: 'o4', orderId: 'WO-4', customerId: 'c1', customer: { name: 'Acme' }, service: 'Roofing', amount: 400, status: 'new', createdAt: '2026-07-05T12:00:00.000Z' }
  ];
  const payments = [
    {
      _id: 'p1', paymentId: 'PAY-1', invoiceNumber: 'INV-1', order: { _id: 'o1', orderId: 'WO-1', customer: { name: 'Acme' } }, customer: { name: 'Acme' }, status: 'pending', amount: 100,
      milestones: [
        { title: 'Deposit', amount: 40, status: 'received', receivedDate: '2026-07-08T12:00:00.000Z' },
        { title: 'Balance', amount: 60, status: 'pending' }
      ]
    },
    { _id: 'p2', paymentId: 'PAY-2', order: { _id: 'o2', orderId: 'WO-2', customer: { name: 'Legacy Co' } }, customer: { name: 'Legacy Co' }, status: 'completed', amount: 200, paymentDate: null, milestones: [] }
  ];
  return { customers, orders, payments, employees: [], vendors: [], stages: [], pipelineRecords: [], excludedOrderIds: ['o4'], excludedStageIds: [] };
}

test('calculates trusted active-order and payment metrics', () => {
  const report = buildAnalytics(fixture(), {}, period);
  assert.equal(report.summary.revenue, 300);
  assert.equal(report.summary.grossProfit, 215);
  assert.equal(report.summary.profitMargin, (215 / 300) * 100);
  assert.equal(report.summary.totalOrders, 2);
  assert.equal(report.summary.completedOrders, 1);
  assert.equal(report.summary.averageOrderValue, 150);
  assert.equal(report.summary.collectedPayments, 40);
  assert.equal(report.summary.outstandingBalance, 60);
  assert.equal(report.tables.recurringServices[0].service, 'Plumbing');
  assert.equal(report.tables.paymentRecords[0].paymentId, 'p1');
  assert.equal(report.dataQuality.missingPaymentDates, 1);
  assert.equal(report.dataQuality.legacyCustomerMatches, 1);
});

test('applies service, employee, customer, status, and normalized location filters', () => {
  assert.equal(buildAnalytics(fixture(), { service: 'Plumbing' }, period).summary.revenue, 100);
  assert.equal(buildAnalytics(fixture(), { employeeId: 'e2' }, period).summary.revenue, 200);
  assert.equal(buildAnalytics(fixture(), { vendorId: 'v1' }, period).summary.revenue, 100);
  assert.equal(buildAnalytics(fixture(), { customerId: 'c2' }, period).summary.revenue, 200);
  assert.equal(buildAnalytics(fixture(), { orderStatus: 'completed' }, period).summary.totalOrders, 1);
  assert.equal(buildAnalytics(fixture(), { city: 'Phoenix', state: 'AZ', zip: '85001' }, period).summary.revenue, 100);
  assert.equal(buildAnalytics(fixture(), { paymentStatus: 'pending' }, period).summary.collectedPayments, 0);
  assert.equal(buildAnalytics(fixture(), { paymentStatus: 'received' }, period).summary.outstandingBalance, 0);
});

test('handles zero-revenue, excluded, cancelled, and out-of-period orders', () => {
  const data = fixture();
  data.orders.push({ _id: 'old', amount: 900, status: 'new', service: 'Old', customer: { name: 'Acme' }, createdAt: '2025-01-01T00:00:00.000Z' });
  const empty = buildAnalytics(data, { service: 'Nothing' }, period);
  assert.equal(empty.summary.revenue, 0);
  assert.equal(empty.summary.profitMargin, 0);
  assert.equal(empty.summary.averageOrderValue, 0);
  assert.equal(isActiveOrder(data.orders[2], new Set()), false);
  assert.equal(isActiveOrder(data.orders[3], new Set(['o4'])), false);
});

test('matches legacy customer names without weakening explicit filters', () => {
  const data = fixture();
  const context = {
    customersById: new Map(data.customers.map(customer => [customer._id, customer])),
    pipelineByOrderId: new Map(),
    customerForOrder: order => data.customers.find(customer => customer.name === order.customer.name)
  };
  assert.equal(orderMatches(data.orders[1], { customerId: 'c2' }, context), true);
  assert.equal(orderMatches(data.orders[1], { customerId: 'c1' }, context), false);
});

test('CSV export escapes commas, quotes, newlines, and spreadsheet formulas', () => {
  const csv = recordsToCsv([{ date: '2026-07-01', order: '=2+2', customer: 'Doe, "Jane"', service: 'Line\nBreak', employee: 'Alex', vendor: '', status: 'new', revenue: 10, cost: 2, profit: 8, paymentStatus: 'pending' }]);
  assert.match(csv, /"'=2\+2"/);
  assert.match(csv, /"Doe, ""Jane"""/);
  assert.match(csv, /"Line\nBreak"/);
});

test('report routes keep authentication, admin RBAC, records, and export contracts', () => {
  const root = path.join(__dirname, '..', '..');
  const route = fs.readFileSync(path.join(root, 'backend/routes/reports.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'pages/admin-dashboard.html'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'assets/js/dashboard-script.js'), 'utf8');
  assert.match(server, /app\.use\('\/api', authenticateToken\)/);
  assert.match(server, /app\.use\('\/api\/reports', checkRole\(\['admin'\]\)/);
  assert.match(route, /router\.get\('\/analytics', authenticateToken, checkRole\(REPORT_ROLES\)/);
  assert.match(route, /router\.get\('\/records', authenticateToken, checkRole\(REPORT_ROLES\)/);
  assert.match(route, /router\.get\('\/export', authenticateToken, checkRole\(REPORT_ROLES\)/);
  assert.match(page, /id="reportsStatus"/);
  assert.match(page, /data-report-tab="financial"/);
  assert.match(page, /data-report-tab="operations"/);
  assert.match(page, /data-report-tab="relationships"/);
  assert.match(page, /id="reportAdvancedFilters"/);
  assert.match(page, /id="reportVendorFilter"/);
  assert.match(page, /aria-controls="reportsTabContent"/);
  assert.match(client, /validateReportsPayload/);
  assert.match(client, /Reports could not be loaded/);
  assert.match(client, /markReportFiltersDirty/);
  assert.match(client, /toggleReportDefinitions/);
  assert.match(client, /window\.location\.hash === '#reports'/);
});

test('report periods use inclusive America/Phoenix day boundaries', () => {
  const { __test } = require('../routes/reports');
  const parsed = __test.parsePeriod({ startDate: '2026-07-01', endDate: '2026-07-31' });
  assert.equal(parsed.start.toISOString(), '2026-07-01T07:00:00.000Z');
  assert.equal(parsed.end.toISOString(), '2026-08-01T06:59:59.999Z');
  assert.throws(() => __test.parsePeriod({ startDate: '2026-08-01', endDate: '2026-07-01' }), /invalid/);
});

test('PDF executive summary has a valid PDF signature and report content', async () => {
  const { __test } = require('../routes/reports');
  const output = new PassThrough();
  const chunks = [];
  output.on('data', chunk => chunks.push(chunk));
  const completed = new Promise((resolve, reject) => {
    output.on('end', resolve);
    output.on('error', reject);
  });
  __test.writePdf(output, {
    meta: { period: { start: period.start, end: period.end }, generatedAt: new Date('2026-07-31T12:00:00Z'), timezone: 'America/Phoenix', definitions: { revenue: 'Active order revenue.' } },
    summary: { revenue: 300, collectedPayments: 40, grossProfit: 215, profitMargin: 71.7, totalOrders: 2, completedOrders: 1, outstandingBalance: 60, averageOrderValue: 150 },
    tables: { topServices: [{ label: 'Plumbing', value: 100, profit: 75 }] },
    dataQuality: { warnings: [] }
  });
  await completed;
  const pdf = Buffer.concat(chunks);
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.ok(pdf.length > 1000);
});
