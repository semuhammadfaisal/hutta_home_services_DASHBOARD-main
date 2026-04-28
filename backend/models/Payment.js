const mongoose = require('mongoose');

const milestoneSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, min: 0 },
  dueDate: Date,
  receivedDate: Date,
  status: {
    type: String,
    enum: ['pending', 'received', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  notes: { type: String, trim: true }
}, { _id: true });

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
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  milestones: { type: [milestoneSchema], default: [] },
  employeePaymentAmount: { type: Number, default: 0 },
  employeePaymentStatus: { 
    type: String, 
    enum: ['pending', 'paid', 'cancelled'], 
    default: 'pending' 
  },
  employeePaymentDate: Date,
  employeePaymentMethod: { 
    type: String, 
    enum: ['cash', 'bank-transfer', 'check', 'online']
  },
  employeePaymentNotes: String,
  vendorPaymentAmount: { type: Number, default: 0 },
  vendorPaymentStatus: { 
    type: String, 
    enum: ['pending', 'paid', 'cancelled'], 
    default: 'pending' 
  },
  vendorPaymentDate: Date,
  vendorPaymentMethod: { 
    type: String, 
    enum: ['cash', 'bank-transfer', 'check', 'online']
  },
  vendorPaymentNotes: String
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);