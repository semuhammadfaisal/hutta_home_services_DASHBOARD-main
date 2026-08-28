const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const Order = require('../models/Order');

const root = path.resolve(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('order supports multiple vendor assignments with service and scheduled arrival', () => {
  const vendorOne = new mongoose.Types.ObjectId();
  const vendorTwo = new mongoose.Types.ObjectId();
  const order = new Order({
    orderId: 'ORD-MULTI-VENDOR',
    customer: { name: 'Test Customer' },
    service: 'Home services',
    amount: 100,
    vendorAssignments: [
      { vendor: vendorOne, service: 'Plumbing', scheduledStart: new Date('2026-09-01T16:00:00Z') },
      { vendor: vendorTwo, service: 'Electrical', scheduledStart: new Date('2026-09-02T17:30:00Z') }
    ]
  });

  const error = order.validateSync();
  assert.equal(error, undefined);
  assert.equal(order.vendorAssignments.length, 2);
  assert.equal(order.vendorAssignments[0].timezone, 'America/Phoenix');
});

test('vendor assignments require both a service and scheduled arrival', () => {
  const order = new Order({
    orderId: 'ORD-MISSING-SCHEDULE',
    customer: { name: 'Test Customer' },
    service: 'Home services',
    amount: 100,
    vendorAssignments: [{ vendor: new mongoose.Types.ObjectId(), service: '' }]
  });

  const error = order.validateSync();
  assert.ok(error?.errors['vendorAssignments.0.service']);
  assert.ok(error?.errors['vendorAssignments.0.scheduledStart']);
});

test('order detail UI exposes the multi-vendor line and vendor profile link flow', () => {
  const html = read('pages/admin-dashboard.html');
  const script = read('assets/js/dashboard-script.js');
  const routes = read('backend/routes/orders.js');

  assert.match(html, /id="detailOrderVendorAssignments"/);
  assert.match(html, /id="modalDetailOrderVendorAssignments"/);
  assert.match(html, /id="orderAssignmentScheduledStart"/);
  assert.match(script, /openAssignedVendorProfile/);
  assert.match(script, /order-vendor-profile-link/);
  assert.match(routes, /post\('\/:id\/vendor-assignments'/);
  assert.match(routes, /delete\('\/:id\/vendor-assignments\/:assignmentId'/);
});
