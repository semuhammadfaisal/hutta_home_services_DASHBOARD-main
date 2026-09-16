const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  serviceCategory: { type: String, required: true, maxlength: 120 },
  postalCodes: { type: [String], required: true },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  status: { type: String, enum: ['confirmed_available', 'withdrawn'], default: 'confirmed_available' },
  confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  confirmedAt: { type: Date, default: Date.now }
}, { timestamps: true });
schema.index({ serviceCategory: 1, status: 1, startsAt: 1 });
schema.index({ vendorId: 1, startsAt: 1, endsAt: 1 });
module.exports = mongoose.model('VendorAvailabilitySlot', schema);
