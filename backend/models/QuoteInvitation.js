const mongoose = require('mongoose');

const quoteInvitationSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, select: false },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  quoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'IncomingQuote', required: true, index: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  status: {
    type: String,
    enum: ['sent', 'delivery_failed', 'processing', 'submitted', 'revoked'],
    default: 'sent',
    index: true
  },
  expiresAt: { type: Date, required: true, index: true },
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

module.exports = mongoose.model('QuoteInvitation', quoteInvitationSchema);
