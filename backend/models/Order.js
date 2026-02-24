const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  customer: {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: String,
    address: String
  },
  service: { type: String, required: true },
  description: String,
  status: { 
    type: String, 
    enum: ['new', 'in-progress', 'completed', 'cancelled', 'delayed'], 
    default: 'new' 
  },
  amount: { type: Number, required: true },
  assignedEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  scheduledDate: Date,
  completedDate: Date,
  notes: String,
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);