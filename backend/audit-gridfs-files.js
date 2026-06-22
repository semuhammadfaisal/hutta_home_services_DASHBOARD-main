const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Customer = require('./models/Customer');
const Vendor = require('./models/Vendor');
const Employee = require('./models/Employee');
const Order = require('./models/Order');

const REPORT_DIR = path.join(__dirname, '..', 'reports');

function csvEscape(value) {
  const text = value === undefined || value === null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function getGridFsFilename(url = '') {
  if (!url.includes('/uploads/')) return null;
  return url.split('/uploads/')[1].split(/[?#]/)[0];
}

function collectDocumentLinks(records, entity) {
  const links = new Map();

  records.forEach((record) => {
    (record.documents || []).forEach((doc) => {
      const filename = getGridFsFilename(doc.url);
      if (!filename) return;

      const current = links.get(filename) || [];
      current.push({
        entity,
        recordId: String(record._id),
        recordName: record.name || record.orderId || '',
        documentName: doc.name || ''
      });
      links.set(filename, current);
    });
  });

  return links;
}

function mergeLinkMaps(...maps) {
  const merged = new Map();

  maps.forEach((map) => {
    map.forEach((links, filename) => {
      merged.set(filename, [...(merged.get(filename) || []), ...links]);
    });
  });

  return merged;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required to audit GridFS files.');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const [gridFiles, customers, vendors, employees, orders] = await Promise.all([
    mongoose.connection.db.collection('uploads.files').find({}).toArray(),
    Customer.find({}, 'name documents').lean(),
    Vendor.find({}, 'name documents').lean(),
    Employee.find({}, 'name documents').lean(),
    Order.find({}, 'orderId documents').lean()
  ]);

  const linksByFilename = mergeLinkMaps(
    collectDocumentLinks(customers, 'customer'),
    collectDocumentLinks(vendors, 'vendor'),
    collectDocumentLinks(employees, 'employee'),
    collectDocumentLinks(orders, 'order')
  );

  const files = gridFiles.map((file) => {
    const linkedRecords = linksByFilename.get(file.filename) || [];
    return {
      filename: file.filename,
      originalName: file.metadata?.originalName || '',
      mimetype: file.metadata?.mimetype || '',
      size: file.length || file.metadata?.size || 0,
      uploadedAt: file.uploadDate || file.metadata?.uploadedAt || null,
      linkedRecords
    };
  });

  const totalBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
  const report = {
    generatedAt: new Date().toISOString(),
    bucket: 'uploads',
    count: files.length,
    totalBytes,
    totalMB: Math.round((totalBytes / 1024 / 1024) * 100) / 100,
    files
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(REPORT_DIR, `gridfs-audit-${stamp}.json`);
  const csvPath = path.join(REPORT_DIR, `gridfs-audit-${stamp}.csv`);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(csvPath, [
    ['filename', 'originalName', 'mimetype', 'size', 'uploadedAt', 'linkedRecords'].map(csvEscape).join(','),
    ...files.map((file) => [
      file.filename,
      file.originalName,
      file.mimetype,
      file.size,
      file.uploadedAt ? new Date(file.uploadedAt).toISOString() : '',
      JSON.stringify(file.linkedRecords)
    ].map(csvEscape).join(','))
  ].join('\n'));

  console.log(`GridFS audit complete: ${files.length} files, ${report.totalMB} MB`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`CSV: ${csvPath}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('GridFS audit failed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
