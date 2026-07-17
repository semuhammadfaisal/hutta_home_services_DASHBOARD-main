const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  jobScheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobSchedule', required: true, unique: true, immutable: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true, index: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, immutable: true },
  decision: { type: String, enum: ['accepted', 'changes_requested'], required: true, immutable: true },
  typedName: { type: String, required: true, maxlength: 160, immutable: true },
  changeRequestMessage: { type: String, maxlength: 3000, immutable: true },
  decisionAt: { type: Date, required: true, default: Date.now, immutable: true },
  scheduleReference: { type: String, required: true, immutable: true },
  revisionNumber: { type: Number, required: true, immutable: true },
  scheduleSnapshotHash: { type: String, required: true, match: /^[a-f0-9]{64}$/, immutable: true },
  ipAddress: { type: String, maxlength: 128, immutable: true },
  userAgent: { type: String, maxlength: 1000, immutable: true },
  source: { type: String, enum: ['secure_schedule_link'], default: 'secure_schedule_link', immutable: true }
}, { timestamps: true });

module.exports = mongoose.model('VendorScheduleDecision', schema);
