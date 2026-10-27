const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('unlinked commercial users get explicit setup controls and permission navigation', () => {
  const script = fs.readFileSync(path.join(root, 'assets/js/commercial-portal.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'pages/commercial-portal.html'), 'utf8');
  assert.match(script, /Organization not linked/);
  assert.match(script, /renderScope\(\); renderNavigation\(\); renderAccount\(\);/);
  assert.match(script, /if \(!state\.organizationId\).*renderSetupState\(\)/);
  assert.match(script, /clearCache\?\.\(\)/);
  for (const id of ['requestSetupButton', 'refreshSetupButton', 'setupStatus']) assert.ok(page.includes(`id="${id}"`));
});

test('workspace setup requests require scoped access and never grant memberships', () => {
  const routes = fs.readFileSync(path.join(root, 'backend/routes/commercial.js'), 'utf8');
  const setup = routes.slice(routes.indexOf("router.post('/setup-request'"), routes.indexOf("router.get('/dashboard'"));
  assert.match(setup, /writes/);
  assert.match(setup, /organizationAccess\(req.user.userId, organizationId\)/);
  assert.match(setup, /role: 'admin', isActive: true/);
  assert.match(setup, /Notification.exists/);
  assert.doesNotMatch(setup, /CommercialMembership\.(create|update|findOneAndUpdate)/);
});

test('an active organization with no assigned locations renders setup instead of organization-not-found', () => {
  const routes = read('backend/routes/commercial.js');
  const portal = read('assets/js/commercial-portal.js');
  const selected = routes.slice(routes.indexOf('async function selectedAccesses'), routes.indexOf('async function commercialBillingRows'));
  assert.match(selected, /organizationAccess\(req\.user\.userId, organizationId\)/);
  assert.doesNotMatch(selected, /!accesses\.some\(item => String\(item\.location\.organizationId\) === organizationId\)/);
  assert.match(routes, /if \(!accesses\.length\) return res\.json\(/);
  assert.match(portal, /renderSetupState\(\)/);
  assert.match(portal, /Commercial organization/);
  assert.match(routes, /const item = preference \|\| \{\}/);
  assert.match(portal, /history\.replaceState\(null, '', '#overview'\); activateRoute\('overview'\)/);
});
