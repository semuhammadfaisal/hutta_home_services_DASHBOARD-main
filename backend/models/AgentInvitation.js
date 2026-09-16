const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  action: { type: String, enum: ['created', 'accepted', 'revoked', 'expired'], required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  occurredAt: { type: Date, default: Date.now },
  reason: { type: String, trim: true, maxlength: 1000 }
}, { _id: false });

const agentInvitationSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, select: false },
  agentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  agentEmail: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'RealEstateTransaction', required: true, unique: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  status: { type: String, enum: ['pending', 'processing', 'accepted', 'revoked', 'expired'], default: 'pending', index: true },
  expiresAt: { type: Date, required: true, index: true },
  acceptedAt: Date,
  acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  revokedAt: Date,
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  history: { type: [eventSchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

agentInvitationSchema.index({ agentUserId: 1, status: 1, expiresAt: 1 });
module.exports = mongoose.model('AgentInvitation', agentInvitationSchema);
