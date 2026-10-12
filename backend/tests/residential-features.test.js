const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const ResidentialPropertyProfile = require('../models/ResidentialPropertyProfile');
const ResidentialUtilityReading = require('../models/ResidentialUtilityReading');
const ResidentialMessage = require('../models/ResidentialMessage');
const ResidentialAccountProfile = require('../models/ResidentialAccountProfile');
const EmailOutbox = require('../models/EmailOutbox');
const { arizonaRecommendations, AUTOPILOT_CONSENT } = require('../routes/residentialFeatures');
const { sendResidentialOrderMessageAlertEmail } = require('../utils/emailService');
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

test('customer order messages create CRM notes and queue Ryan email alerts', async () => {
  const route = read('backend/routes/residentialFeatures.js');
  const worker = read('backend/utils/intakeEmailWorker.js');
  assert.ok(EmailOutbox.schema.path('type').enumValues.includes('residential_order_message_alert'));
  assert.match(route, /order\.notesHistory\.push\(buildNote/);
  assert.match(route, /syncLegacyNotes\(order\)/);
  assert.match(route, /recipients: \['sales@smplfix\.com'\]/);
  assert.match(route, /type: 'residential_order_message_alert'/);
  assert.match(worker, /residential_order_message_alert: sendResidentialOrderMessageAlertEmail/);

  let delivered;
  await sendResidentialOrderMessageAlertEmail({ recipients: ['sales@smplfix.com'], customerName: 'Home Owner', requestReference: 'REQ-20', service: 'Landscaping', message: '<Please call>' }, async payload => { delivered = payload; return { messageId: 'test' }; });
  assert.deepEqual(delivered.to, ['sales@smplfix.com']);
  assert.match(delivered.subject, /REQ-20/);
  assert.match(delivered.text, /Hi Ryan/);
  assert.match(delivered.html, /&lt;Please call&gt;/);
});

test('staff can reply to a customer portal message from CRM order notes', async () => {
  const ordersRoute = read('backend/routes/orders.js');
  const api = read('assets/js/api-service.js');
  const dashboard = read('assets/js/dashboard-script.js');
  const styles = read('assets/css/detail-pages.css');
  const adminPage = read('pages/admin-dashboard.html');

  assert.match(ordersRoute, /router\.post\('\/:id\/messages'/);
  assert.match(ordersRoute, /senderType: 'staff'/);
  assert.match(ordersRoute, /SMPLfix reply to customer:/);
  assert.match(ordersRoute, /title: 'New reply from SMPLfix'/);
  assert.match(ordersRoute, /actionUrl: '#messages'/);
  assert.match(api, /async replyToOrderMessage\(id, body\)/);
  assert.match(dashboard, /Customer portal message:/);
  assert.match(dashboard, /Reply to customer/);
  assert.match(dashboard, /openOrderMessageReplyModal/);
  assert.match(dashboard, /APIService\.replyToOrderMessage\(orderId, reply\)/);
  assert.match(styles, /\.note-reply-btn/);
  assert.match(styles, /\.note-reply-context/);
  assert.match(adminPage, /detail-pages\.css\?v=20261010-order-message-reply/);
  assert.match(adminPage, /dashboard-script\.js\?v=20261010-autopilot-confirm-work/);

  await new ResidentialMessage({ propertyId: oid(), customerId: oid(), orderId: oid(), senderUserId: oid(), senderType: 'staff', body: 'Your appointment is confirmed.' }).validate();
});

test('order message UI exposes conversation, order context, delivery status, and character feedback', () => {
  const html = read('pages/residential-portal.html');
  const css = read('assets/css/residential-portal.css');
  const script = read('assets/js/residential-features.js');
  for (const id of ['messageOrder', 'messageConversationTitle', 'messageConversationMeta', 'messageThread', 'messageBody', 'messageCharacterCount', 'messageOrderContext']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /saved to the order notes and alerts SMPLfix support by email/i);
  assert.match(css, /\.message-workspace-grid/);
  assert.match(script, /renderMessageOrderContext/);
  assert.match(script, /const body = String\(new FormData\(form\)\.get\('body'\)/);
  assert.ok(script.indexOf("const body = String(new FormData(form).get('body')") < script.indexOf('busy(form, true)', script.indexOf('async function sendMessage')), 'message body must be captured before the form controls are disabled');
  assert.match(script, /sendResidentialMessage\(orderId, body\)/);
  assert.match(script, /added to the order notes, and shared with SMPLfix/);
});

test('utility tracker provides guided entry, summaries, filters, trends, and safe submission', () => {
  const html = read('pages/residential-portal.html');
  const css = read('assets/css/residential-portal.css');
  const script = read('assets/js/residential-features.js');
  const route = read('backend/routes/residentialFeatures.js');
  for (const id of ['utilityForm', 'utilityType', 'utilityPeriodStart', 'utilityPeriodEnd', 'utilityUsage', 'utilityUsageUnit', 'utilityFormError', 'utilityTotalReadings', 'utilityLatestBill', 'utilityTrackedTypes', 'utilityHistoryCount', 'utilityReadings']) assert.match(html, new RegExp(`id="${id}"`));
  for (const type of ['all', 'electricity', 'water', 'gas']) assert.match(html, new RegExp(`data-utility-filter="${type}"`));
  assert.match(css, /\.utilities-workspace/);
  assert.match(css, /\.utility-summary/);
  assert.match(css, /\.utility-reading-icon--electricity/);
  assert.match(css, /\.utility-trend\.is-down/);
  assert.match(script, /function utilityTrend/);
  assert.match(script, /function updateUtilityUnit/);
  assert.match(script, /Billing period end must be after the start date/);
  assert.ok(script.indexOf('const payload = Object.fromEntries(new FormData(form))', script.indexOf('async function addUtility')) < script.indexOf('busy(form, true)', script.indexOf('async function addUtility')), 'utility payload must be captured before controls are disabled');
  assert.match(route, /cost !== undefined && \(!Number\.isFinite\(cost\) \|\| cost < 0 \|\| cost > 1000000\)/);
  assert.match(html, /residential-features\.js\?v=20261010-autopilot-confirm-work/);
});

test('Property Passport provides secure guided forms, filtering, file feedback, and safe submission', () => {
  const html = read('pages/residential-portal.html');
  const css = read('assets/css/residential-portal.css');
  const script = read('assets/js/residential-features.js');
  for (const id of ['passportEntryForm', 'passportDocumentForm', 'passportEntryError', 'passportDocumentError', 'passportDocumentFile', 'passportFileName', 'passportFileMeta', 'passportDetailCount', 'passportDocumentCount', 'passportCategoryCount', 'passportEntryFilter', 'passportDocumentFilter', 'passportEntries', 'passportDocuments']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /Private &amp; property-scoped/);
  assert.match(html, /PDF, JPG, PNG, or WebP · 10 MB maximum/);
  assert.match(css, /\.passport-create-grid/);
  assert.match(css, /\.passport-upload-zone/);
  assert.match(css, /\.passport-record-list/);
  assert.match(script, /function updatePassportFile/);
  assert.match(script, /passportEntryFilter/);
  assert.match(script, /passportDocumentFilter/);
  assert.ok(script.indexOf('const payload = Object.fromEntries(new FormData(form))', script.indexOf('async function addPassportEntry')) < script.indexOf('busy(form, true)', script.indexOf('async function addPassportEntry')), 'detail payload must be captured before controls are disabled');
  assert.ok(script.indexOf('const payload = new FormData(form)', script.indexOf('async function uploadPassport')) < script.indexOf('busy(form, true)', script.indexOf('async function uploadPassport')), 'document payload must be captured before the file input is disabled');
  assert.match(html, /residential-features\.js\?v=20261010-autopilot-confirm-work/);
  assert.match(html, /residential-portal\.css\?v=20261011-invoice-dialog-display-fix/);
});

test('auto-approval requires explicit consent and creates auditable history', () => {
  const source = read('backend/routes/residentialFeatures.js');
  assert.match(AUTOPILOT_CONSENT, /automatically approve enabled maintenance services/i);
  assert.match(source, /consentAccepted !== true/);
  assert.match(source, /typedName/);
  assert.match(source, /autopilot_consent_recorded/);
  assert.match(source, /const consentChanged = autoApprovalEnabled/);
  assert.match(source, /consentedAt = new Date\(\)/);
  assert.match(source, /approveEstimates !== true/);
});

test('Autopilot synchronizes customer service requests and lets CRM create protected orders', () => {
  const portalHtml = read('pages/residential-portal.html');
  const portalCss = read('assets/css/residential-portal.css');
  const portalScript = read('assets/js/residential-features.js');
  const adminHtml = read('pages/admin-dashboard.html');
  const adminCss = read('assets/css/autopilot-admin.css');
  const adminScript = read('assets/js/autopilot-admin.js');
  const adminRoute = read('backend/routes/autopilotPlans.js');
  const server = read('backend/server.js');
  for (const id of ['autopilotStatusPill', 'autopilotSummaryStatus', 'autopilotSummaryServices', 'autopilotSummaryNext', 'autopilotSummaryApproval', 'autopilotServices', 'autopilotAuditHistory']) assert.match(portalHtml, new RegExp(`id="${id}"`));
  assert.match(portalCss, /\.autopilot-workspace/);
  assert.match(portalCss, /\.autopilot-service-row\.is-enabled/);
  assert.match(portalScript, /function updateAutopilotSummary/);
  assert.match(portalScript, /data-service-frequency/);
  assert.match(portalScript, /const payload = \{ enabled:/);
  assert.ok(portalScript.indexOf('const payload = { enabled:', portalScript.indexOf('async function saveAutopilot')) < portalScript.indexOf('busy(form, true)', portalScript.indexOf('async function saveAutopilot')), 'Autopilot values must be captured before the form is disabled');
  assert.match(adminHtml, /data-section="autopilot-plans"/);
  assert.match(adminHtml, /id="autopilotPlansTableBody"/);
  assert.match(adminHtml, />Residential Autopilot</);
  assert.doesNotMatch(adminHtml, />Autopilot Plans</);
  assert.doesNotMatch(adminHtml, /Residential operations/);
  assert.doesNotMatch(adminHtml, /Live customer settings synchronized/);
  assert.match(adminCss, /\.autopilot-plan-modal/);
  assert.match(adminScript, /getAutopilotPlans/);
  assert.match(adminScript, /createAutopilotServiceOrder/);
  assert.match(adminScript, /Confirm & create order/);
  assert.match(adminScript, /scheduledDate/);
  assert.match(adminScript, /Customers appear here only after they activate Autopilot/);
  assert.match(adminRoute, /staffRoles/);
  assert.match(adminRoute, /plan\.id && plan\.enabled && plan\.enabledServiceCount > 0/);
  assert.match(adminRoute, /requestReference: `AUTOPILOT:/);
  assert.match(adminRoute, /pricingStatus: 'quoted'/);
  assert.match(adminRoute, /workflowStatus: 'scheduled'/);
  assert.match(portalHtml, /id="autopilotPropertyOptions"/);
  assert.match(portalHtml, /id="autopilotRequestNote"/);
  assert.match(portalScript, /selectedPropertyIds/);
  assert.match(portalScript, /requestNote:/);
  assert.doesNotMatch(adminRoute, /router\.put\(/, 'CRM must not modify homeowner Autopilot choices');
  assert.doesNotMatch(adminRoute, /profile\.autopilot\.autoApprovalEnabled\s*=/, 'CRM must not modify homeowner auto-approval consent');
  assert.match(server, /app\.use\('\/api\/autopilot-plans', staffOnly/);
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
