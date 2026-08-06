const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('authentication uses opaque server sessions and contains no demo or public register path', () => {
  const authRoute = read('backend/routes/auth.js');
  const authMiddleware = read('backend/middleware/auth.js');
  const sessionModel = read('backend/models/AuthSession.js');

  assert.doesNotMatch(authRoute, /jsonwebtoken|jwt\.sign|demo-user|router\.post\('\/register'/);
  assert.match(authRoute, /router\.post\('\/login'/);
  assert.match(authRoute, /router\.get\('\/session', authenticateToken/);
  assert.match(authRoute, /router\.post\('\/logout', authenticateToken/);
  assert.match(authRoute, /router\.post\('\/change-password', authenticateToken/);
  assert.match(sessionModel, /tokenHash/);
  assert.match(sessionModel, /expires:\s*0/);
  assert.match(authMiddleware, /x-csrf-token/i);
  assert.match(authMiddleware, /timingSafeEqual/);
});

test('server applies an authenticated-by-default API boundary and protects dashboard HTML', () => {
  const server = read('backend/server.js');
  const boundary = server.indexOf("app.use('/api', authenticateToken)");
  assert.ok(boundary > server.indexOf("app.use('/api/auth'"));
  assert.ok(boundary > server.indexOf("app.use('/api/vendor-onboarding'"));
  assert.ok(boundary < server.indexOf("app.use('/api/orders'"));
  assert.ok(boundary < server.indexOf("app.use('/api/stages'"));
  assert.match(server, /app\.get\(\['\/pages\/admin-dashboard\.html', '\/admin-dashboard\.html'\], serveDashboard\)/);
  assert.doesNotMatch(server, /express\.static\(path\.join\(__dirname, '\.\.'/);
});

test('browser authentication contains no bearer-token persistence or transmission', () => {
  const clientFiles = [
    'assets/js/api-service.js',
    'assets/js/login-script.js',
    'assets/js/dashboard-script.js',
    'assets/js/file-upload.js',
    'assets/js/pipeline-mongodb.js',
    'assets/js/rbac.js'
  ].map(read).join('\n');

  assert.doesNotMatch(clientFiles, /Authorization\s*[:=]|Bearer\s+\$\{/);
  assert.doesNotMatch(clientFiles, /(?:localStorage|sessionStorage)\.setItem\(['"]huttaSession/);
  assert.match(clientFiles, /X-CSRF-Token|x-csrf-token/);
  assert.match(clientFiles, /AuthReady/);
});

test('login submit control uses dependency-free visible action and success icons', () => {
  const loginPage = read('pages/login.html');
  const loginScript = read('assets/js/login-script.js');
  const loginStyles = read('assets/css/login-styles.css');

  assert.match(loginPage, /class="submit-btn__arrow" aria-hidden="true">&#8594;<\/span>/);
  assert.match(loginScript, /class="submit-btn__success-icon" aria-hidden="true">&#10003;<\/span>/);
  assert.match(loginStyles, /\.submit-btn > :where\(\.submit-btn__arrow, \.submit-btn__success-icon\)/);
});

test('signup creates inactive pending approval requests and validates requested roles', () => {
  const authRoute = read('backend/routes/auth.js');
  assert.match(authRoute, /\['admin', 'manager', 'account_rep'\]\.includes\(requestedRole\)/);
  assert.match(authRoute, /role:\s*'pending'/);
  assert.match(authRoute, /isActive:\s*false/);
});

test('profile settings are database-backed, validated, and cannot self-escalate roles', () => {
  const authRoute = read('backend/routes/auth.js');
  const userModel = read('backend/models/User.js');
  assert.match(authRoute, /router\.get\('\/profile', authenticateToken/);
  assert.match(authRoute, /router\.put\('\/profile', authenticateToken/);
  assert.match(authRoute, /User\.findById\(req\.user\.userId\)/);
  assert.match(authRoute, /Current password is required to change your email address/);
  assert.match(authRoute, /function normalizeProfileAvatar\(value\)/);
  assert.match(authRoute, /png\|jpeg\|webp/);
  assert.match(authRoute, /avatarBytes:\s*512 \* 1024/);
  assert.doesNotMatch(authRoute, /user\.role\s*=\s*req\.body/);
  assert.match(userModel, /firstName: \{ type: String, required: true, trim: true, maxlength: 80 \}/);
  assert.match(userModel, /department: \{ type: String, trim: true, maxlength: 100 \}/);
});

test('profile modal loads fresh data and separates profile and password transactions', () => {
  const html = read('pages/admin-dashboard.html');
  const api = read('assets/js/api-service.js');
  const dashboard = read('assets/js/dashboard-script.js');
  const styles = read('assets/css/smplfix-components.css');
  const profileMarkup = html.slice(html.indexOf('<!-- Profile Modal -->'), html.indexOf('<!-- Pipeline Modals -->'));

  assert.match(profileMarkup, /role="dialog" aria-modal="true"/);
  assert.match(profileMarkup, /id="profileForm" onsubmit="saveProfile\(event\)"/);
  assert.match(profileMarkup, /id="profilePasswordForm" onsubmit="changeProfilePassword\(event\)"/);
  assert.match(profileMarkup, /id="profileRoleLabel"/);
  assert.doesNotMatch(profileMarkup, /<select id="role"/);
  assert.match(api, /async getProfile\(\)[\s\S]*?request\('\/auth\/profile'\)/);
  assert.match(dashboard, /await window\.APIService\.getProfile\(\)/);
  assert.match(dashboard, /profilePendingAvatar !== undefined/);
  assert.match(dashboard, /window\.APIService\.changePassword\(currentPassword, newPassword\)/);
  assert.match(styles, /authoritative SMPLFix account workspace/);
  assert.match(styles, /body #profileModal \.profile-form,[\s\S]*?display: block !important/);
  assert.match(styles, /width: min\(920px, calc\(100vw - 48px\)\) !important/);
  assert.match(dashboard, /document\.body\.classList\.add\('profile-modal-open'\)/);
  assert.match(html, /dashboard-script\.js\?v=20260806-settings-ui/);
});

test('sensitive modules and notification mutations have server-side ownership checks', () => {
  const server = read('backend/server.js');
  const notifications = read('backend/routes/notifications.js');
  const pipeline = read('backend/routes/pipelineRecords.js');
  const legacyFiles = read('backend/routes/gridfs-upload.js');
  assert.match(server, /app\.use\('\/api\/payments', checkRole\(\['admin'\]\)/);
  assert.match(server, /app\.use\('\/api\/users', checkRole\(\['admin'\]\)/);
  assert.match(server, /app\.use\('\/api\/settings', checkRole\(\['admin'\]\)/);
  assert.match(notifications, /\{ _id: req\.params\.id, userId: req\.user\.userId \}/);
  assert.match(pipeline, /kpi\/payments-collected', checkRole\(\['admin'\]\)/);
  assert.match(legacyFiles, /authorizeStoredFile\(req, res, filename\)/);
  assert.match(legacyFiles, /req\.user\?\.role !== 'admin'/);
});

test('idle and absolute session deadlines fail closed', () => {
  const { ABSOLUTE_TIMEOUT_MS, IDLE_TIMEOUT_MS, isSessionExpired } = require('../utils/authSessions');
  const now = Date.now();
  const valid = {
    lastActivityAt: new Date(now - IDLE_TIMEOUT_MS + 1),
    absoluteExpiresAt: new Date(now + 1)
  };
  assert.equal(isSessionExpired(valid, now), false);
  assert.equal(isSessionExpired({ ...valid, lastActivityAt: new Date(now - IDLE_TIMEOUT_MS) }, now), true);
  assert.equal(isSessionExpired({ ...valid, absoluteExpiresAt: new Date(now) }, now), true);
  assert.equal(ABSOLUTE_TIMEOUT_MS, 8 * 60 * 60 * 1000);
});

test('CSRF comparisons trust the deployed Render origin and reject unconfigured origins', () => {
  const auth = require('../middleware/auth');
  const { CANONICAL_PUBLIC_APP_URL } = require('../utils/publicAppUrl');
  assert.equal(auth.sameValue('same-token', 'same-token'), true);
  assert.equal(auth.sameValue('same-token', 'different-token'), false);

  const request = (origin, protocol = 'https', host = 'dashboard.example.com') => ({
    protocol,
    get(name) {
      const headers = { origin, referer: undefined, host };
      return headers[name];
    }
  });
  assert.equal(auth.isSameOrigin(request('https://dashboard.example.com')), true);
  assert.equal(auth.isSameOrigin(request(CANONICAL_PUBLIC_APP_URL, 'http', 'internal-render-host')), true);
  assert.equal(auth.isSameOrigin(request('https://evil.example.com')), false);
});
