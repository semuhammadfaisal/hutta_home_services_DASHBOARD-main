const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({ action: { type: String, required: true }, actorId: mongoose.Schema.Types.ObjectId, reason: String, occurredAt: { type: Date, default: Date.now } }, { _id: false });
const schema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, select: false },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommercialOrganization', required: true, index: true },
  scopeType: { type: String, enum: ['organization', 'portfolio', 'property'], required: true },
  scopeId: { type: mongoose.Schema.Types.ObjectId, required: true },
  scopeKey: { type: String, required: true, index: true },
  role: { type: String, required: true, maxlength: 40 },
  permissions: { view: Boolean, requestService: Boolean, approveEstimates: Boolean, viewInvoices: Boolean, makePayments: Boolean, viewReports: Boolean, manageUsers: Boolean },
  status: { type: String, enum: ['pending', 'processing', 'accepted', 'expired', 'revoked'], default: 'pending', index: true },
  expiresAt: { type: Date, required: true, index: true }, acceptedAt: Date, acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, revokedAt: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  history: { type: [historySchema], default: [] }
}, { timestamps: true });
schema.index({ organizationId: 1, email: 1, scopeKey: 1, status: 1 });
schema.index({ organizationId: 1, status: 1, createdAt: -1 });
module.exports = mongoose.model('CommercialUserInvitation', schema);
