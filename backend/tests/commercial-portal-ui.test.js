const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('commercial login and protected routing are controlled by the authenticated role', () => {
  const login = read('pages/login.html');
  const loginScript = read('assets/js/login-script.js');
  const auth = read('backend/middleware/auth.js');
  const server = read('backend/server.js');
  assert.match(login, /<option value="commercial">Commercial Client Portal<\/option>/);
  assert.match(loginScript, /commercial:\s*\{[\s\S]*destination: '\/pages\/commercial-portal\.html'/);
  assert.match(auth, /role === 'commercial'/);
  assert.match(auth, /new Set\(\['\/pages\/commercial-portal\.html', '\/commercial-portal\.html', '\/pages\/commercial-invitation\.html', '\/commercial-invitation\.html'\]\)/);
  assert.match(server, /resolved\.user\.role !== 'commercial'/);
  assert.match(server, /app\.get\(\['\/pages\/commercial-portal\.html', '\/commercial-portal\.html'\], serveCommercialPortal\)/);
});

test('commercial portal includes every requested portfolio-first section and accessible states', () => {
  const html = read('pages/commercial-portal.html');
  for (const route of ['overview', 'properties', 'orders', 'invoices', 'reports', 'users', 'warranty', 'notifications', 'account']) {
    assert.match(html, new RegExp(`data-(?:route|view)="${route}"`));
  }
  assert.match(html, /id="organizationSelect"/);
  assert.match(html, /id="portfolioSelect"/);
  assert.match(html, /id="globalSearch" type="search"/);
  assert.match(html, /id="loadingState"[^>]*role="status"/);
  assert.match(html, /id="errorState"[^>]*role="alert"/);
  assert.match(html, /class="skip-link"/);
  assert.match(html, /<dialog id="propertyDialog"/);
});

test('commercial UI fetches only commercial-scoped APIs and consumes server navigation entitlements', () => {
  const script = read('assets/js/commercial-portal.js');
  const api = read('assets/js/api-service.js');
  assert.match(script, /state\.navigation = dashboard\.navigation/);
  assert.match(script, /const allowed = new Set\(state\.navigation\)/);
  assert.match(script, /APIService\.getCommercialDashboard/);
  assert.match(script, /APIService\.getCommercialPropertyOrders/);
  assert.doesNotMatch(script, /APIService\.(?:getOrders|getDashboardStats|getCustomers|getVendors)\(/);
  for (const endpoint of ['dashboard', 'invoices', 'reports', 'warranty-claims', 'notifications']) {
    assert.match(api, new RegExp(`\\/commercial\\/${endpoint}`));
  }
});

test('commercial dashboard APIs scope aggregates before returning safe data', () => {
  const route = read('backend/routes/commercial.js');
  const serializers = read('backend/utils/commercialSerializers.js');
  assert.match(route, /selectedAccesses\(req, res\)/);
  assert.match(route, /navigationFor\(accesses\)/);
  assert.match(route, /allCapabilities\.some\(item => item\.canViewReports\)/);
  assert.match(route, /tierEntitlements\(item\.agreement\?\.tier\)\.warrantyClaims/);
  assert.match(route, /Notification\.find\(\{ userId: req\.user\.userId, \$or:/);
  assert.match(route, /serializeEstimate\(estimate, order, capabilities\(access\)\.canApproveEstimates\)/);
  assert.match(serializers, /function serializeEstimate/);
  assert.match(serializers, /assertNoPrivateCommercialFields/);
  const portalScript = read('assets/js/commercial-portal.js');
  assert.doesNotMatch(portalScript, /\.vendorCost|\.markupAmount|\.profit|\.margin/);
});

test('commercial styles cover keyboard focus, mobile navigation, responsive grids, and reduced motion', () => {
  const css = read('assets/css/commercial-portal.css');
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\(max-width:820px\)/);
  assert.match(css, /@media\(max-width:560px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /\.sidebar\.is-open/);
  assert.match(css, /\.property-grid/);
});
