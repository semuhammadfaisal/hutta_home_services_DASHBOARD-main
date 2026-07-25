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

const money = value => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = value => value
  ? new Date(value).toLocaleDateString('en-US', { timeZone: 'America/Phoenix', year: 'numeric', month: 'long', day: 'numeric' })
  : 'Not specified';

function createOutgoingQuotePdf(quote, settings = {}) {
  return new Promise((resolve, reject) => {
    const document = createDocument({ title: `Quote ${quote.quoteReference}`, subject: 'Customer service quote' });
    const chunks = [];
    document.on('data', chunk => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);

    drawBrandHeader(document, {
      documentType: 'Service quote',
      reference: quote.quoteReference,
      status: 'Ready for review',
      meta: [
        `Revision ${quote.revisionNumber || 1}`,
        `Issued ${formatDate(quote.sentAt || new Date())}`,
        `Valid through ${formatDate(quote.validUntil)}`
      ]
    });
    drawDetailsGrid(document, [
      { label: 'Prepared for', value: quote.customerSnapshot?.name || 'Customer' },
      { label: 'Service', value: quote.jobSnapshot?.service || 'Service' },
      { label: 'Service address', value: quote.customerSnapshot?.address },
      { label: 'Request reference', value: quote.jobSnapshot?.requestReference || quote.jobSnapshot?.orderReference }
    ]);

    drawSectionTitle(document, 'Scope of work');
    drawText(document, quote.scopeOfWork, { fallback: 'No scope supplied.' });
    document.moveDown(.65);
    const duration = quote.estimatedDuration?.value
      ? `${quote.estimatedDuration.value} ${quote.estimatedDuration.unit || ''}`
      : 'Not specified';
    drawDetailsGrid(document, [
      { label: 'Estimated duration', value: duration },
      { label: 'Earliest availability', value: formatDate(quote.earliestAvailableDate) },
      {
        label: 'Site access',
        value: quote.siteAccessRequired
          ? `Arrangement required${quote.accessNotes ? ` - ${quote.accessNotes}` : ''}`
          : 'No special arrangement required'
      },
      { label: 'Exclusions / conditions', value: quote.exclusionsConditions || 'None stated', showEmpty: true }
    ]);

    drawCallout(document, { label: 'Total customer price', value: money(quote.customerTotal) });
    drawSectionTitle(document, 'Terms and conditions');
    drawText(document, quote.termsAndConditions, { fallback: 'No terms supplied.', size: 8.7, lineGap: 2 });
    drawSectionTitle(document, 'Contractor disclosure');
    drawDetailsGrid(document, [
      { label: 'Licensed contractor', value: quote.vendorSnapshot?.licensedContractorName },
      { label: 'License type', value: quote.vendorSnapshot?.licenseType },
      { label: 'ROC number', value: quote.vendorSnapshot?.rocNumber }
    ]);
    drawText(document, quote.legalDisclosure, { fallback: 'No disclosure supplied.', size: 8.5, color: '#526178' });
    document.moveDown(.8);
    drawNotice(document, 'This quote is not an invoice and does not confirm scheduling. Customer approval is handled separately.');
    addPageFooters(document, { reference: quote.quoteReference });
    document.end();
  });
}

module.exports = { createOutgoingQuotePdf };
