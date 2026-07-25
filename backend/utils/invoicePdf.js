const {
  addPageFooters,
  createDocument,
  drawBrandHeader,
  drawCallout,
  drawDetailsGrid,
  drawNotice,
  drawSectionTitle,
  drawText
} = require('./pdfDesign');

const money = value => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const date = value => value
  ? new Date(value).toLocaleDateString('en-US', { timeZone: 'America/Phoenix', year: 'numeric', month: 'long', day: 'numeric' })
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
      status: 'Due on receipt',
      meta: [`Issued ${date(invoice.issuedAt)}`, `Due ${date(invoice.dueDate || invoice.issuedAt)}`]
    });
    drawDetailsGrid(doc, [
      { label: 'Bill to', value: invoice.customerSnapshot?.name || 'Customer' },
      { label: 'Customer email', value: invoice.customerSnapshot?.email },
      { label: 'Service address', value: invoice.customerSnapshot?.address },
      { label: 'Quote reference', value: invoice.quoteSnapshot?.quoteReference }
    ]);
    drawSectionTitle(doc, 'Service');
    drawDetailsGrid(doc, [
      { label: 'Description', value: invoice.jobSnapshot?.service || 'Home service' },
      { label: 'Amount', value: money(invoice.amount) }
    ]);
    if (invoice.jobSnapshot?.scopeOfWork) {
      drawSectionTitle(doc, 'Completed scope');
      drawText(doc, invoice.jobSnapshot.scopeOfWork);
    }
    drawCallout(doc, {
      label: 'Total due',
      value: money(invoice.amount),
      note: 'Payment terms: Due on receipt'
    });
    drawNotice(doc, 'Thank you for choosing Hutta Home Services. Questions about this invoice? Reply to sales@huttas.com.');
    addPageFooters(doc, { reference: invoice.invoiceNumber });
    doc.end();
  });
}

module.exports = { createCustomerInvoicePdf };
