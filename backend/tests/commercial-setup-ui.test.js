const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

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
