const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommercialOrganization', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  portfolioCode: { type: String, required: true, uppercase: true, trim: true, maxlength: 40 },
  description: { type: String, trim: true, maxlength: 1000 },
  status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

schema.index({ organizationId: 1, portfolioCode: 1 }, { unique: true });
schema.index({ organizationId: 1, status: 1, name: 1 });

module.exports = mongoose.model('CommercialPortfolio', schema);
