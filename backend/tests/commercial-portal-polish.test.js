const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const CommercialPortalPreference = require('../models/CommercialPortalPreference');
const CommercialWarrantyClaim = require('../models/CommercialWarrantyClaim');
const { resolvePropertyAccess, tierEntitlements } = require('../utils/commercialAccess');
const { serializeWarrantyClaim, assertNoPrivateCommercialFields } = require('../utils/commercialSerializers');
const { LOCATIONS } = require('../seed-commercial-demo');
const { phoenixSchedule } = require('../run-commercial-report-scheduler');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const oid = () => new mongoose.Types.ObjectId();

test('warranty records retain property, order, vendor, coverage, appointments, documents, and resolution', async () => {
  for (const field of ['organizationId', 'propertyId', 'orderId', 'vendorId', 'completionDate', 'coverage.startsAt', 'coverage.endsAt', 'documents', 'appointments', 'resolution.summary']) assert.ok(CommercialWarrantyClaim.schema.path(field), field);
  const claim = new CommercialWarrantyClaim({ organizationId: oid(), propertyId: oid(), claimReference: 'WCL-1', title: 'Covered repair', coverage: { startsAt: new Date('2026-01-01'), endsAt: new Date('2027-01-01') }, appointments: [{ scheduledStart: new Date('2026-09-14T10:00:00Z'), scheduledEnd: new Date('2026-09-14T09:00:00Z') }] });
  await assert.rejects(claim.validate(), /appointment end/);
  assert.ok(CommercialWarrantyClaim.schema.indexes().some(([fields]) => fields.organizationId === 1 && fields.status === 1 && fields['coverage.endsAt'] === 1));
});

test('warranty serializer exposes client-safe operations but no vendor contacts or internal data', () => {
  const claim = serializeWarrantyClaim({ _id: oid(), organizationId: oid(), propertyId: oid(), orderId: oid(), claimReference: 'WCL-2', title: 'HVAC warranty', status: 'scheduled', vendorSnapshot: { name: 'Desert HVAC', rocNumber: '321654', email: 'private@example.com' }, coverage: { startsAt: new Date(), endsAt: new Date(Date.now() + 86400000) }, appointments: [{ _id: oid(), scheduledStart: new Date(), scheduledEnd: new Date(Date.now() + 3600000), status: 'confirmed' }], documents: [{ documentId: 'doc-1', name: 'Warranty.pdf', type: 'application/pdf', size: 200, status: 'active' }], resolution: { summary: 'Repair scheduled', outcome: 'repaired' }, vendorCost: 900, internalNotes: 'private' });
  assert.equal(claim.vendor.name, 'Desert HVAC'); assert.equal(claim.vendor.email, undefined); assert.equal(claim.vendorCost, undefined); assert.equal(claim.documents.length, 1); assert.match(claim.documents[0].downloadUrl, /^\/api\/commercial\/warranty-claims\//);
  assert.throws(() => assertNoPrivateCommercialFields({ claim: { rawVendorInvoice: 10 } }), /Private commercial field blocked/);
});

test('Tier 3 entitlement gates claim lists, details, and protected documents', () => {
  assert.equal(tierEntitlements('tier_1').warrantyClaims, false); assert.equal(tierEntitlements('tier_2').warrantyClaims, false); assert.equal(tierEntitlements('tier_3').warrantyClaims, true);
  const route = read('backend/routes/commercial.js');
  assert.match(route, /router\.get\('\/warranty-claims\/:claimId'/);
  assert.match(route, /router\.get\('\/warranty-claims\/:claimId\/documents\/:documentId'/);
  assert.match(route, /tierEntitlements\(access\.agreement\?\.tier\)\.warrantyClaims/);
  assert.match(route, /streamCommercialDocument/);
});

test('preferences support scoped report scheduling without role or payment mutation', () => {
  assert.ok(CommercialPortalPreference.schema.path('monthlyReports.deliveryDay'));
  assert.ok(CommercialPortalPreference.schema.path('monthlyReports.propertyIds'));
  assert.equal(CommercialPortalPreference.schema.path('monthlyReports.deliveryDay').options.max, 28);
  const route = read('backend/routes/commercial.js');
  const preferenceRoute = route.slice(route.indexOf("router.get('/organizations/:organizationId/preferences'"), route.indexOf("router.patch('/account'"));
  assert.match(preferenceRoute, /propertyIds\.some\(id => !byProperty\.has\(id\)\)/);
  assert.match(preferenceRoute, /canViewReports/);
  assert.doesNotMatch(preferenceRoute, /makePayments\s*:/);
  assert.deepEqual(phoenixSchedule(new Date('2026-09-14T07:00:00Z')), { day: 14, periodKey: '2026-08', currentMonthStartedAt: new Date('2026-09-01T07:00:00.000Z') });
  const scheduler = read('backend/run-commercial-report-scheduler.js');
  assert.match(scheduler, /propertyAccess\(claimed\.userId/); assert.match(scheduler, /lastDeliveryStatus': 'processing'/); assert.match(scheduler, /deliverEmail/);
});

test('multi-owner property managers do not receive organization-wide owner or billing contacts', () => {
  const route = read('backend/routes/commercial.js');
  assert.match(route, /const organizationWide = found\.membership\.propertyAccess === 'all'/);
  assert.match(route, /includeContacts: organizationWide && isAdministrator/);
  assert.match(route, /includeBillingContacts: organizationWide && found\.permissions\.viewInvoices/);
  assert.match(route, /'metadata\.propertyId': \{ \$in: propertyIds \}/);
});

test('large portfolio access resolution is batched and resolves 10,000 locations quickly', () => {
  const source = read('backend/routes/commercial.js');
  const functionBody = source.slice(source.indexOf('async function visiblePropertyAccess'), source.indexOf('async function selectedAccesses'));
  assert.match(functionBody, /Promise\.all/); assert.match(functionBody, /CommercialServiceAgreement\.find/); assert.doesNotMatch(functionBody, /map\(async[\s\S]*propertyAccess/);
  const organizationId = oid(); const membership = { organizationId, role: 'operations_manager', propertyAccess: 'all', permissionMode: 'role_default', permissions: {} }; const started = performance.now();
  for (let index = 0; index < 10000; index += 1) assert.ok(resolvePropertyAccess({ organizationMembership: membership, location: { organizationId, propertyId: oid(), portfolioId: oid() }, agreement: { tier: 'tier_2' } }));
  assert.ok(performance.now() - started < 2000);
});

test('portal includes document access, warranty operations, account settings, and responsive accessibility states', () => {
  const html = read('pages/commercial-portal.html'); const script = read('assets/js/commercial-portal.js'); const css = read('assets/css/commercial-portal.css'); const api = read('assets/js/api-service.js');
  assert.match(html, /data-route="documents"/); assert.match(html, /data-route="activity"/); assert.match(html, /id="preferenceForm"/); assert.match(html, /id="accountForm"/); assert.match(html, /id="reportProperties"/);
  assert.match(script, /renderDocuments/); assert.match(script, /item\.coverage/); assert.match(script, /item\.appointments/); assert.match(script, /updateCommercialPreferences/);
  assert.match(api, /getCommercialDocuments/); assert.match(api, /updateCommercialAccount/); assert.match(css, /\.warranty-facts/); assert.match(css, /@media\(max-width:560px\)/); assert.match(css, /:focus-visible/); assert.match(css, /\.sidebar nav\{min-height:0;overflow-y:auto/);
});

test('demo data covers distinct owners, billing contacts, and all three tiers; release checklist covers production gates', () => {
  assert.deepEqual(LOCATIONS.map(item => item.tier), ['tier_1', 'tier_2', 'tier_3']);
  assert.equal(new Set(LOCATIONS.map(item => item.owner)).size, 3); assert.equal(new Set(LOCATIONS.map(item => item.billing)).size, 3);
  const seed = read('backend/seed-commercial-demo.js'); const checklist = read('backend/COMMERCIAL_PORTAL_RELEASE_CHECKLIST.md');
  assert.match(seed, /process\.argv\.includes\('--apply'\)/); assert.match(seed, /COMMERCIAL_DEMO_USER_EMAIL/);
  for (const phrase of ['authorization', '1,000-property', 'screen-reader', 'rollback', 'needsBillingSnapshotReview']) assert.match(checklist, new RegExp(phrase, 'i'));
});
