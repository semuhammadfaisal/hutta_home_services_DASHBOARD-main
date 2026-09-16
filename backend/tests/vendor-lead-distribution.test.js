const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const QuoteInvitation = require('../models/QuoteInvitation');
const Vendor = require('../models/Vendor');
const VendorPerformanceEvent = require('../models/VendorPerformanceEvent');
const { activeCompliance, distributionKey, evaluateVendorLeadEligibility } = require('../utils/vendorLeadDistribution');
const { respondToLead } = require('../utils/vendorLeadResponses');
const { serializeVendorLead } = require('../utils/vendorLeadSerializers');

const read = relative => fs.readFileSync(path.join(__dirname, '..', '..', relative), 'utf8');
const oid = () => new mongoose.Types.ObjectId();
function qualifiedVendor(overrides = {}) {
  return {
    _id: oid(), name: 'Desert HVAC', email: 'bids@vendor.test', category: 'HVAC', tradeClassifications: ['HVAC'], rating: 4.8,
    isActive: true, portalStatus: 'approved_active', leadDistribution: { paused: false, performanceScore: 91 },
    huttasContractSigned: true, agreementAudit: { acceptedAt: new Date(), signerName: 'Owner' },
    w9OnFile: true, einTaxIdLast4: '6789', w9Profile: { signedAt: new Date() },
    certificateOfInsuranceOnFile: true, insuranceExpirationDate: new Date('2027-01-01'), huttasAdditionalInsured: true,
    coiProfile: { carrier: 'Carrier', policyNumber: 'P1', expirationDate: new Date('2027-01-01'), additionalInsuredConfirmedAt: new Date() },
    workersCompInsuranceOnFile: true, workersCompProfile: { required: true, expirationDate: new Date('2027-01-01') },
    stripeConnect: { accountId: 'acct_1', detailsSubmitted: true, payoutsEnabled: true }, licensedTrade: true, rocLicenseNumber: 'ROC-1', rocLicenseExpirationDate: new Date('2027-01-01'),
    serviceArea: { postalCodes: ['85001'] }, documents: [{ status: 'active', complianceDocumentType: 'certificateOfInsurance' }, { status: 'active', complianceDocumentType: 'workersCompInsurance' }],
    ...overrides
  };
}

test('lead invitation schema captures response lifecycle, deadlines, immutable snapshot, and idempotency', () => {
  for (const status of ['accepted_to_bid', 'declined', 'expired']) assert.ok(QuoteInvitation.schema.path('status').enumValues.includes(status));
  for (const field of ['responseDueAt', 'bidDueAt', 'respondedAt', 'responseTimeMs', 'declineReasonCode', 'declineReason', 'leadSnapshot.propertyAddress', 'qualificationSnapshot.complianceStatus', 'responseHistory']) assert.ok(QuoteInvitation.schema.path(field));
  assert.equal(QuoteInvitation.schema.path('distributionKey').options.unique, true);
  assert.equal(QuoteInvitation.schema.path('distributionKey').options.select, false);
  assert.equal(VendorPerformanceEvent.schema.path('dedupeKey').options.unique, true);
  assert.ok(Vendor.schema.path('leadDistribution.performanceScore'));
});

test('qualification enforces trade, service area, current compliance, rating, and performance rules', () => {
  const order = { service: 'HVAC', customer: { address: '1 Main St, Phoenix, AZ 85001' } };
  const property = { postalCode: '85001' };
  const eligible = evaluateVendorLeadEligibility(qualifiedVendor(), order, property, { minimumRating: 3, minimumPerformanceScore: 50 }, new Date('2026-09-15'));
  assert.equal(eligible.eligible, true);
  assert.equal(eligible.snapshot.complianceStatus, 'current');
  assert.equal(evaluateVendorLeadEligibility(qualifiedVendor({ tradeClassifications: ['Plumbing'], category: 'Plumbing' }), order, property).eligible, false);
  assert.equal(evaluateVendorLeadEligibility(qualifiedVendor({ serviceArea: { postalCodes: ['85701'] } }), order, property).eligible, false);
  assert.equal(evaluateVendorLeadEligibility(qualifiedVendor({ rating: 2 }), order, property).eligible, false);
  assert.equal(evaluateVendorLeadEligibility(qualifiedVendor({ leadDistribution: { paused: false, performanceScore: 20 } }), order, property).eligible, false);
});

test('expired or non-active vendor compliance blocks distribution and acceptance', () => {
  assert.equal(activeCompliance(qualifiedVendor(), new Date('2026-09-15')), true);
  assert.equal(activeCompliance(qualifiedVendor({ insuranceExpirationDate: new Date('2026-09-14') }), new Date('2026-09-15')), false);
  assert.equal(activeCompliance(qualifiedVendor({ portalStatus: 'suspended', isActive: false }), new Date('2026-09-15')), false);
  assert.equal(activeCompliance(qualifiedVendor({ rocVerification: { status: 'mismatch', staffReviewRequired: true } }), new Date('2026-09-15')), false);
});

test('vendor lead serializer allowlists the safe snapshot and excludes contacts, competitors, tokens, and pricing', () => {
  const serialized = serializeVendorLead({
    _id: oid(), vendorId: oid(), orderId: { customer: { email: 'owner@test.invalid', phone: '555' }, vendorCost: 90 }, quoteId: oid(), status: 'sent',
    tokenHash: 'secret', distributionKey: 'secret-key', leadSnapshot: { propertyAddress: '1 Main St', service: 'HVAC', scope: 'Repair unit', requestedWindow: 'Tuesday', relevantNotes: 'Gate code is provided at dispatch' },
    competingVendors: [{ name: 'Never expose' }], vendorCost: 90, markup: 20, margin: 10
  });
  const json = JSON.stringify(serialized);
  assert.equal(serialized.propertyAddress, '1 Main St');
  for (const forbidden of ['owner@test.invalid', 'Never expose', 'tokenHash', 'secret-key', 'vendorCost', 'markup', 'margin']) assert.doesNotMatch(json, new RegExp(forbidden));
});

test('distribution idempotency is stable per order and vendor but isolated across vendors', () => {
  const orderId = oid(); const vendorA = oid(); const vendorB = oid(); const key = 'dispatch-request-123456';
  assert.equal(distributionKey(orderId, vendorA, key), distributionKey(orderId, vendorA, key));
  assert.notEqual(distributionKey(orderId, vendorA, key), distributionKey(orderId, vendorB, key));
});

test('declines require both a controlled reason code and explanatory text before database access', async () => {
  await assert.rejects(respondToLead({ invitationId: oid(), vendorId: oid(), response: 'decline', declineReasonCode: 'other', declineReason: '' }), /Decline reason/);
  await assert.rejects(respondToLead({ invitationId: oid(), vendorId: oid(), response: 'maybe' }), /accept or decline/);
});

test('staff distribution creates one isolated quote invitation per qualified vendor and never awards the order', () => {
  const route = read('backend/routes/incomingQuotes.js');
  assert.match(route, /router\.post\('\/orders\/:orderId\/leads\/distribute'/);
  assert.match(route, /vendorIds\.length > 20/);
  assert.match(route, /evaluateVendorLeadEligibility/);
  assert.match(route, /distributionKey\(order\._id, item\.vendor\._id, idempotencyKey\)/);
  assert.match(route, /await session\.withTransaction/);
  assert.match(route, /responseRequired: true/);
  assert.match(route, /One or more vendors are not eligible for this lead/);
  const block = route.slice(route.indexOf("router.post('/orders/:orderId/leads/distribute'"), route.indexOf("router.post('/orders/:orderId/quotes'"));
  assert.doesNotMatch(block, /order\.vendor\s*=|selectedIncomingQuoteId\s*=/);
  const page = read('pages/admin-dashboard.html'); const client = read('assets/js/incoming-quotes.js'); const api = read('assets/js/api-service.js');
  assert.match(page, /id="incomingLeadDistributionForm"/); assert.match(page, /id="incomingLeadCandidates"/);
  assert.match(client, /getIncomingLeadCandidates/); assert.match(client, /distributeIncomingLead/); assert.match(api, /Idempotency-Key/);
});

test('authenticated and token lead paths enforce vendor isolation and acceptance before bidding', () => {
  const portal = read('backend/routes/vendorPortal.js');
  const incoming = read('backend/routes/incomingQuotes.js');
  assert.match(portal, /findOne\(\{ _id: req\.params\.invitationId, vendorId: req\.vendorRecord\._id, responseRequired: true \}\)/);
  assert.match(portal, /status: 'accepted_to_bid', expiresAt: \{ \$gt: new Date\(\) \}/);
  assert.match(portal, /order\.workflowStatus !== 'quote_collection' \|\| order\.selectedIncomingQuoteId/);
  assert.match(incoming, /router\.post\('\/public\/lead\/respond'/);
  assert.match(incoming, /Accept this lead before preparing an estimate/);
  assert.match(incoming, /Vendor compliance is no longer active and current/);
  const quoteRoute = portal.slice(portal.indexOf("router.post('/leads/:invitationId/estimate-draft/submit'"), portal.indexOf("router.get('/team'"));
  assert.doesNotMatch(quoteRoute, /order\.vendor\s*=|quote\.status\s*=\s*'selected'/);
  const portalPage = read('pages/vendor-portal.html'); const portalClient = read('assets/js/vendor-portal.js'); const tokenPage = read('pages/vendor-quote.html'); const tokenClient = read('assets/js/vendor-quote.js');
  assert.match(portalPage, /id="leadList"/); assert.match(portalClient, /respondToVendorLead/); assert.match(portalClient, /submitVendorEstimateDraft/);
  assert.match(tokenPage, /id="leadDecision"/); assert.match(tokenPage, /Accepting commits/); assert.match(tokenClient, /public\/lead/);
});

test('deadline worker emits idempotent non-response and missed-bid performance events', () => {
  const runner = read('backend/run-vendor-lead-performance.js');
  const responses = read('backend/utils/vendorLeadResponses.js');
  assert.match(runner, /type: 'lead_no_response'/);
  assert.match(runner, /type: 'bid_due_missed'/);
  assert.match(runner, /bidDueMissedAt: \{ \$exists: false \}/);
  assert.match(responses, /\{ dedupeKey: `\$\{invitation\._id\}:\$\{type\}` \}/);
  assert.match(responses, /bid_submitted_late/);
});

test('migration preserves existing quote records and only applies writes with explicit apply mode', () => {
  const migration = read('backend/migrate-vendor-leads.js');
  assert.match(migration, /const APPLY = process\.argv\.includes\('--apply'\)/);
  assert.match(migration, /if \(APPLY\)/);
  assert.match(migration, /Existing quotes and invitations were preserved/);
  assert.doesNotMatch(migration, /deleteMany|drop\(/);
});
