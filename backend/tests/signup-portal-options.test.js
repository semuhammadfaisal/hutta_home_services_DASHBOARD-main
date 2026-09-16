const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const User = require('../models/User');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('signup icons and checkbox states work without external icon fonts', () => {
  const html = read('pages/signup.html'); const css = read('assets/css/login-styles.css'); const icons = read('assets/js/signup-icons.js'); const js = read('assets/js/signup-script.js');
  assert.match(html, /signup-icons\.js/);
  assert.match(html, /id="vendorLicensedTrade"[^>]*><span class="check-control__box"/);
  for (const id of ['vendorCompanyName', 'vendorPhone', 'vendorTrades', 'vendorAddress', 'vendorZip', 'vendorRadius', 'vendorRocNumber']) assert.ok(icons.includes(id));
  assert.match(icons, /viewBox="0 0 24 24"/);
  assert.match(icons, /focusable="false"/);
  assert.match(css, /content: none !important/);
  assert.match(css, /fill: none !important/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(js, /renderSignupIcons\?\.\(\)/);
  assert.match(js, /aria-busy/);
});

test('signup offers five portals and preserves staff-controlled account access', () => {
  const html = read('pages/signup.html');
  for (const portal of ['crm', 'residential', 'real_estate_agent', 'commercial', 'vendor']) assert.match(html, new RegExp(`option value="${portal}"`));
  const js = read('assets/js/signup-script.js');
  assert.match(js, /requestedPortal === 'vendor'/);
  assert.match(js, /APIService\.signupVendor/);
  assert.doesNotMatch(js, /vendor-signup\.html/);
  assert.match(html, /vendorSignupFields/);
  assert.match(js, /vendorFields\.disabled = portal !== 'vendor'/);
  assert.match(js, /form\.reportValidity/);
  assert.match(js, /requestedPortal === 'crm'/);
  assert.match(js, /requestedPortal\n/);
  assert.match(js, /\.get\('portal'\)/);
  assert.match(read('assets/js/login-script.js'), /signup\.html\?portal=/);
});

test('requested customer portal roles are schema-valid but never active by signup selection', () => {
  const roles = User.schema.path('requestedRole').enumValues;
  for (const role of ['residential', 'real_estate_agent', 'commercial']) assert.ok(roles.includes(role));
  assert.ok(!roles.includes('vendor'));
  const auth = read('backend/routes/auth.js').split("router.post('/signup'")[1].split("router.post('/vendor-signup'")[0];
  assert.match(auth, /requestedRole !== requestedPortal/);
  assert.match(auth, /requestedPortal === 'crm'/);
  assert.match(auth, /role: 'pending'/);
  assert.match(auth, /isActive: false/);
  assert.doesNotMatch(auth, /createSession|PropertyMembership\.create|CommercialMembership\.create/);
});
