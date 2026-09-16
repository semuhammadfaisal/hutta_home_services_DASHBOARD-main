const mongoose = require('mongoose');

function agentCannotReceive(value) {
  const membership = typeof this.ownerDocument === 'function' ? this.ownerDocument() : this;
  return membership?.relationship !== 'agent' || value === false;
}

const permissionsSchema = new mongoose.Schema({
  view: { type: Boolean, default: true },
  requestService: { type: Boolean, default: true },
  approveEstimates: { type: Boolean, default: true, validate: { validator: agentCannotReceive, message: 'Agents cannot approve estimates' } },
  manageBilling: { type: Boolean, default: true, validate: { validator: agentCannotReceive, message: 'Agents cannot manage billing' } },
  manageProperty: { type: Boolean, default: true, validate: { validator: agentCannotReceive, message: 'Agents cannot manage property ownership' } }
}, { _id: false });

const propertyMembershipSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  relationship: { type: String, enum: ['owner', 'household_member', 'agent'], default: 'owner' },
  permissions: { type: permissionsSchema, default: () => ({}) },
  status: { type: String, enum: ['active', 'revoked'], default: 'active', index: true },
  startsAt: { type: Date, default: Date.now },
  endsAt: { type: Date, required() { return this.relationship === 'agent'; } },
  revokedAt: Date,
  sourceTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'RealEstateTransaction', required() { return this.relationship === 'agent'; } },
  accessApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  accessExtendedAt: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

propertyMembershipSchema.index({ userId: 1, propertyId: 1 }, { unique: true });
propertyMembershipSchema.index({ userId: 1, status: 1, startsAt: 1, endsAt: 1 });
propertyMembershipSchema.index({ customerId: 1, propertyId: 1 });

propertyMembershipSchema.pre('validate', function enforceAgentBoundary(next) {
  if (this.relationship === 'agent') {
    this.permissions.approveEstimates = false;
    this.permissions.manageBilling = false;
    this.permissions.manageProperty = false;
  }
  next();
});

propertyMembershipSchema.statics.activeForUser = function activeForUser(userId, now = new Date()) {
  return this.find({
    userId,
    status: 'active',
    'permissions.view': true,
    startsAt: { $lte: now },
    $or: [{ endsAt: { $exists: false } }, { endsAt: null }, { endsAt: { $gt: now } }]
  });
};

module.exports = mongoose.model('PropertyMembership', propertyMembershipSchema);
