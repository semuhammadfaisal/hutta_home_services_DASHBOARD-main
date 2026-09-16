const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PORTAL_SOURCES, workspaceFilter } = require('../utils/serviceRequestWorkspace');
const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
test('service requests and Workflow Center have disjoint source filters, including legacy work', () => {
  assert.deepEqual(workspaceFilter({ query: { workspace: 'service-requests' } }), { source: { $in: PORTAL_SOURCES } });
  assert.deepEqual(workspaceFilter({ query: {} }), { source: { $nin: PORTAL_SOURCES } });
  assert.deepEqual(workspaceFilter({ query: { workspace: 'admin' } }), { source: { $nin: PORTAL_SOURCES } });
  for (const source of ['residential_portal', 'agent_portal', 'commercial_portal']) assert.ok(PORTAL_SOURCES.includes(source));
  assert.ok(!PORTAL_SOURCES.includes('website'));
});
test('every lifecycle list scopes canonical orders at the server before looking up children', () => {
  for (const file of ['incomingQuotes', 'outgoingQuotes', 'scheduling', 'closeout']) assert.match(read(`backend/routes/${file}.js`), /workspaceFilter\(_req\)/);
  const overview = read('backend/routes/workflowCenter.js');
  assert.match(overview, /baseWorkflowCondition = \{ \.\.\.workspace/);
  assert.match(overview, /\$match: \{ \.\.\.workspace/);
  assert.match(overview, /loadRecentActivity\(activityLimit, workspace\)/);
  assert.match(overview, /where\(childFilter\).distinct\('orderId'\)/);
  assert.match(overview, /router.get\('\/requests', allowedRoles/);
});
test('dedicated Service Requests routes preserve full six-stage lifecycle and separate sidebar selection', () => {
  const html = read('pages/admin-dashboard.html'); const hub = read('assets/js/workflow-hub.js'); const api = read('assets/js/api-service.js');
  assert.match(html, /id="serviceRequestsNav"/);
  assert.match(html, /#service-requests\/overview/);
  assert.match(hub, /#service-requests\//);
  assert.match(hub, /Service Requests —/);
  assert.match(hub, /ServiceRequestsActive \? 'serviceRequestsNav' : 'workflowCenterNav'/);
  assert.match(hub, /stopImmediatePropagation/);
  for (const section of ['incoming-quotes', 'outgoing-quotes', 'customer-approvals', 'scheduling', 'closeout']) assert.ok(hub.includes(section));
  assert.match(api, /query.has\('workspace'\)/);
  assert.match(api, /query.set\('workspace', params.workspace/);
  assert.match(read('assets/js/dashboard-script.js'), /getServiceRequestQueue/);
});

test('portal notification links, feedback counters and late responses remain isolated', () => {
  for (const file of ['residential', 'agent', 'commercial']) {
    const route = read(`backend/routes/${file}.js`);
    assert.doesNotMatch(route, /actionUrl:\s*'#workflow-center'/);
    assert.match(route, /#service-requests\/overview/);
  }
  assert.match(read('backend/routes/workflowCenter.js'), /Order.find\(\{ \.\.\.workspace, workflowStatus: 'awaiting_customer_closeout'/);
  const hub = read('assets/js/workflow-hub.js');
  assert.match(hub, /requestId !== state.overviewRequestId/);
  assert.match(hub, /getWorkflowOverview\(\{ workspace,/);
  assert.match(hub, /badge && workspace === 'workflow-center'/);
});
