const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  title: { type: String, trim: true, maxlength: 120 },
  email: { type: String, trim: true, lowercase: true, maxlength: 254 },
  phone: { type: String, trim: true, maxlength: 40 },
  isPrimary: { type: Boolean, default: false }
}, { _id: true });

const schema = new mongoose.Schema({
  organizationCode: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 40 },
  name: { type: String, required: true, trim: true, maxlength: 180 },
  legalName: { type: String, trim: true, maxlength: 220 },
  primaryCustomerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', index: true },
  ownerContacts: { type: [contactSchema], default: [] },
  billingContacts: { type: [contactSchema], default: [] },
  status: { type: String, enum: ['active', 'suspended', 'archived'], default: 'active', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

schema.index({ status: 1, name: 1 });
schema.index({ 'ownerContacts.customerId': 1 });
schema.index({ 'billingContacts.email': 1 });

module.exports = mongoose.model('CommercialOrganization', schema);
