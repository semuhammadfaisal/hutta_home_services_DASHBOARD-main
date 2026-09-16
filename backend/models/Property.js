const mongoose = require('mongoose');
const attachmentSchema = require('./attachmentSchema');

const propertySchema = new mongoose.Schema({
  ownerCustomerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  label: { type: String, trim: true, maxlength: 120, default: 'Primary property' },
  addressLine1: { type: String, required: true, trim: true, maxlength: 240 },
  addressLine2: { type: String, trim: true, maxlength: 240 },
  city: { type: String, trim: true, maxlength: 120 },
  state: { type: String, trim: true, maxlength: 80 },
  postalCode: { type: String, trim: true, maxlength: 24 },
  country: { type: String, trim: true, maxlength: 80, default: 'US' },
  propertyType: { type: String, trim: true, maxlength: 80 },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  documents: { type: [attachmentSchema], default: [] },
  source: { type: String, enum: ['manual', 'legacy_customer_address'], default: 'manual' },
  legacyAddressKey: { type: String, trim: true, maxlength: 700 }
  , residentialAddressKey: { type: String, select: false }
}, { timestamps: true });

propertySchema.index({ ownerCustomerId: 1, status: 1 });
propertySchema.index({ residentialAddressKey: 1 }, { unique: true, sparse: true });
propertySchema.index(
  { ownerCustomerId: 1, legacyAddressKey: 1 },
  { unique: true, partialFilterExpression: { legacyAddressKey: { $type: 'string' } } }
);

module.exports = mongoose.model('Property', propertySchema);
