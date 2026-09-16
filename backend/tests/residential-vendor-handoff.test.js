const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { workflowTracker } = require('../utils/residentialSerializers');
const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
test('review is staff-only, requires an active coordinator and stays in request stage', () => {
  const route = read('backend/routes/incomingQuotes.js');
  assert.ok(route.indexOf('router.use(authenticateToken, staffRoles)') < route.indexOf("router.post('/orders/:orderId/residential-review'"));
  const review = route.split("router.post('/orders/:orderId/residential-review'")[1].split("router.post('/orders/:orderId/start'")[0];
  assert.match(review, /confirmReviewed !== true/); assert.match(review, /isActive: true/);
  assert.match(review, /source: 'residential_portal', workflowStatus: 'request_received'/);
  assert.match(review, /session.withTransaction/); assert.match(review, /residential_request_reviewed/);
  assert.doesNotMatch(review, /'quote_collection'/);
  assert.match(route, /!order.employee \|\| !order.residentialStaffReview\?\.reviewedAt/);
});
test('vendor distribution uses shared stage transition and transactional homeowner events without vendor award', () => {
  const route = read('backend/routes/incomingQuotes.js').split("router.post('/orders/:orderId/leads/distribute'")[1].split("router.post('/orders/:orderId/quotes'")[0];
  assert.match(route, /ensureQuoteStage\(order, session\)/);
  assert.match(route, /evaluateVendorLeadEligibility/);
  assert.match(route, /output.find\(item => !item.reused/);
  assert.match(route, /vendor_estimates_requested/);
  assert.match(route, /Collecting vendor estimates/);
  assert.doesNotMatch(route, /selectedIncomingQuoteId\s*=|customerApprovedAt\s*=/);
});
test('CRM handoff is discoverable and homeowner tracker distinguishes review from collection', () => {
  assert.match(read('pages/admin-dashboard.html'), /Review &amp; Send to Vendors/);
  assert.match(read('assets/js/incoming-quotes.js'), /Confirm review &amp; coordinator/);
  assert.match(read('assets/js/incoming-quotes.js'), /leadSubmissionKeys/);
  const received = workflowTracker({ workflowStatus: 'request_received' }, {});
  assert.match(received[0].label, /SMPLfix reviewing/);
  assert.equal(received.find(item => item.key === 'quote_collection').state, 'current');
  const collection = workflowTracker({ workflowStatus: 'quote_collection' }, {});
  assert.equal(collection.find(item => item.key === 'quote_collection').state, 'complete');
});
