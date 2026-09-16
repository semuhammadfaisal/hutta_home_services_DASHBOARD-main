const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const objectId = () => new mongoose.Types.ObjectId();
const AgentClientInvitation = require('../models/AgentClientInvitation');
const PropertyMembership = require('../models/PropertyMembership');
const authenticate = require('../middleware/auth');
const { createInvitationToken, hashInvitationToken, membershipPermissions } = require('../utils/agentAccess');
const { serializeClientInvitation } = require('../utils/agentSerializers');
const { buildPublicUrl } = require('../utils/publicAppUrl');

test('agent-to-homeowner tokens are hashed, hidden, expiring, and stateful', () => {
  const token = createInvitationToken();
  assert.ok(token.length >= 43);
  assert.notEqual(hashInvitationToken(token), token);
  assert.equal(AgentClientInvitation.schema.path('tokenHash').options.select, false);
  assert.equal(AgentClientInvitation.schema.path('tokenHash').options.unique, true);
  assert.equal(AgentClientInvitation.schema.path('expiresAt').options.required, true);
  assert.deepEqual(AgentClientInvitation.schema.path('status').enumValues, ['pending', 'processing', 'accepted', 'expired', 'revoked']);
  const pendingIndex = AgentClientInvitation.schema.indexes().find(([, options]) => options.name === 'one_pending_agent_homeowner_property_invitation');
  assert.equal(pendingIndex[1].unique, true);
  assert.deepEqual(pendingIndex[1].partialFilterExpression, { status: 'pending' });
});

test('invitation serializer never exposes tokens, consent audit details, passwords, or payment data', () => {
  const invitation = new AgentClientInvitation({
    tokenHash: 'a'.repeat(64), agentUserId: objectId(), homeownerEmail: 'owner@example.com',
    homeownerName: 'Owner', proposedProperty: { label: 'Home', addressLine1: '1 Main St', city: 'Phoenix', state: 'AZ', postalCode: '85001' },
    propertyFingerprint: 'address:1-main-st', transactionLabel: 'Home closing', closeDate: new Date('2026-12-01T07:00:00Z'),
    accessEndsAt: new Date('2026-12-02T07:00:00Z'), expiresAt: new Date('2026-11-20T07:00:00Z'), createdBy: objectId(),
    consent: { version: 'v1', text: 'private consent record', typedName: 'Owner', propertyConfirmed: true, permissions: { viewStatus: true }, acceptedAt: new Date(), ipAddress: '127.0.0.1' }
  });
  const output = serializeClientInvitation(invitation);
  const json = JSON.stringify(output).toLowerCase();
  for (const forbidden of ['token', 'password', 'payment', 'typedname', 'ipaddress', 'private consent record']) assert.equal(json.includes(forbidden), false, forbidden);
  assert.equal(output.homeownerEmail, 'owner@example.com');
  assert.equal(output.property.address.line1, '1 Main St');
});

test('agent memberships can never receive approval, billing, or property ownership authority', () => {
  const permissions = membershipPermissions({ viewStatus: true, requestService: true });
  assert.deepEqual(permissions, { view: true, requestService: true, approveEstimates: false, manageBilling: false, manageProperty: false });
  const membership = new PropertyMembership({ userId: objectId(), customerId: objectId(), propertyId: objectId(), relationship: 'agent', sourceTransactionId: objectId(), endsAt: new Date(Date.now() + 86400000), permissions });
  assert.equal(membership.validateSync(), undefined);
});

test('session responses never include password hashes or payment authority', () => {
  const user = { _id: objectId(), email: 'owner@example.com', firstName: 'Home', lastName: 'Owner', role: 'residential', password: '$2a$10$secret', paymentMethod: 'card' };
  const output = authenticate.publicUser(user);
  assert.equal(Object.hasOwn(output, 'password'), false);
  assert.equal(Object.hasOwn(output, 'paymentMethod'), false);
  assert.deepEqual(Object.keys(output).sort(), ['avatar', 'department', 'email', 'firstName', 'id', 'lastName', 'phone', 'role', 'userId'].sort());
});

test('creation handles duplicate/live access and only accepts previously scoped properties', () => {
  const route = read('backend/routes/agent.js');
  assert.match(route, /pending invitation already exists/i);
  assert.match(route, /already linked to your active portfolio/i);
  assert.match(route, /relationship: 'agent'/);
  assert.match(route, /customerEmails\.includes\(homeownerEmail\)/);
  assert.match(route, /findOne\(\{ userId: req\.user\.userId, status: 'active' \}\)/);
});

test('deployment migration is dry-run by default and creates invitation indexes only when applied', () => {
  const migration = read('backend/migrate-agent-client-invitations.js');
  const packageJson = JSON.parse(read('backend/package.json'));
  assert.match(migration, /process\.argv\.includes\('--apply'\)/);
  assert.match(migration, /Duplicate pending invitations must be resolved/);
  assert.match(migration, /AgentClientInvitation\.collection\.createIndex/);
  assert.equal(packageJson.scripts['migrate:agent-client-invitations:apply'], 'node migrate-agent-client-invitations.js --apply');
});

test('homeowner acceptance requires matching identity, explicit consent, and atomic single-use claim', () => {
  const route = read('backend/routes/agentClientInvitations.js');
  assert.match(route, /homeownerEmail: email, status: 'pending', expiresAt: \{ \$gt: now \}/);
  assert.match(route, /propertyConfirmed !== true/);
  assert.match(route, /consentAccepted !== true/);
  assert.match(route, /status: 'processing'/);
  assert.match(route, /existingOwner/);
  assert.match(route, /owned by another portal account and requires staff review/);
});

test('invite-only account creation binds the email and returns a safe residential session', () => {
  const route = read('backend/routes/auth.js');
  assert.match(route, /tokenHash: hashInvitationToken\(token\), homeownerEmail: email, status: 'pending'/);
  assert.match(route, /role: 'residential', isActive: true/);
  assert.match(route, /EXISTING_ACCOUNT/);
  assert.doesNotMatch(route, /residential-invite-signup[\s\S]{0,1800}res\.json\([^\n]*password/);
});

test('homeowner and staff revocation end both transaction and agent membership access', () => {
  const homeowner = read('backend/routes/agentClientInvitations.js');
  const staff = read('backend/routes/agentAdmin.js');
  for (const route of [homeowner, staff]) {
    assert.match(route, /status: 'revoked'/);
    assert.match(route, /PropertyMembership\.updateOne/);
    assert.match(route, /AgentClientInvitation\.updateOne/);
  }
  assert.match(homeowner, /permissions\.manageProperty/);
});

test('agent portal shows every invitation state and never asks for a homeowner password', () => {
  const html = read('pages/agent-portal.html'); const script = read('assets/js/agent-portal.js');
  for (const status of ['pending', 'accepted', 'expired', 'revoked']) assert.match(html, new RegExp(`value="${status}"`));
  assert.match(script, /createAgentClientInvitation/);
  assert.match(script, /resendAgentClientInvitation/);
  assert.match(script, /revokeAgentClientInvitation/);
  assert.doesNotMatch(html, /type="password"/i);
  assert.doesNotMatch(script, /homeownerPassword|clientPassword/i);
});

test('homeowner acceptance UI preserves control and removes the token after acceptance', () => {
  const html = read('pages/agent-invitation.html'); const script = read('assets/js/agent-invitation.js'); const api = read('assets/js/api-service.js');
  assert.match(html, /agent cannot approve estimates, enter payment information, manage billing/i);
  assert.match(html, /explicit|confirm the property/i);
  assert.match(script, /history\.replaceState\(null, '', location\.pathname\)/);
  assert.match(script, /createResidentialInviteAccount/);
  assert.match(script, /previewAgentClientInvitation/);
  assert.match(api, /agent-invitation\.html/);
});

test('secure links keep invitation tokens in URL fragments rather than server-visible queries', () => {
  const agentRoute = read('backend/routes/agent.js'); const email = read('backend/utils/emailService.js');
  assert.match(agentRoute, /agent-invitation\.html', `invitation=/);
  assert.match(email, /buildPublicUrl\('\/pages\/agent-invitation\.html', `invitation=/);
  assert.doesNotMatch(email, /agent-invitation\.html\?invitation=/);
  assert.match(buildPublicUrl('/pages/agent-invitation.html', 'invitation=private-token'), /agent-invitation\.html#invitation=private-token$/);
});
