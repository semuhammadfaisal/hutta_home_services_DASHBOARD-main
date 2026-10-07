const mongoose = require('mongoose');
const noteSchema = require('./noteSchema');
const attachmentSchema = require('./attachmentSchema');

const vendorAssignmentSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  service: { type: String, required: true, trim: true, maxlength: 500 },
  scope: { type: String, trim: true, maxlength: 10000 },
  scheduledStart: { type: Date, required: true },
  scheduledEnd: Date,
  timezone: { type: String, enum: ['America/Phoenix'], default: 'America/Phoenix' },
  accessInstructions: { type: String, trim: true, maxlength: 5000 },
  status: { type: String, enum: ['assigned', 'schedule_pending', 'schedule_changes_requested', 'scheduled', 'en_route', 'in_progress', 'completion_submitted', 'completed', 'cancelled'], default: 'assigned' },
  billingLane: { type: String, enum: ['smplfix_direct', 'owner_billed'], default: 'smplfix_direct' },
  jobScheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobSchedule' },
  vendorWorkOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorWorkOrder' },
  jobCompletionId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobCompletion' },
  vendorInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorInvoice' },
  completionRules: {
    requireServiceNotes: { type: Boolean, default: true },
    requireBeforePhotos: { type: Boolean, default: true },
    requireAfterPhotos: { type: Boolean, default: true }
  },
  statusHistory: [{ status: String, actorType: String, actorId: mongoose.Schema.Types.ObjectId, message: String, createdAt: { type: Date, default: Date.now } }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const customerRequestActionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['submitted', 'emergency_submitted', 'book_again', 'cancel_requested', 'reschedule_requested'],
    required: true
  },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requestedAt: { type: Date, default: Date.now },
  reason: { type: String, trim: true, maxlength: 1000 },
  preferredTiming: { type: String, trim: true, maxlength: 500 },
  previousOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' }
}, { _id: true });

const vendorComplianceOverrideSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  approvedAt: { type: Date, required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedByEmail: String,
  source: { type: String, enum: ['vendor_requirement_approval', 'outgoing_quote_override'], required: true },
  approvalId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorRequirementApproval' },
  requirements: { type: [String], default: [] },
  active: { type: Boolean, default: true }
}, { _id: true });

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  workOrderNumber: { type: String },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
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
  source: { type: String, enum: ['website', 'manual', 'residential_portal', 'agent_portal', 'commercial_portal'], default: 'manual' },
  intakeSubmissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntakeSubmission' },
  requestReference: { type: String },
  workflowStatus: { type: String, enum: ['request_received', 'quote_collection', 'vendor_selected', 'outgoing_quote_draft', 'quote_sent', 'quote_changes_requested', 'customer_approved', 'schedule_pending_vendor', 'schedule_changes_requested', 'scheduled', 'awaiting_customer_closeout', 'completed', 'closeout_issue_reported'], default: undefined },
  selectedIncomingQuoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'IncomingQuote' },
  currentOutgoingQuoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'OutgoingQuote' },
  approvedOutgoingQuoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'OutgoingQuote' },
  customerApprovedAt: Date,
  currentJobScheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobSchedule' },
  confirmedJobScheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobSchedule' },
  scheduledStart: Date,
  scheduledEnd: Date,
  scheduledTimezone: { type: String, enum: ['America/Phoenix'] },
  scheduleConfirmedAt: Date,
  jobCompletionId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobCompletion' },
  customerInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerInvoice' },
  satisfactionDecisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerSatisfactionDecision' },
  completedAt: Date,
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  satisfactionStatus: { type: String, enum: ['not_requested', 'pending', 'satisfied', 'issue_reported', 'issue_resolved'], default: 'not_requested' },
  satisfactionFollowupSentAt: Date,
  closeoutRequestedAt: Date,
  paymentProofSubmissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentProofSubmission' },
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
  customerIntake: {
    propertyType: String,
    preferredTiming: String,
    accessInstructions: String,
    completedAt: Date
  },
  residentialRequest: {
    serviceCategory: { type: String, trim: true, maxlength: 120 },
    issueChips: [{ type: String, trim: true, maxlength: 120 }],
    urgency: { type: String, enum: ['routine', 'soon', 'urgent', 'emergency'] },
    preferredTiming: { type: String, trim: true, maxlength: 500 },
    accessInstructions: { type: String, trim: true, maxlength: 1000 },
    targetCompletionDeadline: Date,
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'RealEstateTransaction' },
    submittedByRole: { type: String, enum: ['residential', 'real_estate_agent'] },
    isEmergency: { type: Boolean, default: false },
    emergencyDisclaimerAcceptedAt: Date,
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  commercialContext: {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommercialOrganization' },
    portfolioId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommercialPortfolio' },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommercialLocation' },
    serviceAgreementId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommercialServiceAgreement' },
    ownerCustomerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    billingContact: { name: String, email: String, phone: String },
    purchaseOrderNumber: { type: String, trim: true, maxlength: 120 },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  repeatedFromOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  portalSubmissionKey: { type: String, trim: true, maxlength: 260 },
  cancellationRequest: {
    status: { type: String, enum: ['pending', 'approved', 'declined'] },
    reason: { type: String, trim: true, maxlength: 1000 },
    requestedAt: Date,
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  rescheduleRequest: {
    status: { type: String, enum: ['pending', 'approved', 'declined'] },
    preferredTiming: { type: String, trim: true, maxlength: 500 },
    reason: { type: String, trim: true, maxlength: 1000 },
    requestedAt: Date,
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  customerRequestHistory: { type: [customerRequestActionSchema], default: [] },
  vendorCost: { type: Number, default: 0 },
  processingFee: { type: Number, default: 0 },
  profit: { type: Number, default: 0 },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
  vendorComplianceOverrides: { type: [vendorComplianceOverrideSchema], default: [] },
  vendorAssignments: { type: [vendorAssignmentSchema], default: [] },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  residentialStaffReview: { reviewedAt: Date, reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, scope: String },
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
orderSchema.index({ propertyId: 1, createdAt: -1 });
orderSchema.index({ employee: 1 });
orderSchema.index({ vendor: 1 });
orderSchema.index({ 'vendorAssignments.vendor': 1 });
orderSchema.index({ 'vendorAssignments.scheduledStart': 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ pipelineRecordId: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ scheduleDate: 1 });
orderSchema.index({ orderId: 1 });
orderSchema.index({ 'customer.email': 1 });
orderSchema.index({ requestReference: 1 }, { unique: true, sparse: true });
orderSchema.index({ intakeSubmissionId: 1 }, { unique: true, sparse: true });
orderSchema.index({ workflowStatus: 1, createdAt: -1 });
orderSchema.index({ selectedIncomingQuoteId: 1 }, { sparse: true });
orderSchema.index({ currentOutgoingQuoteId: 1 }, { sparse: true });
orderSchema.index({ approvedOutgoingQuoteId: 1 }, { sparse: true });
orderSchema.index({ currentJobScheduleId: 1 }, { sparse: true });
orderSchema.index({ confirmedJobScheduleId: 1 }, { sparse: true });
orderSchema.index({ jobCompletionId: 1 }, { unique: true, sparse: true });
orderSchema.index({ customerInvoiceId: 1 }, { unique: true, sparse: true });
orderSchema.index({ satisfactionDecisionId: 1 }, { unique: true, sparse: true });
orderSchema.index({ paymentProofSubmissionId: 1 }, { sparse: true });
orderSchema.index({ scheduledStart: 1 });
orderSchema.index({ source: 1, createdAt: -1 });
orderSchema.index({ portalSubmissionKey: 1 }, { unique: true, sparse: true });
orderSchema.index({ 'residentialRequest.transactionId': 1, createdAt: -1 });
orderSchema.index({ repeatedFromOrderId: 1 }, { sparse: true });
orderSchema.index({ 'commercialContext.organizationId': 1, propertyId: 1, createdAt: -1 });
orderSchema.index({ 'commercialContext.serviceAgreementId': 1, createdAt: -1 });
orderSchema.index({ 'commercialContext.purchaseOrderNumber': 1 }, { sparse: true });

module.exports = mongoose.model('Order', orderSchema);
