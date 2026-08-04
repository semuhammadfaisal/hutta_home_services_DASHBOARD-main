const mongoose = require('mongoose');

const methodSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true, maxlength: 50 },
  label: { type: String, required: true, trim: true, maxlength: 100 },
  instructions: { type: String, required: true, trim: true, maxlength: 4000 },
  enabled: { type: Boolean, default: true },
  transactionReferenceRequired: { type: Boolean, default: false }
}, { _id: false });

const schema = new mongoose.Schema({
  key: { type: String, default: 'global', unique: true, immutable: true },
  paymentMethods: { type: [methodSchema], default: [] },
  remittanceContact: { type: String, trim: true, maxlength: 500, default: 'sales@smplfix.com' },
  proofUploadInstructions: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: 'Upload a clear image showing the transaction date, amount, and reference.'
  },
  customerCloseoutEmailMessage: {
    type: String,
    trim: true,
    maxlength: 3000,
    default: 'Please review the completed work, confirm the service, and review your invoice.'
  },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('CloseoutSettings', schema);
