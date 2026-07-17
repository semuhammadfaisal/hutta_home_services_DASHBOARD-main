const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  workOrderReference: { type: String, required: true, unique: true, immutable: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true, index: true },
  jobScheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobSchedule', required: true, unique: true, immutable: true },
  outgoingQuoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'OutgoingQuote', required: true, immutable: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, immutable: true },
  revisionNumber: { type: Number, required: true, immutable: true },
  customerSnapshot: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  vendorSnapshot: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  jobSnapshot: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  scheduledStart: { type: Date, required: true, immutable: true },
  scheduledEnd: { type: Date, required: true, immutable: true },
  timezone: { type: String, default: 'America/Phoenix', immutable: true },
  accessInstructions: { type: String, maxlength: 5000, immutable: true },
  generatedAt: { type: Date, default: Date.now, immutable: true },
  snapshotHash: { type: String, required: true, match: /^[a-f0-9]{64}$/, immutable: true }
}, { timestamps: true });

module.exports = mongoose.model('VendorWorkOrder', schema);
