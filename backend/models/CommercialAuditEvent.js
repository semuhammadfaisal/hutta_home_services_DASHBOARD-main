const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommercialOrganization', required: true, index: true },
  portfolioId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommercialPortfolio', index: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
  actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  subjectUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action: { type: String, required: true, trim: true, maxlength: 100 },
  summary: { type: String, required: true, trim: true, maxlength: 500 },
  metadata: { type: mongoose.Schema.Types.Mixed, select: false }
}, { timestamps: true });
schema.index({ organizationId: 1, createdAt: -1 });
module.exports = mongoose.model('CommercialAuditEvent', schema);
