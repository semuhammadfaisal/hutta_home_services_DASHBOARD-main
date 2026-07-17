const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeSearch, prefixRegex, encodeCursor, decodeCursor, cursorFilter, parseLimit, pagePayload } = require('../utils/cursorPagination');

test('normalizes bounded indexed search input', () => {
  assert.equal(normalizeSearch('  Ryan   HUTTA '), 'ryan hutta');
  assert.equal(prefixRegex('a+b').test('a+b company'), true);
  assert.equal(prefixRegex('a+b').test('xx a+b'), false);
});

test('cursor round trips and creates a stable range', () => {
  const row = { _id: '507f1f77bcf86cd799439011', createdAt: new Date('2026-01-01T00:00:00Z') };
  const token = encodeCursor(row);
  assert.equal(String(decodeCursor(token).id), row._id);
  const filter = cursorFilter(token);
  assert.equal(filter.$or[0].createdAt.$lt.toISOString(), row.createdAt.toISOString());
});

test('list payload caps rows and emits next cursor', () => {
  const rows = Array.from({ length: 3 }, (_, i) => ({ _id: `507f1f77bcf86cd79943901${i}`, createdAt: new Date(2026, 0, 3 - i) }));
  const payload = pagePayload(rows, 20, 2);
  assert.equal(payload.data.length, 2);
  assert.equal(payload.pagination.hasMore, true);
  assert.equal(parseLimit('500'), 100);
});

test('dashboard uses bounded list APIs and lazy feature loading', () => {
  const root = path.resolve(__dirname, '../..');
  const api = fs.readFileSync(path.join(root, 'assets/js/api-service.js'), 'utf8');
  const pipeline = fs.readFileSync(path.join(root, 'assets/js/pipeline-mongodb.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'pages/admin-dashboard.html'), 'utf8');
  assert.doesNotMatch(api, /limit=5000/);
  assert.doesNotMatch(pipeline, /limit=5000/);
  assert.match(html, /feature-loader\.js/);
  assert.doesNotMatch(html, /<script src="\.\.\/assets\/js\/pipeline-mongodb\.js"/);
});

test('runtime exposes readiness, performance timing, tuned pool, and direct uploads', () => {
  const root = path.resolve(__dirname, '..');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const attachments = fs.readFileSync(path.join(root, 'routes/attachments.js'), 'utf8');
  assert.match(server, /health\/ready/);
  assert.match(server, /MONGODB_MAX_POOL_SIZE \|\| '20'/);
  assert.match(server, /performanceMiddleware/);
  assert.match(attachments, /direct\/:entityType\/:entityId\/sign/);
  assert.match(attachments, /type: 'authenticated'/);
});
