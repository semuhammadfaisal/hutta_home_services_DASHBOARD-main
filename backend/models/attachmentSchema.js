const mongoose = require('mongoose');
const crypto = require('crypto');

const attachmentSchema = new mongoose.Schema({
  documentId: { type: String, default: () => crypto.randomUUID(), index: true },
  name: { type: String, required: true },
  url: { type: String, required: true },
  type: { type: String, required: true },
  size: { type: Number, required: true },
  storageProvider: { type: String, default: 'gridfs' },
  publicId: String,
  fileId: mongoose.Schema.Types.Mixed,
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: String,
  uploadedByEmail: String,
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
  archivedAt: Date,
  archivedBy: String,
  archivedByEmail: String,
  archiveReason: String,
  restoredAt: Date,
  restoredBy: String,
  complianceDocumentType: String,
  complianceDocumentLabel: String
}, { _id: false });

module.exports = attachmentSchema;
