const mongoose = require('mongoose');

const lineItemSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true, maxlength: 1000 },
  quantity: { type: Number, required: true, min: 0.0001 },
  unit: { type: String, required: true, trim: true, maxlength: 40 },
  unitPrice: { type: Number, required: true, min: 0 },
  amount: { type: Number, required: true, min: 0 }
}, { _id: false });

const sourceDocumentSchema = new mongoose.Schema({
  documentId: { type: String, required: true },
  name: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true, min: 1 },
  fileId: { type: mongoose.Schema.Types.Mixed, required: true, select: false },
  sha256: { type: String, required: true, select: false },
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: false });

const schema = new mongoose.Schema({
  assignmentId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, immutable: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true, index: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, immutable: true, index: true },
  jobCompletionId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobCompletion', required: true, immutable: true },
  invoiceNumber: { type: String, required: true, trim: true, maxlength: 120 },
  normalizedInvoiceNumber: { type: String, required: true, immutable: true },
  billingLane: { type: String, enum: ['smplfix_direct', 'owner_billed'], required: true, immutable: true },
  servicePeriodStart: { type: Date, required: true, immutable: true },
  servicePeriodEnd: { type: Date, required: true, immutable: true },
  lineItems: { type: [lineItemSchema], required: true },
  amount: { type: Number, required: true, min: 0 },
  notes: { type: String, trim: true, maxlength: 5000 },
  sourceDocument: { type: sourceDocumentSchema, required: true },
  status: { type: String, enum: ['submitted', 'under_review', 'approved', 'rejected', 'disputed', 'paid'], default: 'under_review', index: true },
  mismatchFlags: [{ code: { type: String, enum: ['amount_mismatch', 'service_period_mismatch', 'line_total_mismatch', 'duplicate_document'] }, message: String }],
  requiresInternalReview: { type: Boolean, default: true },
  submittedAt: { type: Date, default: Date.now },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedAt: Date,
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewNotes: { type: String, trim: true, maxlength: 3000 },
  history: [{ action: String, actorType: String, actorId: mongoose.Schema.Types.ObjectId, message: String, createdAt: { type: Date, default: Date.now } }],
  demoData: { type: Boolean, default: false }
}, { timestamps: true });

schema.index({ vendorId: 1, normalizedInvoiceNumber: 1 }, { unique: true });
schema.index({ vendorId: 1, status: 1, submittedAt: -1 });
schema.index({ 'sourceDocument.sha256': 1 }, { unique: true });
schema.pre('validate', function(next) {
  if (this.servicePeriodStart && this.servicePeriodEnd && this.servicePeriodEnd < this.servicePeriodStart) this.invalidate('servicePeriodEnd', 'Service period end must be on or after the start');
  if (!this.lineItems?.length) this.invalidate('lineItems', 'At least one line item is required');
  next();
});

module.exports = mongoose.model('VendorInvoice', schema);
