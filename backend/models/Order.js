const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  type: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedAt: { type: Date, default: Date.now }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  workOrderNumber: { type: String },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customer: {
    name: { type: String, required: true },
    email: { type: String },
    phone: String,
    address: String
  },
  service: { type: String, required: true },
  amount: { type: Number, required: true },
  vendorCost: { type: Number, default: 0 },
  processingFee: { type: Number, default: 0 },
  profit: { type: Number, default: 0 },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  startDate: { type: Date },
  scheduleDate: { type: Date },
  endDate: { type: Date },
  status: { type: String, default: 'new' },
  priority: { type: String, default: 'medium' },
  description: String,
  notes: String,
  pipelineRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'PipelineRecord' },
  pipelineStage: { type: String }, // Store pipeline stage name directly for efficient KPI calculations
  // Recurring order fields
  orderType: { type: String, enum: ['one-time', 'recurring'], default: 'one-time' },
  recurringFrequency: { type: String, enum: ['weekly', 'bi-weekly', 'monthly', 'yearly', 'custom'] },
  recurringCustomDays: { type: Number },
  recurringEndDate: { type: Date },
  recurringNotes: String,
  documents: { type: [documentSchema], default: [] }
}, { timestamps: true });

orderSchema.index({ customerId: 1 });
orderSchema.index({ employee: 1 });
orderSchema.index({ vendor: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ pipelineRecordId: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ scheduleDate: 1 });
orderSchema.index({ orderId: 1 });
orderSchema.index({ 'customer.email': 1 });

module.exports = mongoose.model('Order', orderSchema);
