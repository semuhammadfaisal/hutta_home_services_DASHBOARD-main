const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const { applyVendorComplianceOverride, hasEmbeddedVendorComplianceOverride } = require('../utils/vendorComplianceOverride');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('a Send Anyway approval persists for the vendor across the whole order', () => {
  const vendorId = new mongoose.Types.ObjectId();
  const order = new Order({ orderId: 'ORDER-1', customer: { name: 'Customer' }, service: 'Repair' });
  assert.equal(hasEmbeddedVendorComplianceOverride(order, vendorId), false);
  applyVendorComplianceOverride(order, {
    vendorId,
    approvedBy: new mongoose.Types.ObjectId(),
    approvedByEmail: 'admin@example.com',
    source: 'vendor_requirement_approval',
    requirements: ['Insurance expired']
  });
  assert.equal(hasEmbeddedVendorComplianceOverride(order, vendorId), true);
  assert.equal(order.vendorComplianceOverrides.length, 1);
  assert.deepEqual(order.vendorComplianceOverrides[0].requirements, ['Insurance expired']);

  applyVendorComplianceOverride(order, {
    vendorId,
    approvedByEmail: 'admin@example.com',
    source: 'outgoing_quote_override',
    requirements: ['ROC expired']
  });
  assert.equal(order.vendorComplianceOverrides.length, 1);
  assert.deepEqual(order.vendorComplianceOverrides[0].requirements, ['ROC expired']);
});

test('downstream workflow gates honor the order-scoped compliance override', () => {
  const incoming = read('backend/routes/incomingQuotes.js');
  const outgoing = read('backend/routes/outgoingQuotes.js');
  const scheduling = read('backend/routes/scheduling.js');
  const vendorPortal = read('backend/routes/vendorPortal.js');
  for (const source of [incoming, outgoing, scheduling, vendorPortal]) assert.match(source, /hasVendorComplianceOverride/);
  assert.match(incoming, /applyVendorComplianceOverride/);
  assert.match(outgoing, /applyVendorComplianceOverride/);
  assert.match(scheduling, /activeCompliance\(vendor, payload\.proposedEnd\)[\s\S]*hasVendorComplianceOverride\(order, vendor\._id, session\)/);
  assert.match(scheduling, /schedule\.vendorComplianceOverride\?\.approved === true/);
  assert.match(scheduling, /vendorComplianceOverride: complianceOverrideApproved/);
  assert.match(vendorPortal, /activeCompliance\(req\.vendorRecord, schedule\.proposedEnd\)[\s\S]*hasVendorComplianceOverride\(scoped\.order, req\.vendorRecord\._id\)/);
});

test('legacy approved exceptions and prior customer-quote overrides remain valid', () => {
  const helper = read('backend/utils/vendorComplianceOverride.js');
  const scheduleModel = read('backend/models/JobSchedule.js');
  assert.match(helper, /status: \{ \$in: \['approved', 'executed'\] \}/);
  assert.match(helper, /sent_with_compliance_override/);
  assert.match(helper, /sent_under_order_compliance_override/);
  assert.match(scheduleModel, /vendorComplianceOverride/);
  assert.match(scheduleModel, /order_vendor_override/);
});
