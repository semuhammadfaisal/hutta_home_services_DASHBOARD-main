const mongoose = require('mongoose');
const attachmentSchema = require('./attachmentSchema');

const vendorSnapshotSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  contractorLicenseNumber: String,
  rocLicenseNumber: String,
  rocLicenseTypeClassification: String,
  rocLicenseExpirationDate: Date,
  certificateOfInsuranceOnFile: Boolean,
  insuranceExpirationDate: Date,
  complianceStatus: { type: String, enum: ['current', 'expiring', 'expired', 'missing'] },
  complianceWarnings: { type: [String], default: [] }
}, { _id: false });

const historySchema = new mongoose.Schema({
  action: { type: String, required: true },
  actorType: { type: String, enum: ['staff', 'vendor', 'system'], default: 'system' },
  actorId: mongoose.Schema.Types.ObjectId,
  actorEmail: String,
  message: String,
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const incomingQuoteSchema = new mongoose.Schema({
  quoteReference: { type: String, required: true, unique: true, index: true },
  quoteChainId: { type: String, required: true, index: true },
  revisionNumber: { type: Number, required: true, min: 1, default: 1 },
  previousVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IncomingQuote' },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  source: { type: String, enum: ['staff', 'vendor'], required: true },
  status: {
    type: String,
    enum: ['draft', 'submitted', 'selected', 'not_selected', 'superseded', 'withdrawn'],
    default: 'draft',
    index: true
  },
  scopeOfWork: { type: String, trim: true, maxlength: 10000 },
  laborAmount: { type: Number, min: 0, default: 0 },
  materialsAmount: { type: Number, min: 0, default: 0 },
  total: { type: Number, min: 0, default: 0 },
  estimatedDuration: {
    value: { type: Number, min: 0 },
    unit: { type: String, enum: ['hours', 'days', 'weeks'] }
  },
  earliestAvailableDate: Date,
  siteAccessRequired: Boolean,
  accessNotes: { type: String, trim: true, maxlength: 3000 },
  exclusionsConditions: { type: String, trim: true, maxlength: 10000 },
  vendorSnapshot: vendorSnapshotSchema,
  complianceWarningAcknowledged: { type: Boolean, default: false },
  complianceWarningAcknowledgedAt: Date,
  complianceWarningAcknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  submittedAt: Date,
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  selectedAt: Date,
  selectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  supersededAt: Date,
  supersededBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  documents: { type: [attachmentSchema], default: [] },
  history: { type: [historySchema], default: [] }
}, { timestamps: true });

incomingQuoteSchema.index({ orderId: 1, vendorId: 1, revisionNumber: -1 });
incomingQuoteSchema.index({ orderId: 1, status: 1 });
incomingQuoteSchema.index(
  { orderId: 1 },
  { unique: true, partialFilterExpression: { status: 'selected' }, name: 'one_selected_quote_per_order' }
);

incomingQuoteSchema.pre('validate', function setCalculatedTotal(next) {
  this.total = Number(this.laborAmount || 0) + Number(this.materialsAmount || 0);
  next();
});

module.exports = mongoose.model('IncomingQuote', incomingQuoteSchema);
