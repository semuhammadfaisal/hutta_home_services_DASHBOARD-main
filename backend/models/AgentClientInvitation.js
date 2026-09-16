const mongoose = require('mongoose');

const permissionsSchema = new mongoose.Schema({
  viewStatus: { type: Boolean, default: true },
  requestService: { type: Boolean, default: true },
  uploadInspection: { type: Boolean, default: true },
  viewDocuments: { type: Boolean, default: true },
  message: { type: Boolean, default: true }
}, { _id: false });

const proposedPropertySchema = new mongoose.Schema({
  label: { type: String, trim: true, maxlength: 120 },
  addressLine1: { type: String, trim: true, maxlength: 240 },
  addressLine2: { type: String, trim: true, maxlength: 240 },
  city: { type: String, trim: true, maxlength: 120 },
  state: { type: String, trim: true, maxlength: 80, default: 'AZ' },
  postalCode: { type: String, trim: true, maxlength: 24 },
  propertyType: { type: String, trim: true, maxlength: 80 }
}, { _id: false });

const eventSchema = new mongoose.Schema({
  action: { type: String, enum: ['created', 'sent', 'viewed', 'accepted', 'expired', 'revoked', 'delivery_failed'], required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  occurredAt: { type: Date, default: Date.now },
  reason: { type: String, trim: true, maxlength: 1000 }
}, { _id: false });

const consentSchema = new mongoose.Schema({
  version: { type: String, required: true },
  text: { type: String, required: true },
  typedName: { type: String, required: true, trim: true, maxlength: 160 },
  propertyConfirmed: { type: Boolean, required: true },
  permissions: { type: permissionsSchema, required: true },
  acceptedAt: { type: Date, required: true },
  ipAddress: { type: String, select: false }
}, { _id: false });

const agentClientInvitationSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, select: false },
  agentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  homeownerEmail: { type: String, required: true, lowercase: true, trim: true, maxlength: 254, index: true },
  homeownerName: { type: String, trim: true, maxlength: 160 },
  existingCustomerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  existingPropertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
  proposedProperty: proposedPropertySchema,
  propertyFingerprint: { type: String, required: true, maxlength: 700 },
  transactionLabel: { type: String, required: true, trim: true, maxlength: 180 },
  closeDate: { type: Date, required: true },
  accessRule: { type: String, enum: ['at_close', 'close_plus_days'], default: 'at_close' },
  graceDays: { type: Number, min: 0, max: 30, default: 0 },
  accessEndsAt: { type: Date, required: true },
  permissions: { type: permissionsSchema, default: () => ({}) },
  status: { type: String, enum: ['pending', 'processing', 'accepted', 'expired', 'revoked'], default: 'pending', index: true },
  expiresAt: { type: Date, required: true, index: true },
  deliveryStatus: { type: String, enum: ['copy_only', 'pending', 'sent', 'failed'], default: 'copy_only' },
  sentAt: Date,
  deliveryError: { type: String, select: false, maxlength: 1000 },
  acceptedAt: Date,
  acceptedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  acceptedCustomerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  acceptedPropertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'RealEstateTransaction' },
  consent: consentSchema,
  revokedAt: Date,
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  revocationReason: { type: String, trim: true, maxlength: 1000 },
  history: { type: [eventSchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

agentClientInvitationSchema.index({ agentUserId: 1, status: 1, createdAt: -1 });
agentClientInvitationSchema.index({ agentUserId: 1, homeownerEmail: 1, propertyFingerprint: 1, status: 1 });
agentClientInvitationSchema.index(
  { agentUserId: 1, homeownerEmail: 1, propertyFingerprint: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' }, name: 'one_pending_agent_homeowner_property_invitation' }
);
module.exports = mongoose.model('AgentClientInvitation', agentClientInvitationSchema);
