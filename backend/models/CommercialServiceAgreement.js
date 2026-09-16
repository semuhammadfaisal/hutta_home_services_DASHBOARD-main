const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommercialOrganization', required: true, index: true },
  portfolioId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommercialPortfolio', index: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  agreementNumber: { type: String, required: true, uppercase: true, trim: true, maxlength: 80 },
  tier: { type: String, enum: ['tier_1', 'tier_2', 'tier_3'], required: true, index: true },
  billingRules: {
    invoiceMode: { type: String, enum: ['coordination_fee_only', 'consolidated_period'], required: true },
    billingPeriod: { type: String, enum: ['per_order', 'weekly', 'monthly'], default: 'monthly' },
    vendorBillsClientDirectly: { type: Boolean, default: false },
    consolidatedInvoice: { type: Boolean, default: false }
  },
  purchaseOrder: {
    required: { type: Boolean, default: false },
    label: { type: String, trim: true, maxlength: 80, default: 'PO number' },
    pattern: { type: String, trim: true, maxlength: 240 },
    instructions: { type: String, trim: true, maxlength: 500 }
  },
  approvalRules: {
    allowedRoles: [{ type: String, enum: ['owner', 'organization_admin', 'billing_admin', 'operations_manager', 'portfolio_admin', 'property_admin', 'approver'] }],
    approvalThreshold: { type: Number, min: 0 }
  },
  paymentRules: {
    allowedRoles: [{ type: String, enum: ['owner', 'organization_admin', 'billing_admin', 'portfolio_admin', 'property_admin', 'billing'] }]
  },
  entitlements: {
    monthlyReports: { type: Boolean, default: false },
    consolidatedInvoices: { type: Boolean, default: false },
    warrantyClaims: { type: Boolean, default: false }
  },
  effectiveFrom: { type: Date, required: true, default: Date.now },
  effectiveTo: Date,
  status: { type: String, enum: ['draft', 'active', 'expired', 'terminated'], default: 'active', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

schema.index({ organizationId: 1, agreementNumber: 1 }, { unique: true });
schema.index({ organizationId: 1, propertyId: 1 }, { unique: true, partialFilterExpression: { status: 'active' }, name: 'one_active_commercial_agreement_per_property' });
schema.index({ propertyId: 1, status: 1, effectiveFrom: -1 });
schema.index({ organizationId: 1, tier: 1, status: 1 });

schema.pre('validate', function enforceTierEntitlements(next) {
  if (this.tier === 'tier_1') {
    this.billingRules.invoiceMode = 'coordination_fee_only';
    this.billingRules.vendorBillsClientDirectly = true;
    this.billingRules.consolidatedInvoice = false;
    this.entitlements.monthlyReports = false;
    this.entitlements.consolidatedInvoices = false;
    this.entitlements.warrantyClaims = false;
  } else if (this.tier === 'tier_2') {
    this.billingRules.invoiceMode = 'consolidated_period';
    this.billingRules.vendorBillsClientDirectly = false;
    this.billingRules.consolidatedInvoice = true;
    this.entitlements.monthlyReports = true;
    this.entitlements.consolidatedInvoices = true;
    this.entitlements.warrantyClaims = false;
  } else if (this.tier === 'tier_3') {
    this.billingRules.invoiceMode = 'consolidated_period';
    this.billingRules.vendorBillsClientDirectly = false;
    this.billingRules.consolidatedInvoice = true;
    this.entitlements.monthlyReports = true;
    this.entitlements.consolidatedInvoices = true;
    this.entitlements.warrantyClaims = true;
  }
  next();
});

module.exports = mongoose.model('CommercialServiceAgreement', schema);
