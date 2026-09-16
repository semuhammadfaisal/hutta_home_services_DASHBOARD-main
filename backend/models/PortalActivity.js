const mongoose = require('mongoose');

const portalActivitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', index: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
  type: { type: String, required: true, trim: true, maxlength: 80 },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  summary: { type: String, trim: true, maxlength: 1000 },
  occurredAt: { type: Date, default: Date.now, index: true },
  metadata: { type: mongoose.Schema.Types.Mixed, select: false }
}, { timestamps: true });

portalActivitySchema.index({ propertyId: 1, occurredAt: -1 });
portalActivitySchema.index({ customerId: 1, occurredAt: -1 });
portalActivitySchema.index({ userId: 1, occurredAt: -1 });

module.exports = mongoose.model('PortalActivity', portalActivitySchema);
