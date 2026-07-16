const mongoose = require('mongoose');
const noteSchema = require('./noteSchema');
const attachmentSchema = require('./attachmentSchema');

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  workOrderNumber: { type: String },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customer: {
    name: { type: String, required: true },
    email: { type: String },
    phone: String,
    address: String
  },
  service: { type: String, required: true },
  amount: {
    type: Number,
    default: null,
    validate: {
      validator(value) {
        return this.pricingStatus === 'unquoted' ? value == null : Number.isFinite(value);
      },
      message: 'Amount is required for quoted orders'
    }
  },
  source: { type: String, enum: ['website', 'manual'], default: 'manual' },
  intakeSubmissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntakeSubmission' },
  requestReference: { type: String },
  workflowStatus: { type: String, enum: ['request_received'], default: undefined },
  pricingStatus: { type: String, enum: ['unquoted', 'quoted'], default: 'quoted' },
  missingData: {
    serviceCategory: { type: Boolean, default: false },
    serviceAddress: { type: Boolean, default: false }
  },
  requiresIntakeReview: { type: Boolean, default: false },
  submittedContact: {
    name: String,
    email: String,
    phone: String
  },
  vendorCost: { type: Number, default: 0 },
  processingFee: { type: Number, default: 0 },
  profit: { type: Number, default: 0 },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  startDate: { type: Date },
  scheduleDate: { type: Date },
  endDate: { type: Date },
  status: { type: String, default: 'new' },
  priority: { type: String, default: 'medium' },
  description: String,
  notes: String,
  notesHistory: { type: [noteSchema], default: [] },
  pipelineRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'PipelineRecord' },
  pipelineStage: { type: String }, // Store pipeline stage name directly for efficient KPI calculations
  // Recurring order fields
  orderType: { type: String, enum: ['one-time', 'recurring'], default: 'one-time' },
  recurringFrequency: { type: String, enum: ['weekly', 'bi-weekly', 'monthly', 'yearly', 'custom'] },
  recurringCustomDays: { type: Number },
  recurringEndDate: { type: Date },
  recurringNotes: String,
  documents: { type: [attachmentSchema], default: [] }
}, { timestamps: true });

orderSchema.index({ customerId: 1 });
orderSchema.index({ employee: 1 });
orderSchema.index({ vendor: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ pipelineRecordId: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ scheduleDate: 1 });
orderSchema.index({ orderId: 1 });
orderSchema.index({ 'customer.email': 1 });
orderSchema.index({ requestReference: 1 }, { unique: true, sparse: true });
orderSchema.index({ intakeSubmissionId: 1 }, { unique: true, sparse: true });
orderSchema.index({ workflowStatus: 1, createdAt: -1 });
orderSchema.index({ source: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
