const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const { deadlineRisk, median, parseTargetDeadline, validateAgentRequest } = require('../utils/agentRequests');
const { serializeOrder } = require('../utils/agentSerializers');
const Order = require('../models/Order');

test('agent request validation requires shared categories, meaningful scope, timing, urgency, and a pre-close deadline', () => {
  const now = new Date('2026-09-07T12:00:00Z');
  const transaction = { closeDate: new Date('2026-09-20T07:00:00Z') };
  const valid = validateAgentRequest({ serviceCategory: 'HVAC', scopeOfWork: 'Inspect both HVAC units before closing.', urgency: 'soon', targetCompletionDeadline: '2026-09-18', preferredTiming: 'Weekday morning' }, transaction, now);
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.payload.serviceCategory, 'HVAC');
  assert.equal(valid.payload.scopeOfWork, 'Inspect both HVAC units before closing.');
  assert.equal(parseTargetDeadline('2026-02-30'), null);
  const invalid = validateAgentRequest({ serviceCategory: 'Imaginary trade', scopeOfWork: 'short', urgency: 'whenever', targetCompletionDeadline: '2026-09-21', preferredTiming: '' }, transaction, now);
  assert.ok(invalid.errors.some(message => /service category/i.test(message)));
  assert.ok(invalid.errors.some(message => /scope/i.test(message)));
  assert.ok(invalid.errors.some(message => /urgency/i.test(message)));
  assert.ok(invalid.errors.some(message => /after.*close/i.test(message)));
  assert.ok(invalid.errors.some(message => /timing/i.test(message)));
});

test('deadline risk is based on target, order state, client estimate, and confirmed schedule', () => {
  const now = new Date('2026-09-07T12:00:00Z');
  const order = { workflowStatus: 'request_received', residentialRequest: { targetCompletionDeadline: new Date('2026-09-09T19:00:00Z') } };
  assert.equal(deadlineRisk(order, {}, null, null, now).level, 'high');
  assert.equal(deadlineRisk(order, {}, { status: 'sent' }, null, now).level, 'watch');
  assert.equal(deadlineRisk(order, {}, { status: 'sent' }, { proposedEnd: new Date('2026-09-10T20:00:00Z') }, now).level, 'critical');
  assert.equal(deadlineRisk({ ...order, workflowStatus: 'completed' }, {}, null, null, now).level, 'ready');
  assert.equal(median([2, 8, 4, 6]), 5);
  assert.equal(median([]), null);
});

test('shared order stores agent submitter, transaction deadline, and protected document classification', () => {
  assert.ok(Order.schema.path('residentialRequest.targetCompletionDeadline'));
  assert.ok(Order.schema.path('residentialRequest.transactionId'));
  assert.deepEqual(Order.schema.path('residentialRequest.submittedByRole').enumValues, ['residential', 'real_estate_agent']);
  assert.ok(Order.schema.path('documents').schema.path('portalDocumentType'));
});

test('agent estimate payload is read-only and deadline data remains free of private pricing', () => {
  const order = serializeOrder({ _id: new mongoose.Types.ObjectId(), propertyId: new mongoose.Types.ObjectId(), orderId: 'AREQ-1', service: 'HVAC', description: 'Inspect unit', workflowStatus: 'quote_sent', vendorCost: 500, profit: 200 }, {
    quote: { quoteReference: 'OUT-1', status: 'sent', customerDecisionStatus: 'pending', sentAt: new Date(), earliestAvailableDate: new Date() },
    deadlineRisk: { level: 'watch', reason: 'Scheduling is not confirmed', deadline: new Date() }
  });
  assert.equal(order.estimateStatus.capabilities.canView, true);
  assert.equal(order.estimateStatus.capabilities.canApprove, false);
  assert.equal(order.estimateStatus.capabilities.canRequestChanges, false);
  assert.equal(order.deadlineRisk.level, 'watch');
  assert.doesNotMatch(JSON.stringify(order), /vendorCost|profit|customerTotal|markup/i);
});

test('agent request route rechecks expiring access, uses the shared workflow, protects files, and notifies owners', () => {
  const route = read('backend/routes/agent.js');
  assert.match(route, /router\.post\('\/transactions\/:transactionId\/requests', writes, uploadRequestDocuments/);
  assert.match(route, /currentTransaction = await RealEstateTransaction\.findOne\(\{ _id: transaction\._id, \.\.\.nowFilter/);
  assert.match(route, /currentMembership = currentTransaction \? await activeMembership\(currentTransaction, req\.user\.userId, new Date\(\), session\)/);
  assert.match(route, /currentMembership\.permissions\?\.requestService !== true/);
  assert.match(route, /source: 'agent_portal'/);
  assert.match(route, /customerId: customer\._id, propertyId: property\._id/);
  assert.match(route, /submittedByRole: 'real_estate_agent'/);
  assert.match(route, /targetCompletionDeadline: payload\.targetCompletionDeadline/);
  assert.match(route, /synchronizeWorkflowOrder\(order, 'request_received'/);
  assert.match(route, /validFileSignature/);
  assert.match(route, /originalRetained: true/);
  assert.match(route, /portalDocumentType: item\.kind/);
  assert.match(route, /relationship: 'owner', status: 'active'/);
  assert.match(route, /You retain estimate approval and payment control/);
  assert.match(route, /PortalActivity\.insertMany/);
  assert.doesNotMatch(route, /AI extraction|Claude API|parsedLineItems/);
});

test('guidance is derived from recorded quote/order data and has no invented fallback', () => {
  const route = read('backend/routes/agent.js'); const script = read('assets/js/agent-portal.js'); const api = read('assets/js/api-service.js');
  assert.match(route, /request-guidance/);
  assert.match(route, /OutgoingQuote\.find\(\{ status: 'sent'/);
  assert.match(route, /Order\.find\(\{ _id: \{ \$in:/);
  assert.match(route, /observedMedian == null \? null/);
  assert.match(route, /staff_confirmed_vendor_calendar/);
  assert.match(route, /JobSchedule.exists/);
  assert.match(api, /getAgentRequestGuidance/);
  assert.match(api, /requestForm\(`\/agent\/transactions/);
  assert.match(script, /No qualifying estimate-turnaround history is available/);
  assert.match(script, /No confirmed vendor calendar availability is recorded/);
  assert.doesNotMatch(script, /within (?:24|48|72) hours|next available (?:tomorrow|today)/i);
});

test('request UI captures every scoped input and never exposes approval actions', () => {
  const html = read('pages/agent-portal.html'); const script = read('assets/js/agent-portal.js');
  for (const id of ['requestTransaction', 'requestPropertySummary', 'requestService', 'requestDescription', 'requestUrgency', 'requestDeadline', 'requestTiming', 'requestAccess', 'requestInspection', 'requestSupporting', 'requestGuidance']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /name="inspectionReport"/);
  assert.match(html, /name="supportingFiles"/);
  assert.match(script, /new FormData\(element\.requestForm\)/);
  assert.match(script, /Estimate:/);
  assert.match(script, /Read-only/);
  assert.doesNotMatch(html, /<button[^>]*>\s*Approve estimate|<button[^>]*>\s*(?:Enter|Manage) payment/i);
});
