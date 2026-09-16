const mongoose = require('mongoose');
const crypto = require('crypto');

const referralSchema = new mongoose.Schema({
  referralId: { type: String, default: () => crypto.randomUUID() },
  displayName: { type: String, trim: true, maxlength: 120 },
  status: { type: String, enum: ['invited', 'joined', 'rewarded'], default: 'invited' },
  rewardAmount: { type: Number, min: 0, max: 10000, default: 0 },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const residentialAccountProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  referralCode: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
  referrals: { type: [referralSchema], default: [] },
  notificationPreferences: {
    portal: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    upcomingVisits: { type: Boolean, default: true },
    jobUpdates: { type: Boolean, default: true },
    invoices: { type: Boolean, default: true },
    seasonalRecommendations: { type: Boolean, default: true }
  },
  account: {
    phone: { type: String, trim: true, maxlength: 40 },
    preferredName: { type: String, trim: true, maxlength: 80 },
    timezone: { type: String, enum: ['America/Phoenix'], default: 'America/Phoenix' }
  }
}, { timestamps: true });

module.exports = mongoose.model('ResidentialAccountProfile', residentialAccountProfileSchema);
