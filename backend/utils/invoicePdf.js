const PDFDocument = require('pdfkit');

const money = value => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const date = value => new Date(value).toLocaleDateString('en-US', { timeZone: 'America/Phoenix', year: 'numeric', month: 'long', day: 'numeric' });

function createCustomerInvoicePdf(invoice) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 54, info: { Title: invoice.invoiceNumber, Author: 'Hutta Home Services' } });
    const chunks = []; doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    doc.fillColor('#0056b8').fontSize(26).font('Helvetica-Bold').text('Hutta Home Services');
    doc.moveDown(.25).fillColor('#64748b').fontSize(10).font('Helvetica').text(invoice.companySnapshot?.address || '').text(invoice.companySnapshot?.phone || '').text(invoice.companySnapshot?.email || 'sales@huttas.com');
    doc.moveDown(1.5).fillColor('#172033').fontSize(28).font('Helvetica-Bold').text('INVOICE', { align: 'right' });
    doc.fontSize(11).font('Helvetica').text(invoice.invoiceNumber, { align: 'right' }).text(`Issued ${date(invoice.issuedAt)}`, { align: 'right' }).text('Due on receipt', { align: 'right' });
    doc.moveDown(1.5).font('Helvetica-Bold').text('Bill to'); doc.font('Helvetica').text(invoice.customerSnapshot?.name || 'Customer').text(invoice.customerSnapshot?.email || '').text(invoice.customerSnapshot?.address || '');
    doc.moveDown(1.5).rect(54, doc.y, 504, 32).fill('#eef5ff'); doc.fillColor('#172033').font('Helvetica-Bold').fontSize(11).text('Service', 68, doc.y - 22).text('Amount', 455, doc.y - 14, { width: 88, align: 'right' });
    doc.moveDown(1.2).font('Helvetica').text(invoice.jobSnapshot?.service || 'Home service', 68, doc.y).text(money(invoice.amount), 455, doc.y - 14, { width: 88, align: 'right' });
    if (invoice.jobSnapshot?.scopeOfWork) { doc.moveDown().fillColor('#64748b').fontSize(9).text(invoice.jobSnapshot.scopeOfWork, 68, doc.y, { width: 370 }); }
    doc.moveDown(2).strokeColor('#d7e3f1').moveTo(300, doc.y).lineTo(558, doc.y).stroke();
    doc.moveDown().fillColor('#172033').fontSize(16).font('Helvetica-Bold').text(`Total due: ${money(invoice.amount)}`, { align: 'right' });
    doc.moveDown(3).fillColor('#64748b').fontSize(10).font('Helvetica').text('Thank you for choosing Hutta Home Services.', { align: 'center' }).text('Questions? Reply to sales@huttas.com', { align: 'center' });
    doc.end();
  });
}

module.exports = { createCustomerInvoicePdf };
