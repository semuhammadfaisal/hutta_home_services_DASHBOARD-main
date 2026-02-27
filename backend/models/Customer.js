const mongoose = require('mongoose');

// Define document subdocument schema explicitly
const documentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  type: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedAt: { type: Date, default: Date.now }
}, { _id: false });

// Define address subdocument schema for multiple locations
const addressSchema = new mongoose.Schema({
  label: { type: String, default: 'Primary' },
  address: String,
  city: String,
  state: String,
  zipCode: String,
  isPrimary: { type: Boolean, default: false }
}, { _id: false });

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: String,
  address: String,
  city: String,
  state: String,
  zipCode: String,
  addresses: { type: [addressSchema], default: [] },
  customerType: { 
    type: String, 
    enum: ['permanent', 'one-time'], 
    default: 'one-time' 
  },
  status: { 
    type: String, 
    enum: ['active', 'inactive'], 
    default: 'active' 
  },
  notes: String,
  totalOrders: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  documents: { type: [documentSchema], default: [] }
}, { timestamps: true });

customerSchema.index({ email: 1, 'addresses.address': 1 });

module.exports = mongoose.model('Customer', customerSchema);