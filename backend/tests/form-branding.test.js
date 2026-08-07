const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('every full form page loads the authoritative SMPLFix form layer last', () => {
  const pages = fs.readdirSync(path.join(root, 'pages'))
    .filter((name) => name.endsWith('.html'))
    .map((name) => `pages/${name}`)
    .filter((file) => {
      const html = read(file);
      return html.includes('</head>') && html.includes('<form');
    });

  assert.ok(pages.length >= 11, 'expected all admin, auth, vendor, and customer form pages');
  for (const file of pages) {
    const styles = [...read(file).matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)]
      .map((match) => match[1]);
    assert.match(styles.at(-1), /smplfix-forms\.css\?v=20260807-form-rebrand$/, `${file} must load the form system last`);
  }
});

test('shared form system is monochrome, responsive, and covers interaction states', () => {
  const css = read('assets/css/smplfix-forms.css');
  const legacyBlue = /#(?:0056b8|003d82|002a5c|2563eb|3b82f6|1d4ed8|175cd3|eef4ff|eff6ff)|rgba\(\s*(?:0\s*,\s*86\s*,\s*184|37\s*,\s*99\s*,\s*235|59\s*,\s*130\s*,\s*246)/i;
  assert.doesNotMatch(css, legacyBlue);
  assert.doesNotMatch(css, /(?:linear|radial)-gradient\s*\(/i);
  assert.match(css, /--smpl-form-ink:/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /:user-invalid/);
  assert.match(css, /input\[type="file"\]::file-selector-button/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('Customer Add and Edit share an accessible branded form workspace', () => {
  const html = read('pages/admin-dashboard.html');
  const js = read('assets/js/dashboard-script.js');
  const customFields = read('assets/js/custom-fields.js');

  assert.match(html, /id="customerModal"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="customerModalTitle"/);
  assert.match(html, /id="customerModalDescription"/);
  assert.match(html, /class="modal-content customer-modal smpl-form-dialog"/);
  for (const heading of ['Customer identity', 'Contact information', 'Service addresses', 'Internal notes', 'Documents', 'Custom fields']) {
    assert.ok(html.includes(heading), `missing customer section: ${heading}`);
  }
  assert.match(html, /id="customerModalSubmit"/);
  assert.doesNotMatch(html.match(/<!-- Customer Modal -->[\s\S]*?<!-- Profile Modal -->/)[0], /style="/);

  assert.match(js, /function appendCustomerRepeatField\(type, index, label, value = ''\)/);
  assert.doesNotMatch(js.match(/function addEmailAddress\(\)[\s\S]*?function removeEmailAddress/)[0], /\.style\.|style="/);
  assert.doesNotMatch(js.match(/function addPhoneNumber\(\)[\s\S]*?function removePhoneNumber/)[0], /\.style\.|style="/);
  assert.doesNotMatch(js.match(/function addPhysicalAddress\(\)[\s\S]*?function removePhysicalAddress/)[0], /\.style\.|style="/);
  assert.match(js, /customerModalSubmit'\)\.innerHTML = '<i class="fas fa-plus"/);
  assert.match(js, /customerModalSubmit'\)\.innerHTML = '<i class="fas fa-check"/);
  assert.match(js, /setAttribute\('aria-hidden', 'false'\)/);
  assert.match(js, /setAttribute\('aria-hidden', 'true'\)/);
  assert.match(customFields, /className = 'custom-field-group smpl-repeat-item'/);
  const customerCustomFieldSource = customFields.match(/function addCustomerCustomField[\s\S]*?\/\/ Remove custom field/)[0];
  assert.doesNotMatch(customerCustomFieldSource, /value="\$\{(?:name|value)\}"/);
});

test('legacy shared custom-field controls no longer declare blue branding', () => {
  const css = read('assets/css/custom-fields.css');
  assert.doesNotMatch(css, /#(?:2563eb|3b82f6)|rgba\(\s*59\s*,\s*130\s*,\s*246/i);
});
