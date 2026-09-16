const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Draft = require('../../assets/js/commercial-request-state');
const { createCommercialReportWorker } = require('../utils/commercialReportWorker');
const { parseOrganizationChoice } = require('../utils/commercialUserApproval');
const { reportCsv, reportPdf } = require('../utils/commercialReportExport');
const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');

test('request drafts block double-clicks and keep the same key after ambiguous failure', () => {
  let sequence = 0; const draft = new Draft(() => `test-key-${++sequence}`);
  const payload = { propertyId: 'property1', service: 'HVAC' };
  const first = draft.start(payload);
  assert.equal(draft.start(payload), null);
  draft.finish(false); assert.equal(draft.start(payload), first);
  draft.finish(false); assert.notEqual(draft.start({ ...payload, propertyId: 'property2' }), first);
  draft.finish(true); assert.notEqual(draft.start(payload), first);
});
test('commercial staff approval validates explicit organization choice and least privilege', () => {
  assert.equal(parseOrganizationChoice({}).role, 'viewer');
  assert.throws(() => parseOrganizationChoice({ organizationId: 'bad' }), /Invalid organization/);
  assert.throws(() => parseOrganizationChoice({ newOrganizationName: 'A' }), /2–180/);
  assert.throws(() => parseOrganizationChoice({ commercialMembershipRole: 'admin' }), /Invalid organization membership/);
  assert.throws(() => parseOrganizationChoice({ organizationId: '507f1f77bcf86cd799439011', newOrganizationName: 'ABC' }), /not both/);
  const source = read('backend/utils/commercialUserApproval.js');
  assert.match(source, /session.withTransaction/);
  assert.match(source, /Choose an active commercial organization/);
  assert.match(source, /commercial_user_approved/);
});
test('report worker skips disconnected databases, prevents overlap, and stops its timer', async () => {
  let runs = 0, release, stopped = 0;
  const worker = createCommercialReportWorker({ run: () => { runs++; return new Promise(resolve => { release = resolve; }); }, setTimer: () => ({ unref() {} }), clearTimer: () => stopped++ });
  worker.start(); assert.equal(runs, 1); await worker.tick(); assert.equal(runs, 1);
  release(); await new Promise(resolve => setImmediate(resolve));
  const next = worker.tick(); assert.equal(runs, 2); release(); await next; worker.stop(); assert.equal(stopped, 1);
  const offline = createCommercialReportWorker({ run: () => runs++, connected: () => false }); await offline.tick(); assert.equal(runs, 2);
});
test('report exports include client totals, protect CSV formulas and ignore private fields', async () => {
  const report = { period: '2026-09', total: 100, paid: 20, balanceDue: 80, properties: [{ propertyLabel: '=HYPERLINK("bad")', total: 100 }], vendorCost: 77, margin: 'PRIVATE-MARGIN' };
  const csv = reportCsv([report]);
  assert.match(csv, /'=HYPERLINK/); assert.doesNotMatch(csv, /PRIVATE-MARGIN|vendorCost/);
  const pdf = await reportPdf([report]); assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
});
test('UI connects estimate decisions, scope edits, job history, and report downloads', () => {
  const js = read('assets/js/commercial-workflows.js');
  assert.match(js, /decideCommercialEstimate/); assert.match(js, /updateCommercialUserAccess/);
  assert.match(js, /scope.type === 'portfolio'/); assert.match(js, /completion.beforePhotos/);
  const portal = read('assets/js/commercial-portal.js');
  assert.match(portal, /data-estimate-order/); assert.match(portal, /data-edit-user-id/);
  assert.match(portal, /Download CSV/); assert.match(portal, /requestDraft.start\(payload\)/);
  const route = read('backend/routes/commercial.js');
  assert.match(route, /scopedCommercialOrder/); assert.match(route, /You cannot edit your own access/);
  assert.match(route, /accesses.length !== locations.length/);
});
test('commercial approval email contains no credentials and propagates delivery failures', async () => {
  const { sendCommercialApprovalEmail } = require('../utils/emailService');
  let message;
  await sendCommercialApprovalEmail('client@example.com', '<Client>', async payload => { message = payload; });
  assert.match(message.html, /&lt;Client&gt;/); assert.match(message.html, /\/pages\/login.html/);
  assert.doesNotMatch(message.html, /temporary password|Password:\s*<strong>/);
  await assert.rejects(sendCommercialApprovalEmail('client@example.com', 'Client', async () => { throw new Error('delivery failed'); }), /delivery failed/);
});

test('real completion and estimate routes exclude private fields and deny revoked property access', async () => {
  const express = require('express');
  const accessModule = require('../utils/commercialAccess');
  const Order = require('../models/Order'), Completion = require('../models/JobCompletion'), Quote = require('../models/OutgoingQuote');
  const originals = { access: accessModule.propertyAccess, order: Order.findById, completion: Completion.find, quote: Quote.findOne };
  const id = '507f1f77bcf86cd799439011', quoteId = '507f1f77bcf86cd799439012';
  let allowed = true;
  const query = value => { const q = { lean: async () => value, select: () => q, sort: () => q }; return q; };
  accessModule.propertyAccess = async () => allowed ? { permissions: { view: true }, agreement: { tier: 'tier_2' } } : null;
  Order.findById = () => query({ _id: id, propertyId: id, commercialContext: { organizationId: id }, service: 'HVAC', currentOutgoingQuoteId: quoteId });
  Completion.find = () => query([{ completionReference: 'DONE-1', completedAt: new Date(), completionNotes: 'Service completed.', beforePhotos: [], afterPhotos: [], vendorCost: 900, internalNotes: 'PRIVATE-NOTE' }]);
  Quote.findOne = () => query({ _id: quoteId, orderId: id, quoteReference: 'QUOTE-1', customerTotal: 100, scopeOfWork: 'Client scope', customerDecisionStatus: 'pending', validUntil: new Date(Date.now() + 86400000), vendorCost: 900, markup: 40 });
  const app = express(); app.use((req, _res, next) => { req.user = { userId: id, role: 'commercial' }; next(); });
  app.use('/commercial', require('../routes/commercial'));
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/commercial/orders/${id}`;
    for (const endpoint of ['/completion', `/estimates/${quoteId}`]) {
      const response = await fetch(base + endpoint); assert.equal(response.status, 200);
      const text = await response.text(); assert.doesNotMatch(text, /vendorCost|markup|PRIVATE-NOTE|internalNotes/);
    }
    allowed = false;
    for (const endpoint of ['/completion', `/estimates/${quoteId}`, '/completion-photos/before/file']) assert.equal((await fetch(base + endpoint)).status, 404);
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    accessModule.propertyAccess = originals.access; Order.findById = originals.order; Completion.find = originals.completion; Quote.findOne = originals.quote;
  }
});
