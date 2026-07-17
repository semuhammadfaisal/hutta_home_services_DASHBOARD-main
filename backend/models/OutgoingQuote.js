const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
  action: { type: String, required: true },
  actorId: mongoose.Schema.Types.ObjectId,
  actorEmail: String,
  message: String,
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const outgoingQuoteSchema = new mongoose.Schema({
  quoteReference: { type: String, required: true, unique: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  incomingQuoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'IncomingQuote', required: true },
  revisionNumber: { type: Number, required: true, min: 1, default: 1 },
  previousVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'OutgoingQuote' },
  status: { type: String, enum: ['draft', 'sent', 'superseded', 'voided'], default: 'draft', index: true },
  customerSnapshot: {
    name: String,
    email: String,
    phone: String,
    address: String
  },
  jobSnapshot: {
    requestReference: String,
    orderReference: String,
    service: String,
    description: String
  },
  vendorSnapshot: {
    companyName: String,
    licensedContractorName: String,
    contractorLicenseNumber: String,
    licenseType: String,
    rocNumber: String,
    rocLicenseExpirationDate: Date,
    coiOnFile: Boolean,
    insuranceExpirationDate: Date
  },
  scopeOfWork: { type: String, trim: true, maxlength: 10000 },
  estimatedDuration: {
    value: { type: Number, min: 0 },
    unit: { type: String, enum: ['hours', 'days', 'weeks'] }
  },
  earliestAvailableDate: Date,
  siteAccessRequired: Boolean,
  accessNotes: { type: String, trim: true, maxlength: 3000 },
  exclusionsConditions: { type: String, trim: true, maxlength: 10000 },
  vendorCost: { type: Number, min: 0, required: true },
  markupType: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
  markupValue: { type: Number, min: 0, default: 20 },
  markupAmount: { type: Number, min: 0, default: 0 },
  customerTotal: { type: Number, min: 0, default: 0 },
  termsAndConditions: { type: String, trim: true, maxlength: 30000 },
  legalDisclosure: { type: String, trim: true, maxlength: 5000 },
  validUntil: { type: Date, required: true },
  publicTokenHash: { type: String, select: false },
  deliveryStatus: { type: String, enum: ['not_sent', 'pending', 'sent', 'retry_scheduled', 'permanently_failed'], default: 'not_sent' },
  customerDecisionStatus: { type: String, enum: ['not_requested', 'pending', 'approved', 'changes_requested'], default: 'not_requested', index: true },
  sentAt: Date,
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  supersededAt: Date,
  supersededBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  voidedAt: Date,
  voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  history: { type: [historySchema], default: [] }
}, { timestamps: true });

outgoingQuoteSchema.index({ orderId: 1, revisionNumber: 1 }, { unique: true });
outgoingQuoteSchema.index({ publicTokenHash: 1 }, { unique: true, sparse: true });
outgoingQuoteSchema.index({ customerDecisionStatus: 1, sentAt: -1 });
outgoingQuoteSchema.index(
  { orderId: 1 },
  { unique: true, partialFilterExpression: { status: 'draft' }, name: 'one_outgoing_draft_per_order' }
);

module.exports = mongoose.model('OutgoingQuote', outgoingQuoteSchema);
