const mongoose = require('mongoose');

const emailOutboxSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['website_customer_confirmation', 'website_operations_alert'],
    required: true
  },
  dedupeKey: { type: String, required: true, unique: true },
  recipients: { type: [String], required: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  intakeSubmissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntakeSubmission', required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  status: {
    type: String,
    enum: ['pending', 'processing', 'sent', 'retry_scheduled', 'permanently_failed'],
    default: 'pending'
  },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  lockedUntil: Date,
  lockedBy: String,
  provider: String,
  providerMessageId: String,
  sentAt: Date,
  lastAttemptAt: Date,
  lastErrorCategory: String
}, { timestamps: true });

emailOutboxSchema.index({ status: 1, nextAttemptAt: 1, lockedUntil: 1 });
emailOutboxSchema.index({ intakeSubmissionId: 1, type: 1 });

module.exports = mongoose.model('EmailOutbox', emailOutboxSchema);
