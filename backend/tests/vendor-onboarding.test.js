const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Vendor = require('../models/Vendor');
const VendorInvitation = require('../models/VendorInvitation');
const { encryptTaxId, decryptTaxId, maskedTaxId } = require('../utils/taxIdCrypto');
const onboardingRoute = require('../routes/vendorOnboarding');
const { buildPublicUrl, getPublicAppUrl } = require('../utils/publicAppUrl');
const { getEmailDeliveryStatus } = require('../utils/emailService');

const internals = onboardingRoute._test;

test('invitation tokens are high entropy and only deterministic hashes are persisted', () => {
  const first = internals.generateToken();
  const second = internals.generateToken();
  assert.notEqual(first, second);
  assert.ok(first.length >= 40);
  assert.match(internals.hashToken(first), /^[a-f0-9]{64}$/);
  assert.equal(internals.hashToken(first), internals.hashToken(first));
  assert.equal(VendorInvitation.schema.path('tokenHash').options.select, false);
});

test('vendor onboarding defaults preserve manual vendor behavior', () => {
  const vendor = new Vendor({ name: 'Manual Vendor', category: 'plumbing' });
  assert.equal(vendor.onboardingSource, 'manual');
  assert.equal(vendor.onboardingStatus, 'approved');
  assert.equal(vendor.isActive, true);
  assert.ok(Vendor.schema.indexes().some(([fields, options]) => fields.invitationId === 1 && options.unique && options.sparse));
});

test('invited vendor can be represented as inactive and pending review', () => {
  const vendor = new Vendor({
    name: 'Invited Vendor', category: 'electrical', onboardingSource: 'invitation',
    onboardingStatus: 'pending_review', isActive: false,
    onboardingHistory: [{ action: 'submitted', message: 'Submitted' }]
  });
  assert.equal(vendor.validateSync(), undefined);
  assert.equal(vendor.isActive, false);
  assert.equal(vendor.onboardingHistory[0].action, 'submitted');
});

test('Tax IDs encrypt with AES-GCM and expose only a masked last four by default', () => {
  const previous = process.env.TAX_ID_ENCRYPTION_KEY;
  process.env.TAX_ID_ENCRYPTION_KEY = '11'.repeat(32);
  try {
    const encrypted = encryptTaxId('12-3456789');
    assert.notEqual(encrypted.encrypted, '123456789');
    assert.equal(decryptTaxId(encrypted), '123456789');
    assert.equal(encrypted.last4, '6789');
    assert.equal(maskedTaxId(encrypted.last4), '***-**-6789');
    assert.equal(Vendor.schema.path('einTaxIdEncrypted').options.select, false);
  } finally {
    if (previous === undefined) delete process.env.TAX_ID_ENCRYPTION_KEY;
    else process.env.TAX_ID_ENCRYPTION_KEY = previous;
  }
});

test('public upload signature validation rejects mismatched content', () => {
  assert.equal(internals.validFileSignature({ originalname: 'contract.pdf', buffer: Buffer.from('%PDF-1.7') }), true);
  assert.equal(internals.validFileSignature({ originalname: 'contract.pdf', buffer: Buffer.from('not a pdf') }), false);
  assert.equal(internals.validFileSignature({ originalname: 'photo.jpg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]) }), true);
  assert.equal(internals.validFileSignature({ originalname: 'payload.txt', buffer: Buffer.from([0x41, 0x00, 0x42]) }), false);
});

test('public tokens stay out of URL paths and are read from the request header', () => {
  const routeSource = fs.readFileSync(path.join(__dirname, '../routes/vendorOnboarding.js'), 'utf8');
  const clientSource = fs.readFileSync(path.join(__dirname, '../../assets/js/vendor-onboarding.js'), 'utf8');
  assert.doesNotMatch(routeSource, /public\/form\/:token/);
  assert.match(routeSource, /x-vendor-invite-token/);
  assert.match(clientSource, /window\.location\.hash/);
  assert.match(clientSource, /history\.replaceState/);
  assert.doesNotMatch(clientSource, /\?token=/);
});

test('public links always use HTTPS and reject localhost or private origins', () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
    FRONTEND_URL: process.env.FRONTEND_URL
  };
  try {
    process.env.NODE_ENV = 'development';
    process.env.PUBLIC_APP_URL = 'http://localhost:5500';
    delete process.env.FRONTEND_URL;
    assert.throws(() => getPublicAppUrl(), /public HTTPS/);
    process.env.PUBLIC_APP_URL = 'http://192.168.1.20:5500';
    assert.throws(() => getPublicAppUrl(), /public HTTPS/);
    process.env.PUBLIC_APP_URL = 'https://hutta-home-services-dashboard-main.onrender.com';
    assert.equal(getPublicAppUrl(), 'https://hutta-home-services-dashboard-main.onrender.com');
    assert.equal(
      buildPublicUrl('/pages/vendor-onboarding.html', 'token=secret-token'),
      'https://hutta-home-services-dashboard-main.onrender.com/pages/vendor-onboarding.html#token=secret-token'
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('email configuration prefers the verified Hutta Resend sender and retains Gmail fallback', () => {
  const previous = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
    EMAIL_USER: process.env.EMAIL_USER,
    EMAIL_PASSWORD: process.env.EMAIL_PASSWORD
  };
  try {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.EMAIL_FROM = 'Hutta Home Services <sales@huttas.com>';
    process.env.EMAIL_REPLY_TO = 'sales@huttas.com';
    process.env.EMAIL_USER = 'legacy-hutta@gmail.com';
    process.env.EMAIL_PASSWORD = 'app-password';
    assert.equal(getEmailDeliveryStatus().provider, 'resend');
    assert.equal(getEmailDeliveryStatus().sender, 'sales@huttas.com');

    delete process.env.RESEND_API_KEY;
    assert.equal(getEmailDeliveryStatus().provider, 'gmail');
    assert.equal(getEmailDeliveryStatus().warning, null);
    assert.equal(getEmailDeliveryStatus().sender, 'legacy-hutta@gmail.com');

    delete process.env.EMAIL_PASSWORD;
    assert.equal(getEmailDeliveryStatus().provider, 'unconfigured');
    assert.match(getEmailDeliveryStatus().warning, /verified Hutta Resend sender/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('email templates keep the legacy Hutta corporate shell with Resend and Gmail delivery', () => {
  const emailSource = fs.readFileSync(path.join(__dirname, '../utils/emailService.js'), 'utf8');
  assert.doesNotMatch(emailSource, /class="logo"|logo-card|LOGO_CONTENT_ID/);
  assert.doesNotMatch(emailSource, /class="hero-mark"/);
  assert.match(emailSource, /table role="presentation" class="page"/);
  assert.match(emailSource, /\.head\{[^}]*background:#ffffff/);
  assert.match(emailSource, /h1\{[^}]*color:#0056b8/);
  assert.match(emailSource, /<p class="wordmark">Huttas<\/p>/);
  assert.match(emailSource, /Professional Home Services Management Platform/);
  assert.match(emailSource, /Hutta Home Services <\$\{REQUIRED_SENDER_ADDRESS\}>/);
  assert.match(emailSource, /process\.env\.EMAIL_REPLY_TO/);
  assert.match(emailSource, /Resend|nodemailer|smtp\.gmail\.com|EMAIL_PASSWORD/i);
  for (const sender of [
    'sendPasswordResetEmail',
    'sendWelcomeEmail',
    'sendVendorInvitationEmail',
    'sendVendorSubmissionReceivedEmail',
    'sendVendorDecisionEmail',
    'sendStaffVendorSubmissionEmail',
    'sendStaffVendorReviewUpdateEmail'
  ]) {
    assert.match(emailSource, new RegExp(`${sender}[\\s\\S]*emailShell\\(`));
  }
});

test('onboarding route and UI include approval, change, rejection, resend, and revoke workflows', () => {
  const routeSource = fs.readFileSync(path.join(__dirname, '../routes/vendorOnboarding.js'), 'utf8');
  const adminSource = fs.readFileSync(path.join(__dirname, '../../assets/js/vendor-onboarding-admin.js'), 'utf8');
  for (const expected of ['approve', 'request_changes', 'reject', 'resend', 'revoke']) {
    assert.match(routeSource + adminSource, new RegExp(expected));
  }
  assert.match(routeSource, /status: 'processing'/);
  assert.match(routeSource, /invitationId/);
  assert.match(adminSource, /vendorEmailDeliveryWarning/);
});

test('missing public files cannot trigger nested login redirect loops', () => {
  const indexSource = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
  const serverSource = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert.match(indexSource, /location\.replace\('\/pages\/login\.html'\)/);
  assert.doesNotMatch(indexSource, /\.\/pages\/login\.html/);
  assert.match(serverSource, /path\.extname\(req\.path\)/);
  assert.match(serverSource, /status\(404\)/);
});

test('review payload exposes a masked Tax ID and a missing-document checklist', () => {
  const vendor = new Vendor({
    name: 'Review Vendor', category: 'plumbing', onboardingSource: 'invitation',
    onboardingStatus: 'pending_review', isActive: false, einTaxIdLast4: '6789',
    documents: [{
      documentId: 'doc-1', name: 'w9.pdf', url: '/api/attachments/vendor/1/doc-1',
      type: 'application/pdf', size: 100, status: 'active', complianceDocumentType: 'w9'
    }]
  });
  const payload = internals.reviewPayload(vendor);
  assert.equal(payload.einTaxIdMasked, '***-**-6789');
  assert.equal(payload.missingDocuments.length, 4);
  assert.ok(payload.missingDocuments.every(document => document.type !== 'w9'));
});

test('vendor review queue is separate from the approved vendor list and decisions are atomic', () => {
  const onboardingSource = fs.readFileSync(path.join(__dirname, '../routes/vendorOnboarding.js'), 'utf8');
  const vendorSource = fs.readFileSync(path.join(__dirname, '../routes/vendors.js'), 'utf8');
  const dashboardSource = fs.readFileSync(path.join(__dirname, '../routes/dashboard.js'), 'utf8');
  const adminSource = fs.readFileSync(path.join(__dirname, '../../assets/js/vendor-onboarding-admin.js'), 'utf8');
  const pageSource = fs.readFileSync(path.join(__dirname, '../../pages/admin-dashboard.html'), 'utf8');

  assert.match(onboardingSource, /router\.get\('\/reviews'/);
  assert.match(onboardingSource, /router\.get\('\/reviews\/:vendorId'/);
  assert.match(onboardingSource, /findOneAndUpdate\(\{/);
  assert.match(onboardingSource, /onboardingStatus: 'pending_review'/);
  assert.match(onboardingSource, /decisionId/);
  assert.match(vendorSource, /onboardingStatus: 'approved'/);
  assert.match(vendorSource, /Vendor applications are read-only until approved/);
  assert.match(vendorSource, /permanently retained in Vendor Reviews/);
  assert.match(dashboardSource, /APPROVED_VENDOR_MATCH/);
  assert.match(pageSource, /id="vendor-reviews"/);
  assert.match(pageSource, /id="vendor-review-detail"/);
  assert.ok(pageSource.indexOf('id="vendorInvitationsPanel"') > pageSource.indexOf('id="vendor-reviews"'));
  assert.ok(pageSource.indexOf('id="vendorInvitationsPanel"') < pageSource.indexOf('id="vendor-review-detail"'));
  for (const behavior of ['loadVendorReviews', 'openVendorReview', 'decideVendorReview', 'refreshVendorReviewCount']) {
    assert.match(adminSource, new RegExp(behavior));
  }
});

test('public onboarding UI provides guided progress, secure metadata, and upload safeguards', () => {
  const pageSource = fs.readFileSync(path.join(__dirname, '../../pages/vendor-onboarding.html'), 'utf8');
  const clientSource = fs.readFileSync(path.join(__dirname, '../../assets/js/vendor-onboarding.js'), 'utf8');
  const cssSource = fs.readFileSync(path.join(__dirname, '../../assets/css/vendor-onboarding-polish.css'), 'utf8');
  assert.match(pageSource, /name="robots" content="noindex,nofollow,noarchive"/);
  assert.match(pageSource, /name="referrer" content="no-referrer"/);
  assert.equal((pageSource.match(/data-form-step=/g) || []).length, 4);
  assert.match(pageSource, /id="formProgressBar"/);
  assert.match(pageSource, /id="categoryInlineDisplay"/);
  assert.match(clientSource, /MAX_FILE_BYTES/);
  assert.match(clientSource, /MAX_BATCH_BYTES/);
  assert.match(clientSource, /updateFileSelection/);
  assert.match(clientSource, /focusFirstInvalid/);
  assert.match(cssSource, /\.onboarding-layout/);
  assert.match(cssSource, /@media \(max-width:680px\)/);
});

test('vendor modal keeps manual and invite experiences mutually exclusive', () => {
  const pageSource = fs.readFileSync(path.join(__dirname, '../../pages/admin-dashboard.html'), 'utf8');
  const adminSource = fs.readFileSync(path.join(__dirname, '../../assets/js/vendor-onboarding-admin.js'), 'utf8');
  const cssSource = fs.readFileSync(path.join(__dirname, '../../assets/css/vendor-modal-onboarding-polish.css'), 'utf8');
  assert.match(pageSource, /role="tablist" aria-label="Choose how to add a vendor"/);
  assert.match(pageSource, /id="vendorManualSaveButton"/);
  assert.match(pageSource, /id="vendorInviteSendButton"/);
  assert.match(adminSource, /manualForm\.hidden = !manual/);
  assert.match(adminSource, /inviteForm\.hidden = manual/);
  assert.match(adminSource, /aria-selected/);
  assert.match(cssSource, /#vendorModal \[hidden\] \{ display: none !important; \}/);
});

test('vendor invite supports an optional update recipient email for staff updates', () => {
  const pageSource = fs.readFileSync(path.join(__dirname, '../../pages/admin-dashboard.html'), 'utf8');
  const adminSource = fs.readFileSync(path.join(__dirname, '../../assets/js/vendor-onboarding-admin.js'), 'utf8');
  const routeSource = fs.readFileSync(path.join(__dirname, '../routes/vendorOnboarding.js'), 'utf8');
  const emailSource = fs.readFileSync(path.join(__dirname, '../utils/emailService.js'), 'utf8');

  assert.ok(VendorInvitation.schema.path('updateRecipientEmail'));
  assert.ok(VendorInvitation.schema.path('updateRecipientNotificationError'));
  assert.ok(Vendor.schema.path('updateRecipientNotificationError'));
  assert.match(pageSource, /id="vendorInviteUpdateEmail"/);
  assert.match(pageSource, /Update Email/);
  assert.match(adminSource, /prefillVendorUpdateEmail/);
  assert.match(adminSource, /updateRecipientEmail: document\.getElementById\('vendorInviteUpdateEmail'\)/);
  assert.match(routeSource, /A valid update recipient email is required/);
  assert.match(routeSource, /mergeEmails\(users\.map\(user => user\.email\), \[invitation\.updateRecipientEmail\]\)/);
  assert.match(routeSource, /updateRecipientEmail: latestInvitation\?\.updateRecipientEmail/);
  assert.match(emailSource, /sendStaffVendorReviewUpdateEmail/);
});

test('read-only vendor review uses a focused overview and accessible decision dialog', () => {
  const pageSource = fs.readFileSync(path.join(__dirname, '../../pages/admin-dashboard.html'), 'utf8');
  const adminSource = fs.readFileSync(path.join(__dirname, '../../assets/js/vendor-onboarding-admin.js'), 'utf8');
  const cssSource = fs.readFileSync(path.join(__dirname, '../../assets/css/vendor-review-detail-polish.css'), 'utf8');
  assert.match(pageSource, /id="vendorReviewDetailMeta"/);
  assert.match(pageSource, /id="vendorReviewDecisionModal" hidden/);
  assert.match(pageSource, /role="dialog" aria-modal="true"/);
  assert.match(adminSource, /function decisionConfig\(action\)/);
  assert.match(adminSource, /executeVendorReviewDecision/);
  assert.match(adminSource, /modal\.hidden = false/);
  assert.match(cssSource, /\.vendor-review-overview/);
  assert.match(cssSource, /\.vendor-decision-overlay/);
  assert.match(cssSource, /\.vendor-decision-message\[hidden\]/);
});
