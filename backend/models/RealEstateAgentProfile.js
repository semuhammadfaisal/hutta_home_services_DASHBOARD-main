const mongoose = require('mongoose');

const realEstateAgentProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  displayName: { type: String, required: true, trim: true, maxlength: 160 },
  brokerageName: { type: String, trim: true, maxlength: 180 },
  licenseNumber: { type: String, trim: true, maxlength: 80 },
  referralCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
  referralProgram: {
    enabled: { type: Boolean, default: true },
    rewardLabel: { type: String, trim: true, maxlength: 120, default: 'SMPLfix referral credit' },
    unitsPerCompletedJob: { type: Number, min: 0, max: 10000, default: 1 }
  },
  status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true }
}, { timestamps: true });

module.exports = mongoose.model('RealEstateAgentProfile', realEstateAgentProfileSchema);
