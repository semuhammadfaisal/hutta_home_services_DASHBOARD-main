const mongoose = require('mongoose');
const noteSchema = require('./noteSchema');

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
  source: { type: String, enum: ['manual', 'stage6_invoice'], default: 'manual' },
  customerInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerInvoice' },
  jobCompletionId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobCompletion' },
  outgoingQuoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'OutgoingQuote' },
  invoiceIssuedAt: Date,
  paymentProofSubmissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentProofSubmission' },
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
    enum: ['bidding', 'pending', 'received', 'completed', 'failed', 'refunded', 'cancelled'], 
    default: 'pending' 
  },
  transactionId: String,
  paymentDate: Date,
  dueDate: Date,
  description: String,
  notes: String,
  notesHistory: { type: [noteSchema], default: [] },
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

paymentSchema.index({ order: 1 });
paymentSchema.index({ customer: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ paymentDate: -1 });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ employeePaymentStatus: 1 });
paymentSchema.index({ vendorPaymentStatus: 1 });
paymentSchema.index({ customerInvoiceId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ jobCompletionId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ order: 1 }, { unique: true, partialFilterExpression: { source: 'stage6_invoice' }, name: 'one_stage6_invoice_payment_per_order' });

module.exports = mongoose.model('Payment', paymentSchema);
