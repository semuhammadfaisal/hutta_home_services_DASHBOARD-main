const {
  addPageFooters,
  createDocument,
  drawBrandHeader,
  drawLineItems,
  drawMetadataColumns,
  drawNotePanel,
  drawTotals
} = require('./pdfDesign');

const money = value => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const date = value => value
  ? new Date(value).toLocaleDateString('en-US', { timeZone: 'America/Phoenix', year: 'numeric', month: 'short', day: 'numeric' })
  : 'Not specified';
const displayMethod = value => String(value || 'Not recorded').replace(/-/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());

function createPaymentReceiptPdf(payment) {
  return new Promise((resolve, reject) => {
    const reference = payment.receiptNumber || `RCPT-${payment.paymentId || payment._id}`;
    const doc = createDocument({ title: `Receipt ${reference}`, subject: 'Customer payment receipt' });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawBrandHeader(doc, { documentType: 'Receipt', reference, status: 'Paid' });
    drawMetadataColumns(doc, [
      {
        label: 'Received from',
        value: payment.customer?.name || payment.customerSnapshot?.name || 'Customer',
        lines: [payment.customer?.email || payment.customerSnapshot?.email]
      },
      {
        label: 'Received',
        value: date(payment.paymentDate || payment.updatedAt || payment.createdAt),
        lines: [`Method: ${displayMethod(payment.paymentMethod)}`]
      },
      {
        label: 'Applied to',
        value: payment.invoiceNumber || payment.order?.orderId || 'Customer account',
        lines: [payment.transactionId ? `Transaction ${payment.transactionId}` : null]
      }
    ]);
    drawLineItems(doc, [{
      title: payment.description || payment.order?.service || 'Payment received',
      detail: payment.invoiceNumber ? `Payment for ${payment.invoiceNumber}` : 'Payment credited to customer account',
      qty: '1',
      amount: money(payment.amount)
    }]);
    drawTotals(doc, {
      subtotal: money(payment.amount),
      total: money(payment.amount),
      totalLabel: 'Amount paid'
    });
    drawNotePanel(doc, {
      label: 'Payment confirmation',
      value: `Payment status: ${String(payment.status || 'received').toUpperCase()}. Keep this receipt for your records. Questions? Reply to sales@smplfix.com.`
    });
    addPageFooters(doc, { reference });
    doc.end();
  });
}

module.exports = { createPaymentReceiptPdf };
