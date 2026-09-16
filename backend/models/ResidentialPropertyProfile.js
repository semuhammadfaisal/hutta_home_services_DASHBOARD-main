const mongoose = require('mongoose');
const crypto = require('crypto');

const serviceSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true, maxlength: 60 },
  label: { type: String, required: true, trim: true, maxlength: 100 },
  enabled: { type: Boolean, default: false },
  frequencyMonths: { type: Number, min: 1, max: 60, default: 12 },
  nextDueAt: Date
}, { _id: false });

const passportDocumentSchema = new mongoose.Schema({
  documentId: { type: String, default: () => crypto.randomUUID() },
  category: { type: String, enum: ['warranty', 'permit', 'appliance', 'paint', 'filter', 'inspection', 'other'], default: 'other' },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  name: { type: String, required: true, trim: true, maxlength: 180 },
  type: { type: String, required: true },
  size: { type: Number, required: true, min: 1 },
  storageProvider: { type: String, enum: ['gridfs'], default: 'gridfs' },
  fileId: mongoose.Schema.Types.ObjectId,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  uploadedAt: { type: Date, default: Date.now },
  sensitive: { type: Boolean, default: true }
}, { _id: false });

const passportEntrySchema = new mongoose.Schema({
  entryId: { type: String, default: () => crypto.randomUUID() },
  category: { type: String, enum: ['appliance', 'paint', 'filter', 'warranty', 'permit', 'other'], default: 'other' },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  value: { type: String, required: true, trim: true, maxlength: 1000 },
  notes: { type: String, trim: true, maxlength: 2000 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const historySchema = new mongoose.Schema({
  action: { type: String, required: true, maxlength: 80 },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  summary: { type: String, maxlength: 500 },
  consentText: { type: String, maxlength: 1000 },
  occurredAt: { type: Date, default: Date.now }
}, { _id: false });

const residentialPropertyProfileSchema = new mongoose.Schema({
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, unique: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  autopilot: {
    enabled: { type: Boolean, default: false },
    autoApprovalEnabled: { type: Boolean, default: false },
    autoApprovalThreshold: { type: Number, min: 0, max: 10000, default: 0 },
    consentVersion: { type: String, default: '2026-09-04' },
    consentedAt: Date,
    consentedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    services: { type: [serviceSchema], default: () => [
      { key: 'hvac', label: 'HVAC tune-up', frequencyMonths: 6 },
      { key: 'roof', label: 'Roof and drainage check', frequencyMonths: 12 },
      { key: 'irrigation', label: 'Irrigation inspection', frequencyMonths: 6 },
      { key: 'water_heater', label: 'Water heater service', frequencyMonths: 12 },
      { key: 'pest', label: 'Pest prevention', frequencyMonths: 3 }
    ] }
  },
  passportEntries: { type: [passportEntrySchema], default: [] },
  passportDocuments: { type: [passportDocumentSchema], default: [] },
  history: { type: [historySchema], default: [] }
}, { timestamps: true });

residentialPropertyProfileSchema.index({ customerId: 1, propertyId: 1 });
module.exports = mongoose.model('ResidentialPropertyProfile', residentialPropertyProfileSchema);
