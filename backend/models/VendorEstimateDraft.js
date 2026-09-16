const mongoose = require('mongoose');

const lineItemSchema = new mongoose.Schema({
  category: { type: String, enum: ['labor', 'material', 'other'], default: 'other' },
  description: { type: String, required: true, trim: true, maxlength: 1000 },
  quantity: { type: Number, required: true, min: 0.0001, max: 1000000 },
  unit: { type: String, required: true, trim: true, maxlength: 40 },
  unitPrice: { type: Number, required: true, min: 0, max: 100000000 },
  amount: { type: Number, required: true, min: 0, max: 100000000 }
}, { _id: true });

const sourceFileSchema = new mongoose.Schema({
  documentId: { type: String, required: true },
  name: { type: String, required: true, maxlength: 180 },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true, min: 1 },
  sha256: { type: String, required: true, select: false },
  fileId: { type: mongoose.Schema.Types.ObjectId, required: true, select: false },
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: false });

const parserAuditSchema = new mongoose.Schema({
  provider: { type: String, maxlength: 80 },
  model: { type: String, maxlength: 160 },
  status: { type: String, enum: ['not_requested', 'unavailable', 'succeeded', 'failed'], default: 'not_requested' },
  requestedAt: Date,
  completedAt: Date,
  sourceDocumentId: String,
  sourceSha256: { type: String, select: false },
  requestId: { type: String, maxlength: 200 },
  errorCode: { type: String, maxlength: 120 }
}, { _id: false });

const schema = new mongoose.Schema({
  invitationId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuoteInvitation', required: true, unique: true, immutable: true },
  quoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'IncomingQuote', required: true, immutable: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true, index: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, immutable: true, index: true },
  status: { type: String, enum: ['draft', 'submitted'], default: 'draft', index: true },
  source: { type: String, enum: ['manual', 'document_parse'], default: 'manual' },
  scope: { type: String, trim: true, maxlength: 10000 },
  lineItems: { type: [lineItemSchema], default: [] },
  subtotal: { type: Number, min: 0, default: 0 },
  notes: { type: String, trim: true, maxlength: 10000 },
  estimatedDuration: { value: { type: Number, min: 0.1, max: 10000 }, unit: { type: String, enum: ['hours', 'days', 'weeks'] } },
  earliestAvailableDate: Date,
  siteAccessRequired: { type: Boolean, default: false },
  accessNotes: { type: String, trim: true, maxlength: 3000 },
  sourceFiles: { type: [sourceFileSchema], default: [] },
  parserAudit: { type: parserAuditSchema, default: () => ({ status: 'not_requested' }) },
  reviewedAt: Date,
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  submittedAt: Date,
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

schema.index({ vendorId: 1, status: 1, updatedAt: -1 });
schema.index({ invitationId: 1, 'sourceFiles.sha256': 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('VendorEstimateDraft', schema);
