const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const Property = require('../models/Property');
const PropertyMembership = require('../models/PropertyMembership');
const User = require('../models/User');
const serializers = require('../utils/residentialSerializers');
const residentialRoute = require('../routes/residential');
const { addressKey, legacyAddresses, streetKey } = require('../migrate-residential-properties');
const checkRole = require('../middleware/rbac');

function objectId() {
  return new mongoose.Types.ObjectId();
}

function collectKeys(value, keys = []) {
  if (Array.isArray(value)) value.forEach(item => collectKeys(item, keys));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => {
    keys.push(key.toLowerCase().replace(/[^a-z0-9]/g, ''));
    collectKeys(item, keys);
  });
  return keys;
}

test('residential users and first-class property relationships validate', () => {
  const user = new User({ email: 'owner@example.com', password: 'password123', firstName: 'Home', lastName: 'Owner', role: 'residential' });
  assert.equal(user.validateSync(), undefined);

  const customerId = objectId();
  const property = new Property({ ownerCustomerId: customerId, addressLine1: '123 Main St' });
  assert.equal(property.validateSync(), undefined);
  assert.equal(property.status, 'active');

  const membership = new PropertyMembership({ userId: user._id, propertyId: property._id, customerId });
  assert.equal(membership.validateSync(), undefined);
  assert.equal(membership.permissions.view, true);
  assert.equal(membership.permissions.approveEstimates, true);

  const invalid = new PropertyMembership({ userId: user._id, propertyId: property._id, customerId, relationship: 'agent' });
  const agentErrors = invalid.validateSync().errors;
  assert.ok(agentErrors.endsAt);
  assert.ok(agentErrors.sourceTransactionId);
  assert.ok(agentErrors['permissions.approveEstimates']);
});

test('legacy property migration normalizes and de-duplicates customer addresses', () => {
  const customer = {
    address: '123 Main St.', city: 'Phoenix', state: 'AZ', zipCode: '85001',
    addresses: [
      { label: 'Home', address: '123 Main St', city: 'Phoenix', state: 'AZ', zipCode: '85001', isPrimary: true },
      { label: 'Rental', address: '9 West Road', city: 'Tempe', state: 'AZ', zipCode: '85281' }
    ]
  };
  const addresses = legacyAddresses(customer);
  assert.equal(addresses.length, 2);
  assert.equal(addressKey(addresses[0]), '123mainst|phoenix|az|85001');
  assert.equal(streetKey({ address: '123 MAIN ST.' }), streetKey(addresses[0]));
  assert.equal(addresses[1].label, 'Rental');
});

test('residential scope requires the authenticated user, active status, view permission, and valid dates', () => {
  const now = new Date('2026-09-02T12:00:00.000Z');
  const userId = objectId();
  const filter = residentialRoute.__test.activeMembershipFilter(userId, now);
  assert.equal(String(filter.userId), String(userId));
  assert.equal(filter.status, 'active');
  assert.equal(filter['permissions.view'], true);
  assert.deepEqual(filter.startsAt, { $lte: now });
  assert.equal(filter.$or[2].endsAt.$gt, now);
});

test('role middleware separates residential portal users from internal staff', () => {
  let allowed = false;
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  checkRole(['residential'])({ user: { role: 'residential' } }, response, () => { allowed = true; });
  assert.equal(allowed, true);

  allowed = false;
  checkRole(['admin', 'manager', 'account_rep'])({ user: { role: 'residential' } }, response, () => { allowed = true; });
  assert.equal(allowed, false);
  assert.equal(response.statusCode, 403);
});

test('residential serializers use allowlists and reject every private portal key', () => {
  const propertyId = objectId();
  const orderId = objectId();
  const commonPrivate = {
    vendorCost: 400,
    processingFee: 15,
    profit: 85,
    margin: 17,
    internalNotes: 'staff only',
    publicTokenHash: 'secret',
    history: [{ actorEmail: 'staff@example.com' }],
    metadata: { private: true }
  };
  const document = {
    documentId: 'doc-1', name: 'photo.jpg', type: 'image/jpeg', size: 100,
    fileId: objectId(), publicId: 'secret-provider-id', url: '/uploads/private-name.jpg', status: 'active'
  };
  const outputs = [
    serializers.serializeProperty({ _id: propertyId, addressLine1: '123 Main', documents: [document], ...commonPrivate }, { relationship: 'owner', permissions: { view: true } }),
    serializers.serializeOrder({ _id: orderId, propertyId, orderId: 'ORD-1', amount: 500, documents: [document], vendor: { _id: objectId(), name: 'Contractor', email: 'private@example.com' }, ...commonPrivate }),
    serializers.serializeEstimate({ _id: objectId(), orderId, customerTotal: 500, vendorSnapshot: { companyName: 'Contractor', rocNumber: 'ROC-1', email: 'private@example.com' }, markupAmount: 100, ...commonPrivate }),
    serializers.serializeSchedule({ _id: objectId(), orderId, vendorSnapshot: { name: 'Contractor', email: 'private@example.com' }, conflictSnapshot: [], ...commonPrivate }),
    serializers.serializeCompletion({ _id: objectId(), orderId, approvedTotal: 500, beforePhotos: [document], afterPhotos: [], vendorSnapshot: { name: 'Contractor', phone: 'private' }, ...commonPrivate }),
    serializers.serializeInvoice({ _id: objectId(), orderId, invoiceNumber: 'INV-1', amount: 500, quoteSnapshot: { vendorCost: 400, markupAmount: 100 }, ...commonPrivate }, { _id: objectId(), paymentId: 'PAY-1', status: 'pending', amount: 500, vendorPaymentAmount: 400 })
  ];
  const keys = collectKeys(outputs);
  serializers.PRIVATE_PORTAL_KEYS.forEach(key => assert.equal(keys.includes(key), false, `${key} leaked`));
  assert.equal(keys.some(key => key.includes('token')), false);
  assert.doesNotThrow(() => outputs.forEach(serializers.assertNoPrivatePortalFields));
  assert.throws(() => serializers.assertNoPrivatePortalFields({ nested: { vendorCost: 1 } }), /Private portal field blocked/);
  assert.equal(outputs[1].clientAmount, 500);
  assert.equal(outputs[2].clientTotal, 500);
});

test('residential routes are membership-scoped and never return raw internal order documents', () => {
  const route = read('backend/routes/residential.js');
  assert.match(route, /router\.use\(authenticateToken, checkRole\(\['residential'\]\)\)/);
  assert.match(route, /PropertyMembership\.findOne\(\{[\s\S]*activeMembershipFilter\(req\.user\.userId\)[\s\S]*propertyId:/);
  assert.match(route, /Order\.findOne\(\{ _id: req\.params\.orderId, propertyId: \{ \$in: scope\.propertyIds \} \}\)/);
  assert.match(route, /order: serializeOrder\(order\)/);
  assert.doesNotMatch(route, /res\.json\(order\)/);
  assert.match(route, /Order\.exists\(\{ _id: invoice\.orderId, propertyId: \{ \$in: scope\.propertyIds \} \}\)/);
});

test('legacy CRM routes are staff-only after residential authentication is enabled', () => {
  const server = read('backend/server.js');
  const sessions = read('backend/utils/authSessions.js');
  assert.match(sessions, /'admin', 'manager', 'account_rep', 'residential'/);
  assert.match(server, /app\.use\('\/api\/residential', checkRole\(\['residential'\]\), require\('\.\/routes\/residential'\)\)/);
  ['dashboard', 'orders', 'customers', 'vendors', 'employees', 'projects', 'notes', 'workflow-center', 'intakes', 'stages', 'pipeline-records', 'pipeline-movements', 'attachments', 'upload'].forEach(route => {
    assert.match(server, new RegExp(`app\\.use\\('\\/api\\/${route.replace(/-/g, '\\-')}', staffOnly`), `${route} is not staff-only`);
  });
});
