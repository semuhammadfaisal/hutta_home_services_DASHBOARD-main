const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const IncomingQuote = require('../models/IncomingQuote');
const VendorEstimateDraft = require('../models/VendorEstimateDraft');
const { normalizeLineItems, serializeVendorEstimateDraft } = require('../utils/vendorEstimateDrafts');
const { normalizeParserOutput, parseVendorEstimate } = require('../utils/vendorEstimateParserProvider');

const read = relative => fs.readFileSync(path.join(__dirname, '..', '..', relative), 'utf8');

test('estimate drafts retain private originals and parser audit metadata', () => {
  for (const field of ['invitationId', 'quoteId', 'orderId', 'vendorId', 'scope', 'lineItems', 'subtotal', 'notes', 'sourceFiles', 'parserAudit.status']) assert.ok(VendorEstimateDraft.schema.path(field));
  assert.equal(VendorEstimateDraft.schema.path('invitationId').options.unique, true);
  assert.equal(VendorEstimateDraft.schema.path('sourceFiles.sha256').options.select, false);
  assert.equal(VendorEstimateDraft.schema.path('sourceFiles.fileId').options.select, false);
  assert.equal(VendorEstimateDraft.schema.path('parserAudit.sourceSha256').options.select, false);
  assert.ok(IncomingQuote.schema.path('vendorEstimateDraftId'));
  assert.ok(IncomingQuote.schema.path('vendorLineItems'));
});

test('server calculates line totals and subtotal using cent-safe rounding', () => {
  const result = normalizeLineItems([
    { category: 'labor', description: 'Diagnostic labor', quantity: 1.5, unit: 'hour', unitPrice: 125, amount: 187.5 },
    { category: 'material', description: 'Valve', quantity: 3, unit: 'each', unitPrice: 19.995, amount: 60 }
  ], { verifyAmounts: true });
  assert.deepEqual(result.errors, []);
  assert.equal(result.lineItems[0].amount, 187.5);
  assert.equal(result.lineItems[1].unitPrice, 20);
  assert.equal(result.lineItems[1].amount, 60);
  assert.equal(result.subtotal, 247.5);
});

test('tampered totals, missing scope fields, and invalid quantities are rejected', () => {
  const result = normalizeLineItems([{ description: 'Part', quantity: 2, unit: 'each', unitPrice: 10, amount: 999 }], { verifyAmounts: true });
  assert.ok(result.errors.some(error => error.includes('does not match')));
  assert.ok(normalizeLineItems([{ description: '', quantity: 0, unit: '', unitPrice: -1 }]).errors.length >= 4);
});

test('parser provider normalizes structured output and preserves manual fallback on failure', async () => {
  const normalized = normalizeParserOutput({ result: { scope: ' Replace unit ', notes: 'Verify power', lineItems: [{ category: 'labor', description: 'Install', quantity: 2, unit: 'hour', unitPrice: 100 }] } });
  assert.equal(normalized.scope, 'Replace unit');
  assert.equal(normalized.lineItems[0].amount, 200);
  const failed = await parseVendorEstimate({ buffer: Buffer.from('x'), mimetype: 'application/pdf', originalname: 'bad.pdf' }, { name: 'test-ai', model: 'm1', configured: true, async parse() { throw Object.assign(new Error('provider down'), { code: 'provider_down' }); } });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.errorCode, 'provider_down');
  assert.deepEqual(failed.output.lineItems, []);
  assert.throws(() => normalizeParserOutput({ lineItems: [{ description: '', quantity: 0 }] }), /malformed estimate data/);
});

test('vendor draft serializer exposes editable data without storage IDs or file hashes', () => {
  const payload = serializeVendorEstimateDraft({ _id: 'draft1', invitationId: 'invite1', quoteId: 'quote1', status: 'draft', lineItems: [{ description: 'Work', quantity: 1, unit: 'each', unitPrice: 5, amount: 5 }], sourceFiles: [{ documentId: 'doc1', name: 'quote.pdf', mimeType: 'application/pdf', size: 10, fileId: 'private-file-id', sha256: 'private-hash' }], parserAudit: { status: 'succeeded', provider: 'test' } });
  const json = JSON.stringify(payload);
  assert.equal(payload.attachments[0].name, 'quote.pdf');
  assert.doesNotMatch(json, /private-file-id|private-hash|sha256|fileId/);
});

test('one vendor-scoped parsing endpoint handles desktop files and mobile camera images', () => {
  const route = read('backend/routes/vendorPortal.js'); const page = read('pages/vendor-portal.html'); const client = read('assets/js/vendor-portal.js'); const api = read('assets/js/api-service.js');
  assert.match(route, /\/leads\/:invitationId\/estimate-draft\/parse/);
  assert.match(route, /vendorId: req\.vendorRecord\._id/);
  assert.match(route, /application\/pdf.*image\/jpeg.*image\/png.*image\/webp/);
  assert.match(route, /validEstimateFile/);
  assert.match(route, /20 \* 1024 \* 1024/);
  assert.match(page, /vendor-estimate\.css/);
  assert.match(client, /data-estimate-dropzone/);
  assert.match(client, /capture="environment"/);
  assert.match(client, /data-estimate-file/);
  assert.match(client, /api\.parseVendorEstimate\(invitationId, data\)/);
  assert.match(api, /estimate-draft\/parse/);
});

test('original file is retained, duplicate hashes are blocked, and parsing never auto-submits', () => {
  const route = read('backend/routes/vendorPortal.js');
  const parseBlock = route.slice(route.indexOf("router.post('/leads/:invitationId/estimate-draft/parse'"), route.indexOf("router.put('/leads/:invitationId/estimate-draft'"));
  assert.ok(parseBlock.indexOf('storeFile(req.file') < parseBlock.indexOf('parseVendorEstimate(req.file)'));
  assert.match(parseBlock, /sourceFiles.*some\(file => file\.sha256 === sha256\)/s);
  assert.match(parseBlock, /already been uploaded/);
  assert.doesNotMatch(parseBlock, /quote\.status\s*=|status: 'submitted'/);
  assert.match(parseBlock, /parserMessage/);
});

test('submission requires saved review confirmation and calculates canonical quote totals', () => {
  const route = read('backend/routes/vendorPortal.js');
  const submitBlock = route.slice(route.indexOf("router.post('/leads/:invitationId/estimate-draft/submit'"), route.indexOf("router.get('/estimate-drafts/:draftId/files"));
  assert.match(submitBlock, /req\.body\.confirmed !== true/);
  assert.match(submitBlock, /!draft \|\| !draft\.reviewedAt/);
  assert.match(submitBlock, /laborCents/);
  assert.match(submitBlock, /materialCents/);
  assert.match(submitBlock, /vendorEstimateDraftId: draft\._id/);
  assert.match(submitBlock, /internalReview: true/);
  assert.doesNotMatch(submitBlock, /OutgoingQuote|CustomerQuote|customer.*notification/i);
});

test('raw estimate access is confined to scoped vendor and staff routes', () => {
  const vendorRoute = read('backend/routes/vendorPortal.js'); const staffRoute = read('backend/routes/incomingQuotes.js');
  assert.match(vendorRoute, /findOne\(\{ _id: req\.params\.draftId, vendorId: req\.vendorRecord\._id \}\)/);
  assert.match(staffRoute, /router\.use\(authenticateToken, staffRoles\)/);
  assert.ok(staffRoute.indexOf("router.use(authenticateToken, staffRoles)") < staffRoute.indexOf("router.get('/estimate-drafts/:draftId'"));
  for (const file of ['backend/routes/residential.js', 'backend/routes/residentialFeatures.js', 'backend/routes/agent.js', 'backend/utils/agentSerializers.js', 'backend/utils/residentialSerializers.js']) assert.doesNotMatch(read(file), /VendorEstimateDraft|vendorLineItems|vendorEstimateNotes/);
});

test('migration creates draft indexes only in explicit apply mode', () => {
  const migration = read('backend/migrate-vendor-leads.js');
  assert.match(migration, /VendorEstimateDraft\.createIndexes\(\)/);
  assert.match(migration, /if \(APPLY\)/);
});
