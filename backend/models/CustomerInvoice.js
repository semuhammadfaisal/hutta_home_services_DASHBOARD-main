const mongoose = require('mongoose');

const commercialBreakdownSchema = new mongoose.Schema({
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, immutable: true },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommercialLocation', immutable: true },
  portfolioId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommercialPortfolio', immutable: true },
  serviceAgreementId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommercialServiceAgreement', immutable: true },
  propertyLabel: { type: String, required: true, trim: true, maxlength: 240, immutable: true },
  locationCode: { type: String, trim: true, maxlength: 80, immutable: true },
  serviceAgreementNumber: { type: String, trim: true, maxlength: 80, immutable: true },
  tierAtService: { type: String, enum: ['tier_1', 'tier_2', 'tier_3'], required: true, immutable: true },
  chargeType: { type: String, enum: ['coordination_service', 'client_service'], required: true, immutable: true },
  billedAmount: { type: Number, min: 0, required: true, immutable: true },
  orderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order', immutable: true }],
  purchaseOrderNumbers: [{ type: String, trim: true, maxlength: 120, immutable: true }]
}, { _id: false });

const schema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true, immutable: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true, immutable: true },
  jobCompletionId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobCompletion', required: true, unique: true, immutable: true },
  outgoingQuoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'OutgoingQuote', required: true, immutable: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', immutable: true },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  amount: { type: Number, min: 0, required: true, immutable: true },
  issuedAt: { type: Date, required: true, immutable: true },
  dueDate: { type: Date, required: true, immutable: true },
  terms: { type: String, default: 'Due on receipt', immutable: true },
  companySnapshot: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  customerSnapshot: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  jobSnapshot: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  quoteSnapshot: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  paymentInstructionsSnapshot: { type: mongoose.Schema.Types.Mixed, default: {}, immutable: true },
  commercialBilling: {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommercialOrganization', immutable: true },
    serviceAgreementId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommercialServiceAgreement', immutable: true },
    invoiceKind: { type: String, enum: ['coordination_fee', 'consolidated_period', 'direct_work', 'warranty_claim'], immutable: true },
    snapshotVersion: { type: Number, min: 1, immutable: true },
    tierAtIssue: { type: String, enum: ['tier_1', 'tier_2', 'tier_3', 'mixed_managed'], immutable: true },
    invoiceModeAtIssue: { type: String, enum: ['coordination_fee_only', 'consolidated_period'], immutable: true },
    billingPeriodAtIssue: { type: String, enum: ['per_order', 'weekly', 'monthly'], immutable: true },
    consolidationKey: { type: String, trim: true, maxlength: 180, immutable: true },
    periodKey: { type: String, trim: true, maxlength: 40, immutable: true },
    periodStart: { type: Date, immutable: true },
    periodEnd: { type: Date, immutable: true },
    organizationName: { type: String, trim: true, maxlength: 240, immutable: true },
    purchaseOrderNumber: { type: String, trim: true, maxlength: 120, immutable: true },
    currency: { type: String, enum: ['USD'], default: 'USD', immutable: true },
    propertyBreakdown: { type: [commercialBreakdownSchema], default: undefined, immutable: true },
    reconciliation: {
      breakdownTotal: { type: Number, min: 0, immutable: true },
      reconciledAt: { type: Date, immutable: true }
    }
  },
  snapshotHash: { type: String, required: true, match: /^[a-f0-9]{64}$/, immutable: true },
  pdfGeneratedAt: Date
}, { timestamps: true });

schema.index({ customerId: 1, issuedAt: -1 });
schema.index({ 'commercialBilling.organizationId': 1, issuedAt: -1 });
schema.index({ 'commercialBilling.serviceAgreementId': 1, issuedAt: -1 });
schema.index({ 'commercialBilling.organizationId': 1, 'commercialBilling.periodStart': -1, 'commercialBilling.periodEnd': -1 });
schema.index({ 'commercialBilling.propertyBreakdown.propertyId': 1, issuedAt: -1 });
schema.index(
  { 'commercialBilling.organizationId': 1, 'commercialBilling.consolidationKey': 1, 'commercialBilling.periodKey': 1, 'commercialBilling.invoiceKind': 1 },
  { unique: true, partialFilterExpression: { 'commercialBilling.invoiceKind': 'consolidated_period', 'commercialBilling.periodKey': { $type: 'string' } }, name: 'one_consolidated_commercial_invoice_per_scope_period' }
);

schema.pre('validate', function validateCommercialSnapshot(next) {
  const billing = this.commercialBilling;
  if (!billing?.organizationId || !billing?.invoiceKind) return next();
  if (billing.snapshotVersion >= 1) {
    if (!billing.tierAtIssue || !billing.invoiceModeAtIssue || !billing.billingPeriodAtIssue) return next(new Error('Commercial billing tier, mode, and period snapshots are required'));
    if (billing.tierAtIssue === 'tier_1' && (billing.invoiceKind !== 'coordination_fee' || billing.invoiceModeAtIssue !== 'coordination_fee_only')) return next(new Error('Tier 1 invoices must contain coordination services only'));
    if (['tier_2', 'tier_3', 'mixed_managed'].includes(billing.tierAtIssue) && (billing.invoiceKind !== 'consolidated_period' || billing.invoiceModeAtIssue !== 'consolidated_period')) return next(new Error('Tier 2 and Tier 3 invoices must be consolidated by period'));
    const rows = billing.propertyBreakdown || [];
    if (!rows.length) return next(new Error('Commercial billing snapshots require a property breakdown'));
    if (billing.tierAtIssue === 'tier_1' && rows.some(row => row.chargeType !== 'coordination_service')) return next(new Error('Tier 1 property lines must be coordination services'));
    if (['tier_2', 'tier_3', 'mixed_managed'].includes(billing.tierAtIssue) && rows.some(row => row.chargeType !== 'client_service')) return next(new Error('Managed-tier property lines must be consolidated client services'));
    const cents = value => Math.round((Number(value) + Number.EPSILON) * 100);
    if (rows.reduce((sum, row) => sum + cents(row.billedAmount), 0) !== cents(this.amount)) return next(new Error('Commercial property breakdown must reconcile to invoice total'));
    if (billing.invoiceKind === 'consolidated_period' && (!billing.periodStart || !billing.periodEnd || !billing.periodKey || !billing.consolidationKey)) return next(new Error('Consolidated invoices require immutable period identifiers'));
  }
  next();
});

module.exports = mongoose.model('CustomerInvoice', schema);
