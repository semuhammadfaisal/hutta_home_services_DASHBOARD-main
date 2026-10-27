const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('commercial properties and orders expose refreshable aggregate workspaces', () => {
  const routes = read('backend/routes/commercial.js');
  const portal = read('assets/js/commercial-portal.js');
  const api = read('assets/js/api-service.js');
  assert.match(routes, /properties\/:propertyId\/workspace/);
  assert.match(routes, /orders\/:orderId\/workspace/);
  assert.match(routes, /const found = await scopedProperty\(req, res\)/);
  assert.match(routes, /const found = await scopedCommercialOrder\(req, res\)/);
  assert.match(routes, /res\.set\('Cache-Control', 'private, no-store'\)\.json\(seal/);
  assert.match(portal, /#properties\/\$\{propertyId\}/);
  assert.match(portal, /#orders\/\$\{orderButton\.dataset\.orderId\}/);
  assert.match(portal, /renderPropertyWorkspace/);
  assert.match(portal, /renderOrderWorkspace/);
  assert.match(api, /getCommercialPropertyWorkspace/);
  assert.match(api, /getCommercialOrderWorkspace/);
});

test('commercial service requests retain deadline, access instructions, PO and idempotency data', () => {
  const html = read('pages/commercial-portal.html');
  const portal = read('assets/js/commercial-portal.js');
  const routes = read('backend/routes/commercial.js');
  const model = read('backend/models/Order.js');
  for (const id of ['requestDeadline', 'requestAccess', 'requestPo']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(portal, /targetCompletionDeadline:\$\('requestDeadline'\)\.value/);
  assert.match(portal, /accessInstructions:\$\('requestAccess'\)\.value/);
  assert.match(routes, /Target completion date must be a future Arizona date/);
  assert.match(routes, /actionUrl:`#orders\/\$\{created\._id\}`/);
  assert.match(model, /commercialContext:[\s\S]*targetCompletionDeadline: Date/);
  assert.match(model, /commercialContext:[\s\S]*accessInstructions:/);
});

test('commercial notification actions stay scoped and open exact workspaces', () => {
  const routes = read('backend/routes/commercial.js');
  const serializers = read('backend/utils/commercialSerializers.js');
  const portal = read('assets/js/commercial-portal.js');
  assert.match(routes, /notifications\/:notificationId\/read/);
  assert.match(routes, /userId: req\.user\.userId/);
  assert.match(routes, /'metadata\.propertyId': \{ \$in: propertyIds \}/);
  assert.match(serializers, /actionUrl\.startsWith\('#'\)/);
  assert.match(portal, /markCommercialNotificationRead/);
  assert.match(serializers, /assertNoPrivateCommercialFields/);
});
