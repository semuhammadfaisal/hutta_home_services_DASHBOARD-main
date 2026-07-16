const mongoose = require('mongoose');
const noteSchema = require('./noteSchema');
const attachmentSchema = require('./attachmentSchema');

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

const addressSchema = new mongoose.Schema({
  label: { type: String, default: 'Business' },
  address: String,
  isPrimary: { type: Boolean, default: false }
}, { _id: false });

const vendorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: String,
  phone: String,
  address: String,
  legalBusinessName: String,
  businessEntityType: String,
  primaryOwnerName: String,
  businessAddress: String,
  einTaxId: { type: String, select: false },
  einTaxIdEncrypted: { type: String, select: false },
  einTaxIdIv: { type: String, select: false },
  einTaxIdTag: { type: String, select: false },
  einTaxIdLast4: String,
  huttasContractSigned: { type: Boolean, default: false },
  huttasContractSignedDate: Date,
  w9OnFile: { type: Boolean, default: false },
  w9Date: Date,
  rocLicenseNumber: String,
  rocLicenseTypeClassification: String,
  rocLicenseExpirationDate: Date,
  certificateOfInsuranceOnFile: { type: Boolean, default: false },
  workersCompInsuranceOnFile: { type: Boolean, default: false },
  huttasAdditionalInsured: { type: Boolean, default: false },
  category: { 
    type: String, 
    required: true 
  },
  rating: { type: Number, min: 1, max: 5, default: 5 },
  isActive: { type: Boolean, default: true },
  onboardingSource: { type: String, enum: ['manual', 'invitation'], default: 'manual', index: true },
  onboardingStatus: {
    type: String,
    enum: ['approved', 'pending_review', 'changes_requested', 'rejected'],
    default: 'approved',
    index: true
  },
  invitationId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorInvitation', unique: true, sparse: true },
  requestedCategory: String,
  submittedAt: Date,
  reviewedAt: Date,
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewMessage: String,
  onboardingEmailStatus: { type: String, enum: ['sent', 'failed'] },
  onboardingEmailError: String,
  updateRecipientNotificationError: String,
  onboardingHistory: [{
    decisionId: String,
    action: { type: String, enum: ['submitted', 'approved', 'changes_requested', 'resubmitted', 'rejected'] },
    message: String,
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    performedByEmail: String,
    createdAt: { type: Date, default: Date.now }
  }],
  notes: String,
  notesHistory: { type: [noteSchema], default: [] },
  documents: { type: [attachmentSchema], default: [] },
  emails: { type: [emailSchema], default: [] },
  phones: { type: [phoneSchema], default: [] },
  addresses: { type: [addressSchema], default: [] },
  customFields: { type: [customFieldSchema], default: [] }
}, { timestamps: true });

vendorSchema.virtual('einTaxIdMasked').get(function() {
  return this.einTaxIdLast4 ? `***-**-${this.einTaxIdLast4}` : '';
});

vendorSchema.set('toJSON', { virtuals: true });
vendorSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Vendor', vendorSchema);
