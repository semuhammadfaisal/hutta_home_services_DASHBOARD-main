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

const serviceAreaSchema = new mongoose.Schema({
  basePostalCode: { type: String, trim: true, maxlength: 20 },
  radiusMiles: { type: Number, min: 0, max: 500 },
  counties: { type: [String], default: [] },
  postalCodes: { type: [String], default: [] }
}, { _id: false });

const vendorPortalStatusValues = ['pending', 'compliance_incomplete', 'under_review', 'approved_active', 'rejected', 'suspended'];

const vendorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: String,
  phone: String,
  address: String,
  legalBusinessName: String,
  businessEntityType: String,
  primaryOwnerName: String,
  businessAddress: String,
  tradeClassifications: { type: [String], default: [] },
  serviceArea: { type: serviceAreaSchema, default: () => ({}) },
  licensedTrade: { type: Boolean, default: false },
  einTaxId: { type: String, select: false },
  einTaxIdEncrypted: { type: String, select: false },
  einTaxIdIv: { type: String, select: false },
  einTaxIdTag: { type: String, select: false },
  einTaxIdLast4: String,
  huttasContractSigned: { type: Boolean, default: false },
  huttasContractSignedDate: Date,
  agreementAudit: {
    version: { type: String, trim: true, maxlength: 80 },
    signerName: { type: String, trim: true, maxlength: 160 },
    signerTitle: { type: String, trim: true, maxlength: 120 },
    acceptedAt: Date,
    ipAddress: { type: String, select: false },
    userAgent: { type: String, select: false },
    documentId: String
  },
  w9OnFile: { type: Boolean, default: false },
  w9Date: Date,
  w9Profile: {
    federalTaxClassification: { type: String, trim: true, maxlength: 100 },
    legalName: { type: String, trim: true, maxlength: 200 },
    businessName: { type: String, trim: true, maxlength: 200 },
    signedBy: { type: String, trim: true, maxlength: 160 },
    signedAt: Date,
    documentId: String
  },
  contractorLicenseNumber: String,
  rocLicenseNumber: String,
  rocLicenseTypeClassification: String,
  rocLicenseExpirationDate: Date,
  certificateOfInsuranceOnFile: { type: Boolean, default: false },
  insuranceExpirationDate: Date,
  workersCompInsuranceOnFile: { type: Boolean, default: false },
  huttasAdditionalInsured: { type: Boolean, default: false },
  coiProfile: {
    carrier: { type: String, trim: true, maxlength: 160 },
    policyNumber: { type: String, trim: true, maxlength: 100 },
    generalLiabilityPerOccurrence: { type: Number, min: 0 },
    generalLiabilityAggregate: { type: Number, min: 0 },
    effectiveDate: Date,
    expirationDate: Date,
    additionalInsuredConfirmedAt: Date,
    documentId: String
  },
  workersCompProfile: {
    required: { type: Boolean, default: true },
    exemptionReason: { type: String, trim: true, maxlength: 500 },
    carrier: { type: String, trim: true, maxlength: 160 },
    policyNumber: { type: String, trim: true, maxlength: 100 },
    effectiveDate: Date,
    expirationDate: Date,
    documentId: String
  },
  stripeConnect: {
    accountId: { type: String, select: false },
    detailsSubmitted: { type: Boolean, default: false },
    chargesEnabled: { type: Boolean, default: false },
    payoutsEnabled: { type: Boolean, default: false },
    lastCheckedAt: Date
  },
  rocVerification: {
    provider: { type: String, trim: true, maxlength: 80 },
    status: { type: String, enum: ['not_requested', 'not_configured', 'pending', 'verified', 'mismatch', 'error'], default: 'not_requested' },
    checkedAt: Date,
    matchedEntityName: String,
    matchedClassification: String,
    matchedLicenseStatus: String,
    matchedExpirationDate: Date,
    mismatchReasons: { type: [String], default: [] },
    staffReviewRequired: { type: Boolean, default: false }
  },
  category: { 
    type: String, 
    required: true 
  },
  rating: { type: Number, min: 1, max: 5, default: 5 },
  leadDistribution: {
    paused: { type: Boolean, default: false },
    performanceScore: { type: Number, min: 0, max: 100, default: 100 },
    minimumLeadRatingOverride: { type: Number, min: 1, max: 5 }
  },
  isActive: { type: Boolean, default: true },
  onboardingSource: { type: String, enum: ['manual', 'invitation', 'self_signup'], default: 'manual', index: true },
  onboardingStatus: {
    type: String,
    enum: ['approved', 'pending_review', 'changes_requested', 'rejected'],
    default: 'approved',
    index: true
  },
  portalStatus: { type: String, enum: vendorPortalStatusValues, default: function() { return this.onboardingSource === 'manual' && this.onboardingStatus === 'approved' ? 'approved_active' : 'pending'; }, index: true },
  portalStatusReason: { type: String, trim: true, maxlength: 1000 },
  portalStatusUpdatedAt: Date,
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

vendorSchema.index({ portalStatus: 1, updatedAt: -1 });
vendorSchema.index({ rocLicenseNumber: 1 }, { sparse: true });

vendorSchema.pre('validate', function(next) {
  if (this.licensedTrade && !String(this.rocLicenseNumber || '').trim()) {
    this.invalidate('rocLicenseNumber', 'ROC license number is required for licensed trades');
  }
  const coiStart = this.coiProfile?.effectiveDate;
  const coiEnd = this.coiProfile?.expirationDate;
  if (coiStart && coiEnd && coiEnd <= coiStart) this.invalidate('coiProfile.expirationDate', 'COI expiration must be after its effective date');
  const wcStart = this.workersCompProfile?.effectiveDate;
  const wcEnd = this.workersCompProfile?.expirationDate;
  if (wcStart && wcEnd && wcEnd <= wcStart) this.invalidate('workersCompProfile.expirationDate', 'Workers compensation expiration must be after its effective date');
  next();
});

vendorSchema.set('toJSON', { virtuals: true });
vendorSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Vendor', vendorSchema);
module.exports.PORTAL_STATUSES = vendorPortalStatusValues;
