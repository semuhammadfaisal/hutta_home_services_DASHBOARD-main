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
test('precise property details are normalized and validated for add and edit forms', () => {
  const output = validateProperty({
    ...valid, propertySubtype: 'Ranch', propertyTitle: 'Desert home', yearBuilt: '2004', bedrooms: '4', fullBathrooms: '2',
    livingAreaSqFt: '2450', lotSize: '0.4', lotSizeUnit: 'acres', county: 'Maricopa', parcelNumber: 'APN-22',
    interiorCooling: 'Central AC', exteriorType: 'Stucco', utilityElectricity: 'APS', hasHoa: true, hoaFee: '125', hoaFrequency: 'monthly',
    virtualTourUrl: 'https://example.com/tour', ownerName: 'Home Owner', ownerEmail: 'owner@example.com', ownerType: 'individual', ownerDeclaration: true
  });
  assert.equal(output.errors.length, 0);
  assert.equal(output.data.details.yearBuilt, 2004);
  assert.equal(output.data.details.lotSizeUnit, 'acres');
  assert.equal(output.data.addressDetails.parcelNumber, 'APN-22');
  assert.equal(output.data.hoa.hasHoa, true);
  assert.equal(output.data.ownerInformation.email, 'owner@example.com');
  assert.equal(output.data.ownershipVerification.declarationConfirmed, true);
  assert.match(validateProperty({ ...valid, yearBuilt: '1200', virtualTourUrl: 'javascript:alert(1)' }).errors.join(' '), /Year built|Virtual tour URL/);
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

test('Add All Details progressively exposes every property section with secure uploads', () => {
  const html = read('pages/residential-portal.html');
  const js = read('assets/js/residential-portal.js');
  const api = read('assets/js/api-service.js');
  const featureRoute = read('backend/routes/residentialFeatures.js');
  const serializer = serializeProperty({ _id: 'id', details: { bedrooms: 3 }, addressDetails: { county: 'Maricopa' }, ownershipVerification: { status: 'pending_review', declarationConfirmed: true } }, {});
  assert.equal(serializer.details.bedrooms, 3);
  assert.equal(serializer.addressDetails.county, 'Maricopa');
  assert.equal(serializer.ownershipVerification.status, 'pending_review');
  assert.match(html, /data-expand-property-details="addPropertyExtendedDetails"/);
  assert.match(html, /id="propertyExtendedDetailsTemplate"/);
  for (const heading of ['Property Details', 'Property Address', 'Interior Features', 'Exterior Features', 'Utilities', 'HOA', 'Photos &amp; Media', 'Important Documents', 'Owner Information', 'Verification']) assert.match(html, new RegExp(heading));
  for (const field of ['propertySubtype', 'yearBuilt', 'parcelNumber', 'interiorCooling', 'roofType', 'utilityWaterHeater', 'hoaFee', 'virtualTourUrl', 'ownerType', 'ownershipProof']) assert.match(html, new RegExp(`name="${field}"`));
  assert.match(js, /initializePropertyDetailForms/);
  assert.match(js, /uploadPropertyFiles/);
  assert.match(js, /uploadResidentialPassportDocument/);
  assert.match(api, /uploadResidentialPassportDocument/);
  assert.match(featureRoute, /'video\/mp4'/);
  assert.match(featureRoute, /category === 'proof_of_ownership'/);
  assert.match(featureRoute, /'ownershipVerification.status': 'pending_review'/);
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
