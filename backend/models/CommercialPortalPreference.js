const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommercialOrganization', required: true, index: true },
  timezone: { type: String, enum: ['America/Phoenix'], default: 'America/Phoenix' },
  notifications: {
    portal: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    orderUpdates: { type: Boolean, default: true },
    billingUpdates: { type: Boolean, default: true },
    warrantyUpdates: { type: Boolean, default: true },
    reportReady: { type: Boolean, default: true }
  },
  monthlyReports: {
    enabled: { type: Boolean, default: false },
    deliveryDay: { type: Number, min: 1, max: 28, default: 1 },
    format: { type: String, enum: ['pdf', 'csv', 'both'], default: 'pdf' },
    propertyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Property' }],
    lastDeliveryPeriodKey: String,
    lastDeliveryStatus: { type: String, enum: ['processing', 'delivered', 'failed'] },
    lastDeliveredAt: Date,
    lastDeliveryAttemptAt: Date,
    lastDeliveryError: { type: String, maxlength: 500 }
  },
  display: {
    compactTables: { type: Boolean, default: false }
  }
}, { timestamps: true });

schema.index({ userId: 1, organizationId: 1 }, { unique: true });
schema.index({ 'monthlyReports.enabled': 1, 'monthlyReports.deliveryDay': 1 });

module.exports = mongoose.model('CommercialPortalPreference', schema);
