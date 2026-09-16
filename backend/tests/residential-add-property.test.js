const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateProperty, exactText } = require('../utils/residentialProperties');
const Property = require('../models/Property');
const Customer = require('../models/Customer');
const { serializeProperty } = require('../utils/residentialSerializers');
const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
const valid = { addressLine1: '123 Main St', city: 'Phoenix', state: 'AZ', postalCode: '85001', confirmAuthority: true };
test('property validation requires address and authority and rejects objects and oversized values', () => {
  assert.equal(validateProperty(valid).errors.length, 0);
  assert.ok(validateProperty({}).errors.length >= 5);
  assert.ok(validateProperty({ ...valid, city: { $ne: null }, label: 'x'.repeat(121) }).errors.length >= 2);
  assert.ok(validateProperty({ ...valid, confirmAuthority: 'true' }).errors.length);
});
test('address keys normalize case and whitespace while preserving unit separation', () => {
  assert.equal(validateProperty(valid).addressKey, validateProperty({ ...valid, city: ' PHOENIX ', addressLine1: '123  MAIN St' }).addressKey);
  assert.notEqual(validateProperty(valid).addressKey, validateProperty({ ...valid, addressLine2: 'Unit 2' }).addressKey);
  assert.ok(exactText('123 Main (A)').test(' 123 MAIN (A) '));
  assert.ok(!exactText('123 Main (A)').test('123 Main A'));
});
test('private ownership/dedup keys have unique indexes and cannot leak through serializer', () => {
  assert.ok(Property.schema.indexes().some(([key, options]) => key.residentialAddressKey && options.unique && options.sparse));
  assert.ok(Customer.schema.indexes().some(([key, options]) => key.portalOwnerUserId && options.unique));
  assert.doesNotMatch(JSON.stringify(serializeProperty({ _id: 'id', residentialAddressKey: 'private-key', ownerCustomerId: 'owner' }, {})), /private-key|residentialAddressKey/);
});
test('property creation is residential-only, transactional, server-owned, conflict-safe, and audited', () => {
  const route = read('backend/routes/residential.js');
  assert.match(route, /router.use\(authenticateToken, checkRole\(\['residential'\]\)\)/);
  const create = route.split("router.post('/properties'")[1].split("router.get('/properties'")[0];
  assert.match(create, /actionLimiter/); assert.match(create, /session.withTransaction/);
  assert.match(create, /relationship: 'owner'/); assert.match(create, /permissions.manageProperty/);
  assert.match(create, /ownerCustomerId: customer._id/); assert.match(create, /PropertyMembership.create/);
  assert.match(create, /requires staff review/); assert.match(create, /Customer.exists/);
  assert.match(create, /SecurityAuditEvent.create/); assert.match(create, /PortalActivity.create/);
  assert.match(create, /error.code === 11000/);
});
test('portal offers accessible property form, duplicate guard, offline/error states and refresh', () => {
  const html = read('pages/residential-portal.html'); const js = read('assets/js/residential-portal.js');
  assert.doesNotMatch(html, /Adding properties will be available/);
  assert.match(html, /id="addPropertyDialog" aria-labelledby="addPropertyTitle"/);
  assert.match(html, /name="confirmAuthority" required/);
  assert.match(js, /button.disabled \|\| !form.reportValidity/);
  assert.match(js, /navigator.onLine/); assert.match(js, /addResidentialProperty/);
  assert.match(js, /state.currentPropertyId = safeId\(response.data.id\)/);
});

test('View property record opens on demand, scrolls and focuses the record with bounded SVG icons', () => {
  const js = read('assets/js/residential-portal.js'); const css = read('assets/css/residential-portal.css');
  assert.match(js, /aria-controls="propertyDetail" aria-expanded=/);
  assert.match(js, /propertyDetailTitle.focus\(\{ preventScroll: true \}\)/);
  assert.match(js, /propertyDetail.scrollIntoView/);
  assert.match(js, /state.currentPropertyId && !elements.propertyDetail.hidden/);
  assert.match(js, /safeId\(propertyId\) !== safeId\(state.currentPropertyId\)/);
  assert.match(css, /\.property-card-icon svg \{ width: 22px; height: 22px/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /scroll-margin-top/);
  assert.match(css, /\.property-card \.property-card-icon \{ display: grid; place-items: center/);
});
