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
  details: {
    subtype: { type: String, trim: true, maxlength: 100 },
    title: { type: String, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 3000 },
    yearBuilt: { type: Number, min: 1700, max: 2200 },
    bedrooms: { type: Number, min: 0, max: 100 },
    fullBathrooms: { type: Number, min: 0, max: 100 },
    halfBathrooms: { type: Number, min: 0, max: 100 },
    livingAreaSqFt: { type: Number, min: 0, max: 10000000 },
    lotSize: { type: Number, min: 0, max: 100000000 },
    lotSizeUnit: { type: String, enum: ['sq_ft', 'acres'], default: 'sq_ft' },
    stories: { type: Number, min: 0, max: 200 },
    garageSpaces: { type: Number, min: 0, max: 100 },
    parkingSpaces: { type: Number, min: 0, max: 1000 },
    condition: { type: String, trim: true, maxlength: 100 }
  },
  addressDetails: {
    county: { type: String, trim: true, maxlength: 120 },
    parcelNumber: { type: String, trim: true, maxlength: 120 },
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 }
  },
  interior: {
    flooring: { type: String, trim: true, maxlength: 500 }, kitchen: { type: String, trim: true, maxlength: 1000 },
    appliances: { type: String, trim: true, maxlength: 1000 }, heating: { type: String, trim: true, maxlength: 500 },
    cooling: { type: String, trim: true, maxlength: 500 }, fireplace: { type: String, trim: true, maxlength: 500 },
    laundry: { type: String, trim: true, maxlength: 500 }, basement: { type: String, trim: true, maxlength: 500 },
    attic: { type: String, trim: true, maxlength: 500 }, furnishing: { type: String, enum: ['', 'furnished', 'unfurnished', 'partially_furnished'], default: '' }
  },
  exterior: {
    exteriorType: { type: String, trim: true, maxlength: 500 }, roofType: { type: String, trim: true, maxlength: 500 },
    garage: { type: String, trim: true, maxlength: 500 }, driveway: { type: String, trim: true, maxlength: 500 },
    yard: { type: String, trim: true, maxlength: 500 }, patioDeck: { type: String, trim: true, maxlength: 500 },
    balcony: { type: String, trim: true, maxlength: 500 }, pool: { type: String, trim: true, maxlength: 500 },
    fence: { type: String, trim: true, maxlength: 500 }, landscaping: { type: String, trim: true, maxlength: 1000 }
  },
  utilities: {
    electricity: { type: String, trim: true, maxlength: 200 }, gas: { type: String, trim: true, maxlength: 200 },
    water: { type: String, trim: true, maxlength: 200 }, sewerSeptic: { type: String, trim: true, maxlength: 200 },
    internet: { type: String, trim: true, maxlength: 200 }, solar: { type: String, trim: true, maxlength: 500 },
    waterHeater: { type: String, trim: true, maxlength: 500 }
  },
  hoa: {
    hasHoa: { type: Boolean, default: false }, name: { type: String, trim: true, maxlength: 200 },
    fee: { type: Number, min: 0, max: 1000000 }, frequency: { type: String, enum: ['', 'monthly', 'quarterly', 'semiannual', 'annual'], default: '' },
    websiteContact: { type: String, trim: true, maxlength: 1000 }
  },
  media: { virtualTourUrl: { type: String, trim: true, maxlength: 1000 } },
  ownerInformation: {
    name: { type: String, trim: true, maxlength: 200 }, email: { type: String, trim: true, lowercase: true, maxlength: 320 },
    phone: { type: String, trim: true, maxlength: 60 }, mailingAddress: { type: String, trim: true, maxlength: 1000 },
    ownerType: { type: String, enum: ['', 'individual', 'joint_owner', 'llc', 'trust', 'other'], default: '' }
  },
  ownershipVerification: {
    status: { type: String, enum: ['unverified', 'pending_review', 'verified', 'rejected'], default: 'unverified' },
    declarationConfirmed: { type: Boolean, default: false }, declarationConfirmedAt: Date
  },
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
