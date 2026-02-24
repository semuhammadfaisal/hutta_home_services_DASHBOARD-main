const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: String,
  address: String,
  category: { 
    type: String, 
    enum: ['electrical', 'plumbing', 'civil', 'carpentry', 'hvac', 'painting', 'cleaning'], 
    required: true 
  },
  rating: { type: Number, min: 1, max: 5, default: 5 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Vendor', vendorSchema);