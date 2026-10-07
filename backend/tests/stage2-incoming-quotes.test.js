const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const IncomingQuote = require('../models/IncomingQuote');
const Order = require('../models/Order');
const QuoteInvitation = require('../models/QuoteInvitation');
const Vendor = require('../models/Vendor');
const EmailOutbox = require('../models/EmailOutbox');
const VendorRequirementApproval = require('../models/VendorRequirementApproval');
const { complianceForVendor, orderReadyForQuotes, parseQuotePayload } = require('../utils/incomingQuotes');
const { approvalPayloadHash, vendorRequirementIssues } = require('../utils/vendorRequirementGate');

test('incoming quote payload calculates from labor and materials and validates submission fields', () => {
  const { payload, errors } = parseQuotePayload({
    scopeOfWork: 'Replace damaged irrigation valves',
    laborAmount: 1200,
    materialsAmount: 650,
    estimatedDuration: { value: 3, unit: 'days' },
    earliestAvailableDate: '2026-08-01',
    siteAccessRequired: true,
    accessNotes: 'Gate access required'
  }, { requireComplete: true });
  assert.deepEqual(errors, []);
  assert.equal(payload.laborAmount + payload.materialsAmount, 1850);
});

test('incoming quote submission rejects negative prices and incomplete access details', () => {
  const { errors } = parseQuotePayload({ laborAmount: -1, materialsAmount: 0, siteAccessRequired: true }, { requireComplete: true });
  assert.ok(errors.some(error => error.includes('Labor amount')));
  assert.ok(errors.some(error => error.includes('Access notes')));
  assert.ok(errors.some(error => error.includes('Scope of work')));
});

test('vendor compliance reports missing, expired, expiring, and current states', () => {
  const now = new Date('2026-07-17T00:00:00Z');
  assert.equal(complianceForVendor({}, now).status, 'missing');
  assert.equal(complianceForVendor({ contractorLicenseNumber: 'C1', rocLicenseNumber: 'R1', certificateOfInsuranceOnFile: true, insuranceExpirationDate: '2026-07-16' }, now).status, 'expired');
  assert.equal(complianceForVendor({ contractorLicenseNumber: 'C1', rocLicenseNumber: 'R1', certificateOfInsuranceOnFile: true, insuranceExpirationDate: '2026-08-01' }, now).status, 'expiring');
  assert.equal(complianceForVendor({ contractorLicenseNumber: 'C1', rocLicenseNumber: 'R1', certificateOfInsuranceOnFile: true, insuranceExpirationDate: '2027-01-01' }, now).status, 'current');
});

test('Order must contain category and address before Stage 2', () => {
  assert.equal(orderReadyForQuotes({ service: 'Plumbing', customer: { address: '123 Main St' }, missingData: { serviceCategory: false, serviceAddress: false } }), true);
  assert.equal(orderReadyForQuotes({ service: 'Plumbing', customer: { address: '' }, missingData: { serviceCategory: false, serviceAddress: true } }), false);
});

test('Stage 2 models expose required workflow, revision, and email states', () => {
  assert.ok(Order.schema.path('workflowStatus').enumValues.includes('quote_collection'));
  assert.ok(Order.schema.path('workflowStatus').enumValues.includes('vendor_selected'));
  assert.ok(IncomingQuote.schema.path('status').enumValues.includes('superseded'));
  assert.ok(QuoteInvitation.schema.path('status').enumValues.includes('processing'));
  assert.ok(EmailOutbox.schema.path('type').enumValues.includes('vendor_quote_invitation'));
  assert.ok(EmailOutbox.schema.path('type').enumValues.includes('vendor_compliance_update_request'));
  assert.ok(VendorRequirementApproval.schema.path('status').enumValues.includes('approved'));
  assert.ok(Vendor.schema.path('contractorLicenseNumber'));
  assert.ok(Vendor.schema.path('insuranceExpirationDate'));
  assert.ok(IncomingQuote.schema.indexes().some(([fields, options]) => fields.orderId === 1 && options.partialFilterExpression?.status === 'selected'));
});

test('vendor requirement overrides are bound to the exact action payload and ignore only the approval id', () => {
  const payload = { vendorId: 'vendor-1', email: 'vendor@example.com', personalMessage: 'Please quote' };
  const original = approvalPayloadHash('quote_invitation', 'order-1', ['vendor-1'], payload);
  const approvedRetry = approvalPayloadHash('quote_invitation', 'order-1', ['vendor-1'], { ...payload, requirementApprovalId: 'approval-1' });
  const changedRecipient = approvalPayloadHash('quote_invitation', 'order-1', ['vendor-1'], { ...payload, email: 'other@example.com', requirementApprovalId: 'approval-1' });
  assert.equal(original, approvedRetry);
  assert.notEqual(original, changedRecipient);
  assert.ok(vendorRequirementIssues({}).some(item => item.includes('ROC number')));
});

test('both service-request and workflow workspaces expose update-email and admin-approved send-anyway controls', () => {
  const route = fs.readFileSync(path.join(__dirname, '../routes/incomingQuotes.js'), 'utf8');
  const ui = fs.readFileSync(path.join(__dirname, '../../assets/js/incoming-quotes.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../../pages/admin-dashboard.html'), 'utf8');
  assert.match(route, /VENDOR_REQUIREMENTS_BLOCKED/);
  assert.match(route, /vendor_compliance_update_request/);
  assert.match(route, /vendor_requirement_override_approved/);
  assert.match(ui, /Email vendor to update/);
  assert.match(ui, /Send anyway/);
  assert.match(ui, /requirementDialog\?\.close\(\);[\s\S]*WorkflowDialog\?\.confirm/);
  assert.match(ui, /!confirmed[\s\S]*requirementDialog\.showModal\(\)/);
  assert.match(ui, /response\.approval\.status === 'approved'/);
  assert.match(ui, /ensureResidentialReviewBeforeSend/);
  assert.doesNotMatch(ui, /incomingResidentialConfirmed/);
  assert.match(route, /pending\.status === 'approved'[\s\S]*reusedApproval: true/);
  assert.match(ui, /window\.ServiceRequestsActive \? 'service-requests' : 'workflow-center'/);
  assert.match(html, /id="incomingRequirementApprovals"/);
});

test('public quote page and route withhold customer contact and internal selection keeps Order unquoted', () => {
  const route = fs.readFileSync(path.join(__dirname, '../routes/incomingQuotes.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../../pages/admin-dashboard.html'), 'utf8');
  assert.match(route, /serviceAddress: order\.customer\?\.address/);
  assert.doesNotMatch(route, /customerEmail:|customerPhone:/);
  assert.match(route, /order\.pricingStatus = 'unquoted'/);
  assert.match(route, /order\.amount = null/);
  assert.doesNotMatch(route, /new Payment|Payment\.create/);
  assert.ok(server.indexOf("app.use('/api/incoming-quotes'") < server.indexOf("app.use('/api', authenticateToken)"));
  assert.match(html, /id="incoming-quotes"/);
  assert.match(html, />Incoming Quotes</);
});

test('an active vendor invitation can be sent again without creating a duplicate quote chain', () => {
  const route = fs.readFileSync(path.join(__dirname, '..', 'routes', 'incomingQuotes.js'), 'utf8');
  const ui = fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'js', 'incoming-quotes.js'), 'utf8');
  assert.match(route, /sendAdditionalInvitation/);
  assert.match(route, /reusedInvitation: true/);
  assert.match(route, /\$inc: \{ sendCount: 1 \}/);
  assert.doesNotMatch(route, /This vendor already has an active quote invitation/);
  assert.match(ui, /Invitation sent again to this vendor using the active quote request/);
  assert.match(ui, /invite\.sendCount/);
});

test('Stage 2 forms retain their form reference across asynchronous submissions', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'js', 'incoming-quotes.js'), 'utf8');
  assert.doesNotMatch(ui, /event\.currentTarget\.reset\(\)/);
  assert.ok((ui.match(/const form = event\.currentTarget;/g) || []).length >= 2);
  assert.ok((ui.match(/form\.reset\(\)/g) || []).length >= 2);
});

test('Stage 2 compliance panel renders the canonical vendor ROC and COI fields', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'js', 'incoming-quotes.js'), 'utf8');
  const api = fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'js', 'api-service.js'), 'utf8');
  assert.match(ui, /vendor\.rocLicenseNumber/);
  assert.match(ui, /vendor\.certificateOfInsuranceOnFile/);
  assert.doesNotMatch(ui, /vendor\.rocNumber/);
  assert.doesNotMatch(ui, /vendor\.coiOnFile/);
  assert.match(api, /requestCache\.delete\('GET:\/incoming-quotes\/vendor-options'\)/);
});

test('Stage 2 workspace uses the focused responsive quote-entry design', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'pages', 'admin-dashboard.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'css', 'stage2-workspace-polish.css'), 'utf8');
  assert.match(html, /stage2-workspace-polish\.css\?v=20260812-stage2-workspace/);
  assert.match(html, /incoming-form-section-pricing/);
  assert.match(html, /incoming-form-section-conditions/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) auto !important/);
  assert.match(css, /is-workspace-open[^{}]*workflow-shared-chrome \.workflow-filterbar/);
  assert.match(css, /@media \(max-width: 760px\)/);
});
