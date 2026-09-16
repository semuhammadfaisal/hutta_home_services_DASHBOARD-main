const mongoose = require('mongoose');

const residentialMessageSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  senderType: { type: String, enum: ['client', 'agent', 'vendor', 'staff'], required: true },
  body: { type: String, required: true, trim: true, minlength: 1, maxlength: 3000 },
  status: { type: String, enum: ['sent', 'hidden'], default: 'sent' }
}, { timestamps: true });

residentialMessageSchema.index({ orderId: 1, createdAt: 1 });
module.exports = mongoose.model('ResidentialMessage', residentialMessageSchema);
