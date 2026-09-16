const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  assignmentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, immutable: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true, immutable: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true, immutable: true },
  senderType: { type: String, enum: ['vendor', 'staff'], required: true, immutable: true },
  senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  body: { type: String, required: true, trim: true, minlength: 1, maxlength: 3000 },
  status: { type: String, enum: ['sent', 'hidden'], default: 'sent', index: true }
}, { timestamps: true });

schema.index({ assignmentId: 1, vendorId: 1, createdAt: 1 });

module.exports = mongoose.model('VendorAssignmentMessage', schema);
