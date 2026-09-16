const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const objectId = () => new mongoose.Types.ObjectId();
const AgentInvitation = require('../models/AgentInvitation');
const PropertyMembership = require('../models/PropertyMembership');
const RealEstateTransaction = require('../models/RealEstateTransaction');
const User = require('../models/User');
const checkRole = require('../middleware/rbac');
const { agentPermissions, calculateAccessExpiry, createInvitationToken, hashInvitationToken, membershipPermissions } = require('../utils/agentAccess');
const serializers = require('../utils/agentSerializers');

function normalizedKeys(value, output = []) {
  if (Array.isArray(value)) value.forEach(item => normalizedKeys(item, output));
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
    output.push(key.toLowerCase().replace(/[^a-z0-9]/g, ''));
    normalizedKeys(item, output);
  }
  return output;
}

test('real estate agent identity is a first-class authenticated role', () => {
  const user = new User({ email: 'agent@example.com', password: 'password123', firstName: 'Ada', lastName: 'Agent', role: 'real_estate_agent' });
  assert.equal(user.validateSync(), undefined);
  let allowed = false;
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  checkRole(['real_estate_agent'])({ user: { role: 'real_estate_agent' } }, response, () => { allowed = true; });
  assert.equal(allowed, true);
  allowed = false;
  checkRole(['residential'])({ user: { role: 'real_estate_agent' } }, response, () => { allowed = true; });
  assert.equal(allowed, false);
  assert.equal(response.statusCode, 403);
});

test('agent membership requires a transaction and expiry and can never grant approval, billing, or ownership management', () => {
  const ids = { userId: objectId(), propertyId: objectId(), customerId: objectId(), transactionId: objectId() };
  const unsafe = new PropertyMembership({ ...ids, sourceTransactionId: ids.transactionId, relationship: 'agent', endsAt: new Date(Date.now() + 86400000), permissions: { view: true, requestService: true, approveEstimates: true, manageBilling: true, manageProperty: true } });
  const errors = unsafe.validateSync().errors;
  assert.ok(errors['permissions.approveEstimates']);
  assert.ok(errors['permissions.manageBilling']);
  assert.ok(errors['permissions.manageProperty']);

  const permissions = membershipPermissions({ viewStatus: true, requestService: true });
  const safe = new PropertyMembership({ ...ids, sourceTransactionId: ids.transactionId, relationship: 'agent', endsAt: new Date(Date.now() + 86400000), permissions });
  assert.equal(safe.validateSync(), undefined);
  assert.deepEqual(permissions, { view: true, requestService: true, approveEstimates: false, manageBilling: false, manageProperty: false });
});

test('transaction permissions expose operational actions only', () => {
  const permissions = agentPermissions({ requestService: false, approveEstimates: true, manageBilling: true });
  assert.deepEqual(permissions, { viewStatus: true, requestService: false, uploadInspection: true, viewDocuments: true, message: true });
  const transaction = new RealEstateTransaction({ agentUserId: objectId(), customerId: objectId(), propertyId: objectId(), label: '123 Main closing', closeDate: new Date('2026-10-10T07:00:00Z'), accessEndsAt: new Date('2026-10-11T07:00:00Z'), permissions, createdBy: objectId() });
  assert.equal(transaction.validateSync(), undefined);
  assert.equal(transaction.schema.path('permissions.approveEstimates'), undefined);
});

test('invitation tokens are random, hashed, single-use stateful, and hidden by default', () => {
  const first = createInvitationToken(); const second = createInvitationToken();
  assert.notEqual(first, second);
  assert.ok(first.length >= 43);
  assert.match(hashInvitationToken(first), /^[a-f0-9]{64}$/);
  assert.notEqual(hashInvitationToken(first), first);
  assert.equal(AgentInvitation.schema.path('tokenHash').options.select, false);
  assert.equal(AgentInvitation.schema.path('tokenHash').options.unique, true);
  assert.deepEqual(AgentInvitation.schema.path('status').enumValues, ['pending', 'processing', 'accepted', 'revoked', 'expired']);
});

test('close-date expiry covers the full Arizona close date and validates extension bounds', () => {
  assert.equal(calculateAccessExpiry('2026-10-10', 0).toISOString(), '2026-10-11T07:00:00.000Z');
  assert.equal(calculateAccessExpiry('2026-10-10', 3).toISOString(), '2026-10-14T07:00:00.000Z');
  assert.equal(calculateAccessExpiry('2026-02-30', 0), null);
  assert.equal(calculateAccessExpiry('2026-10-10', 31), null);
});

test('agent serializers allowlist status data and block private pricing and contact fields recursively', () => {
  const order = serializers.serializeOrder({
    _id: objectId(), propertyId: objectId(), orderId: 'ORD-1', service: 'HVAC', description: 'Inspect unit', status: 'scheduled', amount: 1200,
    vendorCost: 700, markup: 500, coordinationFee: 100, profit: 400, margin: 33, processingFee: 12, internalNotes: 'private',
    customer: { email: 'owner@example.com', phone: '555-0100' }, vendor: { name: 'ROC Co', email: 'vendor@example.com', phone: '555-0101', rocNumber: 'ROC-1' }
  });
  const json = JSON.stringify(order);
  for (const secret of ['1200', '700', 'owner@example.com', 'vendor@example.com', 'private']) assert.equal(json.includes(secret), false);
  const keys = normalizedKeys(order);
  for (const key of ['amount', 'vendorcost', 'markup', 'coordinationfee', 'profit', 'margin', 'processingfee', 'internalnotes', 'customeremail', 'customerphone']) assert.equal(keys.includes(key), false, `${key} leaked`);
  assert.equal(order.vendor.rocNumber, 'ROC-1');
  assert.equal(order.capabilities.canApproveEstimates, false);
  assert.equal(order.capabilities.canManageBilling, false);
  assert.equal(serializers.serializeMessage({ body: 'Call 602-555-0199 or vendor@example.com', senderType: 'vendor' }).body, 'Call [contact hidden] or [contact hidden]');
  assert.throws(() => serializers.seal({ nested: { vendorCost: 1 } }), /Private agent field blocked/);
});

test('agent routes fail closed on IDOR, expiration, property/customer mismatch, and document access', () => {
  const route = read('backend/routes/agent.js');
  assert.match(route, /const nowFilter = \(userId,[^\n]+agentUserId: userId, status: 'active', accessEndsAt: \{ \$gt: now \}/);
  assert.match(route, /propertyId: transaction\.propertyId, customerId: transaction\.customerId, relationship: 'agent', sourceTransactionId: transaction\._id/);
  assert.match(route, /propertyId: order\.propertyId, customerId: order\.customerId/);
  assert.match(route, /permissions\.\$\{permission\}/);
  assert.match(route, /scopedTransaction\(req, res, 'viewDocuments'\)/);
  assert.match(route, /scopedOrder\(req, res, 'viewDocuments'\)/);
  assert.match(route, /'Cache-Control': 'private, no-store'/);
  assert.doesNotMatch(route, /router\.(post|patch|put)\([^\n]*(approve|payment|billing)/i);
});

test('invitation acceptance atomically binds the signed-in agent and blocks replay', () => {
  const route = read('backend/routes/agent.js');
  assert.match(route, /hashInvitationToken\(rawToken\)/);
  assert.match(route, /agentUserId: req\.user\.userId, agentEmail: String\(req\.user\.email\)\.toLowerCase\(\), status: 'pending', expiresAt: \{ \$gt: now \}/);
  assert.match(route, /\$set: \{ status: 'processing' \}/);
  assert.match(route, /session\.withTransaction/);
  assert.match(route, /relationship: 'owner', status: 'active'/);
  assert.match(route, /ownerCustomerId: invitation\.customerId/);
  assert.match(route, /invitation\.status = 'accepted'/);
  assert.match(route, /status: 'expired'/);
});

test('staff invitation flow reuses existing customers and properties and supports audited extension and revocation', () => {
  const route = read('backend/routes/agentAdmin.js'); const server = read('backend/server.js');
  assert.match(server, /app\.use\('\/api\/agent', checkRole\(\['real_estate_agent'\]\), require\('\.\/routes\/agent'\)\)/);
  assert.match(server, /app\.use\('\/api\/agent-admin', staffOnly, require\('\.\/routes\/agentAdmin'\)\)/);
  assert.match(route, /Customer\.findOne\(\{ _id: req\.body\.customerId, status: 'active' \}\)/);
  assert.match(route, /Property\.findOne\(\{ _id: req\.body\.propertyId, ownerCustomerId: req\.body\.customerId, status: 'active' \}\)/);
  assert.doesNotMatch(route, /Customer\.create|Property\.create/);
  assert.match(route, /createInvitationToken\(\)/);
  assert.match(route, /tokenHash = hashInvitationToken\(rawToken\)/);
  assert.match(route, /accessHistory\.push\(\{ action: 'extended'/);
  assert.match(route, /relationship: 'agent'/);
  assert.match(route, /action: 'revoked'/);
});

test('agent resources are explicit and use shared orders, messages, documents, and referral attribution', () => {
  const route = read('backend/routes/agent.js');
  for (const endpoint of ["'/clients'", "'/properties'", "'/transactions'", "'/portfolio'", "'/orders'", "'/activity'", "'/referrals'", "'/notifications'"]) assert.ok(route.includes(endpoint), `${endpoint} missing`);
  assert.match(route, /source: 'agent_portal'/);
  assert.match(route, /pricingStatus: 'unquoted'/);
  assert.match(route, /ResidentialMessage\.create/);
  assert.match(route, /senderType: 'agent'/);
  assert.match(route, /AgentReferralAttribution\.updateOne/);
  assert.match(route, /uploadInspection/);
  assert.match(route, /validFileSignature/);
});
