const mongoose = require('mongoose');
const attachmentSchema = require('./attachmentSchema');

const appointmentSchema = new mongoose.Schema({
  scheduledStart: { type: Date, required: true },
  scheduledEnd: { type: Date, required: true },
  timezone: { type: String, enum: ['America/Phoenix'], default: 'America/Phoenix' },
  status: { type: String, enum: ['proposed', 'confirmed', 'completed', 'cancelled'], default: 'proposed' },
  publicNote: { type: String, trim: true, maxlength: 1000 }
}, { timestamps: true });

const commercialWarrantyClaimSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommercialOrganization', required: true, index: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true },
  vendorSnapshot: {
    name: { type: String, trim: true, maxlength: 180 },
    rocNumber: { type: String, trim: true, maxlength: 80 }
  },
  claimReference: { type: String, required: true, unique: true, trim: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  summary: { type: String, trim: true, maxlength: 2000 },
  status: { type: String, enum: ['submitted', 'under_review', 'information_requested', 'approved', 'scheduled', 'work_in_progress', 'resolved', 'denied', 'cancelled'], default: 'submitted', index: true },
  completionDate: Date,
  coverage: {
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    description: { type: String, trim: true, maxlength: 1000 }
  },
  documents: { type: [attachmentSchema], default: [] },
  appointments: { type: [appointmentSchema], default: [] },
  resolution: {
    summary: { type: String, trim: true, maxlength: 2000 },
    outcome: { type: String, enum: ['repaired', 'replaced', 'credit_issued', 'not_covered', 'withdrawn'] },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: Date
  },
  openedAt: { type: Date, default: Date.now },
  resolvedAt: Date
}, { timestamps: true });

commercialWarrantyClaimSchema.index({ organizationId: 1, propertyId: 1, openedAt: -1 });
commercialWarrantyClaimSchema.index({ organizationId: 1, status: 1, 'coverage.endsAt': 1 });
commercialWarrantyClaimSchema.index({ orderId: 1, status: 1 });

commercialWarrantyClaimSchema.pre('validate', function validateCoverage(next) {
  if (this.coverage?.startsAt && this.coverage?.endsAt && this.coverage.endsAt < this.coverage.startsAt) return next(new Error('Warranty coverage end must be after its start'));
  for (const appointment of this.appointments || []) if (appointment.scheduledEnd <= appointment.scheduledStart) return next(new Error('Warranty appointment end must be after its start'));
  if (this.status === 'resolved' && !(this.resolution?.resolvedAt || this.resolvedAt)) return next(new Error('Resolved warranty claims require resolution details'));
  next();
});

module.exports = mongoose.model('CommercialWarrantyClaim', commercialWarrantyClaimSchema);
