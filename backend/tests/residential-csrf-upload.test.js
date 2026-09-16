const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function client(responses, nextUser = 'owner') {
  const calls = []; let refreshes = 0;
  const storage = { removeItem() {} };
  const window = { AuthSession: { user: { id: 'owner' }, csrfToken: 'stale' }, addEventListener() {}, dispatchEvent() {}, location: { hostname: 'localhost', pathname: '/pages/residential-portal.html' } };
  const source = fs.readFileSync(path.resolve(__dirname, '../../assets/js/api-service.js'), 'utf8').split('// Create global instance')[0];
  const context = vm.createContext({ window, localStorage: storage, sessionStorage: storage, console, CustomEvent: class {}, fetch: async (_url, config) => { calls.push(config); const response = responses.shift(); return { status: response.status, ok: response.status < 400, headers: { get: () => 'application/json' }, json: async () => response.data }; } });
  vm.runInContext(source + '\nglobalThis.client = new APIService();', context);
  const api = context.client;
  api.getSession = async () => { refreshes += 1; const payload = { user: { id: nextUser }, csrfToken: `fresh-${refreshes}` }; api.setSession(payload); return payload; };
  return { api, calls, refreshes: () => refreshes };
}
test('multipart request refreshes stale CSRF and preserves file body and idempotency header', async () => {
  const c = client([{ status: 201, data: { ok: true } }]); const form = { originalFile: true };
  await c.api.requestForm('/residential/requests', form, 'POST', { 'Idempotency-Key': 'same-key' });
  assert.equal(c.calls[0].headers['X-CSRF-Token'], 'fresh-1'); assert.equal(c.calls[0].body, form);
  assert.equal(c.calls[0].headers['Idempotency-Key'], 'same-key'); assert.equal(c.calls[0].credentials, 'include');
  assert.equal(c.calls[0].headers['Content-Type'], undefined);
});
test('CSRF-only rejection gets a single token refresh and safe retry', async () => {
  const c = client([{ status: 403, data: { code: 'CSRF_INVALID' } }, { status: 201, data: { ok: true } }]);
  await c.api.requestForm('/residential/requests', {});
  assert.equal(c.calls.length, 2); assert.equal(c.calls[1].headers['X-CSRF-Token'], 'fresh-2');
});
test('repeated CSRF failure and unrelated authorization failures never loop', async () => {
  for (const code of ['CSRF_INVALID', 'FORBIDDEN']) {
    const c = client([{ status: 403, data: { code } }, { status: 403, data: { code } }]);
    await assert.rejects(c.api.requestForm('/residential/requests', {}));
    assert.equal(c.calls.length, code === 'CSRF_INVALID' ? 2 : 1);
  }
});
test('a different signed-in account blocks upload instead of reusing stale property data', async () => {
  const c = client([], 'other-owner');
  await assert.rejects(c.api.requestForm('/residential/requests', {}), /account changed/);
  assert.equal(c.calls.length, 0);
});
