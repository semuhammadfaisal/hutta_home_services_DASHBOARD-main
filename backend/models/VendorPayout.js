const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  vendorInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorInvoice', required: true, unique: true, immutable: true },
  assignmentId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, immutable: true, index: true },
  amount: { type: Number, required: true, min: 0, immutable: true },
  provider: { type: String, enum: ['stripe_connect'], default: 'stripe_connect', immutable: true },
  status: { type: String, enum: ['pending', 'approved', 'scheduled', 'paid', 'failed', 'disputed'], default: 'pending', index: true },
  providerReference: { type: String, trim: true, maxlength: 180, select: false },
  scheduledFor: Date,
  paidAt: Date,
  failureMessage: { type: String, trim: true, maxlength: 1000 },
  disputeMessage: { type: String, trim: true, maxlength: 1000 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  history: [{ status: String, actorId: mongoose.Schema.Types.ObjectId, message: String, createdAt: { type: Date, default: Date.now } }],
  demoData: { type: Boolean, default: false }
}, { timestamps: true });

schema.index({ vendorId: 1, status: 1, updatedAt: -1 });
module.exports = mongoose.model('VendorPayout', schema);
