const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  jobCompletionId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobCompletion', required: true, immutable: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true, index: true },
  customerInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerInvoice', required: true, immutable: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', immutable: true },
  closeoutRevision: { type: Number, min: 1, required: true, default: 1, immutable: true },
  decision: { type: String, enum: ['satisfied', 'issue_reported'], required: true, immutable: true, index: true },
  typedName: { type: String, required: true, trim: true, maxlength: 160, immutable: true },
  completionConfirmed: { type: Boolean, required: true, immutable: true },
  confirmationStatement: { type: String, required: true, maxlength: 2000, immutable: true },
  issueMessage: { type: String, trim: true, maxlength: 3000, immutable: true },
  decisionAt: { type: Date, required: true, default: Date.now, immutable: true },
  completionSnapshotHash: { type: String, required: true, match: /^[a-f0-9]{64}$/, immutable: true },
  invoiceSnapshotHash: { type: String, required: true, match: /^[a-f0-9]{64}$/, immutable: true },
  evidenceSnapshotHash: { type: String, required: true, match: /^[a-f0-9]{64}$/, immutable: true },
  ipAddress: { type: String, maxlength: 128, immutable: true },
  userAgent: { type: String, maxlength: 1000, immutable: true },
  source: { type: String, enum: ['secure_satisfaction_link'], default: 'secure_satisfaction_link', immutable: true },
  resolvedAt: Date,
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolutionNote: { type: String, trim: true, maxlength: 3000 }
}, { timestamps: true });

schema.index({ jobCompletionId: 1, closeoutRevision: 1 }, { unique: true });
schema.index({ orderId: 1, decisionAt: -1 });

module.exports = mongoose.model('CustomerSatisfactionDecision', schema);
