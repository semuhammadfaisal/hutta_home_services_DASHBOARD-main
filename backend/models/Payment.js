const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  paymentId: { type: String, required: true, unique: true },
  invoiceNumber: { type: String },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  amount: { type: Number, required: true },
  paymentMethod: { 
    type: String, 
    enum: ['cash', 'credit-card', 'debit-card', 'bank-transfer', 'check', 'online']
  },
  status: { 
    type: String, 
    enum: ['pending', 'received', 'completed', 'failed', 'refunded', 'cancelled'], 
    default: 'pending' 
  },
  transactionId: String,
  paymentDate: Date,
  dueDate: Date,
  description: String,
  notes: String,
  receiptNumber: String,
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);