const PDFDocument = require('pdfkit');
const path = require('path');

const money = value => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = value => value ? new Date(value).toLocaleDateString('en-US', { timeZone: 'America/Phoenix', year: 'numeric', month: 'long', day: 'numeric' }) : 'Not specified';

function createOutgoingQuotePdf(quote, settings = {}) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'LETTER', margin: 48, info: { Title: `Quote ${quote.quoteReference}`, Author: 'Hutta Home Services' } });
    const chunks = [];
    document.on('data', chunk => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);

    const company = settings.company || {};
    const logo = path.resolve(__dirname, '../../assets/images/logo.png');
    try { document.image(logo, 48, 42, { width: 105 }); } catch (_error) { /* branding text remains */ }
    document.fillColor('#0056b8').fontSize(22).text(company.name || 'Hutta Home Services', 175, 48, { align: 'right' });
    document.fillColor('#64748b').fontSize(9).text([company.address, company.phone, company.email, company.website].filter(Boolean).join('  |  '), 175, 78, { align: 'right' });
    document.moveTo(48, 108).lineTo(564, 108).strokeColor('#d7e3f1').stroke();

    document.fillColor('#172033').fontSize(25).text('SERVICE QUOTE', 48, 128);
    document.fontSize(10).fillColor('#526178').text(`Quote: ${quote.quoteReference}  •  Revision ${quote.revisionNumber || 1}`);
    document.text(`Issued: ${formatDate(quote.sentAt || new Date())}  •  Valid through: ${formatDate(quote.validUntil)}`);
    document.moveDown(1.2);

    document.fillColor('#0056b8').fontSize(11).text('PREPARED FOR');
    document.fillColor('#172033').fontSize(11).text(quote.customerSnapshot?.name || 'Customer');
    document.fillColor('#526178').fontSize(9).text(quote.customerSnapshot?.address || '');
    document.moveDown(1.1);
    document.fillColor('#0056b8').fontSize(11).text('SERVICE');
    document.fillColor('#172033').fontSize(11).text(quote.jobSnapshot?.service || 'Service');
    document.fillColor('#526178').fontSize(9).text(`Request: ${quote.jobSnapshot?.requestReference || quote.jobSnapshot?.orderReference || '—'}`);
    document.moveDown(1.1);

    document.fillColor('#0056b8').fontSize(11).text('SCOPE OF WORK');
    document.fillColor('#27364b').fontSize(10).text(quote.scopeOfWork || 'No scope supplied.', { lineGap: 3 });
    document.moveDown(.8);
    const duration = quote.estimatedDuration?.value ? `${quote.estimatedDuration.value} ${quote.estimatedDuration.unit || ''}` : 'Not specified';
    document.fillColor('#526178').fontSize(9).text(`Estimated duration: ${duration}`);
    document.text(`Earliest availability: ${formatDate(quote.earliestAvailableDate)}`);
    document.text(`Site access: ${quote.siteAccessRequired ? `Arrangement required${quote.accessNotes ? ` — ${quote.accessNotes}` : ''}` : 'No special arrangement required'}`);
    if (quote.exclusionsConditions) document.text(`Exclusions / conditions: ${quote.exclusionsConditions}`);
    document.moveDown(1.2);

    const priceY = document.y;
    document.roundedRect(48, priceY, 516, 55, 7).fill('#edf7ff');
    document.fillColor('#314866').fontSize(10).text('TOTAL CUSTOMER PRICE', 64, priceY + 12);
    document.fillColor('#0056b8').fontSize(22).text(money(quote.customerTotal), 330, priceY + 13, { width: 215, align: 'right' });
    document.y = priceY + 72;

    document.fillColor('#0056b8').fontSize(11).text('TERMS AND CONDITIONS');
    document.fillColor('#3b465a').fontSize(8.5).text(quote.termsAndConditions || '', { lineGap: 2 });
    document.moveDown(1);
    document.fillColor('#64748b').fontSize(8).text(`Licensed contractor: ${quote.vendorSnapshot?.licensedContractorName || ''}`);
    document.text(`License type: ${quote.vendorSnapshot?.licenseType || ''}`);
    document.text(`ROC number: ${quote.vendorSnapshot?.rocNumber || ''}`);
    document.moveDown(.5).fillColor('#526178').text(quote.legalDisclosure || '', { lineGap: 2 });
    document.moveDown(1.2).fillColor('#8a97a8').fontSize(7.5).text('This quote is not an invoice and does not confirm scheduling. Customer approval is handled separately.', { align: 'center' });
    document.end();
  });
}

module.exports = { createOutgoingQuotePdf };
