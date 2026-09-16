const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
  viewPortfolio: { type: Boolean, default: true },
  requestService: { type: Boolean, default: false },
  approveEstimates: { type: Boolean, default: false },
  viewInvoices: { type: Boolean, default: false },
  makePayments: { type: Boolean, default: false },
  manageUsers: { type: Boolean, default: false },
  viewReports: { type: Boolean, default: false }
}, { _id: false });

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommercialOrganization', required: true, index: true },
  role: { type: String, enum: ['owner', 'organization_admin', 'billing_admin', 'operations_manager', 'viewer'], required: true },
  propertyAccess: { type: String, enum: ['all', 'selected'], default: 'selected' },
  permissions: { type: permissionSchema, default: () => ({}) },
  permissionMode: { type: String, enum: ['role_default', 'custom'], default: 'role_default' },
  status: { type: String, enum: ['active', 'revoked'], default: 'active', index: true },
  startsAt: { type: Date, default: Date.now },
  endsAt: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  revokedAt: Date
}, { timestamps: true });

schema.index({ userId: 1, organizationId: 1 }, { unique: true });
schema.index({ userId: 1, status: 1, startsAt: 1, endsAt: 1 });
schema.index({ organizationId: 1, status: 1, role: 1 });

module.exports = mongoose.model('CommercialMembership', schema);
