const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('commercial setup requests are durable, deduplicated, and linked to the staff workspace', () => {
  const portalRoutes = read('backend/routes/commercial.js');
  const model = read('backend/models/CommercialSetupRequest.js');
  const migration = read('backend/migrate-commercial-accounts.js');
  assert.match(portalRoutes, /CommercialSetupRequest\.findOne\(\{ activeKey \}\)/);
  assert.match(portalRoutes, /CommercialSetupRequest\.create/);
  assert.match(portalRoutes, /#commercial-setup\/\$\{setupRequest\._id\}/);
  assert.match(model, /activeKey: \{ type: String, unique: true, sparse: true/);
  assert.match(model, /pending.*processing.*completed.*rejected/);
  assert.match(migration, /CommercialSetupRequest/);
  assert.match(migration, /MODELS\.map\(Model => Model\.createIndexes\(\)\)/);
});

test('staff completion provisions canonical locations, tier agreements, access, audit, and client notification', () => {
  const routes = read('backend/routes/commercialAdmin.js');
  const server = read('backend/server.js');
  assert.match(server, /\/api\/commercial-admin', staffOnly/);
  assert.match(routes, /Property\.find\(\{ _id: \{ \$in:/);
  assert.match(routes, /CommercialLocation\.findOneAndUpdate/);
  assert.match(routes, /CommercialServiceAgreement\.findOne/);
  assert.match(routes, /membership\.propertyAccess !== 'all'/);
  assert.match(routes, /CommercialPropertyMembership\.findOneAndUpdate/);
  assert.match(routes, /commercial_location_provisioned/);
  assert.match(routes, /Commercial workspace is ready/);
  assert.doesNotMatch(routes, /new Property|Property\.create/);
});

test('staff setup UI supports queue review, portfolio selection, tiers, PO rules, and verification', () => {
  const page = read('pages/admin-dashboard.html');
  const script = read('assets/js/commercial-setup-admin.js');
  const styles = read('assets/css/commercial-setup-admin.css');
  for (const id of ['commercialSetupNav', 'commercial-setup', 'commercialSetupDialog', 'commercialSetupForm']) assert.ok(page.includes(`id="${id}"`));
  assert.match(script, /Create a new portfolio/);
  assert.match(script, /tier_1/);
  assert.match(script, /tier_2/);
  assert.match(script, /tier_3/);
  assert.match(script, /purchaseOrderRequired/);
  assert.match(script, /commercialSetupVerified/);
  assert.match(styles, /@media \(max-width: 780px\)/);
  assert.match(styles, /:focus-visible/);
});

test('legacy notification-only requests are imported and relinked without duplicating properties', () => {
  const routes = read('backend/routes/commercialAdmin.js');
  assert.match(routes, /importLegacySetupNotifications/);
  assert.match(routes, /legacy_notification_imported/);
  assert.match(routes, /notification\.actionUrl = `\/pages\/admin-dashboard\.html#commercial-setup/);
  assert.doesNotMatch(routes, /Customer\.create/);
});
