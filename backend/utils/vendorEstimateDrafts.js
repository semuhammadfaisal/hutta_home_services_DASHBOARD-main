function clean(value, max = 1000) { return String(value || '').trim().slice(0, max); }
function cents(value) { return Math.round((Number(value) + Number.EPSILON) * 100); }
function dollars(value) { return cents(value) / 100; }

function normalizeLineItems(input, { requireItems = true, verifyAmounts = false } = {}) {
  const rows = Array.isArray(input) ? input : [];
  const errors = [];
  if (requireItems && !rows.length) errors.push('At least one estimate line item is required');
  if (rows.length > 200) errors.push('Estimate cannot contain more than 200 line items');
  const lineItems = rows.slice(0, 200).map((row, index) => {
    const description = clean(row?.description, 1000);
    const category = ['labor', 'material', 'other'].includes(row?.category) ? row.category : 'other';
    const quantity = Number(row?.quantity);
    const unit = clean(row?.unit, 40);
    const unitPrice = Number(row?.unitPrice);
    if (!description) errors.push(`Line ${index + 1} description is required`);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000) errors.push(`Line ${index + 1} quantity is invalid`);
    if (!unit) errors.push(`Line ${index + 1} unit is required`);
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 100000000) errors.push(`Line ${index + 1} unit price is invalid`);
    const normalizedUnitPrice = dollars(unitPrice || 0);
    const amount = Number.isFinite(quantity) && Number.isFinite(unitPrice) ? dollars(quantity * normalizedUnitPrice) : 0;
    if (verifyAmounts && row?.amount !== undefined && cents(row.amount) !== cents(amount)) errors.push(`Line ${index + 1} total does not match quantity × unit price`);
    return { category, description, quantity, unit, unitPrice: normalizedUnitPrice, amount };
  });
  const subtotal = dollars(lineItems.reduce((sum, item) => sum + cents(item.amount), 0) / 100);
  return { lineItems, subtotal, errors };
}

function serializeVendorEstimateDraft(draft) {
  const item = draft?.toObject ? draft.toObject() : (draft || {});
  return {
    id: item._id ? String(item._id) : null,
    invitationId: item.invitationId ? String(item.invitationId) : null,
    quoteId: item.quoteId ? String(item.quoteId) : null,
    status: item.status || 'draft', source: item.source || 'manual', scope: item.scope || '',
    lineItems: (item.lineItems || []).map(line => ({ id: line._id ? String(line._id) : undefined, category: line.category, description: line.description, quantity: line.quantity, unit: line.unit, unitPrice: line.unitPrice, amount: line.amount })),
    subtotal: item.subtotal || 0, notes: item.notes || '', estimatedDuration: item.estimatedDuration || {}, earliestAvailableDate: item.earliestAvailableDate || null,
    siteAccessRequired: item.siteAccessRequired === true, accessNotes: item.accessNotes || '',
    attachments: (item.sourceFiles || []).map(file => ({ id: file.documentId, name: file.name, type: file.mimeType, size: file.size, uploadedAt: file.uploadedAt, downloadUrl: item._id ? `/api/vendor-portal/estimate-drafts/${item._id}/files/${encodeURIComponent(file.documentId)}` : null })),
    parser: item.parserAudit ? { provider: item.parserAudit.provider || 'none', model: item.parserAudit.model || '', status: item.parserAudit.status || 'not_requested', requestedAt: item.parserAudit.requestedAt || null, completedAt: item.parserAudit.completedAt || null, requestId: item.parserAudit.requestId || '', errorCode: item.parserAudit.errorCode || '' } : { provider: 'none', status: 'not_requested' },
    manualEntryRequired: item.parserAudit?.status !== 'succeeded', reviewedAt: item.reviewedAt || null, submittedAt: item.submittedAt || null
  };
}

module.exports = { clean, cents, dollars, normalizeLineItems, serializeVendorEstimateDraft };
