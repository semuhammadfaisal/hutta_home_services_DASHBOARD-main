const mongoose = require('mongoose');

// Define document subdocument schema explicitly
const documentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  type: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedAt: { type: Date, default: Date.now }
}, { _id: false });

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
  isActive: { type: Boolean, default: true },
  documents: { type: [documentSchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('Vendor', vendorSchema);