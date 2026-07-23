const mongoose = require('mongoose');
const attachmentSchema = require('./attachmentSchema');

const schema = new mongoose.Schema({
  completionReference: { type: String, required: true, unique: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true, index: true },
  jobScheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobSchedule', required: true },
  outgoingQuoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'OutgoingQuote', required: true },
  vendorWorkOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorWorkOrder', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  source: { type: String, enum: ['vendor', 'staff'], default: 'vendor' },
  status: { type: String, enum: ['pending', 'completed', 'voided'], default: 'pending', index: true },
  completionNotes: { type: String, trim: true, maxlength: 5000 },
  completedAt: Date,
  vendorEnteredName: { type: String, trim: true, maxlength: 160 },
  beforePhotos: { type: [attachmentSchema], default: [] },
  afterPhotos: { type: [attachmentSchema], default: [] },
  photoOverride: { type: Boolean, default: false },
  photoOverrideReason: { type: String, trim: true, maxlength: 2000 },
  customerSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  vendorSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  scheduleSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  jobSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  approvedTotal: { type: Number, min: 0, required: true },
  publicTokenHash: { type: String, select: false },
  tokenExpiresAt: Date,
  tokenSentAt: Date,
  tokenRevokedAt: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  completedByEmail: String,
  completionSnapshotHash: { type: String, match: /^[a-f0-9]{64}$/ },
  customerInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerInvoice' },
  satisfactionTokenHash: { type: String, select: false },
  satisfactionTokenExpiresAt: Date,
  satisfactionDecisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerSatisfactionDecision' },
  history: [{ action: String, actorType: String, actorId: mongoose.Schema.Types.ObjectId, actorEmail: String, message: String, createdAt: { type: Date, default: Date.now } }]
}, { timestamps: true });

schema.index({ publicTokenHash: 1 }, { unique: true, sparse: true });
schema.index({ satisfactionTokenHash: 1 }, { unique: true, sparse: true });
schema.index({ status: 1, completedAt: -1 });

module.exports = mongoose.model('JobCompletion', schema);
