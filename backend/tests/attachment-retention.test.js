const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const Employee = require('../models/Employee');
const Order = require('../models/Order');
const { prepareDocumentUpdate } = require('../utils/documents');
const { ensurePersistentAttachmentMetadata } = require('../utils/attachmentMetadata');

const attachment = () => ({
  name: 'important-contract.pdf',
  url: '/uploads/important-contract.pdf',
  type: 'application/pdf',
  size: 1024
});

test('all supported entities assign permanent attachment identity and active status', () => {
  const records = [
    new Customer({ name: 'Customer', documents: [attachment()] }),
    new Vendor({ name: 'Vendor', category: 'general', documents: [attachment()] }),
    new Employee({ name: 'Employee', email: 'employee@example.com', role: 'electrician', documents: [attachment()] }),
    new Order({ orderId: 'ORD-TEST', customer: { name: 'Customer' }, service: 'Service', amount: 10, documents: [attachment()] })
  ];

  for (const record of records) {
    const validationError = record.validateSync();
    assert.equal(validationError, undefined);
    assert.match(record.documents[0].documentId, /^[0-9a-f-]{36}$/i);
    assert.equal(record.documents[0].status, 'active');
  }
});

test('entity updates cannot replace, merge, or remove documents', () => {
  const update = prepareDocumentUpdate([attachment()], {
    name: 'Updated name',
    documents: [{ ...attachment(), name: 'replacement.pdf' }],
    documentsMode: 'replace'
  });
  assert.deepEqual(update, { name: 'Updated name' });
});

test('attachment archive metadata is retained by the shared schema', () => {
  const customer = new Customer({
    name: 'Customer',
    documents: [{
      ...attachment(),
      status: 'archived',
      archivedAt: new Date('2026-01-01T00:00:00Z'),
      archivedBy: 'user-1',
      archiveReason: 'Superseded'
    }]
  });
  assert.equal(customer.documents[0].status, 'archived');
  assert.equal(customer.documents[0].archiveReason, 'Superseded');
  assert.equal(customer.documents[0].archivedBy, 'user-1');
});

test('attachment and audit code contain no physical file deletion path', () => {
  const files = ['../routes/attachments.js', '../audit-gridfs-files.js', '../utils/attachmentRetention.js'];
  const source = files.map(file => fs.readFileSync(path.join(__dirname, file), 'utf8')).join('\n');
  assert.doesNotMatch(source, /bucket\s*\.\s*delete\s*\(/);
  assert.doesNotMatch(source, /uploads\.files[^\n]*(deleteOne|deleteMany|findOneAndDelete)/);
  assert.doesNotMatch(source, /unlink(Sync)?\s*\(/);
  assert.match(source, /permanent-no-deletion|permanently retained/i);
});

test('seven distinct attachments remain distinct', () => {
  const customer = new Customer({
    name: 'Customer',
    documents: Array.from({ length: 7 }, (_value, index) => ({
      ...attachment(),
      name: `${index + 1}.pdf`,
      url: `/uploads/${index + 1}.pdf`
    }))
  });
  assert.equal(customer.documents.length, 7);
  assert.equal(new Set(customer.documents.map(document => document.documentId)).size, 7);
  assert.deepEqual(customer.documents.map(document => document.name), ['1.pdf', '2.pdf', '3.pdf', '4.pdf', '5.pdf', '6.pdf', '7.pdf']);
});

test('default attachment document ids are replaced with stable persisted ids', () => {
  const document = {
    documentId: 'temporary-default-id',
    status: 'active',
    $isDefault: field => field === 'documentId' || field === 'status'
  };
  const entity = {
    documents: [document],
    marked: null,
    markModified(field) {
      this.marked = field;
    }
  };

  assert.equal(ensurePersistentAttachmentMetadata(entity), true);
  assert.match(document.documentId, /^[0-9a-f-]{36}$/i);
  assert.notEqual(document.documentId, 'temporary-default-id');
  assert.equal(document.status, 'active');
  assert.equal(entity.marked, 'documents');
});
