const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', '..', relative), 'utf8');

test('vendor portal exposes every routed workspace and nested detail routes', () => {
  const page = read('pages/vendor-portal.html');
  const shell = read('assets/js/vendor-portal-shell.js');
  for (const route of ['overview', 'assignments', 'opportunities', 'billing', 'compliance', 'documents', 'account']) {
    assert.match(page, new RegExp(`href="#${route}"`));
    assert.match(page, new RegExp(`data-view="${route}"`));
  }
  assert.match(shell, /location\.hash/);
  assert.match(shell, /hashchange/);
  assert.match(shell, /parts\[1\]/);
  assert.match(shell, /CustomEvent\('vendorroutechange'/);
  assert.match(read('assets/js/vendor-portal.js'), /#assignments\//);
  assert.ok(page.indexOf('vendor-portal-shell.js') < page.indexOf('vendor-portal.js?v='), 'router must initialize before portal data rendering');
});

test('vendor portal presents focused assignments, opportunities, billing, compliance, documents, and account tools', () => {
  const page = read('pages/vendor-portal.html');
  const source = read('assets/js/vendor-portal.js');
  for (const id of ['assignmentSearch', 'assignmentStatus', 'opportunitySearch', 'opportunityStatus', 'billingMetrics', 'checklist', 'documentForm', 'profileForm', 'teamList', 'permissionSummary']) assert.match(page, new RegExp(`id="${id}"`));
  assert.match(source, /data-opportunity=/);
  assert.match(source, /#assignments\/\$\{encodeURIComponent/);
  assert.match(source, /#opportunities\/\$\{encodeURIComponent/);
  assert.match(source, /Customer contact details are hidden/);
  assert.match(source, /Billed to owner/);
});

test('vendor sections load independently and team uses the existing authorized endpoint', () => {
  const source = read('assets/js/vendor-portal.js');
  const api = read('assets/js/api-service.js');
  assert.match(source, /Promise\.allSettled\(loaders\)/);
  assert.match(source, /leadResult\.status === 'rejected'/);
  assert.match(source, /assignmentResult\.status === 'rejected'/);
  assert.match(source, /invoiceResult\.status === 'rejected'/);
  assert.match(source, /performanceResult\.status === 'rejected'/);
  assert.match(source, /teamResult\.status === 'rejected'/);
  assert.match(api, /getVendorTeam\(\).*\/vendor-portal\/team/);
});

test('vendor self-signup is a secure three-step guided flow', () => {
  const page = read('pages/vendor-signup.html');
  const source = read('assets/js/vendor-signup.js');
  assert.equal((page.match(/data-signup-step=/g) || []).length, 3);
  assert.equal((page.match(/data-step-marker=/g) || []).length, 3);
  assert.match(page, /pending-review vendors/i);
  assert.match(page, /Stripe-hosted banking setup/);
  assert.match(source, /validateStep/);
  assert.match(source, /licensedTrade/);
  assert.match(source, /signupVendor\(payload\)/);
});

test('vendor redesign supports mobile, focus, reduced motion, and invited onboarding alignment', () => {
  const css = read('assets/css/vendor-portal-redesign.css');
  const invited = read('pages/vendor-onboarding.html');
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /vendor-detail-route/);
  assert.match(invited, /vendor-onboarding-unified\.css/);
  assert.match(invited, /normal dispatch begins only after approval/i);
});
