const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true, immutable: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true, immutable: true },
  jobCompletionId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobCompletion', required: true, unique: true, immutable: true },
  outgoingQuoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'OutgoingQuote', required: true, immutable: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', immutable: true },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  amount: { type: Number, min: 0, required: true, immutable: true },
  issuedAt: { type: Date, required: true, immutable: true },
  dueDate: { type: Date, required: true, immutable: true },
  terms: { type: String, default: 'Due on receipt', immutable: true },
  companySnapshot: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  customerSnapshot: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  jobSnapshot: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  quoteSnapshot: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  snapshotHash: { type: String, required: true, match: /^[a-f0-9]{64}$/, immutable: true },
  pdfGeneratedAt: Date
}, { timestamps: true });

schema.index({ customerId: 1, issuedAt: -1 });

module.exports = mongoose.model('CustomerInvoice', schema);
