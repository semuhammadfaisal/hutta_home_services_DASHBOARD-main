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
      ,'vendor_completion_confirmation'
      ,'vendor_completion_link'
      ,'customer_completion_satisfaction'
      ,'customer_satisfaction_followup'
      ,'customer_satisfaction_confirmation'
      ,'customer_issue_confirmation'
      ,'staff_completion_alert'
      ,'staff_satisfaction_alert'
      ,'staff_closeout_issue_alert'
      ,'staff_closeout_issue_resolved'
      ,'customer_closeout_review'
      ,'customer_closeout_followup'
      ,'customer_closeout_confirmation'
      ,'customer_closeout_issue_confirmation'
      ,'customer_closeout_issue_resolved'
      ,'customer_payment_proof_received'
      ,'staff_payment_proof_alert'
      ,'customer_payment_proof_verified'
      ,'customer_payment_proof_rejected'
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
  jobCompletionId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobCompletion' },
  customerInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerInvoice' },
  satisfactionDecisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerSatisfactionDecision' },
  paymentProofSubmissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentProofSubmission' },
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
emailOutboxSchema.index({ jobCompletionId: 1, type: 1 });
emailOutboxSchema.index({ customerInvoiceId: 1, type: 1 });

module.exports = mongoose.model('EmailOutbox', emailOutboxSchema);
