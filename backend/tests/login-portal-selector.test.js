const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('login offers CRM, residential, real estate agent, commercial, and vendor workspaces with CRM as the default', () => {
  const html = read('pages/login.html');
  assert.match(html, /<select id="portalType"[^>]*aria-describedby="portalDescription securityRoutingNote"/);
  assert.match(html, /<option value="crm" selected>CRM — Internal team<\/option>/);
  assert.match(html, /<option value="residential">Residential Client Portal<\/option>/);
  assert.match(html, /<option value="real_estate_agent">Real Estate Agent Portal<\/option>/);
  assert.match(html, /<option value="commercial">Commercial Client Portal<\/option>/);
  assert.match(html, /<option value="vendor">Vendor Portal<\/option>/);
  assert.match(html, /id="portalDescription" aria-live="polite"/);
  assert.match(html, /account permissions securely determine the portal you can open/i);
});

test('portal choice updates presentation and is remembered without becoming an authorization source', () => {
  const script = read('assets/js/login-script.js');
  const auth = read('backend/middleware/auth.js');
  assert.match(script, /smplfixPortalPreference/);
  assert.match(script, /selectedPortal\.destination/);
  assert.match(script, /response\.destination/);
  assert.doesNotMatch(script, /window\.location\.href\s*=\s*selectedPortal\.destination/);
  assert.match(auth, /destinationForRole\(req\.authUser\.role, requestedPath\)/);
  assert.match(auth, /allowed\.has\(parsed\.pathname\) \? `\$\{parsed\.pathname\}\$\{parsed\.search\}\$\{parsed\.hash\}` : fallback/);
  assert.match(auth, /new Set\(\['\/pages\/vendor-portal\.html'/);
});

test('portal selector has responsive, keyboard-visible styling', () => {
  const css = read('assets/css/login-styles.css');
  assert.match(css, /\.portal-selector\s*\{/);
  assert.match(css, /\.portal-selector \.field-control select/);
  assert.match(css, /\.field-control select:focus/);
  assert.match(css, /\.security-routing-note\s*\{/);
});
