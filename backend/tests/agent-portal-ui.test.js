const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('pages/agent-portal.html');
const script = read('assets/js/agent-portal.js');
const css = read('assets/css/agent-portal.css');
const api = read('assets/js/api-service.js');
const server = read('backend/server.js');
const auth = read('backend/middleware/auth.js');
const login = read('assets/js/login-script.js');

test('agent portal has dedicated accessible navigation for every requested workspace', () => {
  for (const route of ['overview', 'portfolio', 'transactions', 'requests', 'documents', 'referrals', 'notifications', 'account']) {
    assert.match(html, new RegExp(`data-route="${route}"`), `${route} navigation missing`);
    assert.match(html, new RegExp(`data-view="${route}"`), `${route} view missing`);
  }
  assert.match(html, /class="skip-link" href="#agentMain"/);
  assert.match(html, /<main id="agentMain"[^>]*tabindex="-1"/);
  assert.match(html, /aria-label="Agent portal navigation"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /<dialog id="transactionDialog"[^>]*aria-labelledby=/);
});

test('overview emphasizes close risk, work, appointments, activity, and readiness', () => {
  for (const id of ['overviewMetrics', 'closingSoonList', 'appointmentList', 'openItemsList', 'activityList']) assert.ok(html.includes(`id="${id}"`));
  assert.match(script, /Closing in 7 days/);
  assert.match(script, /isRisk/);
  assert.match(script, /days to close/);
  assert.match(script, /Completion readiness/);
  assert.match(script, /scheduledStart/);
});

test('portfolio and transaction details use authorized agent payloads without internal controls', () => {
  assert.match(script, /window\.APIService\.getAgentPortfolio\(\)/);
  assert.match(script, /window\.APIService\.getAgentOrders\(\)/);
  assert.match(script, /getAgentTransaction\(transactionId\)/);
  assert.match(script, /getAgentTransactionOrders\(transactionId\)/);
  assert.match(script, /transaction\.client\?\.displayName/);
  assert.match(script, /transaction\.property/);
  assert.doesNotMatch(html + script, /vendor cost|profit margin|coordination fee|assign vendor|release invoice|payment method/i);
  assert.doesNotMatch(script, /\/api\/(orders|customers|dashboard|payments|residential)/);
});

test('agent frontend service methods call only agent-scoped APIs', () => {
  for (const method of ['getAgentProfile', 'getAgentPortfolio', 'getAgentClients', 'getAgentProperties', 'getAgentTransactions', 'getAgentTransaction', 'getAgentTransactionOrders', 'getAgentOrders', 'getAgentActivity', 'getAgentReferrals', 'getAgentNotifications', 'readAgentNotification', 'acceptAgentInvitation', 'createAgentRequest']) assert.match(api, new RegExp(`async ${method}\\(`));
  assert.match(api, /\/(?:agent)\/portfolio/);
  assert.match(api, /\/(?:agent)\/notifications/);
  assert.match(api, /\/(?:agent)\/transactions\/\$\{encodeURIComponent\(transactionId\)\}\/requests/);
});

test('routing is controlled by the authenticated server role', () => {
  assert.match(auth, /role === 'real_estate_agent'/);
  assert.match(auth, /fallback = residential \? '\/pages\/residential-portal\.html' : agent \? '\/pages\/agent-portal\.html'/);
  assert.match(server, /resolved\.user\.role !== 'real_estate_agent'/);
  assert.match(server, /app\.get\(\['\/pages\/agent-portal\.html', '\/agent-portal\.html'\], serveAgentPortal\)/);
  assert.match(server, /sendFile\(path\.join\(__dirname, '\.\.\/pages\/agent-portal\.html'\)\)/);
  assert.match(api, /admin-dashboard\|residential-portal\|agent-portal/);
});

test('invitation token stays in the browser fragment through login and is submitted in a request body', () => {
  assert.match(login, /\^#invitation=\[A-Za-z0-9_-\]\{32,100\}\$/);
  assert.match(script, /new URLSearchParams\(location\.hash\.slice\(1\)\)/);
  assert.match(script, /acceptAgentInvitation\(token\)/);
  assert.match(api, /body: JSON\.stringify\(\{ token \}\)/);
  assert.doesNotMatch(script, /\?invitation=/);
});

test('portal implements search, filters, loading, empty, error, offline, and expired-access states', () => {
  for (const id of ['globalSearch', 'transactionFilter', 'portalLoading', 'portalError', 'offlineBanner', 'expiredState', 'portfolioEmpty', 'transactionEmpty', 'documentEmpty', 'notificationEmpty']) assert.ok(html.includes(`id="${id}"`), `${id} missing`);
  assert.match(script, /matchesSearch/);
  assert.match(script, /state\.transactionFilter/);
  assert.match(script, /error\?\.status === 404 \|\| error\?\.status === 403/);
  assert.match(script, /window\.addEventListener\('offline'/);
});

test('responsive CSS supports desktop, tablet, mobile, focus, and reduced motion', () => {
  assert.match(css, /@media \(max-width: 1050px\)/);
  assert.match(css, /@media \(max-width: 780px\)/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /min-width: 320px/);
  assert.match(css, /\.agent-sidebar\.is-open/);
});
