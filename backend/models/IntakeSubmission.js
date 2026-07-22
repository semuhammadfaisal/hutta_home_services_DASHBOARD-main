const mongoose = require('mongoose');

const deliveryStateSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['pending', 'sent', 'retry_scheduled', 'permanently_failed', 'skipped'],
    default: 'pending'
  },
  attempts: { type: Number, default: 0 },
  lastAttemptAt: Date,
  sentAt: Date,
  lastErrorCategory: String
}, { _id: false });

const intakeSubmissionSchema = new mongoose.Schema({
  requestReference: { type: String, required: true, unique: true },
  externalSubmissionId: { type: String, required: true, unique: true, trim: true },
  source: { type: String, enum: ['huttas_website'], default: 'huttas_website' },
  submittedAt: { type: Date, required: true },
  receivedAt: { type: Date, default: Date.now },
  normalizedCustomer: {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true }
  },
  formSnapshot: {
    name: String,
    email: String,
    phone: String,
    serviceDetails: String
  },
  marketingSmsConsent: { type: Boolean, default: false },
  marketingSmsConsentAt: Date,
  status: {
    type: String,
    enum: ['processing', 'completed', 'review_required', 'failed'],
    default: 'processing'
  },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  customerMatchCount: { type: Number, default: 0 },
  matchingCustomerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }],
  customerMatchReason: String,
  requiresReview: { type: Boolean, default: false },
  reviewResolvedAt: Date,
  reviewResolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  completionStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed'],
    default: 'pending'
  },
  completionTokenHash: { type: String, select: false },
  completionTokenExpiresAt: Date,
  completionStartedAt: Date,
  completedAt: Date,
  completionEmailCount: { type: Number, default: 0 },
  completionSnapshot: {
    serviceCategory: String,
    serviceAddress: String,
    serviceDetails: String,
    propertyType: String,
    preferredTiming: String,
    accessInstructions: String,
    submittedAt: Date,
    documentCount: { type: Number, default: 0 }
  },
  customerConfirmation: { type: deliveryStateSchema, default: () => ({}) },
  operationsAlert: { type: deliveryStateSchema, default: () => ({}) }
}, { timestamps: true });

intakeSubmissionSchema.index({ status: 1, receivedAt: -1 });
intakeSubmissionSchema.index({ orderId: 1 });
intakeSubmissionSchema.index({ 'normalizedCustomer.email': 1 });
intakeSubmissionSchema.index({ completionTokenHash: 1 }, { unique: true, sparse: true });
intakeSubmissionSchema.index({ completionStatus: 1, completionTokenExpiresAt: 1 });

module.exports = mongoose.model('IntakeSubmission', intakeSubmissionSchema);
