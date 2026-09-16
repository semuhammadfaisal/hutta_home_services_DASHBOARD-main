const mongoose = require('mongoose');

const responseHistorySchema = new mongoose.Schema({
  action: { type: String, enum: ['distributed', 'accepted_to_bid', 'declined', 'quote_submitted', 'expired', 'bid_due_missed'], required: true },
  actorType: { type: String, enum: ['staff', 'vendor', 'system'], required: true },
  actorId: mongoose.Schema.Types.ObjectId,
  message: { type: String, maxlength: 1000 },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const quoteInvitationSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, select: false },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  quoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'IncomingQuote', required: true, index: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  status: {
    type: String,
    enum: ['sent', 'delivery_failed', 'accepted_to_bid', 'declined', 'processing', 'submitted', 'revoked', 'expired'],
    default: 'sent',
    index: true
  },
  expiresAt: { type: Date, required: true, index: true },
  responseRequired: { type: Boolean, default: false },
  responseDueAt: { type: Date, index: true },
  bidDueAt: { type: Date, index: true },
  respondedAt: Date,
  responseTimeMs: { type: Number, min: 0 },
  acceptedAt: Date,
  declinedAt: Date,
  bidDueMissedAt: Date,
  declineReasonCode: { type: String, enum: ['capacity', 'outside_scope', 'outside_service_area', 'schedule', 'pricing', 'compliance', 'other'] },
  declineReason: { type: String, maxlength: 1000 },
  distributionKey: { type: String, unique: true, sparse: true, select: false },
  leadSnapshot: {
    propertyAddress: { type: String, maxlength: 700 },
    service: { type: String, maxlength: 160 },
    scope: { type: String, maxlength: 5000 },
    requestedWindow: { type: String, maxlength: 500 },
    relevantNotes: { type: String, maxlength: 2000 }
  },
  qualificationSnapshot: {
    tradeMatched: Boolean,
    serviceAreaMatched: Boolean,
    complianceStatus: String,
    rating: Number,
    performanceScore: Number,
    evaluatedAt: Date
  },
  responseHistory: { type: [responseHistorySchema], default: [] },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  invitedByEmail: String,
  personalMessage: { type: String, maxlength: 2000 },
  sentAt: Date,
  submittedAt: Date,
  processingStartedAt: Date,
  revokedAt: Date,
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sendCount: { type: Number, default: 1 },
  lastDeliveryError: String,
  lastDeliveryProvider: String,
  lastDeliveryMessageId: String
}, { timestamps: true });

quoteInvitationSchema.index({ orderId: 1, vendorId: 1, createdAt: -1 });
quoteInvitationSchema.index({ vendorId: 1, status: 1, bidDueAt: 1 });
quoteInvitationSchema.index({ status: 1, responseDueAt: 1 });

module.exports = mongoose.model('QuoteInvitation', quoteInvitationSchema);
