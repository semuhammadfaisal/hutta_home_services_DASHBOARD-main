const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const { completedOrder, cancelledOrder, daysFromPhoenixToday, readinessFor, riskRank } = require('../utils/agentOverview');
const { PORTAL_SOURCES, ISOLATED_INTAKE_SOURCES, workspaceFilter } = require('../utils/serviceRequestWorkspace');

test('overview date windows use Phoenix calendar days', () => {
  const now = new Date('2026-07-01T06:30:00.000Z'); // June 30, 11:30 PM in Phoenix
  assert.equal(daysFromPhoenixToday('2026-07-01T07:00:00.000Z', now), 1);
  assert.equal(daysFromPhoenixToday('2026-06-30T07:00:00.000Z', now), 0);
});

test('overview readiness excludes cancelled work and labels no-work transactions', () => {
  assert.deepEqual(readinessFor([]), { percent: null, label: 'No work pending', completed: 0, total: 0 });
  const result = readinessFor([
    { workflowStatus: 'completed' },
    { workflowStatus: 'scheduled' },
    { status: 'cancelled' }
  ]);
  assert.deepEqual(result, { percent: 50, label: '1 of 2 complete', completed: 1, total: 2 });
  assert.equal(completedOrder({ status: 'closed' }), true);
  assert.equal(cancelledOrder({ workflowStatus: 'lost' }), true);
  assert.ok(riskRank('critical') < riskRank('high'));
});

test('pending agent intake is excluded from both shared request workspaces', () => {
  assert.deepEqual(workspaceFilter({ query: { workspace: 'service-requests' } }), { source: { $in: PORTAL_SOURCES } });
  assert.deepEqual(workspaceFilter({ query: {} }), { source: { $nin: [...PORTAL_SOURCES, ...ISOLATED_INTAKE_SOURCES] } });
  assert.ok(ISOLATED_INTAKE_SOURCES.includes('agent_portal'));
  assert.ok(!PORTAL_SOURCES.includes('agent_portal'));
  assert.ok(PORTAL_SOURCES.includes('agent_fulfillment'));
});

test('agent overview exposes an aggregated endpoint and refresh behavior', () => {
  const route = read('backend/routes/agent.js');
  const api = read('assets/js/api-service.js');
  const ui = read('assets/js/agent-portal.js');
  const html = read('pages/agent-portal.html');
  assert.match(route, /router\.get\('\/overview'/);
  assert.match(route, /closingWithinSevenDays/);
  assert.match(route, /refreshAfterSeconds: 60/);
  assert.match(api, /async getAgentOverview\(\)/);
  assert.match(ui, /scheduleOverviewRefresh/);
  assert.match(ui, /document\.addEventListener\('visibilitychange'/);
  for (const id of ['overviewRefresh', 'overviewUpdated', 'overviewStale', 'priorityList']) assert.ok(html.includes(`id="${id}"`));
});

test('CRM navigation uses a dedicated agent intake screen and an explicit fulfillment handoff', () => {
  const html = read('pages/admin-dashboard.html');
  const hub = read('assets/js/workflow-hub.js');
  const route = read('backend/routes/agentAdmin.js');
  const intake = read('backend/routes/agent.js');
  const adminUi = read('assets/js/agent-requests-admin.js');
  const sync = read('backend/utils/workflowSync.js');
  assert.match(html, /id="agentRequestsNav"/);
  assert.match(html, /href="#agent-requests" data-section="agent-requests"/);
  assert.match(html, /id="agent-requests" class="content-section agent-requests-section"/);
  assert.doesNotMatch(hub, /agent-requests/);
  assert.match(route, /router\.get\('\/requests'/);
  assert.match(route, /source: 'agent_portal', workflowStatus: 'request_received'/);
  assert.match(route, /router\.post\('\/requests\/:orderId\/advance'/);
  assert.match(route, /order\.source = 'agent_fulfillment'/);
  assert.match(route, /synchronizeWorkflowOrder\(order, 'quote_collection'/);
  assert.doesNotMatch(intake, /synchronizeWorkflowOrder\(order, 'request_received'/);
  assert.match(adminUi, /Send to fulfillment/);
  assert.match(adminUi, /Homeowner approves & pays/);
  assert.match(sync, /AGENT_MILESTONES/);
  assert.match(sync, /'agent_portal', 'agent_fulfillment'/);
});
