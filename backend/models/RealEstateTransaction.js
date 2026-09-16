const mongoose = require('mongoose');
const attachmentSchema = require('./attachmentSchema');

const permissionSchema = new mongoose.Schema({
  viewStatus: { type: Boolean, default: true },
  requestService: { type: Boolean, default: true },
  uploadInspection: { type: Boolean, default: true },
  viewDocuments: { type: Boolean, default: true },
  message: { type: Boolean, default: true }
}, { _id: false });

const accessHistorySchema = new mongoose.Schema({
  action: { type: String, enum: ['created', 'invited', 'accepted', 'extended', 'revoked', 'expired'], required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  previousEndsAt: Date,
  newEndsAt: Date,
  reason: { type: String, trim: true, maxlength: 1000 },
  occurredAt: { type: Date, default: Date.now }
}, { _id: false });

const realEstateTransactionSchema = new mongoose.Schema({
  agentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  label: { type: String, required: true, trim: true, maxlength: 180 },
  closeDate: { type: Date, required: true, index: true },
  accessRule: { type: String, enum: ['at_close', 'close_plus_days'], default: 'at_close' },
  graceDays: { type: Number, min: 0, max: 30, default: 0 },
  accessEndsAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ['invited', 'active', 'closed', 'revoked'], default: 'invited', index: true },
  permissions: { type: permissionSchema, default: () => ({}) },
  documents: { type: [attachmentSchema], default: [] },
  acceptedAt: Date,
  revokedAt: Date,
  extendedAt: Date,
  accessHistory: { type: [accessHistorySchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

realEstateTransactionSchema.index({ agentUserId: 1, status: 1, accessEndsAt: 1 });
realEstateTransactionSchema.index({ agentUserId: 1, propertyId: 1, createdAt: -1 });
module.exports = mongoose.model('RealEstateTransaction', realEstateTransactionSchema);
