const mongoose = require('mongoose');

const vendorInvitationSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, select: false },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  companyName: String,
  category: { type: String, required: true },
  categoryLabel: String,
  personalMessage: String,
  purpose: { type: String, enum: ['initial', 'changes_requested'], default: 'initial' },
  status: {
    type: String,
    enum: ['sent', 'delivery_failed', 'processing', 'submitted', 'revoked'],
    default: 'sent',
    index: true
  },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  invitedByEmail: String,
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
  expiresAt: { type: Date, required: true, index: true },
  sentAt: Date,
  submittedAt: Date,
  processingStartedAt: Date,
  revokedAt: Date,
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sendCount: { type: Number, default: 1 },
  lastDeliveryError: String,
  lastDeliveryProvider: { type: String, enum: ['resend', 'gmail'] },
  lastDeliveryMessageId: String,
  confirmationDeliveryError: String,
  staffNotificationError: String,
  submissionError: String
}, { timestamps: true });

vendorInvitationSchema.index({ email: 1, status: 1 });
vendorInvitationSchema.index({ vendor: 1, createdAt: -1 });

module.exports = mongoose.model('VendorInvitation', vendorInvitationSchema);
