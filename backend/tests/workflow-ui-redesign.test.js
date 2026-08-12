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

test('overview, journey, and admin reconciliation APIs are authenticated and map every workflow state', () => {
  const server = read('backend/server.js');
  const route = read('backend/routes/workflowCenter.js');
  assert.ok(server.indexOf("app.use('/api', authenticateToken)") < server.indexOf("app.use('/api/workflow-center'"));
  assert.match(route, /router\.get\('\/overview', allowedRoles/);
  assert.match(route, /router\.get\('\/orders\/:orderId\/journey', allowedRoles/);
  assert.match(route, /router\.post\('\/reconcile\/:orderId', adminOnly/);
  assert.doesNotMatch(route, /router\.(put|patch|delete)/);
  const { stageByStatus, phoenixWeekBounds } = require('../routes/workflowCenter').__test;
  assert.equal(stageByStatus.request_received, 1);
  assert.equal(stageByStatus.quote_collection, 2);
  assert.equal(stageByStatus.outgoing_quote_draft, 3);
  assert.equal(stageByStatus.quote_changes_requested, 4);
  assert.equal(stageByStatus.scheduled, 6);
  assert.equal(stageByStatus.awaiting_customer_closeout, 6);
  assert.equal(stageByStatus.completed, 6);
  assert.equal(stageByStatus.closeout_issue_reported, 6);
  const week = phoenixWeekBounds(new Date('2026-01-01T12:00:00.000Z'));
  assert.equal(week.start.toISOString(), '2025-12-29T07:00:00.000Z');
  assert.equal(week.end.toISOString(), '2026-01-05T07:00:00.000Z');
  assert.doesNotMatch(route, /\.limit\(500\)/);
  assert.match(route, /attentionCounts/);
  assert.match(route, /recentActivity/);
  assert.match(route, /scheduled_this_week/);
  assert.match(route, /America\/Phoenix/);
});

test('internal redesign provides accessible dialogs, filters, readiness, timelines, and responsive states', () => {
  const hub = read('assets/js/workflow-hub.js');
  const css = read('assets/css/workflow-redesign.css');
  const referenceCss = read('assets/css/workflow-reference.css');
  const incomingCss = read('assets/css/incoming-quotes.css');
  const incoming = read('assets/js/incoming-quotes.js');
  const outgoing = read('assets/js/outgoing-quotes.js');
  const intake = read('assets/js/dashboard-script.js');
  const approvals = read('assets/js/customer-approvals.js');
  const scheduling = read('assets/js/scheduling.js');
  const closeout = read('assets/js/closeout.js');
  assert.match(hub, /role="dialog" aria-modal="true"/);
  assert.match(hub, /Discard unsaved changes/);
  assert.match(hub, /Send readiness/);
  assert.match(hub, /workflow-decision-timeline/);
  assert.match(hub, /America\/Phoenix/);
  assert.match(hub, /smplfix\.workflow-center\.ui\.v2/);
  assert.match(hub, /LEGACY_STORAGE_KEY = 'huttas\.workflow-center\.ui\.v2'/);
  assert.match(hub, /data-filter="status"/);
  assert.match(hub, /sessionStorage/);
  assert.match(incoming, /WorkflowDialog/);
  assert.match(incoming, /incoming-vendor-compliance/);
  assert.match(incomingCss, /#incomingQuoteWorkspace \.incoming-vendor-compliance\[hidden\][\s\S]*display:\s*none\s*!important/);
  assert.match(outgoing, /WorkflowDialog/);
  assert.match(intake, /Intake health/);
  assert.match(intake, /intake-checklist/);
  assert.match(approvals, /workflow-audit-details/);
  assert.match(approvals, /changes_requested:\s*0/);
  assert.match(scheduling, /scheduleConfirmedSummary/);
  assert.match(scheduling, /Arizona time/);
  assert.match(closeout, /closeout-upload-preview/);
  assert.match(closeout, /completed early/);
  assert.doesNotMatch(`${incoming}\n${outgoing}`, /(^|[^.A-Za-z])(confirm|prompt)\(/m);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media\(max-width:520px\)/);
  assert.match(css, /Reference-aligned Workflow Center/);
  assert.match(css, /workflow-empty-art/);
  assert.match(hub, /workflow-empty-illustrated/);
  assert.match(hub, /\$\{tabs\(stage\)\}\$\{filterbar\(stage\)\}/);
  assert.match(hub, /workflow-kpi-grid/);
  assert.match(hub, /data-attention-filter/);
  assert.match(hub, /recentActivity/);
  assert.match(referenceCss, /Workflow Center reference-style operational UI/);
  assert.match(referenceCss, /grid-template-columns: repeat\(5/);
  assert.match(referenceCss, /workflow-activity-list/);
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
  const vendorPolish = read('assets/css/vendor-quote-polish.css');
  const completionJs = read('assets/js/vendor-completion.js');
  const secureCss = read('assets/css/secure-workflow.css');
  for (const html of [customer, vendor, schedule, completion, satisfaction]) assert.match(html, /secure-workflow\.css/);
  assert.equal((vendor.match(/class="quote-card secure-step" data-step="[123]"/g) || []).length, 3);
  assert.match(vendor, /id="vendorQuoteReview"/);
  assert.match(vendor, /vendor-quote-polish\.css\?v=20260812-vendor-quote-polish/);
  assert.match(vendor, /class="vendor-quote-page"/);
  assert.match(vendorJs, /validateStep/);
  assert.match(vendorJs, /reviewMarkup/);
  assert.match(vendorPolish, /Vendor quote portal — final smplfix visual layer/);
  assert.match(vendorPolish, /@media\(max-width:520px\)/);
  assert.match(completionJs, /completion-preview-grid/);
  assert.match(completionJs, /completion-upload-progress/);
  assert.match(secureCss, /Shared secure workflow v2/);
  assert.match(secureCss, /min-height:44px/);
  assert.doesNotMatch(customer, /vendorCost|markupAmount|internalNotes/);
  assert.doesNotMatch(schedule, /vendorCost|markupAmount|internalNotes/);
});

test('workflow controls remain contained across desktop, tablet, and mobile layouts', () => {
  const css = read('assets/css/workflow-redesign.css');
  const secureCss = read('assets/css/secure-workflow.css');
  const html = read('pages/admin-dashboard.html');
  assert.match(css, /Layout integrity: controls and long content always stay inside their surface/);
  assert.match(css, /\.workflow-queue-row\{\s*width:100%;\s*max-width:100%/);
  assert.match(css, /grid-template-columns:minmax\(0,1\.15fr\).*max-content/);
  assert.match(css, /@media\(max-width:1380px\) and \(min-width:761px\)/);
  assert.match(css, /\.workflow-row-action\{\s*grid-column:1\/-1/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*\.workflow-row-action\{grid-column:auto;justify-self:stretch;width:100%\}/);
  assert.match(css, /\.workflow-sticky-actions[\s\S]*flex-wrap:wrap/);
  assert.match(secureCss, /Public-page layout integrity/);
  assert.match(secureCss, /overflow-wrap:anywhere/);
  assert.match(secureCss, /@media\(max-width:560px\)/);
  assert.match(html, /workflow-reference\.css\?v=20260806-workflow-monochrome/);
});

test('Workflow Center buttons provide pointer and keyboard interaction feedback', () => {
  const hub = read('assets/js/workflow-hub.js');
  const css = read('assets/css/workflow-redesign.css');
  const html = read('pages/admin-dashboard.html');
  assert.match(hub, /function bindButtonEffects\(\)/);
  assert.match(hub, /workflow-click-ripple/);
  assert.match(hub, /pointerdown/);
  assert.match(hub, /\['Enter', ' '\]/);
  assert.match(hub, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.workflow-clickable\.is-workflow-pressed/);
  assert.match(css, /@keyframes workflow-button-ripple/);
  assert.match(css, /@media\(hover:hover\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(html, /workflow-hub\.js\?v=20260806-activity-clean/);
});

test('Workflow Center overview follows the monochrome SMPLFix brand system', () => {
  const components = read('assets/css/smplfix-components.css');
  const hub = read('assets/js/workflow-hub.js');
  const html = read('pages/admin-dashboard.html');

  assert.match(components, /Workflow Center: SMPLFix brand alignment and overview hierarchy/);
  assert.match(components, /#workflow-overview \.workflow-kpi-grid\s*\{[\s\S]*?repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(components, /\.workflow-tab\[aria-selected="true"\][\s\S]*?background:\s*var\(--smpl-ink\)/);
  assert.match(components, /#workflow-overview \.workflow-overview-grid\s*\{[\s\S]*?minmax\(0, 1\.65fr\)/);
  assert.match(components, /\.workflow-attention-empty \.workflow-empty-art[\s\S]*?background:\s*var\(--smpl-ink\)/);
  assert.match(components, /workflow-attention-filters button > span[\s\S]*?width:\s*16px/);
  assert.match(components, /workflow-attention-empty \.workflow-empty-art\.success[\s\S]*?background:\s*var\(--smpl-ink\)\s*!important/);
  assert.match(components, /workflow-panel-icon > i[\s\S]*?color:\s*var\(--smpl-paper\)\s*!important/);
  assert.match(hub, /workflow-empty-art success" aria-hidden="true"><i class="fas fa-check"/);
  assert.match(components, /workflow-attention-filters button\[aria-selected="true"\] > span[\s\S]*?color:\s*var\(--smpl-ink\)\s*!important/);
  assert.match(components, /workflow-activity-list::before\s*\{[\s\S]*?content:\s*none\s*!important/);
  assert.doesNotMatch(hub, /<span class="workflow-activity-dot">/);
  assert.match(html, /smplfix-components\.css\?v=20260806-profile-ui/);
  assert.match(html, /workflow-hub\.js\?v=20260806-activity-clean/);
});

test('all six Workflow Center stages share the final branded inner-workspace system', () => {
  const components = read('assets/css/smplfix-components.css');
  const html = read('pages/admin-dashboard.html');

  assert.match(components, /Workflow Center inner stages: one branded system across stages 1-6/);
  assert.match(components, /\.workflow-stage-section > \.workflow-header[\s\S]*?border-bottom:\s*1px solid var\(--smpl-line\)\s*!important/);
  assert.match(components, /\.workflow-stage-section \.workflow-summary\s*\{[\s\S]*?repeat\(auto-fit, minmax\(180px, 1fr\)\)/);
  assert.match(components, /\.workflow-stage-section :where\([\s\S]*?\.workflow-request-card,[\s\S]*?\.closeout-order-card[\s\S]*?border-left-color:\s*var\(--smpl-line\)\s*!important/);
  assert.match(components, /\.workflow-stage-section \.workflow-journey-step\.current[\s\S]*?background:\s*var\(--smpl-ink\)\s*!important/);
  assert.match(components, /@media \(max-width: 520px\)[\s\S]*?\.workflow-stage-section \.workflow-filterbar/);
  assert.equal((html.match(/class="content-section[^\"]*workflow-stage-section" data-workflow-stage="[1-6]"/g) || []).length, 6);
});

test('Workflow Center feature styles contain no legacy blue palette or blue-dominant colors', () => {
  const files = [
    'assets/css/workflow-center.css',
    'assets/css/incoming-quotes.css',
    'assets/css/outgoing-quotes.css',
    'assets/css/customer-approvals.css',
    'assets/css/scheduling.css',
    'assets/css/closeout.css',
    'assets/css/workflow-redesign.css',
    'assets/css/workflow-reference.css'
  ];
  const css = files.map(read).join('\n');
  const components = read('assets/css/smplfix-components.css');
  const workflowComponents = components.slice(
    components.indexOf('/* Workflow Center: SMPLFix brand alignment'),
    components.indexOf('/* Mini charts: compact SMPLFix analytics cards.')
  );
  const legacyToken = /--(?:wf|wfr|co|schedule|oq)-blue(?:-dark|-soft)?|var\(--(?:wf|wfr|co|schedule|oq)-blue(?:-dark|-soft)?\)/i;
  assert.doesNotMatch(css, legacyToken);
  assert.doesNotMatch(workflowComponents, legacyToken);

  const isBlueDominant = (red, green, blue) => blue > red + 8 && blue > green + 3;
  const blueHex = [...css.matchAll(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})\b/gi)]
    .filter(match => isBlueDominant(
      Number.parseInt(match[1], 16),
      Number.parseInt(match[2], 16),
      Number.parseInt(match[3], 16)
    ));
  const blueRgb = [...css.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gi)]
    .filter(match => isBlueDominant(Number(match[1]), Number(match[2]), Number(match[3])));
  assert.deepEqual(blueHex.map(match => match[0]), []);
  assert.deepEqual(blueRgb.map(match => match[0]), []);
});

test('reference overview omits New Request and exposes KPI, attention, activity, and relative-time interactions', () => {
  const html = read('pages/admin-dashboard.html');
  const hub = read('assets/js/workflow-hub.js');
  const api = read('assets/js/api-service.js');
  assert.doesNotMatch(hub, /New Request/);
  assert.match(hub, /Open Requests|open_requests/);
  assert.match(hub, /Waiting for Vendors|waiting_vendors/);
  assert.match(hub, /Awaiting Approval|awaiting_approval/);
  assert.match(hub, /Scheduled This Week|scheduled_this_week/);
  assert.match(hub, /Ready to Close|ready_to_close/);
  assert.match(hub, /relativeTime/);
  assert.match(api, /attentionLimit/);
  assert.match(api, /activityLimit/);
  assert.match(html, /workflowOverviewMount" aria-live="polite"/);
});
