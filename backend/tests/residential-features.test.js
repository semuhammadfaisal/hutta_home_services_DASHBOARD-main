const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const ResidentialPropertyProfile = require('../models/ResidentialPropertyProfile');
const ResidentialUtilityReading = require('../models/ResidentialUtilityReading');
const ResidentialMessage = require('../models/ResidentialMessage');
const ResidentialAccountProfile = require('../models/ResidentialAccountProfile');
const { arizonaRecommendations, AUTOPILOT_CONSENT } = require('../routes/residentialFeatures');
const { DEMO } = require('../seed-residential-demo');

const root = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const oid = () => new mongoose.Types.ObjectId();

test('residential feature schemas validate scoped care, passport, utility, relay, and account records', async () => {
  const userId = oid(); const customerId = oid(); const propertyId = oid(); const orderId = oid();
  const profile = new ResidentialPropertyProfile({ propertyId, customerId });
  await profile.validate();
  assert.equal(profile.autopilot.services.length, 5);
  assert.equal(profile.autopilot.autoApprovalThreshold, 0);
  await new ResidentialUtilityReading({ propertyId, customerId, enteredBy: userId, utilityType: 'water', periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-31'), usage: 8000, unit: 'gallons' }).validate();
  await new ResidentialMessage({ propertyId, customerId, orderId, senderUserId: userId, senderType: 'client', body: 'Please use the side gate.' }).validate();
  await new ResidentialAccountProfile({ userId, customerId, referralCode: 'SMPL-DEMO1234' }).validate();
});

test('auto-approval requires explicit consent and creates auditable history', () => {
  const source = read('backend/routes/residentialFeatures.js');
  assert.match(AUTOPILOT_CONSENT, /automatically approve enabled maintenance services/i);
  assert.match(source, /consentAccepted !== true/);
  assert.match(source, /typedName/);
  assert.match(source, /autopilot_consent_recorded/);
  assert.match(source, /consentedAt = new Date\(\)/);
  assert.match(source, /approveEstimates !== true/);
});

test('Arizona recommendations cover every month with regional maintenance guidance', () => {
  for (let month = 1; month <= 12; month += 1) {
    const recommendations = arizonaRecommendations(month);
    assert.ok(recommendations.length >= 1, `month ${month} needs a recommendation`);
    assert.ok(recommendations.every(item => item.id && item.serviceKey && item.title && item.summary));
  }
  assert.match(JSON.stringify(arizonaRecommendations(7)), /Monsoon/i);
});

test('all property and order feature resources pass through active membership scope', () => {
  const source = read('backend/routes/residentialFeatures.js');
  const declarations = [...source.matchAll(/router\.(?:get|post|put|patch)\('([^']+)'/g)].map(match => match[1]);
  const propertyRoutes = declarations.filter(route => route.startsWith('/properties/'));
  const orderRoutes = declarations.filter(route => route.startsWith('/orders/'));
  assert.equal(propertyRoutes.length, 10);
  assert.equal(orderRoutes.length, 2);
  assert.match(source, /PropertyMembership\.findOne\(\{ \.\.\.activeMembership\(req\.user\.userId\), propertyId: req\.params\.propertyId \}\)/);
  assert.match(source, /Property\.findOne\(\{ _id: membership\.propertyId, ownerCustomerId: membership\.customerId, status: 'active' \}\)/);
  assert.match(source, /const found = await scopedOrder\(req, res/);
  assert.match(source, /const found = await scopedProperty\(req, res/);
  assert.match(read('backend/server.js'), /app\.use\('\/api\/residential\/features', checkRole\(\['residential'\]\)/);
});

test('notifications and account resources are signed-in-user scoped', () => {
  const source = read('backend/routes/residentialFeatures.js');
  assert.match(source, /Notification\.find\(\{ userId: req\.user\.userId \}\)/);
  assert.match(source, /_id: req\.params\.notificationId, userId: req\.user\.userId/);
  assert.match(source, /ResidentialAccountProfile\.findOneAndUpdate\(\s*\{ userId: req\.user\.userId \}/);
  assert.doesNotMatch(source, /req\.body\?\.userId|req\.query\.userId/);
});

test('relay messages and Passport documents expose only authorized safe resources', () => {
  const source = read('backend/routes/residentialFeatures.js');
  assert.match(source, /sender: item\.senderType === 'client' \? 'You'/);
  assert.doesNotMatch(source, /senderEmail|senderPhone|vendorEmail|vendorPhone|customerEmail|customerPhone/);
  assert.match(source, /passport\/documents\/:documentId/);
  assert.match(source, /Cache-Control': 'private, no-store'/);
  assert.match(source, /propertyId: found\.property\._id/);
  assert.match(source, /validFileSignature\(req\.file\)/);
});

test('residential JSON and downloadable document code never emits internal financial fields', () => {
  const featureSource = read('backend/routes/residentialFeatures.js');
  const pdfSources = ['backend/utils/quotePdf.js', 'backend/utils/invoicePdf.js', 'backend/utils/receiptPdf.js'].map(read).join('\n');
  assert.doesNotMatch(featureSource, /vendorCost|markupAmount|coordinationFee|processingCost|internalNotes|profitMargin/i);
  assert.doesNotMatch(pdfSources, /vendorCost|markupAmount|coordinationFee|processingCost|internalNotes|profitMargin/i);
  const serializers = read('backend/utils/residentialSerializers.js');
  for (const field of ['vendorcost', 'markupamount', 'coordinationfee', 'processingcost', 'profit', 'margin', 'internalnotes']) assert.match(serializers.toLowerCase(), new RegExp(field));
  assert.match(serializers, /function seal\(/);
});

test('portal includes accessible routes and controls for every final residential feature', () => {
  const html = read('pages/residential-portal.html');
  const client = read('assets/js/residential-features.js');
  const css = read('assets/css/residential-portal.css');
  for (const route of ['autopilot', 'passport', 'utilities', 'messages', 'notifications', 'referrals', 'account']) {
    assert.match(html, new RegExp(`data-route="${route}"`));
    assert.match(html, new RegExp(`data-view="${route}"`));
  }
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /autocomplete="name"/);
  assert.match(client, /textContent = plan\.consentText/);
  assert.match(client, /escapeHtml\(item\.body\)/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /\.feature-grid, \.preference-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /\.portal-nav \{[^}]*overflow-y: auto/);
  assert.match(css, /:focus-visible/);
});

test('demo seed is realistic, additive, and dry-run by default', () => {
  const source = read('backend/seed-residential-demo.js');
  assert.equal(DEMO.services.length, 5);
  assert.ok(DEMO.passportEntries.length >= 3);
  assert.ok(DEMO.utilityReadings.length >= 2);
  assert.match(source, /const APPLY = process\.argv\.includes\('--apply'\)/);
  assert.match(source, /\$setOnInsert/);
  assert.doesNotMatch(source, /deleteMany|dropDatabase|remove\(/);
  assert.match(read('backend/RESIDENTIAL_PORTAL_RELEASE_CHECKLIST.md'), /Security gates/);
});
