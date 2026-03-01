const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  customer: {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: String,
    address: String
  },
  service: { type: String, required: true },
  amount: { type: Number, required: true },
  vendorCost: { type: Number, default: 0 },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  status: { type: String, default: 'new' },
  priority: { type: String, default: 'medium' },
  description: String,
  notes: String
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);