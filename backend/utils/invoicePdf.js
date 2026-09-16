const {
  addPageFooters,
  createDocument,
  drawBrandHeader,
  drawLineItems,
  drawMetadataColumns,
  drawNotePanel,
  drawSectionTitle,
  drawText,
  drawTotals
} = require('./pdfDesign');

const money = value => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const date = value => value
  ? new Date(value).toLocaleDateString('en-US', { timeZone: 'America/Phoenix', year: 'numeric', month: 'short', day: 'numeric' })
  : 'Not specified';

function createCustomerInvoicePdf(invoice) {
  return new Promise((resolve, reject) => {
    const doc = createDocument({ title: invoice.invoiceNumber, subject: 'Customer invoice' });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawBrandHeader(doc, {
      documentType: 'Invoice',
      reference: invoice.invoiceNumber,
      status: invoice.terms || 'Due on receipt'
    });
    drawMetadataColumns(doc, [
      {
        label: 'Billed to',
        value: invoice.customerSnapshot?.name || 'Customer',
        lines: [invoice.customerSnapshot?.address, invoice.customerSnapshot?.email]
      },
      {
        label: 'Issued',
        value: date(invoice.issuedAt),
        lines: [`Due ${date(invoice.dueDate || invoice.issuedAt)}`]
      },
      {
        label: 'Property',
        value: invoice.customerSnapshot?.address || 'Service address',
        lines: [invoice.quoteSnapshot?.quoteReference]
      }
    ]);

    drawLineItems(doc, [{
      title: invoice.jobSnapshot?.service || 'Home service',
      detail: invoice.jobSnapshot?.scopeOfWork || 'Completed service',
      qty: '1',
      amount: money(invoice.amount)
    }]);
    drawTotals(doc, {
      subtotal: money(invoice.amount),
      tax: money(0),
      total: money(invoice.amount),
      totalLabel: 'Total due'
    });

    if (invoice.contractor?.name || invoice.contractor?.rocNumber) {
      drawNotePanel(doc, {
        label: 'Service contractor',
        value: [
          invoice.contractor.name,
          invoice.contractor.licenseType,
          invoice.contractor.rocNumber ? `ROC ${invoice.contractor.rocNumber}` : null
        ].filter(Boolean).join(' | ')
      });
    }

    const payment = invoice.paymentInstructionsSnapshot || {};
    const methods = Array.isArray(payment.paymentMethods)
      ? payment.paymentMethods.filter(method => method?.enabled !== false && method?.label && method?.instructions)
      : [];
    if (methods.length || payment.remittanceContact || payment.proofUploadInstructions) {
      drawSectionTitle(doc, 'Payment instructions');
      methods.forEach(method => drawText(doc, `${method.label}: ${method.instructions}`, { size: 8.2 }));
      if (payment.remittanceContact) drawText(doc, `Remittance contact: ${payment.remittanceContact}`, { size: 8.2 });
      if (payment.proofUploadInstructions) drawText(doc, payment.proofUploadInstructions, { size: 8.2 });
      doc.moveDown(.6);
    }
    drawNotePanel(doc, {
      label: 'Note',
      value: 'Thank you for choosing smplfix. Questions about this invoice? Reply to sales@smplfix.com.'
    });
    addPageFooters(doc, { reference: invoice.invoiceNumber });
    doc.end();
  });
}

function createCommercialInvoicePdf(invoice, settlement = {}) {
  return new Promise((resolve, reject) => {
    const billing = invoice.commercialBilling || {};
    const rows = billing.propertyBreakdown || [];
    const doc = createDocument({ title: invoice.invoiceNumber, subject: 'Commercial client invoice' });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    drawBrandHeader(doc, { documentType: billing.invoiceKind === 'coordination_fee' ? 'Coordination Invoice' : 'Consolidated Invoice', reference: invoice.invoiceNumber, status: settlement.status || invoice.terms || 'Open' });
    drawMetadataColumns(doc, [
      { label: 'Billed to', value: billing.organizationName || invoice.customerSnapshot?.name || 'Commercial client', lines: [invoice.customerSnapshot?.address, invoice.customerSnapshot?.email] },
      { label: 'Issued', value: date(invoice.issuedAt), lines: [`Due ${date(invoice.dueDate || invoice.issuedAt)}`] },
      { label: 'Billing period', value: billing.periodStart ? `${date(billing.periodStart)} – ${date(billing.periodEnd)}` : 'Per order', lines: [billing.invoiceKind === 'coordination_fee' ? 'SMPLfix coordination services' : 'Consolidated property services'] }
    ]);
    drawLineItems(doc, rows.length ? rows.map(row => ({
      title: row.propertyLabel || row.locationCode || 'Authorized property',
      detail: [row.locationCode, ...(row.purchaseOrderNumbers || []).map(value => `PO ${value}`)].filter(Boolean).join(' | '),
      qty: '1', amount: money(row.billedAmount)
    })) : [{ title: billing.invoiceKind === 'coordination_fee' ? 'SMPLfix coordination services' : (invoice.jobSnapshot?.service || 'Commercial services'), detail: invoice.jobSnapshot?.scopeOfWork || 'Client services', qty: '1', amount: money(invoice.amount) }]);
    drawTotals(doc, { subtotal: money(invoice.amount), tax: money(0), total: money(invoice.amount), totalLabel: settlement.status === 'paid' ? 'Total paid' : 'Total due' });
    drawNotePanel(doc, { label: 'Billing note', value: billing.invoiceKind === 'coordination_fee' ? 'This invoice includes SMPLfix coordination services only. Trade vendors bill the client directly.' : 'This invoice consolidates client-facing charges for the listed properties and billing period.' });
    addPageFooters(doc, { reference: invoice.invoiceNumber });
    doc.end();
  });
}

module.exports = { createCommercialInvoicePdf, createCustomerInvoicePdf };
