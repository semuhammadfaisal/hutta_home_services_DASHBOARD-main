const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  parseResidentialAccount,
  serializeResidentialAccount,
  syncCustomerFromResidentialAccount
} = require('../utils/residentialAccount');

test('residential account input requires identity and complete addresses', () => {
  assert.deepEqual(parseResidentialAccount({ firstName: '', lastName: '' }).errors, [
    'First name is required',
    'Last name is required'
  ]);
  assert.match(parseResidentialAccount({ firstName: 'Ada', lastName: 'Lovelace', city: 'Phoenix' }).errors.join(' '), /Street address is required/);
  assert.equal(parseResidentialAccount({ firstName: 'Ada', lastName: 'Lovelace', phone: '(602) 555-0100' }).errors.length, 0);
});

test('portal profile changes update CRM scalar and primary contact fields', () => {
  const customer = {
    name: 'Old Name',
    phone: 'old',
    address: 'Old street',
    phones: [{ label: 'Mobile', number: 'old', isPrimary: true }, { label: 'Work', number: 'work', isPrimary: false }],
    addresses: [{ label: 'Home', address: 'Old street', city: 'Mesa', state: 'AZ', zipCode: '85201', isPrimary: true }]
  };
  const data = {
    firstName: 'Ada', lastName: 'Lovelace', phone: '602-555-0100',
    addressLine1: '123 Main St', city: 'Phoenix', state: 'AZ', postalCode: '85001'
  };
  syncCustomerFromResidentialAccount(customer, data);
  assert.equal(customer.name, 'Ada Lovelace');
  assert.equal(customer.phone, '602-555-0100');
  assert.equal(customer.phones[0].number, '602-555-0100');
  assert.equal(customer.phones[1].number, 'work');
  assert.deepEqual(customer.addresses[0], { label: 'Primary', address: '123 Main St', city: 'Phoenix', state: 'AZ', zipCode: '85001', isPrimary: true });
});

test('account response is sourced from the same CRM primary contact record', () => {
  const account = serializeResidentialAccount({
    user: { email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace' },
    customer: { phone: 'fallback', phones: [{ number: 'primary', isPrimary: true }], addresses: [{ address: '123 Main St', city: 'Phoenix', state: 'AZ', zipCode: '85001', isPrimary: true }] },
    profile: { account: { preferredName: 'Ada', timezone: 'America/Phoenix' } }
  });
  assert.equal(account.phone, 'primary');
  assert.equal(account.addressLine1, '123 Main St');
  assert.equal(account.preferredName, 'Ada');
});

test('account UI groups profile fields, completion, preferences, and CRM sync responsively', () => {
  const root = path.resolve(__dirname, '../..');
  const html = fs.readFileSync(path.join(root, 'pages/residential-portal.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'assets/css/residential-portal.css'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'assets/js/residential-features.js'), 'utf8');
  assert.match(html, /class="panel settings-form account-profile-card"/);
  assert.match(html, /id="profileCompletionBadge"/);
  assert.match(html, /class="account-profile-grid account-address-grid"/);
  assert.match(html, /Synced with CRM/);
  assert.match(css, /\.account-profile-grid\s*\{[^}]*repeat\(3/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.account-profile-grid[^}]*grid-template-columns:\s*1fr/);
  assert.match(js, /function updateProfileCompletion\(\)/);
});
