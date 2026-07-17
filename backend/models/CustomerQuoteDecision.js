const mongoose = require('mongoose');

const customerQuoteDecisionSchema = new mongoose.Schema({
  outgoingQuoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'OutgoingQuote', required: true, unique: true, immutable: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', immutable: true },
  decision: { type: String, enum: ['approved', 'changes_requested'], required: true, immutable: true, index: true },
  typedName: { type: String, required: true, trim: true, maxlength: 160, immutable: true },
  termsAccepted: { type: Boolean, required: true, immutable: true },
  changeRequestMessage: { type: String, trim: true, maxlength: 3000, immutable: true },
  decisionAt: { type: Date, required: true, default: Date.now, immutable: true, index: true },
  quoteReference: { type: String, required: true, immutable: true },
  revisionNumber: { type: Number, required: true, min: 1, immutable: true },
  consentText: { type: String, required: true, maxlength: 2000, immutable: true },
  termsHash: { type: String, required: true, match: /^[a-f0-9]{64}$/, immutable: true },
  quoteSnapshotHash: { type: String, required: true, match: /^[a-f0-9]{64}$/, immutable: true },
  ipAddress: { type: String, maxlength: 128, immutable: true },
  userAgent: { type: String, maxlength: 1000, immutable: true },
  source: { type: String, enum: ['secure_quote_link'], default: 'secure_quote_link', immutable: true }
}, { timestamps: true });

customerQuoteDecisionSchema.index({ orderId: 1, decisionAt: -1 });

module.exports = mongoose.model('CustomerQuoteDecision', customerQuoteDecisionSchema);
