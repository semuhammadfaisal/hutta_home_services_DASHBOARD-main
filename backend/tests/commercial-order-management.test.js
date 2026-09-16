const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const objectId = () => new mongoose.Types.ObjectId();

const CommercialPortfolioMembership = require('../models/CommercialPortfolioMembership');
const CommercialUserInvitation = require('../models/CommercialUserInvitation');
const CommercialAuditEvent = require('../models/CommercialAuditEvent');
const CommercialPropertyMembership = require('../models/CommercialPropertyMembership');
const CommercialMembership = require('../models/CommercialMembership');
const CustomerQuoteDecision = require('../models/CustomerQuoteDecision');
const permissions = require('../utils/commercialPermissions');

test('commercial access supports organization, portfolio, and property least-privilege grants', () => {
  assert.ok(CommercialPortfolioMembership.schema.path('portfolioId'));
  assert.ok(CommercialPropertyMembership.schema.path('permissions.manageUsers'));
  assert.ok(CommercialMembership.schema.path('permissionMode'));
  assert.ok(CommercialPortfolioMembership.schema.path('permissionMode'));
  assert.ok(CommercialAuditEvent.schema.path('actorUserId'));
  const grantor = { view:true, requestService:true, approveEstimates:false, viewInvoices:true, makePayments:false, viewReports:true, manageUsers:true };
  const requested = { view:true, requestService:true, approveEstimates:true, viewInvoices:true, makePayments:true, viewReports:true, manageUsers:true };
  const result = permissions.cleanPermissions('portfolio_admin', requested, grantor);
  assert.equal(result.requestService, true);
  assert.equal(result.approveEstimates, false);
  assert.equal(result.makePayments, false);
  assert.equal(result.manageUsers, true);
  assert.equal(permissions.validateRole('organization', 'owner'), false);
  assert.equal(permissions.validateRole('property', 'property_admin'), true);
});

test('commercial invitations use high-entropy hashed single-use expiring tokens', () => {
  const first = permissions.createToken(); const second = permissions.createToken();
  assert.match(first, /^[A-Za-z0-9_-]{40,100}$/);
  assert.notEqual(first, second);
  assert.match(permissions.hashToken(first), /^[a-f0-9]{64}$/);
  assert.notEqual(permissions.hashToken(first), first);
  assert.equal(CommercialUserInvitation.schema.path('tokenHash').options.select, false);
  assert.equal(CommercialUserInvitation.schema.path('tokenHash').options.unique, true);
  assert.deepEqual(CommercialUserInvitation.schema.path('status').enumValues, ['pending','processing','accepted','expired','revoked']);
});

test('commercial request creation rechecks property agreement, PO rules, attribution, idempotency, audit, and shared workflow', () => {
  const route = read('backend/routes/commercial.js');
  assert.match(route, /propertyAccess\(req\.user\.userId, req\.params\.organizationId, propertyId\)/);
  assert.match(route, /String\(access\.agreement\._id\) !== agreementId/);
  assert.match(route, /access\.agreement\.purchaseOrder\?\.required && !po/);
  assert.match(route, /portalSubmissionKey:submissionKey/);
  assert.match(route, /source:'commercial_portal'/);
  assert.match(route, /ownerCustomerId:owner\._id/);
  assert.match(route, /billingContact:access\.location\.billingContactOverride/);
  assert.match(route, /synchronizeWorkflowOrder\(created, 'request_received'/);
  assert.match(route, /CommercialAuditEvent\.create/);
  assert.match(route, /Notification\.insertMany/);
});

test('commercial estimate actions are server-authorized and use immutable decision evidence', () => {
  const route = read('backend/routes/commercial.js');
  assert.ok(CustomerQuoteDecision.schema.path('source').enumValues.includes('commercial_portal'));
  assert.match(route, /canApproveEstimates\) return res\.status\(403\)/);
  assert.match(route, /currentOutgoingQuoteId:quote\._id,workflowStatus:'quote_sent'/);
  assert.match(route, /quoteSnapshotHash\(quote\)/);
  assert.match(route, /source:'commercial_portal'/);
});

test('mixed-role administration blocks self-escalation and grants only within managed scope', () => {
  const route = read('backend/routes/commercial.js');
  assert.match(route, /String\(req\.params\.userId\)===String\(req\.user\.userId\)/);
  assert.match(route, /scopeAccess\(req\.user\.userId,req\.params\.organizationId,scopeType,scopeId\)/);
  assert.match(route, /cleanPermissions\(role,req\.body\?\.permissions,grantor\.permissions\)/);
  assert.match(route, /permissionMode:'custom'/);
  assert.match(route, /CommercialPortfolioMembership\.updateOne/);
  assert.match(route, /CommercialPropertyMembership\.updateOne/);
  assert.match(route, /subjectUserId:target\._id/);
});

test('invitation acceptance is atomic, email-bound, replay-safe, and rotates the stored token', () => {
  const route = read('backend/routes/commercial.js');
  const auth = read('backend/routes/auth.js');
  assert.match(route, /findOneAndUpdate\(\{tokenHash:hashToken\(token\),email:req\.user\.email\.toLowerCase\(\),status:'pending'/);
  assert.match(route, /\$set:\{status:'processing'\}/);
  assert.match(route, /invitation\.tokenHash=hashToken\(createToken\(\)\)/);
  assert.match(auth, /commercial-invite-signup/);
  assert.match(auth, /tokenHash: hashCommercialInvitationToken\(token\), email, status: 'pending'/);
});

test('commercial frontend exposes secure request and scoped invitation workflows only through commercial APIs', () => {
  const html = read('pages/commercial-portal.html'); const script = read('assets/js/commercial-portal.js'); const invite = read('assets/js/commercial-invitation.js');
  assert.match(html, /id="requestForm"/); assert.match(html, /id="requestPo"/); assert.match(html, /id="inviteForm"/);
  assert.match(script, /createCommercialRequest/); assert.match(script, /createCommercialInvitation/); assert.match(script, /revokeCommercialInvitation/);
  assert.match(invite, /commercial-invitation\/preview/); assert.match(invite, /commercial-invite-signup/); assert.match(invite, /commercial\/invitations\/accept/);
  assert.doesNotMatch(script, /APIService\.(?:createOrder|updateUser|assignUserRole)\(/);
});
