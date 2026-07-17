const mongoose = require('mongoose');

const emailOutboxSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'website_customer_confirmation',
      'website_operations_alert',
      'vendor_quote_invitation',
      'vendor_quote_submission_confirmation',
      'vendor_quote_staff_alert',
      'vendor_quote_revision_request',
      'customer_outgoing_quote',
      'customer_quote_approval_confirmation',
      'staff_quote_approval_alert',
      'customer_quote_change_confirmation',
      'staff_quote_change_alert',
      'vendor_schedule_proposal',
      'vendor_schedule_accepted_confirmation',
      'customer_schedule_confirmation',
      'staff_schedule_accepted_alert',
      'vendor_schedule_change_confirmation',
      'staff_schedule_change_alert'
    ],
    required: true
  },
  dedupeKey: { type: String, required: true, unique: true },
  recipients: { type: [String], required: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  intakeSubmissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntakeSubmission' },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  incomingQuoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'IncomingQuote' },
  quoteInvitationId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuoteInvitation' },
  outgoingQuoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'OutgoingQuote' },
  jobScheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobSchedule' },
  vendorWorkOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorWorkOrder' },
  status: {
    type: String,
    enum: ['pending', 'processing', 'sent', 'retry_scheduled', 'permanently_failed', 'cancelled'],
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
emailOutboxSchema.index({ incomingQuoteId: 1, type: 1 });
emailOutboxSchema.index({ quoteInvitationId: 1, type: 1 });
emailOutboxSchema.index({ outgoingQuoteId: 1, type: 1 });
emailOutboxSchema.index({ jobScheduleId: 1, type: 1 });

module.exports = mongoose.model('EmailOutbox', emailOutboxSchema);
