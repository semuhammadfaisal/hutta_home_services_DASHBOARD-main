const mongoose = require('mongoose');

const quoteSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'global', unique: true, immutable: true },
  defaultMarkupType: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
  defaultMarkupValue: { type: Number, min: 0, default: 20 },
  defaultValidityDays: { type: Number, min: 1, max: 365, default: 30 },
  company: {
    name: { type: String, default: 'smplfix' },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    website: { type: String, default: 'smplfix.com' },
    logo: { type: String, default: '/assets/images/smplfix-logo-ink.png' }
  },
  termsAndConditions: { type: String, trim: true, maxlength: 30000, default: '' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('QuoteSettings', quoteSettingsSchema);
