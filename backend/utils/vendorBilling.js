function clean(value, max = 5000) { return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max); }
function cents(value) { return Math.round((Number(value) + Number.EPSILON) * 100); }
function dollars(value) { return Math.round(Number(value)) / 100; }
function normalizeInvoiceNumber(value) { return clean(value, 120).toUpperCase().replace(/\s+/g, ' '); }
function normalizeInvoiceLines(input, options = {}) {
  const errors = []; const source = Array.isArray(input) ? input : [];
  if (!source.length || source.length > 200) errors.push('Invoice requires between 1 and 200 line items');
  const lineItems = source.slice(0, 200).map((item, index) => {
    const description = clean(item.description, 1000); const quantity = Number(item.quantity); const unit = clean(item.unit, 40); const unitPriceCents = cents(item.unitPrice); const amountCents = Math.round(quantity * unitPriceCents);
    if (!description) errors.push(`Line ${index + 1} description is required`);
    if (!Number.isFinite(quantity) || quantity <= 0) errors.push(`Line ${index + 1} quantity must be greater than zero`);
    if (!unit) errors.push(`Line ${index + 1} unit is required`);
    if (!Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0) errors.push(`Line ${index + 1} unit price is invalid`);
    if (options.verifyAmounts && item.amount !== undefined && cents(item.amount) !== amountCents) errors.push(`Line ${index + 1} total does not match quantity and unit price`);
    return { description, quantity, unit, unitPrice: dollars(unitPriceCents), amount: dollars(amountCents) };
  });
  const totalCents = lineItems.reduce((sum, item) => sum + cents(item.amount), 0);
  return { lineItems, amount: dollars(totalCents), errors };
}
function id(value) { return value == null ? null : String(value); }
function payoutReference(value) { const text = clean(value, 180); return text || null; }
function serializePayout(item) {
  if (!item) return null; const source = item.toObject ? item.toObject() : item;
  return { id: id(source._id), status: source.status, amount: Number(source.amount || 0), provider: 'Stripe Connect', reference: payoutReference(source.providerReference), scheduledFor: source.scheduledFor || null, paidAt: source.paidAt || null, message: source.status === 'failed' ? source.failureMessage || 'Payout requires review' : source.status === 'disputed' ? source.disputeMessage || 'Payout is disputed' : '' };
}
function serializeVendorInvoice(item, payout) {
  const source = item?.toObject ? item.toObject() : item || {};
  const ownerBilled = source.billingLane === 'owner_billed';
  return { id: id(source._id), assignmentId: id(source.assignmentId), orderId: id(source.orderId), invoiceNumber: source.invoiceNumber, amount: Number(source.amount || 0), servicePeriod: { start: source.servicePeriodStart, end: source.servicePeriodEnd }, lineItems: (source.lineItems || []).map(line => ({ description: line.description, quantity: line.quantity, unit: line.unit, unitPrice: line.unitPrice, amount: line.amount })), notes: source.notes || '', status: source.status, billingLane: source.billingLane, paymentLabel: ownerBilled ? 'Billed to owner' : 'Paid by SMPLfix', payout: ownerBilled ? null : serializePayout(payout), mismatchReview: (source.mismatchFlags || []).length ? { flagged: true, message: 'Submitted details differ from the assignment record and are under internal review.' } : { flagged: false }, supportingDocument: source.sourceDocument?.documentId ? { id: source.sourceDocument.documentId, name: source.sourceDocument.name, type: source.sourceDocument.mimeType, size: source.sourceDocument.size, downloadUrl: `/api/vendor-portal/invoices/${id(source._id)}/document` } : null, submittedAt: source.submittedAt, reviewedAt: source.reviewedAt || null };
}

module.exports = { clean, cents, dollars, normalizeInvoiceLines, normalizeInvoiceNumber, serializePayout, serializeVendorInvoice };
