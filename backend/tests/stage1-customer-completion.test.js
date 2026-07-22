const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
process.env.INTAKE_COMPLETION_TOKEN_SECRET = 'stage1-completion-test-secret-value-1234567890';
const { decryptToken, encryptToken, generateToken, hashToken, parseCompletionPayload } = require('../utils/intakeCompletion');

test('intake completion tokens are random, hash-only, and reversibly encrypted for outbox delivery', () => {
  const first = generateToken();
  const second = generateToken();
  assert.notEqual(first, second);
  assert.equal(hashToken(first).length, 64);
  assert.equal(decryptToken(encryptToken(first)), first);
});

test('completion payload requires category, address, and useful service details', () => {
  assert.deepEqual(parseCompletionPayload({}).errors, [
    'Service category is required',
    'Service address is required',
    'Please provide service details'
  ]);
  const parsed = parseCompletionPayload({ serviceCategory: 'Plumbing', serviceAddress: '123 Main St', serviceDetails: 'Repair leaking kitchen pipe', propertyType: 'Residential' });
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.payload.serviceCategory, 'Plumbing');
});

test('public completion route is mounted before authenticated API boundary', () => {
  const server = fs.readFileSync(path.join(root, 'backend', 'server.js'), 'utf8');
  assert.ok(server.indexOf("app.use('/api/intake-completion'") < server.indexOf("app.use('/api', authenticateToken)"));
  assert.match(server, /complete-request\.html/);
});

test('completion route advances only eligible requests and never creates vendor invitations', () => {
  const route = fs.readFileSync(path.join(root, 'backend', 'routes', 'intakeCompletion.js'), 'utf8');
  assert.match(route, /currentOrder\.workflowStatus = requiresReview \? 'request_received' : 'quote_collection'/);
  assert.match(route, /currentOrder\.pricingStatus = 'unquoted'/);
  assert.match(route, /currentOrder\.amount = null/);
  assert.doesNotMatch(route, /QuoteInvitation|IncomingQuote/);
});

test('confirmation email links to the secure completion page', () => {
  const email = fs.readFileSync(path.join(root, 'backend', 'utils', 'emailService.js'), 'utf8');
  assert.match(email, /complete-request\.html/);
  assert.match(email, /Complete Service Request/);
  const page = fs.readFileSync(path.join(root, 'pages', 'complete-request.html'), 'utf8');
  assert.match(page, /X-Intake-Completion-Token|complete-request\.js/);
  assert.doesNotMatch(page, /vendor cost|markup|staff notes/i);
});

test('intake and Order schemas retain completion and customer-supplied detail fields', () => {
  const intake = fs.readFileSync(path.join(root, 'backend', 'models', 'IntakeSubmission.js'), 'utf8');
  const order = fs.readFileSync(path.join(root, 'backend', 'models', 'Order.js'), 'utf8');
  assert.match(intake, /completionTokenHash: \{ type: String, select: false \}/);
  assert.match(intake, /completionStatus/);
  assert.match(order, /customerIntake/);
  assert.match(order, /preferredTiming/);
  assert.match(order, /accessInstructions/);
});

test('completion migration creates only its own indexes and avoids legacy index conflicts', () => {
  const migration = fs.readFileSync(path.join(root, 'backend', 'migrate-stage1-completion.js'), 'utf8');
  assert.match(migration, /completionTokenHash_1/);
  assert.match(migration, /completionStatus_1_completionTokenExpiresAt_1/);
  assert.doesNotMatch(migration, /\.createIndexes\(\)/);
  assert.doesNotMatch(migration, /Order\.createIndexes/);
});
