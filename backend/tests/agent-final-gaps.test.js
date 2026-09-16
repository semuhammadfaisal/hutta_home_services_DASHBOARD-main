const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createAgentArchive, safeName } = require('../utils/agentArchive');
const { clientDocumentAllowed } = require('../utils/agentDocumentPolicy');
const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');

test('ZIP contains real files and safe unique entry names, not just summaries', async () => {
  const zip = await createAgentArchive([{ name: '../../photo.png', buffer: Buffer.from('REAL-PHOTO') }, { name: 'estimate.pdf', buffer: Buffer.from('CLIENT-PRICE-ONLY') }]);
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let offset = zip.readUInt32LE(eocd + 16);
  const actual = [];
  while (zip.readUInt32LE(offset) === 0x02014b50) {
    const size = zip.readUInt32LE(offset + 20), nameLength = zip.readUInt16LE(offset + 28);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString();
    const local = zip.readUInt32LE(offset + 42);
    const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(dataStart, dataStart + size);
    actual.push({ name, content: zip.readUInt16LE(offset + 10) === 8 ? zlib.inflateRawSync(data).toString() : data.toString() });
    offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
  }
  assert.deepEqual(actual.map(item => item.content), ['REAL-PHOTO', 'CLIENT-PRICE-ONLY']);
  assert.ok(actual.every(item => !item.name.includes('/')));
  assert.doesNotMatch(safeName('../bad\\name\r\n'), /[/\\\r\n]/);
  await assert.rejects(createAgentArchive(Array.from({ length: 251 }, () => ({ name: 'file', buffer: Buffer.alloc(0) }))), /limits/);
});

test('uncategorized and private vendor/internal documents cannot enter a client bundle', () => {
  for (const kind of ['vendor_estimate', 'vendor_invoice', 'internal', undefined]) assert.equal(clientDocumentAllowed({ portalDocumentType: kind }), false);
  for (const kind of ['inspection_report', 'supporting_photo', 'warranty']) assert.equal(clientDocumentAllowed({ portalDocumentType: kind }), true);
  assert.equal(clientDocumentAllowed({ category: 'warranty', status: 'archived' }), false);
});

test('all agent routes are guarded before any handler, and bundle expiry is rechecked', () => {
  const route = read('backend/routes/agent.js');
  assert.ok(route.indexOf('router.use(async') < route.indexOf('router.post('));
  assert.match(route, /profile.status !== 'active'/);
  assert.match(route, /package.zip', writes/);
  assert.match(route, /if \(!\(await scopedTransaction\(req, res, 'viewDocuments'\)\)\) return/);
  assert.match(route, /existingProperty\?\.label/);
  assert.doesNotMatch(route, /\|\| proposedProperty.label/);
  assert.match(route, /filter\(clientDocumentAllowed\)/);
});

test('availability is explicit calendar data checked against compliance and overlaps', () => {
  const route = read('backend/routes/agent.js');
  assert.match(route, /VendorAvailabilitySlot.find/);
  assert.match(route, /postalCodes: property\?\.postalCode/);
  assert.match(route, /activeCompliance\(vendor\)/);
  assert.match(route, /proposedStart: \{ \$lt: slot.endsAt \}/);
  assert.match(route, /guaranteed: false/);
  assert.doesNotMatch(route, /source: 'active_client_estimates'/);
});

test('agent approval sends password-free email and records delivery failures', () => {
  const email = read('backend/utils/emailService.js').split('const sendAgentApprovalEmail =')[1].split('const sendWelcomeEmail =')[0];
  assert.match(email, /buildPublicUrl\('\/pages\/login.html'\)/);
  assert.doesNotMatch(email, /\$\{password\}/);
  const users = read('backend/routes/users.js');
  assert.match(users, /sendAgentApprovalEmail\(user.email, user.firstName\)/);
  assert.match(users, /status: 'accepted'/);
  assert.match(users, /status: 'failed'/);
});

test('approval email delivers a safe login link and propagates provider errors', async () => {
  const { sendAgentApprovalEmail } = require('../utils/emailService');
  let payload;
  await sendAgentApprovalEmail('agent@example.com', '<Ryan>', async message => { payload = message; return { messageId: 'test-delivery' }; });
  assert.equal(payload.to, 'agent@example.com');
  assert.match(payload.html, /&lt;Ryan&gt;/);
  assert.match(payload.html, /\/pages\/login.html/);
  assert.doesNotMatch(payload.html, /Password:\s*<strong>|temporary password/);
  await assert.rejects(sendAgentApprovalEmail('agent@example.com', 'Ryan', async () => { throw new Error('provider unavailable'); }), /provider unavailable/);
});

test('suspended agents get 403 on real routed APIs before database resource handlers', async () => {
  const express = require('express');
  const User = require('../models/User');
  const Profile = require('../models/RealEstateAgentProfile');
  const originalUser = User.findOne, originalProfile = Profile.findOne;
  const id = '507f1f77bcf86cd799439011';
  User.findOne = () => ({ lean: async () => ({ _id: id, role: 'real_estate_agent', isActive: true }) });
  Profile.findOne = () => ({ lean: async () => ({ userId: id, status: 'suspended' }) });
  const app = express();
  app.use((req, _res, next) => { req.user = { userId: id, role: 'real_estate_agent' }; next(); });
  app.use('/agent', require('../routes/agent'));
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    for (const route of ['/me', '/orders', '/referrals', '/transactions/x/package.zip', '/orders/x/messages', '/transactions/x/documents/x']) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/agent${route}`);
      assert.equal(response.status, 403, route);
    }
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    User.findOne = originalUser; Profile.findOne = originalProfile;
  }
});
