const mongoose = require('mongoose');

const agentReferralAttributionSchema = new mongoose.Schema({
  agentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'RealEstateTransaction', required: true, unique: true, index: true },
  source: { type: String, enum: ['agent_invitation'], default: 'agent_invitation' },
  status: { type: String, enum: ['attributed', 'converted', 'closed'], default: 'attributed', index: true },
  attributedAt: { type: Date, default: Date.now },
  convertedAt: Date,
  convertedJobCount: { type: Number, min: 0, default: 0 },
  completedJobCount: { type: Number, min: 0, default: 0 },
  lastJobAt: Date,
  rewardStatus: { type: String, enum: ['not_eligible', 'pending', 'earned', 'issued'], default: 'not_eligible' },
  rewardUnits: { type: Number, min: 0, default: 0 }
}, { timestamps: true });

agentReferralAttributionSchema.index({ agentUserId: 1, attributedAt: -1 });
module.exports = mongoose.model('AgentReferralAttribution', agentReferralAttributionSchema);
