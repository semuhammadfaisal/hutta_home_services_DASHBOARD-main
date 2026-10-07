const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const Order = require('../models/Order');
const { serializeActivity, serializeOrder } = require('../utils/residentialSerializers');
const {
  requestCapabilities,
  submissionKey,
  uniqueChips,
  validateIdempotencyKey,
  validateOrderAction,
  validateRequestPayload
} = require('../utils/residentialRequests');

function objectId() { return new mongoose.Types.ObjectId(); }

test('standard and emergency request payloads are normalized and validated', () => {
  const standard = validateRequestPayload({
    propertyId: String(objectId()),
    serviceCategory: 'Plumbing',
    issueChips: ['Leak or dripping', 'Leak or dripping', 'Other'],
    description: ' Kitchen sink is leaking. ',
    urgency: 'soon',
    preferredTiming: 'Weekday afternoon',
    accessInstructions: 'Dog is friendly'
  });
  assert.deepEqual(standard.errors, []);
  assert.deepEqual(standard.payload.issueChips, ['Leak or dripping', 'Other']);
  assert.equal(standard.payload.description, 'Kitchen sink is leaking.');
  assert.equal(standard.payload.urgency, 'soon');

  const emergency = validateRequestPayload({
    propertyId: String(objectId()), serviceCategory: 'Electrical', issueChips: ['Sparking'],
    preferredTiming: 'Now', emergencyDisclaimerAccepted: 'true'
  }, true);
  assert.deepEqual(emergency.errors, []);
  assert.equal(emergency.payload.urgency, 'emergency');
  assert.equal(emergency.payload.emergencyDisclaimerAccepted, true);

  const missingAck = validateRequestPayload({ propertyId: 'x', serviceCategory: 'HVAC', description: 'No cooling', preferredTiming: 'Now' }, true);
  assert.match(missingAck.errors.join(' '), /acknowledgement/i);
  assert.ok(validateRequestPayload({ propertyId: 'x', serviceCategory: 'Unknown', urgency: 'wild' }).errors.length >= 3);
  assert.equal(uniqueChips(new Array(12).fill(0).map((_, index) => `Issue ${index}`)).length, 8);
});

test('idempotency keys are constrained and namespaced to the authenticated user', () => {
  const userId = objectId();
  assert.equal(validateIdempotencyKey('request-1234'), 'request-1234');
  assert.equal(validateIdempotencyKey('short'), null);
  assert.equal(validateIdempotencyKey('bad key with spaces'), null);
  assert.equal(submissionKey(userId, 'request-1234'), `${userId}:request-1234`);
});

test('server-side workflow rules govern cancellation, rescheduling, and Book Again', () => {
  assert.deepEqual(requestCapabilities({ workflowStatus: 'request_received' }), {
    canCancel: true, canReschedule: false, cancellationPending: false, reschedulePending: false, canBookAgain: false
  });
  assert.equal(requestCapabilities({ workflowStatus: 'scheduled' }).canReschedule, true);
  assert.equal(requestCapabilities({ workflowStatus: 'completed' }).canBookAgain, true);
  assert.equal(requestCapabilities({ workflowStatus: 'scheduled', cancellationRequest: { status: 'pending' } }).canReschedule, false);
  assert.match(validateOrderAction({ workflowStatus: 'completed' }, 'cancel', { reason: 'No longer needed' }).error, /no longer/i);
  assert.match(validateOrderAction({ workflowStatus: 'request_received' }, 'cancel', { reason: '' }).error, /reason/i);
  assert.deepEqual(validateOrderAction({ workflowStatus: 'scheduled' }, 'reschedule', { preferredTiming: 'Friday morning' }).payload, { preferredTiming: 'Friday morning', reason: '' });
});

test('Order stores portal intake and audit data while the residential serializer exposes only safe request state', () => {
  const userId = objectId();
  const order = new Order({
    orderId: 'ORD-900001', customer: { name: 'Owner' }, service: 'Plumbing', amount: null,
    pricingStatus: 'unquoted', source: 'residential_portal', workflowStatus: 'request_received',
    propertyId: objectId(), portalSubmissionKey: `${userId}:request-1234`,
    residentialRequest: { serviceCategory: 'Plumbing', issueChips: ['Leak'], urgency: 'urgent', preferredTiming: 'Tomorrow', accessInstructions: 'Side gate', submittedBy: userId },
    customerRequestHistory: [{ type: 'submitted', requestedBy: userId }]
  });
  assert.equal(order.validateSync(), undefined);
  const output = serializeOrder(order);
  assert.equal(output.request.serviceCategory, 'Plumbing');
  assert.equal(output.request.urgency, 'urgent');
  assert.equal(output.actions.canCancel, true);
  assert.equal(output.portalSubmissionKey, undefined);
  assert.equal(output.customerRequestHistory, undefined);
  assert.equal(output.request.submittedBy, undefined);
});

test('residential activity presents request submissions in customer-facing language', () => {
  const output = serializeActivity({
    _id: objectId(),
    title: 'Service request received',
    message: 'REQ-2026-000018 was received for My home.',
    createdAt: new Date('2026-09-21T12:00:00Z')
  });
  assert.equal(output.title, 'Service request submitted');
  assert.equal(output.summary, 'REQ-2026-000018 was submitted for My home.');
});

test('homeowner notifications use submitted wording and keep the unread badge on the bell', () => {
  const route = read('backend/routes/residential.js');
  const features = read('backend/routes/residentialFeatures.js');
  const shell = read('assets/css/portal-crm-shell.css');
  assert.match(route, /title: emergency \? 'Emergency request submitted' : 'Service request submitted'/);
  assert.match(features, /replace\(\/Service request received\/g, 'Service request submitted'\)/);
  assert.match(shell, /#openNotificationsButton \{ position: relative; overflow: visible; \}/);
  assert.match(shell, /#notificationBadge \{[\s\S]*?position: absolute;[\s\S]*?inset: -5px -5px auto auto;/);
});

test('residential mutation routes enforce membership, limits, workflow sync, audit, and notifications', () => {
  const route = read('backend/routes/residential.js');
  for (const endpoint of [
    "router.post('/requests'", "router.post('/emergency-requests'", "router.post('/orders/:orderId/book-again'",
    "router.post('/orders/:orderId/cancel-request'", "router.post('/orders/:orderId/reschedule-request'"
  ]) assert.match(route, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(route, /requestLimiter, handleRequestUpload/);
  assert.match(route, /activeMembershipFilter\(req\.user\.userId\)/);
  assert.match(route, /permissions\?\.requestService !== true/);
  assert.match(route, /portalSubmissionKey: key/);
  assert.match(route, /await synchronizeWorkflowOrder\(order, 'request_received', \{ session \}\)/);
  assert.match(route, /PortalActivity\.create/);
  assert.match(route, /Notification\.insertMany/);
  assert.match(route, /customerRequestHistory/);
  assert.match(route, /does not guarantee emergency dispatch/i);
  assert.match(route, /hasValidRequestSignature/);
  assert.match(route, /REQUEST_BATCH_BYTES/);
});

test('Book Again creates a clean shared order and never copies vendor, price, or schedule fields', () => {
  const route = read('backend/routes/residential.js');
  const start = route.indexOf("router.post('/orders/:orderId/book-again'");
  const end = route.indexOf("router.post('/orders/:orderId/cancel-request'", start);
  const bookAgainRoute = route.slice(start, end);
  assert.match(bookAgainRoute, /requestCapabilities\(original\)\.canBookAgain/);
  assert.match(bookAgainRoute, /repeatedFromOrder: original/);
  assert.doesNotMatch(bookAgainRoute, /original\.(?:amount|vendor|vendorAssignments|scheduledStart|scheduledEnd|scheduleDate|currentJobScheduleId|confirmedJobScheduleId)/);
  const createFlow = route.slice(route.indexOf('async function createSharedResidentialOrder'), route.indexOf('async function recordResidentialOrderAction'));
  assert.match(createFlow, /amount: null/);
  assert.match(createFlow, /vendorCost: 0/);
  assert.doesNotMatch(createFlow, /vendorAssignments:/);
  assert.doesNotMatch(createFlow, /scheduledStart:/);
});

test('portal UI connects the complete request lifecycle with accessible dialogs', () => {
  const html = read('pages/residential-portal.html');
  const client = read('assets/js/residential-portal.js');
  const api = read('assets/js/api-service.js');
  const css = read('assets/css/residential-portal.css');
  for (const id of ['openRequestButton', 'openEmergencyButton', 'requestDialog', 'requestForm', 'requestProperty', 'requestDocuments', 'emergencyAcknowledgement', 'orderActionDialog']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);
  }
  assert.match(html, /does not guarantee emergency dispatch/i);
  assert.match(html, /enctype="multipart\/form-data"/);
  assert.match(client, /createResidentialRequest\(formData, state\.requestSubmissionKey/);
  assert.match(client, /bookResidentialOrderAgain/);
  assert.match(client, /requestResidentialCancellation/);
  assert.match(client, /requestResidentialReschedule/);
  assert.match(client, /validateSelectedFiles/);
  assert.match(api, /'Idempotency-Key': idempotencyKey/);
  assert.match(css, /\.portal-dialog::backdrop/);
  assert.match(css, /\.issue-chips input:focus-visible \+ span/);
});
