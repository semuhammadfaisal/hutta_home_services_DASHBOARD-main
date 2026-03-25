const mongoose = require('mongoose');

// Define document subdocument schema explicitly
const documentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  type: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedAt: { type: Date, default: Date.now }
}, { _id: false });

// Define email subdocument schema
const emailSchema = new mongoose.Schema({
  label: { type: String, default: 'Email' },
  address: { type: String, required: true },
  isPrimary: { type: Boolean, default: false }
}, { _id: false });

// Define phone subdocument schema
const phoneSchema = new mongoose.Schema({
  label: { type: String, default: 'Phone' },
  number: { type: String, required: true },
  isPrimary: { type: Boolean, default: false }
}, { _id: false });

// Define custom field subdocument schema
const customFieldSchema = new mongoose.Schema({
  name: { type: String, required: true },
  value: { type: String, default: '' }
}, { _id: false });

const vendorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: String,
  phone: String,
  address: String,
  category: { 
    type: String, 
    required: true 
  },
  rating: { type: Number, min: 1, max: 5, default: 5 },
  isActive: { type: Boolean, default: true },
  notes: String,
  documents: { type: [documentSchema], default: [] },
  emails: { type: [emailSchema], default: [] },
  phones: { type: [phoneSchema], default: [] },
  customFields: { type: [customFieldSchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('Vendor', vendorSchema);