const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const objectId = () => new mongoose.Types.ObjectId();

const CommercialLocation = require('../models/CommercialLocation');
const CommercialMembership = require('../models/CommercialMembership');
const CommercialOrganization = require('../models/CommercialOrganization');
const CommercialPortfolio = require('../models/CommercialPortfolio');
const CommercialPropertyMembership = require('../models/CommercialPropertyMembership');
const CommercialServiceAgreement = require('../models/CommercialServiceAgreement');
const User = require('../models/User');
const access = require('../utils/commercialAccess');
const serializers = require('../utils/commercialSerializers');
const migration = require('../migrate-commercial-accounts');

test('commercial account foundation models organizations, portfolios, shared locations, memberships, and property agreements', () => {
  for (const Model of [CommercialOrganization, CommercialPortfolio, CommercialLocation, CommercialMembership, CommercialPropertyMembership, CommercialServiceAgreement]) assert.ok(Model.schema.path('_id'));
  assert.ok(CommercialLocation.schema.path('propertyId'));
  assert.ok(CommercialLocation.schema.path('ownerCustomerId'));
  assert.ok(CommercialOrganization.schema.path('ownerContacts'));
  assert.ok(CommercialOrganization.schema.path('billingContacts'));
  assert.ok(CommercialMembership.schema.path('organizationId'));
  assert.ok(CommercialPropertyMembership.schema.path('propertyId'));
  assert.ok(CommercialServiceAgreement.schema.path('tier'));
  assert.ok(CommercialServiceAgreement.schema.path('purchaseOrder.required'));
  assert.ok(CommercialServiceAgreement.schema.path('approvalRules.allowedRoles'));
  assert.ok(CommercialServiceAgreement.schema.path('paymentRules.allowedRoles'));
  assert.ok(User.schema.path('role').enumValues.includes('commercial'));
  assert.ok(CommercialMembership.schema.indexes().some(([fields, options]) => fields.userId === 1 && fields.organizationId === 1 && options.unique));
  assert.ok(CommercialPropertyMembership.schema.indexes().some(([fields, options]) => fields.userId === 1 && fields.organizationId === 1 && fields.propertyId === 1 && options.unique));
});

test('one commercial user can hold different roles across organizations and selected properties', () => {
  const userId = objectId(); const organizationA = objectId(); const organizationB = objectId(); const propertyA = objectId(); const propertyB = objectId();
  const first = new CommercialMembership({ userId, organizationId: organizationA, role: 'operations_manager', propertyAccess: 'selected' });
  const second = new CommercialMembership({ userId, organizationId: organizationB, role: 'billing_admin', propertyAccess: 'all' });
  const propertyOne = new CommercialPropertyMembership({ userId, organizationId: organizationA, propertyId: propertyA, locationId: objectId(), role: 'approver' });
  const propertyTwo = new CommercialPropertyMembership({ userId, organizationId: organizationA, propertyId: propertyB, locationId: objectId(), role: 'viewer' });
  assert.notEqual(String(first.organizationId), String(second.organizationId));
  assert.equal(access.organizationPermissions(first).requestService, true);
  assert.equal(access.organizationPermissions(second).makePayments, true);
  assert.equal(access.propertyPermissions(propertyOne).approveEstimates, true);
  assert.equal(access.propertyPermissions(propertyTwo).approveEstimates, false);
});

test('selected-property access rejects a different property even inside the same organization', { concurrency: false }, async () => {
  const userId = objectId(); const organizationId = objectId(); const allowedPropertyId = objectId(); const deniedPropertyId = objectId();
  const originals = {
    organization: CommercialMembership.findOne,
    property: CommercialPropertyMembership.findOne,
    location: CommercialLocation.findOne,
    agreement: CommercialServiceAgreement.findOne
  };
  const lean = value => ({ lean: async () => value });
  CommercialMembership.findOne = () => lean({ userId, organizationId, role: 'operations_manager', propertyAccess: 'selected', permissions: {}, status: 'active' });
  CommercialPropertyMembership.findOne = query => lean(String(query.propertyId) === String(allowedPropertyId) ? { userId, organizationId, propertyId: allowedPropertyId, role: 'coordinator', permissions: { view: true, requestService: true }, status: 'active' } : null);
  CommercialLocation.findOne = query => lean({ _id: objectId(), organizationId, propertyId: query.propertyId, status: 'active' });
  CommercialServiceAgreement.findOne = () => ({ sort: () => lean({ _id: objectId(), organizationId, propertyId: allowedPropertyId, tier: 'tier_2', approvalRules: { allowedRoles: [] }, paymentRules: { allowedRoles: [] } }) });
  try {
    assert.ok(await access.propertyAccess(userId, organizationId, allowedPropertyId));
    assert.equal(await access.propertyAccess(userId, organizationId, deniedPropertyId), null);
  } finally {
    CommercialMembership.findOne = originals.organization;
    CommercialPropertyMembership.findOne = originals.property;
    CommercialLocation.findOne = originals.location;
    CommercialServiceAgreement.findOne = originals.agreement;
  }
});

test('tier entitlements enforce coordination-only Tier 1, consolidated Tier 2, and warranty-enabled Tier 3', async () => {
  assert.deepEqual(access.tierEntitlements('tier_1'), { invoiceMode: 'coordination_fee_only', monthlyReports: false, consolidatedInvoices: false, warrantyClaims: false, vendorBillsClientDirectly: true });
  assert.equal(access.tierEntitlements('tier_2').warrantyClaims, false);
  assert.equal(access.tierEntitlements('tier_2').consolidatedInvoices, true);
  assert.equal(access.tierEntitlements('tier_3').warrantyClaims, true);
  assert.equal(access.tierEntitlements('unknown').invoiceMode, null);
  const agreement = new CommercialServiceAgreement({ organizationId: objectId(), propertyId: objectId(), agreementNumber: 'AGR-1', tier: 'tier_1', billingRules: { invoiceMode: 'consolidated_period' }, entitlements: { warrantyClaims: true }, approvalRules: {}, paymentRules: {} });
  await agreement.validate();
  assert.equal(agreement.billingRules.invoiceMode, 'coordination_fee_only');
  assert.equal(agreement.billingRules.vendorBillsClientDirectly, true);
  assert.equal(agreement.entitlements.warrantyClaims, false);
});

test('agreement approval and payment capabilities require both membership permission and an authorized role', () => {
  const agreement = { approvalRules: { allowedRoles: ['approver'] }, paymentRules: { allowedRoles: ['billing'] } };
  const approver = access.capabilities({ agreement, propertyMembership: { role: 'approver' }, permissions: { view: true, requestService: true, approveEstimates: true, viewInvoices: true, makePayments: true } });
  const billing = access.capabilities({ agreement, propertyMembership: { role: 'billing' }, permissions: { view: true, approveEstimates: true, viewInvoices: true, makePayments: true } });
  assert.equal(approver.canApproveEstimates, true);
  assert.equal(approver.canMakePayments, false);
  assert.equal(billing.canApproveEstimates, false);
  assert.equal(billing.canMakePayments, true);
});

test('commercial serializers allowlist client fields and reject recursive internal pricing leakage', () => {
  const propertyId = objectId();
  const safe = serializers.serializeOrder({ _id: objectId(), orderId: 'ORD-1', propertyId, service: 'HVAC', amount: 900, vendorCost: 500, markupAmount: 400, profit: 400, notes: 'private', commercialContext: { purchaseOrderNumber: 'PO-44' } }, { tier: 'tier_2' }, { canRequestService: true, canApproveEstimates: true });
  assert.equal(safe.clientAmount, 900);
  assert.equal(safe.purchaseOrderNumber, 'PO-44');
  assert.equal(safe.vendorCost, undefined);
  assert.equal(safe.notes, undefined);
  assert.throws(() => serializers.assertNoPrivateCommercialFields({ nested: { vendorCost: 12 } }), /Private commercial field blocked/);
  assert.throws(() => serializers.assertNoPrivateCommercialFields({ nested: { internal_notes: 'secret' } }), /Private commercial field blocked/);
  assert.throws(() => serializers.assertNoPrivateCommercialFields({ nested: { marginPercent: 20 } }), /Private commercial field blocked/);
  const member = serializers.serializeMember({ _id: objectId(), firstName: 'Alex', lastName: 'Lee', email: 'alex@example.com' }, { _id: objectId(), role: 'operations_manager', propertyAccess: 'selected', permissions: {}, status: 'active' }, [{ propertyId, locationId: objectId(), role: 'approver', permissions: { approveEstimates: true }, status: 'active' }]);
  assert.equal(member.propertyRoles[0].role, 'approver');
  assert.equal(member.propertyRoles[0].propertyId, String(propertyId));
});

test('Tier 1 hides order price and invoice visibility uses immutable issue-time tier', () => {
  const order = { _id: objectId(), orderId: 'ORD-2', propertyId: objectId(), service: 'Roofing', amount: 1200 };
  assert.equal(serializers.serializeOrder(order, { tier: 'tier_1' }, {}).clientAmount, undefined);
  assert.equal(serializers.serializeOrder(order, { tier: 'tier_2' }, {}).clientAmount, 1200);
  const baseInvoice = { _id: objectId(), orderId: objectId(), invoiceNumber: 'INV-1', amount: 100, commercialBilling: { organizationId: objectId(), tierAtIssue: 'tier_1', invoiceModeAtIssue: 'coordination_fee_only', invoiceKind: 'consolidated_period' } };
  assert.equal(serializers.serializeInvoice(baseInvoice), null);
  const coordination = serializers.serializeInvoice({ ...baseInvoice, commercialBilling: { organizationId: objectId(), tierAtIssue: 'tier_1', invoiceModeAtIssue: 'coordination_fee_only', invoiceKind: 'coordination_fee' } });
  assert.equal(coordination.amount, 100);
  assert.equal(coordination.invoiceType, 'coordination_fee');
});

test('commercial APIs fail closed on organization/property IDOR and query shared orders through both scopes', () => {
  const route = read('backend/routes/commercial.js');
  const server = read('backend/server.js');
  assert.match(server, /app\.use\('\/api\/commercial', checkRole\(\['commercial'\]\), require\('\.\/routes\/commercial'\)\)/);
  assert.match(route, /organizationAccess\(req\.user\.userId, req\.params\.organizationId\)/);
  assert.match(route, /propertyAccess\(req\.user\.userId, req\.params\.organizationId, req\.params\.propertyId\)/);
  assert.match(route, /propertyId: found\.property\._id, 'commercialContext\.organizationId': found\.organization\._id/);
  assert.match(route, /res\.status\(404\)\.json\(\{ message: 'Property not found' \}\); return null/);
  assert.doesNotMatch(route, /res\.json\(\{\s*(?:order|invoice|organization):\s*(?:order|invoice|organization)\s*\}\)/);
});

test('commercial migration is dry-run by default, idempotent, and never guesses tier or invoice kind', () => {
  const source = read('backend/migrate-commercial-accounts.js');
  assert.match(source, /const APPLY = process\.argv\.includes\('--apply'\)/);
  assert.equal(migration.tierFrom({ customFields: [] }), null);
  assert.equal(migration.tierFrom({ customFields: [{ name: 'Commercial Tier', value: 'Tier 3' }] }), 'tier_3');
  assert.match(source, /findOne\(\{ organizationCode \}\)/);
  assert.match(source, /updateOne\([\s\S]*\{ upsert: true/);
  assert.match(source, /needsTierReview/);
  assert.doesNotMatch(source, /commercialBilling\.invoiceKind'?:\s*tier/);
});
