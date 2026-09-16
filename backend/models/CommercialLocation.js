const mongoose = require('mongoose');

const contactOverrideSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 160 },
  email: { type: String, trim: true, lowercase: true, maxlength: 254 },
  phone: { type: String, trim: true, maxlength: 40 }
}, { _id: false });

const schema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommercialOrganization', required: true, index: true },
  portfolioId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommercialPortfolio', required: true, index: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  ownerCustomerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  locationCode: { type: String, required: true, uppercase: true, trim: true, maxlength: 60 },
  ownerLabel: { type: String, trim: true, maxlength: 180 },
  billingContactOverride: contactOverrideSchema,
  status: { type: String, enum: ['active', 'inactive', 'archived'], default: 'active', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

schema.index({ organizationId: 1, propertyId: 1 }, { unique: true });
schema.index({ organizationId: 1, locationCode: 1 }, { unique: true });
schema.index({ portfolioId: 1, status: 1 });

module.exports = mongoose.model('CommercialLocation', schema);
