const mongoose = require('mongoose');

const jobScheduleSchema = new mongoose.Schema({
  scheduleReference: { type: String, required: true, unique: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  outgoingQuoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'OutgoingQuote', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  revisionNumber: { type: Number, required: true, min: 1 },
  previousVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobSchedule' },
  status: { type: String, enum: ['pending_vendor', 'accepted', 'changes_requested', 'superseded', 'revoked'], required: true, default: 'pending_vendor', index: true },
  proposedStart: { type: Date, required: true, index: true },
  proposedEnd: { type: Date, required: true, index: true },
  timezone: { type: String, enum: ['America/Phoenix'], default: 'America/Phoenix' },
  accessInstructions: { type: String, trim: true, maxlength: 5000 },
  internalNotes: { type: String, trim: true, maxlength: 5000, select: false },
  conflictAcknowledged: { type: Boolean, default: false },
  conflictSnapshot: { type: [mongoose.Schema.Types.Mixed], default: [] },
  customerSnapshot: { name: String, email: String, phone: String, address: String },
  vendorSnapshot: { name: String, email: String, phone: String },
  jobSnapshot: { requestReference: String, orderReference: String, service: String, description: String, scopeOfWork: String },
  publicTokenHash: { type: String, select: false },
  tokenExpiresAt: { type: Date, required: true },
  sentAt: Date,
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  acceptedAt: Date,
  changesRequestedAt: Date,
  supersededAt: Date,
  revokedAt: Date,
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  history: [{ action: String, actorId: mongoose.Schema.Types.ObjectId, actorEmail: String, message: String, createdAt: { type: Date, default: Date.now } }]
}, { timestamps: true });

jobScheduleSchema.index({ orderId: 1, revisionNumber: 1 }, { unique: true });
jobScheduleSchema.index({ publicTokenHash: 1 }, { unique: true, sparse: true });
jobScheduleSchema.index({ vendorId: 1, status: 1, proposedStart: 1, proposedEnd: 1 });
jobScheduleSchema.index({ orderId: 1 }, { unique: true, partialFilterExpression: { status: 'pending_vendor' }, name: 'one_pending_schedule_per_order' });

module.exports = mongoose.model('JobSchedule', jobScheduleSchema);
