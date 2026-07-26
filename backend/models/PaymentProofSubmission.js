const mongoose = require('mongoose');
const attachmentSchema = require('./attachmentSchema');

const schema = new mongoose.Schema({
  proofReference: { type: String, required: true, unique: true, immutable: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true, index: true },
  customerInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerInvoice', required: true, immutable: true, index: true },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true, immutable: true, index: true },
  jobCompletionId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobCompletion', required: true, immutable: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', immutable: true },
  revisionNumber: { type: Number, min: 1, required: true, immutable: true },
  previousVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentProofSubmission', immutable: true },
  status: {
    type: String,
    enum: ['pending_review', 'verified', 'rejected', 'superseded'],
    default: 'pending_review',
    required: true,
    index: true
  },
  paymentMethod: { type: String, required: true, trim: true, maxlength: 50, immutable: true },
  payerName: { type: String, required: true, trim: true, maxlength: 160, immutable: true },
  declaredAmount: { type: Number, min: 0, required: true, immutable: true },
  paidAt: { type: Date, required: true, immutable: true },
  transactionReference: { type: String, trim: true, maxlength: 200, immutable: true },
  customerNotes: { type: String, trim: true, maxlength: 2000, immutable: true },
  proofImages: { type: [attachmentSchema], required: true, immutable: true },
  submittedAt: { type: Date, required: true, default: Date.now, immutable: true },
  ipAddress: { type: String, maxlength: 128, immutable: true },
  userAgent: { type: String, maxlength: 1000, immutable: true },
  source: { type: String, enum: ['secure_closeout_link'], default: 'secure_closeout_link', immutable: true },
  verifiedAt: Date,
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectedAt: Date,
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: { type: String, trim: true, maxlength: 2000 }
}, { timestamps: true });

schema.index(
  { paymentId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'pending_review' }, name: 'one_pending_payment_proof_per_payment' }
);
schema.index({ jobCompletionId: 1, revisionNumber: -1 }, { unique: true });

module.exports = mongoose.model('PaymentProofSubmission', schema);
