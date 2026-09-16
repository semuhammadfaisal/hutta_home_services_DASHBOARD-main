const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true, immutable: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true, immutable: true },
  invitationId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuoteInvitation', required: true, index: true, immutable: true },
  type: { type: String, enum: ['lead_accepted', 'lead_declined', 'lead_no_response', 'bid_submitted_on_time', 'bid_submitted_late', 'bid_due_missed'], required: true, index: true },
  responseTimeMs: { type: Number, min: 0 },
  occurredAt: { type: Date, default: Date.now, index: true },
  dedupeKey: { type: String, required: true, unique: true },
  metadata: { type: mongoose.Schema.Types.Mixed, select: false }
}, { timestamps: true });

schema.index({ vendorId: 1, occurredAt: -1 });
schema.index({ vendorId: 1, type: 1, occurredAt: -1 });

module.exports = mongoose.model('VendorPerformanceEvent', schema);
