const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Customer = require('./models/Customer');
const Vendor = require('./models/Vendor');
const Employee = require('./models/Employee');
const Order = require('./models/Order');

const REPORT_DIR = path.join(__dirname, '..', 'reports');
const APPLY = process.argv.includes('--apply');
const ENTITY_MODELS = [
  ['customer', Customer],
  ['vendor', Vendor],
  ['employee', Employee],
  ['order', Order]
];

function gridFsFilename(url = '') {
  if (!String(url).includes('/uploads/')) return null;
  return decodeURIComponent(String(url).split('/uploads/')[1].split(/[?#]/)[0]);
}

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required to audit GridFS files.');
  await mongoose.connect(process.env.MONGODB_URI);

  const gridCollection = mongoose.connection.db.collection('uploads.files');
  const gridFiles = await gridCollection.find({}).toArray();
  const gridById = new Map(gridFiles.map(file => [String(file._id), file]));
  const gridByName = new Map(gridFiles.map(file => [file.filename, file]));
  const linkedFileIds = new Set();
  const seenDocumentIds = new Map();
  const links = [];
  const missingFiles = [];
  const malformedDocuments = [];
  const duplicateDocumentIds = [];
  const legacyUrls = [];
  const repairs = [];

  for (const [entityType, Model] of ENTITY_MODELS) {
    const records = await Model.find({}, 'name orderId documents');
    for (const record of records) {
      let recordChanged = false;
      for (const document of record.documents || []) {
        if (!document.documentId || document.$isDefault?.('documentId')) {
          if (!document.documentId) document.documentId = crypto.randomUUID();
          recordChanged = true;
          repairs.push({ action: 'backfill-document-id', entityType, entityId: String(record._id), documentName: document.name });
        }
        if (!document.status || document.$isDefault?.('status')) {
          if (!document.status) document.status = 'active';
          recordChanged = true;
          repairs.push({ action: 'backfill-status', entityType, entityId: String(record._id), documentId: document.documentId });
        }

        const documentId = document.documentId;
        if (seenDocumentIds.has(documentId)) {
          duplicateDocumentIds.push({ documentId, first: seenDocumentIds.get(documentId), duplicate: { entityType, entityId: String(record._id) } });
        } else {
          seenDocumentIds.set(documentId, { entityType, entityId: String(record._id) });
        }

        let gridFile = document.fileId ? gridById.get(String(document.fileId)) : null;
        const legacyFilename = gridFsFilename(document.url);
        if (!gridFile && legacyFilename) gridFile = gridByName.get(legacyFilename);
        if (legacyFilename) legacyUrls.push({ entityType, entityId: String(record._id), documentId, url: document.url });

        if (gridFile) {
          linkedFileIds.add(String(gridFile._id));
          links.push({ entityType, entityId: String(record._id), documentId, fileId: String(gridFile._id), filename: gridFile.filename });
          if (String(document.fileId || '') !== String(gridFile._id)) {
            document.fileId = gridFile._id;
            recordChanged = true;
            repairs.push({ action: 'backfill-file-id', entityType, entityId: String(record._id), documentId, fileId: String(gridFile._id) });
          }
          if (document.storageProvider === 'gridfs' || legacyFilename) {
            const protectedUrl = `/api/attachments/${entityType}/${record._id}/${documentId}`;
            if (document.url !== protectedUrl) {
              document.url = protectedUrl;
              document.storageProvider = 'gridfs';
              recordChanged = true;
              repairs.push({ action: 'protect-url', entityType, entityId: String(record._id), documentId });
            }
          }
          if (APPLY) {
            await gridCollection.updateOne({ _id: gridFile._id }, { $set: {
              'metadata.documentId': documentId,
              'metadata.entityType': entityType,
              'metadata.entityId': String(record._id),
              'metadata.linkStatus': 'linked'
            } });
          }
        } else if (document.storageProvider === 'gridfs' || legacyFilename || document.fileId) {
          missingFiles.push({ entityType, entityId: String(record._id), documentId, name: document.name, fileId: String(document.fileId || ''), url: document.url });
        }

        if (!document.name || !document.type || !Number.isFinite(Number(document.size))) {
          malformedDocuments.push({ entityType, entityId: String(record._id), documentId, name: document.name || '', issue: 'Missing required metadata' });
        }
      }
      if (APPLY && recordChanged) await record.save();
    }
  }

  const retainedEntities = await mongoose.connection.db.collection('attachment_retention').find({}).toArray();
  for (const retained of retainedEntities) {
    for (const document of retained.documents || []) {
      let gridFile = document.fileId ? gridById.get(String(document.fileId)) : null;
      if (!gridFile) {
        const filename = gridFsFilename(document.url);
        if (filename) gridFile = gridByName.get(filename);
      }
      if (gridFile) {
        linkedFileIds.add(String(gridFile._id));
        links.push({
          entityType: retained.entityType,
          entityId: retained.entityId,
          documentId: document.documentId || '',
          fileId: String(gridFile._id),
          filename: gridFile.filename,
          retainedEntity: true
        });
      }
    }
  }

  const orphanFiles = gridFiles
    .filter(file => !linkedFileIds.has(String(file._id)))
    .map(file => ({
      fileId: String(file._id),
      filename: file.filename,
      originalName: file.metadata?.originalName || '',
      size: file.length || file.metadata?.size || 0,
      uploadedAt: file.uploadDate || file.metadata?.uploadedAt || null,
      disposition: 'retained-in-quarantine'
    }));

  if (APPLY && orphanFiles.length) {
    await gridCollection.updateMany(
      { _id: { $in: orphanFiles.map(file => new mongoose.Types.ObjectId(file.fileId)) } },
      { $set: { 'metadata.linkStatus': 'quarantined', 'metadata.quarantinedAt': new Date() } }
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'apply-non-destructive' : 'dry-run',
    retentionPolicy: 'permanent-no-deletion',
    summary: {
      gridFiles: gridFiles.length,
      linkedFiles: linkedFileIds.size,
      orphanFiles: orphanFiles.length,
      missingFiles: missingFiles.length,
      malformedDocuments: malformedDocuments.length,
      duplicateDocumentIds: duplicateDocumentIds.length,
      legacyUrls: legacyUrls.length,
      retainedEntities: retainedEntities.length,
      proposedOrAppliedRepairs: repairs.length
    },
    links,
    orphanFiles,
    missingFiles,
    malformedDocuments,
    duplicateDocumentIds,
    legacyUrls,
    repairs
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(REPORT_DIR, `attachment-audit-${stamp}.json`);
  const csvPath = path.join(REPORT_DIR, `attachment-audit-${stamp}.csv`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(csvPath, [
    ['category', 'entityType', 'entityId', 'documentId', 'fileId', 'nameOrFilename', 'detail'].map(csvEscape).join(','),
    ...missingFiles.map(item => ['missing-file', item.entityType, item.entityId, item.documentId, item.fileId, item.name, item.url].map(csvEscape).join(',')),
    ...orphanFiles.map(item => ['orphan-retained', '', '', '', item.fileId, item.filename, item.disposition].map(csvEscape).join(',')),
    ...malformedDocuments.map(item => ['malformed', item.entityType, item.entityId, item.documentId, '', item.name, item.issue].map(csvEscape).join(','))
  ].join('\n'));

  console.log(`Attachment audit complete (${report.mode}). No files were deleted.`);
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`JSON: ${jsonPath}`);
  console.log(`CSV: ${csvPath}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('Attachment audit failed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
