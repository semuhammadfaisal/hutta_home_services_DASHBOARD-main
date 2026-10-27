const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
  action: { type: String, required: true, trim: true, maxlength: 80 },
  actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  note: { type: String, trim: true, maxlength: 1000 },
  occurredAt: { type: Date, default: Date.now }
}, { _id: false });

const schema = new mongoose.Schema({
  requestReference: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 40 },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommercialOrganization', required: true, index: true },
  activeKey: { type: String, unique: true, sparse: true, select: false },
  status: { type: String, enum: ['pending', 'processing', 'completed', 'rejected'], default: 'pending', index: true },
  requestedAt: { type: Date, default: Date.now, index: true },
  reviewedAt: Date,
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  portfolioId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommercialPortfolio' },
  propertyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Property' }],
  notes: { type: String, trim: true, maxlength: 1000 },
  rejectionReason: { type: String, trim: true, maxlength: 1000 },
  history: { type: [historySchema], default: [] }
}, { timestamps: true });

schema.index({ status: 1, requestedAt: -1 });
schema.index({ organizationId: 1, requestedAt: -1 });

module.exports = mongoose.model('CommercialSetupRequest', schema);
