const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const VendorPortalMembership = require('../models/VendorPortalMembership');
const { encryptTaxId, decryptTaxId } = require('../utils/taxIdCrypto');
const { complianceChecklist, nextPortalStatus } = require('../utils/vendorCompliance');
const { hasPermission } = require('../utils/vendorPortalAccess');
const { assertNoVendorPrivateData, serializeVendor } = require('../utils/vendorSerializers');
const { verifyVendorRoc } = require('../utils/rocVerificationProvider');

const oid = () => new mongoose.Types.ObjectId();
const read = relative => fs.readFileSync(path.join(__dirname, '..', '..', relative), 'utf8');

test('vendor role and unique membership bind each login to exactly one Vendor record', () => {
  assert.ok(User.schema.path('role').enumValues.includes('vendor'));
  assert.equal(VendorPortalMembership.schema.path('userId').options.unique, true);
  assert.equal(VendorPortalMembership.schema.path('vendorId').options.immutable, true);
  assert.deepEqual(VendorPortalMembership.schema.path('role').enumValues, ['owner', 'admin', 'member']);
  const route = read('backend/routes/vendorPortal.js');
  const access = read('backend/utils/vendorPortalAccess.js');
  assert.match(route, /router\.use\(loadVendorAccess\)/);
  assert.match(access, /findOne\(\{ userId: req\.user\.userId, status: 'active' \}\)/);
  assert.doesNotMatch(route, /req\.(?:body|params|query)\.vendorId/);
  const auth = require('../middleware/auth');
  assert.equal(auth.destinationForRole('vendor', '/pages/admin-dashboard.html'), '/pages/vendor-portal.html');
  assert.equal(auth.destinationForRole('vendor', '/pages/vendor-portal.html'), '/pages/vendor-portal.html');
});

test('least-privilege vendor team permissions cannot self-authorize', () => {
  assert.equal(hasPermission({ status: 'active', role: 'member', permissions: { assignments: true, compliance: true } }, 'assignments'), true);
  assert.equal(hasPermission({ status: 'active', role: 'member', permissions: { compliance: true } }, 'compliance'), false);
  assert.equal(hasPermission({ status: 'revoked', role: 'owner', permissions: { team: true } }, 'team'), false);
  const admin = read('backend/routes/vendorPortalAdmin.js');
  assert.match(admin, /VendorPortalMembership\.exists\(\{ userId: user\._id \}\)/);
  assert.match(admin, /role: 'vendor', isActive: true/);
  assert.doesNotMatch(read('backend/routes/vendorPortal.js'), /VendorPortalMembership\.create/);
  assert.match(read('backend/routes/vendorPortal.js'), /router\.get\('\/team', requireVendorPermission\('team'\)/);
});

test('vendor signup captures the required company, contact, trade, service area, entity, and ROC inputs', () => {
  const auth = read('backend/routes/auth.js');
  for (const field of ['companyName', 'contactName', 'phone', 'entityType', 'tradeClassifications', 'serviceArea', 'licensedTrade', 'rocLicenseNumber']) assert.match(auth, new RegExp(field));
  assert.match(auth, /role: 'vendor'/);
  assert.match(auth, /portalStatus: 'compliance_incomplete'/);
  assert.match(auth, /ROC license number is required for licensed trades/);
  assert.match(read('backend/middleware/auth.js'), /vendor \? '\/pages\/vendor-portal\.html'/);
  const server = read('backend/server.js');
  assert.match(server, /resolved\.user\.role !== 'vendor'/);
  assert.match(server, /fileName === 'vendor-portal\.html'\) return serveVendorPortal/);
});

test('Tax IDs remain AES-GCM encrypted, select-false, masked, and absent from vendor serializers', () => {
  const previous = process.env.TAX_ID_ENCRYPTION_KEY;
  process.env.TAX_ID_ENCRYPTION_KEY = '11'.repeat(32);
  try {
    const encrypted = encryptTaxId('12-3456789');
    assert.equal(decryptTaxId(encrypted), '123456789');
    assert.equal(encrypted.last4, '6789');
    for (const field of ['einTaxId', 'einTaxIdEncrypted', 'einTaxIdIv', 'einTaxIdTag']) assert.equal(Vendor.schema.path(field).options.select, false);
    const payload = serializeVendor({ _id: oid(), name: 'Safe Vendor', category: 'HVAC', einTaxId: '12-3456789', einTaxIdEncrypted: encrypted.encrypted, einTaxIdIv: encrypted.iv, einTaxIdTag: encrypted.tag, einTaxIdLast4: '6789', stripeConnect: { accountId: 'acct_private' } });
    assert.equal(payload.taxIdMasked, '***-**-6789');
    assert.doesNotMatch(JSON.stringify(payload), /123456789|acct_private|einTaxIdEncrypted/);
  } finally { if (previous === undefined) delete process.env.TAX_ID_ENCRYPTION_KEY; else process.env.TAX_ID_ENCRYPTION_KEY = previous; }
});

test('compliance checklist enforces agreement, W-9, COI, additional insured, workers comp, Stripe, and ROC', () => {
  const complete = {
    huttasContractSigned: true, agreementAudit: { acceptedAt: new Date(), signerName: 'Owner' },
    w9OnFile: true, einTaxIdLast4: '6789', w9Profile: { signedAt: new Date() },
    certificateOfInsuranceOnFile: true, huttasAdditionalInsured: true, coiProfile: { carrier: 'Carrier', policyNumber: 'P1', expirationDate: new Date(Date.now() + 86400000), additionalInsuredConfirmedAt: new Date() },
    workersCompInsuranceOnFile: true, workersCompProfile: { required: true, expirationDate: new Date(Date.now() + 86400000) },
    stripeConnect: { accountId: 'acct_1', detailsSubmitted: true, payoutsEnabled: true }, licensedTrade: true, rocLicenseNumber: 'ROC-1', portalStatus: 'compliance_incomplete',
    documents: [{ status: 'active', complianceDocumentType: 'certificateOfInsurance' }, { status: 'active', complianceDocumentType: 'workersCompInsurance' }]
  };
  assert.ok(complianceChecklist(complete).every(item => item.complete));
  assert.equal(nextPortalStatus(complete), 'under_review');
  assert.equal(nextPortalStatus({ ...complete, portalStatus: 'suspended' }), 'suspended');
  assert.equal(nextPortalStatus({ ...complete, stripeConnect: {} }), 'compliance_incomplete');
});

test('portal statuses and staff transitions enforce review, approval, rejection, and suspension', () => {
  assert.deepEqual(Vendor.schema.path('portalStatus').enumValues, ['pending', 'compliance_incomplete', 'under_review', 'approved_active', 'rejected', 'suspended']);
  const admin = read('backend/routes/vendorPortalAdmin.js');
  assert.match(admin, /complianceChecklist\(vendor\)\.filter/);
  assert.match(admin, /staffReviewRequired/);
  assert.match(admin, /vendor\.isActive = req\.body\.status === 'approved_active'/);
  assert.match(admin, /vendor_portal_status_changed/);
});

test('optional ROC provider flags entity, classification, and inactive license mismatches for staff', async () => {
  const result = await verifyVendorRoc({ licensedTrade: true, rocLicenseNumber: '123', name: 'SMPL Plumbing', legalBusinessName: 'SMPL Plumbing LLC', rocLicenseTypeClassification: 'C-37' }, { name: 'test', lookup: async () => ({ configured: true, entityName: 'Other LLC', classification: 'C-39', status: 'Suspended' }) });
  assert.equal(result.status, 'mismatch');
  assert.equal(result.staffReviewRequired, true);
  assert.equal(result.mismatchReasons.length, 3);
  const disabled = await verifyVendorRoc({ licensedTrade: true, rocLicenseNumber: '123' }, { name: 'disabled', lookup: async () => ({ configured: false }) });
  assert.equal(disabled.status, 'not_configured');
});

test('Stripe Connect uses hosted onboarding and stores only the connected account identifier', () => {
  assert.equal(Vendor.schema.path('stripeConnect.accountId').options.select, false);
  const provider = read('backend/utils/vendorConnectProvider.js');
  assert.match(provider, /stripe\.accounts\.create/);
  assert.match(provider, /stripe\.accountLinks\.create/);
  assert.match(provider, /type: 'account_onboarding'/);
  assert.doesNotMatch(read('backend/models/Vendor.js'), /routingNumber|bankAccountNumber|cardNumber/);
});

test('vendor document access is membership-derived and private fields cannot leak recursively', () => {
  const route = read('backend/routes/vendorPortal.js');
  assert.match(route, /req\.vendorRecord\.documents/);
  assert.match(route, /GridFSBucket/);
  assert.match(route, /Cache-Control': 'private, no-store'/);
  assert.throws(() => assertNoVendorPrivateData({ nested: { vendorCost: 2 } }), /Private vendor field leaked/);
  assert.throws(() => assertNoVendorPrivateData({ stripe: { accountId: 'acct_1' } }), /Private vendor field leaked/);
});

test('responsive authenticated portal and signup expose safe onboarding controls', () => {
  const portal = read('pages/vendor-portal.html'); const signup = read('pages/vendor-signup.html'); const css = read('assets/css/vendor-portal.css'); const client = read('assets/js/vendor-portal.js');
  assert.match(portal, /id="checklist"/); assert.match(portal, /id="workersCompForm"/); assert.match(portal, /id="documentForm"/); assert.match(portal, /id="stripeOnboarding"/);
  assert.match(signup, /name="trade/); assert.match(signup, /name="licensedTrade"/); assert.match(css, /:focus-visible/); assert.match(css, /@media\(max-width:560px\)/);
  assert.match(client, /session\.user\?\.role !== 'vendor'/); assert.match(client, /startVendorStripeOnboarding/); assert.doesNotMatch(client, /vendorId/);
});

test('migration safely backfills legacy statuses and creates portal indexes only in apply mode', () => {
  const migration = read('backend/migrate-vendor-onboarding.js');
  assert.match(migration, /portalStatusBackfills/);
  assert.match(migration, /legacyStatus === 'approved' \? 'approved_active'/);
  assert.match(migration, /if \(APPLY\) await Promise\.all/);
});
