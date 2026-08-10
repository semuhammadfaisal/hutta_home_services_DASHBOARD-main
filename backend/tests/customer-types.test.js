const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const Customer = require('../models/Customer');

const customerTypes = [
  'recurring',
  'one-time',
  'residential',
  'commercial',
  'government',
  'hoa'
];

test('customer model accepts every supported customer type', () => {
  customerTypes.forEach((customerType) => {
    const customer = new Customer({ name: 'Test Customer', customerType });
    assert.equal(customer.validateSync(), undefined, `${customerType} should be valid`);
  });

  const invalidCustomer = new Customer({ name: 'Test Customer', customerType: 'unsupported' });
  assert.match(invalidCustomer.validateSync().errors.customerType.message, /not a valid enum value/);
});

test('customer type choices are available in the form, filter, and CSV import', () => {
  const dashboard = read('pages/admin-dashboard.html');
  const customerScript = read('assets/js/dashboard-script.js');
  const csvImport = read('assets/js/csv-import.js');

  ['residential', 'commercial', 'government', 'hoa'].forEach((customerType) => {
    assert.match(dashboard, new RegExp(`<option value="${customerType}">`, 'g'));
    assert.match(customerScript, new RegExp(`\\['${customerType}',`));
    assert.match(csvImport, new RegExp(`'${customerType}': '${customerType}'`));
  });
});
