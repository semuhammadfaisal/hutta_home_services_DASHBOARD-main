const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
test('all external portals and onboarding pages load shared branding last', () => {
  for (const name of ['residential-portal', 'agent-portal', 'commercial-portal', 'vendor-portal', 'vendor-signup', 'agent-invitation', 'commercial-invitation']) {
    const html = read(`pages/${name}.html`);
    const links = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(match => match[0]);
    const brandIndex = links.findIndex(link => /portal-brand.css\?v=20260916-unified-brand/.test(link));
    assert.notEqual(brandIndex, -1);
    if (name.endsWith('-portal')) {
      assert.match(links.at(-1), /portal-crm-shell.css\?v=20260921-crm-shell/);
      assert.ok(brandIndex < links.length - 1, 'shared CRM shell must load after portal branding');
    } else {
      assert.equal(brandIndex, links.length - 1);
    }
  }
});
test('portal typography uses SMPLfix fonts, not serif headings or Inter', () => {
  for (const name of ['residential', 'agent', 'commercial', 'vendor']) {
    const css = read(`assets/css/${name}-portal.css`);
    assert.doesNotMatch(css, /Georgia|Times New Roman|\bInter\b/);
    assert.match(css, /--smpl-font-ui/);
  }
  const css = read('assets/css/portal-brand.css');
  assert.match(css, /Space Grotesk/);
  assert.match(css, /Space Mono/);
  assert.match(css, /--ink: #0b0b0c/);
  assert.match(css, /--paper: #f6f6f4/);
  assert.match(css, /--green: #0b0b0c/);
  assert.match(css, /--red: #b42318/);
  assert.match(css, /:focus-visible/);
});
