const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('server controls staff and residential page access independently', () => {
  const server = read('backend/server.js');
  const auth = require('../middleware/auth');
  assert.equal(auth.destinationForRole('residential'), '/pages/residential-portal.html');
  assert.equal(auth.destinationForRole('admin'), '/pages/admin-dashboard.html');
  assert.equal(auth.destinationForRole('residential', '/pages/admin-dashboard.html'), '/pages/residential-portal.html');
  assert.equal(auth.destinationForRole('manager', '/pages/residential-portal.html'), '/pages/admin-dashboard.html');
  assert.equal(auth.destinationForRole('admin', '/pages/admin-dashboard.html?tab=orders#open'), '/pages/admin-dashboard.html?tab=orders#open');
  assert.equal(auth.destinationForRole('residential', '//evil.example'), '/pages/residential-portal.html');
  assert.match(server, /resolved\.user\.role !== 'residential'/);
  assert.match(server, /!STAFF_ROLES\.includes\(resolved\.user\.role\)/);
  assert.match(server, /app\.get\(\['\/pages\/residential-portal\.html', '\/residential-portal\.html'\], serveResidentialPortal\)/);
  assert.match(server, /app\.get\(\['\/pages\/admin-dashboard\.html', '\/admin-dashboard\.html'\], serveDashboard\)/);
});

test('login redirects only to the server-provided role destination', () => {
  const login = read('assets/js/login-script.js');
  const api = read('assets/js/api-service.js');
  assert.match(api, /JSON\.stringify\(\{ email, password, returnTo \}\)/);
  assert.match(login, /response\.destination/);
  assert.doesNotMatch(login, /safeReturnTo/);
  assert.doesNotMatch(login, /window\.location\.href\s*=\s*returnTo/);
  assert.match(api, /\(\?:admin-dashboard\|residential-portal\|agent-portal\|commercial-portal\)/);
});

test('residential portal has the required semantic views and dashboard modules', () => {
  const html = read('pages/residential-portal.html');
  for (const id of [
    'portalMain', 'propertySwitcher', 'portalLoading', 'portalError', 'portalUnauthorized', 'offlineBanner',
    'homeView', 'propertiesView', 'estimateList', 'activeJobsList', 'activityList', 'bookAgainList',
    'propertyList', 'propertyDetail', 'requestedServicesList', 'serviceHistoryList'
  ]) assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);
  assert.match(html, /class="skip-link" href="#portalMain"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-label="Residential portal navigation"/);
  assert.match(html, /id="openRequestButton"/);
  assert.match(html, /id="openEmergencyButton"/);
  assert.match(html, /residential-portal\.css\?v=/);
  assert.match(html, /residential-portal\.js\?v=/);
  assert.doesNotMatch(html, /admin-dashboard\.js|dashboard-script\.js|data-role-select|portal dropdown/i);
});

test('property record summarizes requested-service financial and workflow progress', () => {
  const html = read('pages/residential-portal.html');
  const client = read('assets/js/residential-portal.js');
  assert.match(html, /id="requestedServicesTitle">Requested Services</);
  assert.match(client, /requestedServiceCard/);
  assert.match(client, /Current stage/);
  assert.match(client, /Estimate/);
  assert.match(client, /Invoice/);
  assert.match(client, /Payment/);
  assert.match(client, /requestedServicePaymentLabel/);
  assert.match(client, /data-job-detail/);
  assert.doesNotMatch(client, /requested-service[\s\S]{0,800}(?:vendorCost|markup|margin|profit)/i);
});

test('job details derive an accurate stage and expose only valid customer actions', () => {
  const client = read('assets/js/residential-portal.js');
  const css = read('assets/css/residential-portal.css');
  assert.match(client, /function jobDetailStage/);
  assert.match(client, /Payment received and this service record is complete/);
  assert.match(client, /Cancellation requested/);
  assert.match(client, /Schedule change requested/);
  assert.match(client, /data-estimate-detail/);
  assert.match(client, /data-order-action="reschedule"/);
  assert.match(client, /data-order-action="cancel"/);
  assert.match(client, /data-book-again/);
  assert.match(client, /Invoice PDF/);
  assert.match(client, /Receipt PDF/);
  assert.match(client, /Message SMPLfix/);
  assert.match(css, /repeat\(10, minmax/);
});

test('portal client reads only residential-scoped APIs and handles every required state', () => {
  const api = read('assets/js/api-service.js');
  const client = read('assets/js/residential-portal.js');
  for (const method of [
    'getResidentialHome', 'getResidentialProperty', 'getResidentialOrders', 'getResidentialEstimates',
    'getResidentialSchedules', 'getResidentialInvoices', 'getResidentialActivity'
  ]) assert.match(api, new RegExp(`async ${method}\\(`), `missing ${method}`);
  assert.match(client, /window\.AuthSession\?\.user\?\.role !== 'residential'/);
  assert.match(client, /window\.addEventListener\('online'/);
  assert.match(client, /window\.addEventListener\('offline'/);
  assert.match(client, /elements\.loading\.hidden/);
  assert.match(client, /elements\.unauthorized\.hidden/);
  assert.match(client, /elements\.error\.hidden/);
  assert.match(client, /state\.properties\.some\(property => safeId\(property\.id\)/);
  assert.doesNotMatch(client, /localStorage|sessionStorage|[?&]role=|URLSearchParams/);
  assert.doesNotMatch(client, /APIService\.(?:getOrders|getCustomers|getPayments)\(/);
});

test('portal interactions escape API content and calculate views from scoped records', () => {
  const source = read('assets/js/residential-portal.js');
  const context = {
    window: {},
    document: { addEventListener() {} },
    Intl,
    Date,
    setTimeout,
    clearTimeout,
    console
  };
  vm.runInNewContext(source, context, { filename: 'residential-portal.js' });
  const helpers = context.window.ResidentialPortal.__test;
  assert.equal(helpers.escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(helpers.normalizeStatus('Awaiting_Customer Closeout'), 'awaiting-customer-closeout');
  assert.equal(helpers.isCompleted({ workflowStatus: 'completed' }), true);
  assert.equal(helpers.isCompleted({ workflowStatus: 'scheduled' }), false);
  assert.equal(helpers.jobDetailStage({ order: { workflowStatus: 'awaiting_customer_closeout' }, invoice: { payment: { status: 'completed' } } }).label, 'Paid');
  assert.equal(helpers.jobDetailStage({ order: {}, invoice: { payment: { status: 'pending' } } }).label, 'Payment pending');
  assert.equal(helpers.jobDetailStage({ order: {}, completion: { completedAt: new Date().toISOString() } }).label, 'Work completed');
  assert.equal(helpers.requestedServicePaymentLabel(null), 'Not due');
});

test('residential styles provide visible focus, responsive layouts, and reduced-motion support', () => {
  const css = read('assets/css/residential-portal.css');
  assert.match(css, /:focus-visible\s*\{[\s\S]*outline:\s*3px solid/);
  assert.match(css, /@media \(max-width: 1180px\)/);
  assert.match(css, /@media \(max-width: 860px\)/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /min-width:\s*320px/);
  assert.match(css, /\.portal-sidebar\.is-open/);
  assert.match(css, /\.sidebar-heading \.icon-button\s*\{\s*color:\s*var\(--ink\)/);
  assert.doesNotMatch(css, /overflow-x:\s*hidden/);
});
