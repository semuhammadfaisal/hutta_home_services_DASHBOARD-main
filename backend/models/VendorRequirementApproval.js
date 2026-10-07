const mongoose = require('mongoose');

const issueSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  vendorName: { type: String, required: true, trim: true, maxlength: 200 },
  requirements: { type: [String], default: [] }
}, { _id: false });

const vendorRequirementApprovalSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  action: { type: String, enum: ['quote_invitation', 'lead_distribution'], required: true },
  workspace: { type: String, enum: ['service-requests', 'workflow-center'], default: 'workflow-center' },
  vendorIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' }], required: true },
  issues: { type: [issueSchema], default: [] },
  actionPayload: { type: mongoose.Schema.Types.Mixed, required: true },
  payloadHash: { type: String, required: true, maxlength: 64 },
  idempotencyKey: { type: String, trim: true, maxlength: 120 },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'executed', 'cancelled'], default: 'pending', index: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requestedByEmail: { type: String, trim: true, lowercase: true, maxlength: 320 },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  reviewNote: { type: String, trim: true, maxlength: 2000 },
  executedAt: Date
}, { timestamps: true });

vendorRequirementApprovalSchema.index({ orderId: 1, status: 1, createdAt: -1 });
vendorRequirementApprovalSchema.index({ requestedBy: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('VendorRequirementApproval', vendorRequirementApprovalSchema);
