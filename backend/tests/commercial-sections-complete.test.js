const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('commercial sections expose their own useful controls and account preferences', () => {
  const html = read('pages/commercial-portal.html');
  for (const id of [
    'refreshPortalButton', 'portalUpdatedAt', 'activityProperty', 'activityType',
    'invoiceMetrics', 'reportProperty', 'reportDateFrom', 'reportDateTo',
    'applyReportFilters', 'reportDeliverySummary', 'documentProperty',
    'documentSource', 'warrantyStatus', 'notificationFilter',
    'markAllNotificationsRead', 'compactTables', 'userAccessDialog',
    'userAccessScopeType', 'userAccessRole'
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /data-request-service/);
});

test('commercial rendering completes billing, permissions, warranty and notification journeys', () => {
  const portal = read('assets/js/commercial-portal.js');
  const api = read('assets/js/api-service.js');
  assert.match(portal, /function reportFilters\(\)/);
  assert.match(portal, /function permissionLabels\(/);
  assert.match(portal, /function openWarrantyClaim\(/);
  assert.match(portal, /invoiceMetrics/);
  assert.match(portal, /markAllCommercialNotificationsRead/);
  assert.match(portal, /function openUserAccess\(/);
  assert.match(portal, /updateCommercialUserAccess/);
  assert.match(portal, /display:\{compactTables:/);
  assert.match(api, /getCommercialWarrantyClaim\(claimId\)/);
  assert.match(api, /markAllCommercialNotificationsRead\(\)/);
});

test('every commercial navigation item opens and limited sections explain their requirements', () => {
  const html = read('pages/commercial-portal.html');
  const portal = read('assets/js/commercial-portal.js');
  const css = read('assets/css/commercial-portal.css');
  assert.match(portal, /const portalRoutes = \['overview', 'properties', 'orders', 'activity', 'invoices', 'reports', 'documents', 'users', 'warranty', 'notifications', 'account'\]/);
  assert.match(portal, /if \(!portalRoutes\.includes\(base\)\)/);
  assert.match(portal, /link\.classList\.toggle\('is-limited',!available\)/);
  assert.match(portal, /function describeEmpty\(/);
  assert.match(portal, /sectionErrors/);
  assert.match(css, /\[hidden\]\{display:none!important\}/);
  assert.match(html, /commercial-portal\.js\?v=20261027-section-routing/);
});

test('bulk notification read remains scoped to the signed-in commercial membership', () => {
  const routes = read('backend/routes/commercial.js');
  assert.match(routes, /router\.patch\('\/notifications\/read-all', writes/);
  assert.match(routes, /Notification\.updateMany\([\s\S]*userId: req\.user\.userId, isRead: false/);
  assert.match(routes, /'metadata\.organizationId': \{ \$in: organizationIds \}/);
  assert.match(routes, /'metadata\.propertyId': \{ \$in: propertyIds \}/);
});

test('new commercial controls remain responsive and honor the existing accessibility system', () => {
  const css = read('assets/css/commercial-portal.css');
  assert.match(css, /\.section-filters/);
  assert.match(css, /\.section-metrics/);
  assert.match(css, /\.detail-grid/);
  assert.match(css, /\.compact-commercial-tables/);
  assert.match(css, /@media\(max-width:560px\)[^{]*\{[^}]*\.page-actions/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});
