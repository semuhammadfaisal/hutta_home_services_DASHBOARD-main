const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  theme: { type: String, enum: ['light', 'dark'], default: 'light' },
  language: { type: String, default: 'en' },
  timezone: { type: String, default: 'UTC' },
  notifications: {
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    sms: { type: Boolean, default: false }
  },
  dashboard: {
    itemsPerPage: { type: Number, default: 10 },
    defaultView: { type: String, enum: ['table', 'grid'], default: 'table' },
    autoRefresh: { type: Boolean, default: true },
    refreshInterval: { type: Number, default: 30 }
  },
  company: {
    name: String,
    address: String,
    phone: String,
    email: String,
    website: String,
    logo: String
  }
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);