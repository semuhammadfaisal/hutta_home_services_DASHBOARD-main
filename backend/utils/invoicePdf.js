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

module.exports = { createCustomerInvoicePdf };
