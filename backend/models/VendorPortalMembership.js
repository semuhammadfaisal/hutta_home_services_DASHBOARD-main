const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true, unique: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, immutable: true, index: true },
  role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
  permissions: {
    profile: { type: Boolean, default: false },
    compliance: { type: Boolean, default: false },
    team: { type: Boolean, default: false },
    assignments: { type: Boolean, default: true },
    invoices: { type: Boolean, default: false }
  },
  status: { type: String, enum: ['active', 'revoked'], default: 'active', index: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  revokedAt: Date,
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

schema.index({ vendorId: 1, status: 1, createdAt: 1 });

module.exports = mongoose.model('VendorPortalMembership', schema);
