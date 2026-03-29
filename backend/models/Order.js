const mongoose = require('mongoose');

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
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  status: { type: String, default: 'new' },
  priority: { type: String, default: 'medium' },
  description: String,
  notes: String,
  pipelineRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'PipelineRecord' },
  pipelineStage: { type: String } // Store pipeline stage name directly for efficient KPI calculations
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);