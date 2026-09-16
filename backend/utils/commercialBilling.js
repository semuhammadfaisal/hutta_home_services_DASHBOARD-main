const PAYMENT_SUCCESS = new Set(['received', 'completed']);

const toCents = value => Math.round((Number(value) + Number.EPSILON) * 100);
const fromCents = value => Number((Number(value || 0) / 100).toFixed(2));
const id = value => String(value?._id || value || '');

function reconcileInvoice(invoice) {
  const rows = invoice?.commercialBilling?.propertyBreakdown || [];
  const invoiceCents = toCents(invoice?.amount || 0);
  const breakdownCents = rows.reduce((sum, row) => sum + toCents(row.billedAmount || 0), 0);
  return { invoiceCents, breakdownCents, differenceCents: invoiceCents - breakdownCents, reconciled: invoiceCents === breakdownCents };
}

function invoiceVisibility(invoice) {
  const billing = invoice?.commercialBilling || {};
  if (!billing.organizationId) return false;
  if (billing.tierAtIssue === 'tier_1' || billing.invoiceModeAtIssue === 'coordination_fee_only') return billing.invoiceKind === 'coordination_fee';
  if (['tier_2', 'tier_3', 'mixed_managed'].includes(billing.tierAtIssue) || billing.invoiceModeAtIssue === 'consolidated_period') return billing.invoiceKind === 'consolidated_period';
  // Legacy commercial invoices are fail-closed to the two explicitly client-safe kinds.
  return ['coordination_fee', 'consolidated_period'].includes(billing.invoiceKind);
}

function paymentSummary(invoice, payments = [], now = new Date()) {
  const matching = payments.filter(payment => id(payment.customerInvoiceId) === id(invoice._id) || id(payment._id) === id(invoice.paymentId));
  const paidCents = matching.filter(payment => PAYMENT_SUCCESS.has(payment.status)).reduce((sum, payment) => sum + toCents(payment.amount), 0);
  const totalCents = toCents(invoice.amount);
  let status = 'open';
  if (paidCents >= totalCents && totalCents >= 0) status = 'paid';
  else if (paidCents > 0) status = 'partial';
  else if (invoice.dueDate && new Date(invoice.dueDate) < now) status = 'overdue';
  return { status, paidAmount: fromCents(paidCents), balanceDue: fromCents(Math.max(0, totalCents - paidCents)), paidAt: matching.filter(item => PAYMENT_SUCCESS.has(item.status)).map(item => item.paymentDate).filter(Boolean).sort().at(-1) };
}

// Arizona does not observe daylight saving time. Commercial billing boundaries are 00:00 Phoenix (07:00 UTC).
function phoenixPeriod(dateValue = new Date(), period = 'monthly') {
  const instant = new Date(dateValue);
  if (Number.isNaN(instant.getTime())) throw Object.assign(new Error('Invalid billing date'), { status: 400 });
  const local = new Date(instant.getTime() - 7 * 60 * 60 * 1000);
  let startLocal;
  let endLocal;
  if (period === 'weekly') {
    const mondayOffset = (local.getUTCDay() + 6) % 7;
    startLocal = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - mondayOffset));
    endLocal = new Date(startLocal.getTime() + 7 * 86400000);
  } else if (period === 'monthly') {
    startLocal = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1));
    endLocal = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1));
  } else throw Object.assign(new Error('Billing period must be weekly or monthly'), { status: 400 });
  const start = new Date(startLocal.getTime() + 7 * 60 * 60 * 1000);
  const end = new Date(endLocal.getTime() + 7 * 60 * 60 * 1000);
  return { start, end, periodKey: period === 'monthly' ? startLocal.toISOString().slice(0, 7) : `week:${startLocal.toISOString().slice(0, 10)}` };
}

function billedPropertyIds(invoice) {
  return [...new Set((invoice?.commercialBilling?.propertyBreakdown || []).map(row => id(row.propertyId)).filter(Boolean))];
}

function allocationFor(invoice, propertyIds) {
  const allowed = new Set((propertyIds || []).map(id));
  const rows = invoice?.commercialBilling?.propertyBreakdown || [];
  if (!rows.length) return allowed.size ? 0 : Number(invoice.amount || 0);
  return fromCents(rows.filter(row => allowed.has(id(row.propertyId))).reduce((sum, row) => sum + toCents(row.billedAmount), 0));
}

function dateRange(query = {}) {
  const parsePhoenixDay = (value, end = false) => {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Object.assign(new Error('Invalid date range'), { status: 400 });
    const dayStart = new Date(`${value}T07:00:00.000Z`);
    const phoenixDate = new Date(dayStart.getTime() - 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (Number.isNaN(dayStart.getTime()) || phoenixDate !== value) throw Object.assign(new Error('Invalid date range'), { status: 400 });
    return end ? new Date(dayStart.getTime() + 86400000 - 1) : dayStart;
  };
  const from = parsePhoenixDay(query.dateFrom);
  const to = parsePhoenixDay(query.dateTo, true);
  if (from && to && from > to) throw Object.assign(new Error('Invalid date range'), { status: 400 });
  if (from && to && to - from > 3 * 366 * 86400000) throw Object.assign(new Error('Date range cannot exceed three years'), { status: 400 });
  return { from, to };
}

function buildBillingSnapshot({ organization, agreement, lines, issuedAt = new Date() }) {
  if (!organization?._id || !agreement?._id || !Array.isArray(lines) || !lines.length) throw new Error('Organization, agreement, and at least one billing line are required');
  const mode = agreement.billingRules?.invoiceMode;
  const period = mode === 'coordination_fee_only' ? 'per_order' : (agreement.billingRules?.billingPeriod || 'monthly');
  const expectedKind = mode === 'coordination_fee_only' ? 'coordination_fee' : 'consolidated_period';
  if (!['coordination_fee_only', 'consolidated_period'].includes(mode)) throw new Error('Unsupported commercial invoice mode');
  if (mode === 'coordination_fee_only' && lines.some(line => line.tierAtService !== 'tier_1')) throw new Error('Tier 1 invoices can contain coordination services only');
  if (mode === 'consolidated_period' && lines.some(line => !['tier_2', 'tier_3'].includes(line.tierAtService))) throw new Error('Consolidated invoices can contain Tier 2 or Tier 3 client charges only');
  const tiers = [...new Set(lines.map(line => line.tierAtService))];
  const boundary = period === 'per_order' ? null : phoenixPeriod(issuedAt, period);
  const propertyBreakdown = lines.map(line => ({
    propertyId: line.propertyId, locationId: line.locationId, portfolioId: line.portfolioId,
    serviceAgreementId: line.serviceAgreementId || agreement._id, propertyLabel: line.propertyLabel,
    locationCode: line.locationCode, serviceAgreementNumber: line.serviceAgreementNumber || agreement.agreementNumber,
    tierAtService: line.tierAtService, chargeType: mode === 'coordination_fee_only' ? 'coordination_service' : 'client_service', billedAmount: fromCents(toCents(line.billedAmount)),
    orderIds: line.orderIds || [], purchaseOrderNumbers: [...new Set((line.purchaseOrderNumbers || []).filter(Boolean))]
  }));
  const amount = fromCents(propertyBreakdown.reduce((sum, line) => sum + toCents(line.billedAmount), 0));
  return {
    amount,
    commercialBilling: {
      organizationId: organization._id, serviceAgreementId: agreement._id, invoiceKind: expectedKind,
      snapshotVersion: 1, tierAtIssue: tiers.length === 1 ? tiers[0] : 'mixed_managed', invoiceModeAtIssue: mode,
      billingPeriodAtIssue: period, consolidationKey: mode === 'consolidated_period' ? `organization:${organization._id}` : undefined,
      periodKey: boundary?.periodKey, periodStart: boundary?.start, periodEnd: boundary?.end,
      organizationName: organization.name, currency: 'USD', propertyBreakdown,
      reconciliation: { breakdownTotal: amount, reconciledAt: new Date(issuedAt) }
    }
  };
}

module.exports = { allocationFor, billedPropertyIds, buildBillingSnapshot, dateRange, fromCents, invoiceVisibility, paymentSummary, phoenixPeriod, reconcileInvoice, toCents };
