const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const multer = require('multer');
const { GridFSBucket, ObjectId } = require('mongodb');
const authenticateToken = require('../middleware/auth');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const Employee = require('../models/Employee');
const Order = require('../models/Order');
const IncomingQuote = require('../models/IncomingQuote');
const { ensurePersistentAttachmentMetadata } = require('../utils/attachmentMetadata');
const { v2: cloudinary } = require('cloudinary');

const router = express.Router();
const MAX_UPLOAD_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES || `${50 * 1024 * 1024}`, 10);
const MAX_FILES = parseInt(process.env.MAX_ATTACHMENT_BATCH || '10', 10);
const MAX_BATCH_BYTES = parseInt(process.env.MAX_ATTACHMENT_BATCH_BYTES || `${MAX_UPLOAD_BYTES * MAX_FILES}`, 10);
const MAX_UPLOAD_LABEL = `${Math.round((MAX_UPLOAD_BYTES / 1024 / 1024) * 100) / 100} MB`;
const ALLOWED_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'txt', 'jpg', 'jpeg', 'png']);
const ALLOWED_MIME_BY_EXTENSION = {
  pdf: ['application/pdf', 'application/octet-stream'],
  doc: ['application/msword', 'application/octet-stream'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/octet-stream'],
  txt: ['text/plain', 'application/octet-stream'],
  jpg: ['image/jpeg'], jpeg: ['image/jpeg'], png: ['image/png']
};
const ENTITY_CONFIG = {
  order: { Model: Order, roles: ['admin', 'manager', 'account_rep'] },
  'incoming-quote': { Model: IncomingQuote, roles: ['admin', 'manager', 'account_rep'] },
  customer: { Model: Customer, roles: ['admin', 'manager', 'account_rep'] },
  vendor: { Model: Vendor, roles: ['admin', 'manager'] },
  employee: { Model: Employee, roles: ['admin', 'manager'] }
};
cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true });
const CLOUDINARY_FOLDER = String(process.env.CLOUDINARY_FOLDER || 'hutta-documents').replace(/[^a-zA-Z0-9/_-]/g, '');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_FILES },
  fileFilter: (_req, file, callback) => {
    const extension = String(file.originalname || '').split('.').pop().toLowerCase();
    const valid = ALLOWED_EXTENSIONS.has(extension) && (ALLOWED_MIME_BY_EXTENSION[extension] || []).includes(file.mimetype);
    callback(valid ? null : new Error('File extension and MIME type are not allowed'), valid);
  }
}).array('documents', MAX_FILES);

function getUserId(req) {
  return String(req.user?.userId || req.user?.id || '');
}

function getBucket() {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return null;
  return new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
}

function validateEntity(req, res, next) {
  const config = ENTITY_CONFIG[req.params.entityType];
  if (!config) return res.status(400).json({ message: 'Unsupported attachment entity type' });
  if (!config.roles.includes(req.user?.role)) return res.status(403).json({ message: 'Access denied: Insufficient permissions' });
  if (!mongoose.Types.ObjectId.isValid(req.params.entityId)) return res.status(400).json({ message: 'Invalid entity id' });
  req.attachmentConfig = config;
  next();
}

async function loadEntity(req, res, next) {
  try {
    const entity = await req.attachmentConfig.Model.findById(req.params.entityId);
    if (!entity) return res.status(404).json({ message: 'Entity not found' });
    req.attachmentEntity = entity;
    next();
  } catch (error) {
    next(error);
  }
}

function handleUpload(req, res, next) {
  upload(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: `File exceeds the ${MAX_UPLOAD_LABEL} size limit` });
    if (error.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ message: `Maximum ${MAX_FILES} files per upload` });
    return res.status(400).json({ message: error.message || 'Upload failed' });
  });
}

function findAttachment(entity, documentId) {
  return (entity.documents || []).find((document) => document.documentId === documentId);
}

function syncVendorComplianceFlags(entityType, entity) {
  if (entityType !== 'vendor' || !entity) return;
  const activeTypes = new Set((entity.documents || [])
    .filter(document => document.status !== 'archived' && document.complianceDocumentType)
    .map(document => document.complianceDocumentType));
  entity.huttasContractSigned = activeTypes.has('huttasContract');
  entity.w9OnFile = activeTypes.has('w9');
  entity.certificateOfInsuranceOnFile = activeTypes.has('certificateOfInsurance');
  entity.workersCompInsuranceOnFile = activeTypes.has('workersCompInsurance');
  entity.huttasAdditionalInsured = activeTypes.has('huttasAdditionalInsured');
}

function gridFsFilename(document) {
  if (!document?.url?.includes('/uploads/')) return null;
  return decodeURIComponent(document.url.split('/uploads/')[1].split(/[?#]/)[0]);
}

function safeDownloadName(value = 'document') {
  return String(value).replace(/[\r\n"\\]/g, '_').slice(0, 180) || 'document';
}

function logAttachmentNotFound(req, reason, extra = {}) {
  console.warn('Attachment stream 404', {
    reason,
    entityType: req.params.entityType,
    entityId: req.params.entityId,
    documentId: req.params.documentId,
    ...extra
  });
}

function hasValidSignature(file) {
  const extension = String(file.originalname || '').split('.').pop().toLowerCase();
  const buffer = file.buffer || Buffer.alloc(0);
  if (extension === 'pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  if (extension === 'png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (extension === 'jpg' || extension === 'jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (extension === 'doc') return buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (extension === 'docx') return buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (extension === 'txt') return !buffer.subarray(0, Math.min(buffer.length, 4096)).includes(0x00);
  return false;
}

function uploadToGridFs(file, metadata) {
  return new Promise((resolve, reject) => {
    const bucket = getBucket();
    if (!bucket) return reject(new Error('File storage is not ready'));
    const safeBaseName = String(file.originalname || 'document').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120);
    const filename = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${safeBaseName}`;
    const stream = bucket.openUploadStream(filename, { metadata });
    stream.once('error', reject);
    stream.once('finish', () => resolve({ fileId: stream.id, filename }));
    stream.end(file.buffer);
  });
}

router.use(authenticateToken);

router.get('/retained', async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    const records = await mongoose.connection.db.collection('attachment_retention')
      .find({}).sort({ retainedAt: -1 }).limit(500).toArray();
    res.json(records);
  } catch (error) {
    next(error);
  }
});

router.get('/retained/:retentionId/:documentId/download', async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    if (!ObjectId.isValid(req.params.retentionId)) return res.status(400).json({ message: 'Invalid retention id' });
    const retained = await mongoose.connection.db.collection('attachment_retention').findOne({ _id: new ObjectId(req.params.retentionId) });
    const document = retained?.documents?.find(item => item.documentId === req.params.documentId);
    if (!document) return res.status(404).json({ message: 'Retained attachment not found' });
    let file = document.fileId && ObjectId.isValid(String(document.fileId))
      ? await mongoose.connection.db.collection('uploads.files').findOne({ _id: new ObjectId(String(document.fileId)) })
      : null;
    if (!file) {
      const filename = gridFsFilename(document);
      if (filename) file = await mongoose.connection.db.collection('uploads.files').findOne({ filename });
    }
    if (!file) return res.status(404).json({ message: 'Stored file unavailable; retention metadata remains intact' });
    const filename = safeDownloadName(document.name || file.metadata?.originalName);
    res.set({
      'Content-Type': document.type || file.metadata?.mimetype || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': file.length,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    getBucket().openDownloadStream(file._id).on('error', next).pipe(res);
  } catch (error) {
    next(error);
  }
});

router.post('/direct/:entityType/:entityId/sign', validateEntity, loadEntity, async (req, res) => {
  if (req.params.entityType === 'incoming-quote' && req.attachmentEntity.status !== 'draft') return res.status(409).json({ message: 'Submitted quote attachments are immutable' });
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) return res.status(503).json({ message: 'Direct upload is not configured', fallback: true });
  const name = safeDownloadName(req.body.name || 'document');
  const extension = name.split('.').pop().toLowerCase();
  const mime = String(req.body.type || '').toLowerCase();
  const size = Number(req.body.size || 0);
  if (!ALLOWED_EXTENSIONS.has(extension) || !(ALLOWED_MIME_BY_EXTENSION[extension] || []).includes(mime) || size <= 0 || size > MAX_UPLOAD_BYTES) return res.status(400).json({ message: 'File type or size is not allowed' });
  const resourceType = ['jpg', 'jpeg', 'png'].includes(extension) ? 'image' : 'raw';
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `${CLOUDINARY_FOLDER}/${req.params.entityType}/${req.params.entityId}`;
  const publicId = `${crypto.randomUUID()}-${name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)}`;
  const signed = { folder, public_id: publicId, timestamp, type: 'authenticated', overwrite: false, unique_filename: false };
  res.json({ cloudName: process.env.CLOUDINARY_CLOUD_NAME, apiKey: process.env.CLOUDINARY_API_KEY, resourceType, publicId: `${folder}/${publicId}`, uploadParams: signed, signature: cloudinary.utils.api_sign_request(signed, process.env.CLOUDINARY_API_SECRET) });
});

router.post('/direct/:entityType/:entityId/finalize', validateEntity, loadEntity, async (req, res, next) => {
  try {
    if (req.params.entityType === 'incoming-quote' && req.attachmentEntity.status !== 'draft') return res.status(409).json({ message: 'Submitted quote attachments are immutable' });
    const publicId = String(req.body.publicId || '');
    const resourceType = req.body.resourceType === 'image' ? 'image' : 'raw';
    const expectedPrefix = `${CLOUDINARY_FOLDER}/${req.params.entityType}/${req.params.entityId}/`;
    if (!publicId.startsWith(expectedPrefix)) return res.status(400).json({ message: 'Invalid upload reference' });
    const resource = await cloudinary.api.resource(publicId, { resource_type: resourceType, type: 'authenticated' });
    if (!resource || Number(resource.bytes || 0) <= 0 || Number(resource.bytes) > MAX_UPLOAD_BYTES) return res.status(400).json({ message: 'Uploaded file failed verification' });
    const documentId = crypto.randomUUID();
    const document = {
      documentId, name: safeDownloadName(req.body.name || publicId.split('/').pop()),
      url: `/api/attachments/${req.params.entityType}/${req.params.entityId}/${documentId}`,
      type: String(req.body.type || resource.resource_type || 'application/octet-stream'), size: Number(resource.bytes),
      storageProvider: 'cloudinary', publicId, storageResourceType: resourceType,
      uploadedAt: new Date(), uploadedBy: getUserId(req), uploadedByEmail: req.user?.email || '', status: 'active',
      complianceDocumentType: String(req.body.complianceDocumentType || '').trim() || undefined,
      complianceDocumentLabel: String(req.body.complianceDocumentLabel || '').trim() || undefined
    };
    if (document.complianceDocumentType) {
      for (const existing of req.attachmentEntity.documents || []) {
        if (existing.status !== 'archived' && existing.complianceDocumentType === document.complianceDocumentType) {
          existing.status = 'archived'; existing.archivedAt = new Date(); existing.archivedBy = getUserId(req); existing.archivedByEmail = req.user?.email || ''; existing.archiveReason = 'Superseded by a newer compliance document';
        }
      }
    }
    req.attachmentEntity.documents.push(document); syncVendorComplianceFlags(req.params.entityType, req.attachmentEntity); await req.attachmentEntity.save();
    res.status(201).json({ files: [document], documents: req.attachmentEntity.documents });
  } catch (error) { next(error); }
});

router.use('/:entityType/:entityId', validateEntity, loadEntity);

router.get('/:entityType/:entityId', async (req, res, next) => {
  try {
    if (ensurePersistentAttachmentMetadata(req.attachmentEntity)) await req.attachmentEntity.save();
    const documents = req.attachmentEntity.documents || [];
    res.json({
      active: documents.filter((document) => document.status !== 'archived'),
      archived: documents.filter((document) => document.status === 'archived')
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:entityType/:entityId', handleUpload, async (req, res, next) => {
  const uploaded = [];
  try {
    if (req.params.entityType === 'incoming-quote' && req.attachmentEntity.status !== 'draft') {
      return res.status(409).json({ message: 'Submitted quote attachments are immutable; request a revision to change documents' });
    }
    if (!req.files?.length) return res.status(400).json({ message: 'No files uploaded' });
    const totalBytes = req.files.reduce((sum, file) => sum + Number(file.size || 0), 0);
    if (totalBytes > MAX_BATCH_BYTES) return res.status(413).json({ message: 'Attachment batch exceeds the maximum total size' });
    const invalidFile = req.files.find(file => !hasValidSignature(file));
    if (invalidFile) return res.status(400).json({ message: `${invalidFile.originalname} does not match its declared file type` });
    const complianceDocumentType = String(req.body.complianceDocumentType || '').trim() || undefined;
    const complianceDocumentLabel = String(req.body.complianceDocumentLabel || '').trim() || undefined;
    const userId = getUserId(req);
    const now = new Date();

    for (const file of req.files) {
      const documentId = crypto.randomUUID();
      const metadata = {
        documentId,
        entityType: req.params.entityType,
        entityId: req.params.entityId,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        uploadedAt: now,
        uploadedBy: userId,
        uploadedByEmail: req.user?.email || '',
        linkStatus: 'quarantined'
      };
      const stored = await uploadToGridFs(file, metadata);
      uploaded.push({
        documentId,
        name: file.originalname,
        url: `/api/attachments/${req.params.entityType}/${req.params.entityId}/${documentId}`,
        type: file.mimetype || 'application/octet-stream',
        size: file.size,
        storageProvider: 'gridfs',
        fileId: stored.fileId,
        uploadedAt: now,
        uploadedBy: userId,
        uploadedByEmail: req.user?.email || '',
        status: 'active',
        complianceDocumentType,
        complianceDocumentLabel
      });
    }

    await req.attachmentConfig.Model.updateOne(
      { _id: req.params.entityId },
      { $push: { documents: { $each: uploaded } } },
      { runValidators: true }
    );

    if (complianceDocumentType) {
      const newIds = uploaded.map(document => document.documentId);
      await req.attachmentConfig.Model.updateOne(
        { _id: req.params.entityId },
        { $set: {
          'documents.$[older].status': 'archived',
          'documents.$[older].archivedAt': now,
          'documents.$[older].archivedBy': userId,
          'documents.$[older].archivedByEmail': req.user?.email || '',
          'documents.$[older].archiveReason': 'Superseded by a newer compliance document'
        } },
        { arrayFilters: [{
          'older.complianceDocumentType': complianceDocumentType,
          'older.documentId': { $nin: newIds },
          'older.status': { $ne: 'archived' }
        }] }
      );
    }

    req.attachmentEntity = await req.attachmentConfig.Model.findById(req.params.entityId);
    syncVendorComplianceFlags(req.params.entityType, req.attachmentEntity);
    if (req.params.entityType === 'vendor') await req.attachmentEntity.save();

    const fileIds = uploaded.map((document) => new ObjectId(String(document.fileId)));
    await mongoose.connection.db.collection('uploads.files').updateMany(
      { _id: { $in: fileIds } },
      { $set: { 'metadata.linkStatus': 'linked' } }
    );

    res.status(201).json({ files: uploaded, documents: req.attachmentEntity.documents });
  } catch (error) {
    // Uploaded GridFS objects are deliberately retained with linkStatus=quarantined.
    error.message = uploaded.length ? `Attachment metadata could not be linked; uploaded files were retained for recovery. ${error.message}` : error.message;
    next(error);
  }
});

async function streamAttachment(req, res, next, disposition) {
  try {
    if (ensurePersistentAttachmentMetadata(req.attachmentEntity)) await req.attachmentEntity.save();
    const document = findAttachment(req.attachmentEntity, req.params.documentId);
    if (!document) {
      logAttachmentNotFound(req, 'metadata-missing');
      return res.status(404).json({ message: 'Attachment not found' });
    }

    if (document.storageProvider === 'cloudinary' && document.publicId) {
      const signedUrl = cloudinary.url(document.publicId, { resource_type: document.storageResourceType || 'raw', type: 'authenticated', sign_url: true, secure: true });
      res.set('Cache-Control', 'private, no-store');
      return res.redirect(302, signedUrl);
    }
    if (document.storageProvider && document.storageProvider !== 'gridfs' && /^https?:\/\//i.test(document.url || '')) {
      return res.redirect(document.url);
    }

    const bucket = getBucket();
    if (!bucket) return res.status(503).json({ message: 'File storage is not ready' });
    let file;
    if (document.fileId && ObjectId.isValid(String(document.fileId))) {
      file = await mongoose.connection.db.collection('uploads.files').findOne({ _id: new ObjectId(String(document.fileId)) });
    }
    if (!file) {
      const filename = gridFsFilename(document);
      if (filename) file = await mongoose.connection.db.collection('uploads.files').findOne({ filename });
    }
    if (!file) {
      logAttachmentNotFound(req, 'gridfs-file-missing', {
        fileId: String(document.fileId || ''),
        url: document.url || '',
        filename: gridFsFilename(document) || ''
      });
      return res.status(404).json({ message: 'Stored file is unavailable; metadata has been retained for recovery' });
    }

    const filename = safeDownloadName(document.name || file.metadata?.originalName);
    res.set({
      'Content-Type': document.type || file.metadata?.mimetype || 'application/octet-stream',
      'Content-Disposition': `${disposition}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': file.length,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    bucket.openDownloadStream(file._id).on('error', next).pipe(res);
  } catch (error) {
    next(error);
  }
}

router.get('/:entityType/:entityId/:documentId/download', (req, res, next) => streamAttachment(req, res, next, 'attachment'));
router.get('/:entityType/:entityId/:documentId', (req, res, next) => streamAttachment(req, res, next, 'inline'));

router.patch('/:entityType/:entityId/:documentId/archive', async (req, res, next) => {
  try {
    if (req.params.entityType === 'incoming-quote' && req.attachmentEntity.status !== 'draft') {
      return res.status(409).json({ message: 'Submitted quote attachments are immutable' });
    }
    if (ensurePersistentAttachmentMetadata(req.attachmentEntity)) await req.attachmentEntity.save();
    const document = findAttachment(req.attachmentEntity, req.params.documentId);
    if (!document) return res.status(404).json({ message: 'Attachment not found' });
    document.status = 'archived';
    document.archivedAt = new Date();
    document.archivedBy = getUserId(req);
    document.archivedByEmail = req.user?.email || '';
    document.archiveReason = String(req.body.reason || 'Archived by user').slice(0, 500);
    syncVendorComplianceFlags(req.params.entityType, req.attachmentEntity);
    await req.attachmentEntity.save();
    res.json({ document, message: 'Attachment archived; stored file was retained' });
  } catch (error) {
    next(error);
  }
});

router.patch('/:entityType/:entityId/:documentId/restore', async (req, res, next) => {
  try {
    if (req.params.entityType === 'incoming-quote' && req.attachmentEntity.status !== 'draft') {
      return res.status(409).json({ message: 'Submitted quote attachments are immutable' });
    }
    if (ensurePersistentAttachmentMetadata(req.attachmentEntity)) await req.attachmentEntity.save();
    const document = findAttachment(req.attachmentEntity, req.params.documentId);
    if (!document) return res.status(404).json({ message: 'Attachment not found' });
    if (req.params.entityType === 'vendor' && document.complianceDocumentType) {
      (req.attachmentEntity.documents || []).forEach((other) => {
        if (other.documentId !== document.documentId && other.complianceDocumentType === document.complianceDocumentType && other.status !== 'archived') {
          other.status = 'archived';
          other.archivedAt = new Date();
          other.archivedBy = getUserId(req);
          other.archivedByEmail = req.user?.email || '';
          other.archiveReason = 'Superseded by restored compliance document version';
        }
      });
    }
    document.status = 'active';
    document.restoredAt = new Date();
    document.restoredBy = getUserId(req);
    document.archivedAt = undefined;
    document.archivedBy = undefined;
    document.archivedByEmail = undefined;
    document.archiveReason = undefined;
    syncVendorComplianceFlags(req.params.entityType, req.attachmentEntity);
    await req.attachmentEntity.save();
    res.json({ document, message: 'Attachment restored' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
