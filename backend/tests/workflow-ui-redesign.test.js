const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Workflow Center uses one sidebar entry and a unified six-view shell', () => {
  const html = read('pages/admin-dashboard.html');
  const hub = read('assets/js/workflow-hub.js');
  assert.equal((html.match(/id="workflowCenterNav"/g) || []).length, 1);
  assert.match(html, /id="workflow-overview"/);
  assert.match(html, /data-workflow-stage="1"/);
  assert.match(html, /data-workflow-stage="5"/);
  assert.match(html, /data-workflow-stage="6"/);
  assert.match(hub, /#workflow-center\/stage-/);
  assert.match(hub, /Back to/);
  assert.match(hub, /state\.scroll/);
});

test('read-only overview and journey APIs are authenticated and map every workflow state', () => {
  const server = read('backend/server.js');
  const route = read('backend/routes/workflowCenter.js');
  assert.ok(server.indexOf("app.use('/api', authenticateToken)") < server.indexOf("app.use('/api/workflow-center'"));
  assert.match(route, /router\.get\('\/overview', allowedRoles/);
  assert.match(route, /router\.get\('\/orders\/:orderId\/journey', allowedRoles/);
  assert.doesNotMatch(route, /router\.(post|put|patch|delete)/);
  const { stageByStatus } = require('../routes/workflowCenter').__test;
  assert.equal(stageByStatus.request_received, 1);
  assert.equal(stageByStatus.quote_collection, 2);
  assert.equal(stageByStatus.outgoing_quote_draft, 3);
  assert.equal(stageByStatus.quote_changes_requested, 4);
  assert.equal(stageByStatus.scheduled, 6);
  assert.equal(stageByStatus.completed, 6);
  assert.equal(stageByStatus.closeout_issue_reported, 6);
});

test('internal redesign provides accessible dialogs, filters, readiness, timelines, and responsive states', () => {
  const hub = read('assets/js/workflow-hub.js');
  const css = read('assets/css/workflow-redesign.css');
  const incoming = read('assets/js/incoming-quotes.js');
  const outgoing = read('assets/js/outgoing-quotes.js');
  assert.match(hub, /role="dialog" aria-modal="true"/);
  assert.match(hub, /Discard unsaved changes/);
  assert.match(hub, /Send readiness/);
  assert.match(hub, /workflow-decision-timeline/);
  assert.match(hub, /America\/Phoenix/);
  assert.match(incoming, /WorkflowDialog/);
  assert.match(outgoing, /WorkflowDialog/);
  assert.doesNotMatch(`${incoming}\n${outgoing}`, /(^|[^.A-Za-z])(confirm|prompt)\(/m);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media\(max-width:520px\)/);
  assert.match(css, /Reference-aligned Workflow Center/);
  assert.match(css, /workflow-empty-art/);
  assert.match(hub, /workflow-empty-illustrated/);
  assert.match(hub, /\$\{tabs\(stage\)\}\$\{filterbar\(stage\)\}/);
});

test('workflow workspaces never request a journey without a linked Order ID', () => {
  const hub = read('assets/js/workflow-hub.js');
  const api = read('assets/js/api-service.js');
  const dashboard = read('assets/js/dashboard-script.js');
  assert.match(hub, /if \(!orderId\) return result/);
  assert.match(api, /Order ID is required to load the workflow journey/);
  assert.match(dashboard, /Order unavailable/);
  assert.match(dashboard, /This intake is not linked to an Order/);
});

test('public workflow pages share secure styling and vendor quote is a three-step review flow', () => {
  const customer = read('pages/customer-quote.html');
  const vendor = read('pages/vendor-quote.html');
  const schedule = read('pages/vendor-schedule.html');
  const completion = read('pages/vendor-completion.html');
  const satisfaction = read('pages/customer-satisfaction.html');
  const vendorJs = read('assets/js/vendor-quote.js');
  for (const html of [customer, vendor, schedule, completion, satisfaction]) assert.match(html, /secure-workflow\.css/);
  assert.equal((vendor.match(/class="quote-card secure-step" data-step="[123]"/g) || []).length, 3);
  assert.match(vendor, /id="vendorQuoteReview"/);
  assert.match(vendorJs, /validateStep/);
  assert.match(vendorJs, /reviewMarkup/);
  assert.doesNotMatch(customer, /vendorCost|markupAmount|internalNotes/);
  assert.doesNotMatch(schedule, /vendorCost|markupAmount|internalNotes/);
});
