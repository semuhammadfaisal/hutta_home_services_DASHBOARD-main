const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const route = read('backend/routes/agentAdmin.js');
const html = read('pages/admin-dashboard.html');
const script = read('assets/js/agent-directory-admin.js');
const requestScript = read('assets/js/agent-requests-admin.js');
const css = read('assets/css/agent-directory-admin.css');
const api = read('assets/js/api-service.js');
const server = read('backend/server.js');

test('CRM exposes a dedicated staff-only agent directory and profile route', () => {
  assert.match(server, /app\.use\('\/api\/agent-admin', staffOnly/);
  assert.match(route, /router\.get\('\/agents'/);
  assert.match(route, /router\.get\('\/agents\/:agentUserId'/);
  assert.match(route, /role: 'real_estate_agent'/);
  assert.match(route, /profileCompletion: \{ complete: missingFields\.length === 0, missingFields \}/);
  assert.match(route, /RealEstateTransaction\.find\(\{ agentUserId: user\._id \}\)/);
  assert.match(route, /AgentClientInvitation\.find\(\{ agentUserId: user\._id \}\)/);
  assert.match(route, /AgentReferralAttribution\.find\(\{ agentUserId: user\._id \}\)/);
  assert.match(route, /'residentialRequest\.submittedBy': user\._id/);
});

test('agent CRM response explicitly selects operational data without secrets or referral money', () => {
  assert.doesNotMatch(route, /select\([^\n]*(password|tokenHash|paymentProvider|rewardUnits|rewardStatus)/);
  assert.doesNotMatch(route, /invitations: invitations\.map\([^\n]*(tokenHash|consent|deliveryError)/);
  assert.doesNotMatch(route, /referrals: referrals\.map\([^\n]*(rewardUnits|rewardStatus)/);
  assert.match(route, /res\.set\('Cache-Control', 'no-store'\)/);
});

test('admin dashboard lists agents and opens a complete CRM profile workspace', () => {
  assert.match(html, /data-section="agents"/);
  assert.match(html, /id="agents" class="content-section agent-directory-section"/);
  assert.match(html, /id="agent-detail" class="content-section agent-detail-section"/);
  for (const label of ['Real Estate Agents', 'Portfolio and transactions', 'Service requests and work', 'Referral attribution']) assert.ok((html + script).includes(label), `${label} missing`);
  assert.match(script, /getAgentAdminAgents\(\)/);
  assert.match(script, /getAgentAdminAgent\(agentUserId\)/);
  assert.match(script, /window\.dashboard\?\.showSection\?\.\('agent-detail'\)/);
  assert.match(script, /data-agent-order-id/);
  assert.match(api, /async getAgentAdminAgents\(\)/);
  assert.match(api, /async getAgentAdminAgent\(agentUserId\)/);
  assert.match(route, /agent: profile \? \{ userId: String\(profile\.userId\)/);
  assert.match(requestScript, /data-agent-action="profile"/);
  assert.match(requestScript, /window\.openAgentAdminProfile\?\.\(button\.dataset\.agentId\)/);
  assert.match(html, /id="agentRequestsRegisteredTitle">Registered Agents/);
  assert.match(html, /Agents appear here even when they have not submitted a service request/);
  assert.match(requestScript, /Promise\.allSettled\(\[window\.APIService\.getAgentAdminRequests\(\), window\.APIService\.getAgentAdminAgents\(\)\]\)/);
  assert.match(requestScript, /function renderRegisteredAgents\(\)/);
});

test('agent directory is responsive and supports loading, empty, search, and status states', () => {
  assert.match(script, /Loading agents/);
  assert.match(script, /No matching agents/);
  assert.match(script, /agentsSearch/);
  assert.match(script, /agentsStatus/);
  assert.match(css, /@media \(max-width: 1100px\)/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
});
