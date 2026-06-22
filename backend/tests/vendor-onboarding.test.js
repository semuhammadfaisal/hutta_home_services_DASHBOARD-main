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

test('production public links use HTTPS and reject localhost or private origins', () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
    FRONTEND_URL: process.env.FRONTEND_URL
  };
  try {
    process.env.NODE_ENV = 'production';
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

test('email configuration prefers verified-domain Resend and warns for Gmail fallback', () => {
  const previous = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_USER: process.env.EMAIL_USER,
    EMAIL_PASSWORD: process.env.EMAIL_PASSWORD
  };
  try {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.EMAIL_FROM = 'Hutta Home Services <vendors@business.test>';
    process.env.EMAIL_USER = 'temporary@gmail.com';
    process.env.EMAIL_PASSWORD = 'test-password';
    assert.equal(getEmailDeliveryStatus().provider, 'resend');
    assert.equal(getEmailDeliveryStatus().warning, null);

    process.env.EMAIL_FROM = 'temporary@gmail.com';
    assert.equal(getEmailDeliveryStatus().provider, 'gmail');
    assert.match(getEmailDeliveryStatus().warning, /Spam/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
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
