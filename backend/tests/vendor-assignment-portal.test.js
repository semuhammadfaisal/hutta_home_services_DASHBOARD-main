const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const JobCompletion = require('../models/JobCompletion');
const JobSchedule = require('../models/JobSchedule');
const VendorAssignmentMessage = require('../models/VendorAssignmentMessage');
const { canTransition, expirationWarnings, findAssignment, redactContact, serializeAssignment, transition } = require('../utils/vendorAssignments');

const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('assignment transition policy blocks invalid and backward vendor status changes', () => {
  assert.equal(canTransition('scheduled', 'en_route'), true);
  assert.equal(canTransition('scheduled', 'in_progress'), true);
  assert.equal(canTransition('in_progress', 'completion_submitted'), true);
  assert.equal(canTransition('completed', 'in_progress'), false);
  const assignment = { status: 'scheduled', statusHistory: [] };
  transition(assignment, 'en_route', { type: 'vendor', id: new mongoose.Types.ObjectId() });
  assert.equal(assignment.status, 'en_route');
  assert.throws(() => transition(assignment, 'scheduled', { type: 'vendor' }), /cannot move/);
});

test('assignment lookup and serializer isolate competing vendors and private pricing', () => {
  const vendorOne = new mongoose.Types.ObjectId(); const vendorTwo = new mongoose.Types.ObjectId();
  const order = new Order({ orderId: 'ORD-ISOLATION', customer: { name: 'Owner', email: 'owner@example.com', phone: '6025550100', address: '123 Main St' }, service: 'Home service', amount: 500, vendorCost: 300, profit: 200, vendorAssignments: [{ vendor: vendorOne, service: 'Plumbing', scope: 'Repair sink', scheduledStart: new Date('2026-10-10T16:00:00Z') }, { vendor: vendorTwo, service: 'Electrical', scope: 'Repair outlet', scheduledStart: new Date('2026-10-11T16:00:00Z') }] });
  const own = findAssignment(order, order.vendorAssignments[0]._id, vendorOne); const denied = findAssignment(order, order.vendorAssignments[1]._id, vendorOne);
  assert.ok(own); assert.equal(denied, null);
  const payload = serializeAssignment(order, own); const json = JSON.stringify(payload);
  assert.match(json, /123 Main St/); assert.doesNotMatch(json, /owner@example|6025550100|vendorCost|profit|Repair outlet/);
});

test('compliance expiration warnings cover ROC, COI, and workers compensation', () => {
  const now = new Date('2026-09-16T00:00:00Z');
  const warnings = expirationWarnings({ rocLicenseExpirationDate: '2026-09-20', coiProfile: { expirationDate: '2026-09-30' }, workersCompProfile: { required: true, expirationDate: '2026-10-20' } }, now);
  assert.deepEqual(warnings.map(item => item.key), ['roc_license', 'coi', 'workers_comp']);
  assert.equal(warnings[0].severity, 'critical');
});

test('message relay removes direct email and telephone details before persistence', () => {
  assert.equal(redactContact('Call 602-555-0100 or owner@example.com'), 'Call [contact hidden] or [contact hidden]');
  const message = new VendorAssignmentMessage({ assignmentId: new mongoose.Types.ObjectId(), orderId: new mongoose.Types.ObjectId(), vendorId: new mongoose.Types.ObjectId(), senderType: 'vendor', senderUserId: new mongoose.Types.ObjectId(), body: 'Safe routed update' });
  assert.equal(message.validateSync(), undefined);
});

test('scheduling and completion models are assignment-aware for multi-vendor orders', () => {
  const scheduleIndexes = JobSchedule.schema.indexes(); const completionIndexes = JobCompletion.schema.indexes();
  assert.ok(scheduleIndexes.some(([keys]) => keys.orderId === 1 && keys.assignmentId === 1 && keys.revisionNumber === 1));
  assert.ok(completionIndexes.some(([keys, options]) => keys.orderId === 1 && keys.assignmentId === 1 && options.unique));
  assert.equal(JobCompletion.schema.path('orderId').options.unique, undefined);
});

test('vendor assignment endpoints enforce vendor scope, conflict checks, uploads, and audit', () => {
  const route = read('backend/routes/vendorPortal.js'); const scheduling = read('backend/routes/scheduling.js');
  assert.match(route, /vendorAssignments:\s*\{\s*\$elemMatch:\s*\{\s*_id: req\.params\.assignmentId, vendor: req\.vendorRecord\._id/);
  assert.match(route, /This visit conflicts with another confirmed assignment/);
  assert.match(route, /assignmentPhotoUpload/); assert.match(route, /At least one before photo is required/); assert.match(route, /At least one after photo is required/);
  assert.match(route, /vendor_assignment_completion_submitted/); assert.match(route, /VendorAssignmentMessage/);
  assert.match(scheduling, /activeCompliance\(vendor, payload\.proposedEnd\)/);
  assert.match(scheduling, /assignmentId: assignmentId/);
});

test('vendor portal UI exposes schedule response, status, photo completion, and message relay', () => {
  const html = read('pages/vendor-portal.html'); const adminHtml = read('pages/admin-dashboard.html'); const script = read('assets/js/vendor-portal.js'); const scheduling = read('assets/js/scheduling.js'); const api = read('assets/js/api-service.js');
  assert.match(html, /Assignments &amp; schedule/); assert.match(script, /data-schedule-response/); assert.match(script, /data-assignment-status/);
  assert.match(script, /beforePhotos/); assert.match(script, /afterPhotos/); assert.match(script, /data-assignment-message/);
  assert.match(api, /respondToVendorSchedule/); assert.match(api, /submitVendorAssignmentCompletion/);
  assert.match(adminHtml, /id="scheduleAssignmentInput"/); assert.match(scheduling, /assignmentId: \$\('scheduleAssignmentInput'/);
});

test('migration replaces legacy one-order indexes without deleting assignment data', () => {
  const migration = read('backend/migrate-vendor-assignments.js');
  assert.match(migration, /one_pending_schedule_per_order/); assert.match(migration, /orderId_1_revisionNumber_1/); assert.match(migration, /orderId_1/);
  assert.doesNotMatch(migration, /deleteMany|dropDatabase/);
});
