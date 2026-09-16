const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
const css = read('assets/css/residential-form-polish.css');

test('dialog polish loads after base styles and preserves closed dialog behavior', () => {
  const html = read('pages/residential-portal.html');
  assert.ok(html.indexOf('residential-form-polish.css') > html.indexOf('residential-portal.css'));
  assert.match(css, /\.portal-dialog\[open\] \{ display: flex; flex-direction: column;/);
  assert.match(css, /body:has\(\.portal-dialog\[open\]\) \{ overflow: hidden;/);
});

test('forms have a single scrolling body with fixed header and actions', () => {
  assert.match(css, /\.portal-dialog \{[^}]*overflow: hidden/);
  assert.match(css, /\.portal-dialog > form \{[^}]*min-height: 0; overflow: hidden/);
  assert.match(css, /\.dialog-header, \.portal-dialog \.dialog-footer \{ flex: 0 0 auto/);
  assert.match(css, /\.dialog-body \{ flex: 1 1 auto; min-height: 0; overflow: auto; overflow-x: hidden/);
});

test('controls include mobile sizing, focus, uploads, and bounded icons', () => {
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /grid-template-columns: minmax\(0,1fr\)/);
  assert.match(css, /:focus-visible \{ outline: 2px/);
  assert.match(css, /input\[type="checkbox"\] \{ width: 18px; height: 18px/);
  assert.match(css, /\.portal-dialog svg \{ width: 20px; height: 20px/);
  assert.match(css, /::file-selector-button/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
