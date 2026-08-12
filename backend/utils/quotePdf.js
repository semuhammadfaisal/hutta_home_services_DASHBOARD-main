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
const formatDate = value => value
  ? new Date(value).toLocaleDateString('en-US', { timeZone: 'America/Phoenix', year: 'numeric', month: 'short', day: 'numeric' })
  : 'Not specified';

function createOutgoingQuotePdf(quote) {
  return new Promise((resolve, reject) => {
    const document = createDocument({ title: `Quote ${quote.quoteReference}`, subject: 'Customer service quote' });
    const chunks = [];
    document.on('data', chunk => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);

    drawBrandHeader(document, {
      documentType: 'Quote',
      reference: quote.quoteReference,
      status: 'Ready for review',
      meta: [`Revision ${quote.revisionNumber || 1}`]
    });
    drawMetadataColumns(document, [
      {
        label: 'Prepared for',
        value: quote.customerSnapshot?.name || 'Customer',
        lines: [quote.customerSnapshot?.address]
      },
      {
        label: 'Issued',
        value: formatDate(quote.sentAt || new Date()),
        lines: [`Valid through ${formatDate(quote.validUntil)}`]
      },
      {
        label: 'Service',
        value: quote.jobSnapshot?.service || 'Home service',
        lines: [quote.jobSnapshot?.requestReference || quote.jobSnapshot?.orderReference]
      }
    ]);

    drawLineItems(document, [{
      title: quote.jobSnapshot?.service || 'Home service',
      detail: quote.scopeOfWork || 'Service scope as discussed.',
      qty: '1',
      amount: money(quote.customerTotal)
    }]);
    drawTotals(document, {
      subtotal: money(quote.customerTotal),
      tax: money(0),
      total: money(quote.customerTotal),
      totalLabel: 'Quoted total'
    });

    const duration = quote.estimatedDuration?.value
      ? `${quote.estimatedDuration.value} ${quote.estimatedDuration.unit || ''}`.trim()
      : 'Not specified';
    drawNotePanel(document, {
      label: 'Service details',
      value: [
        `Estimated duration: ${duration}`,
        `Earliest availability: ${formatDate(quote.earliestAvailableDate)}`,
        quote.siteAccessRequired
          ? `Site access: Arrangement required${quote.accessNotes ? ` - ${quote.accessNotes}` : ''}`
          : 'Site access: No special arrangement required',
        `Exclusions / conditions: ${quote.exclusionsConditions || 'None stated'}`
      ].join('\n')
    });

    if (quote.termsAndConditions) {
      drawSectionTitle(document, 'Terms and conditions');
      drawText(document, quote.termsAndConditions, { size: 8.2, lineGap: 2 });
    }
    const contractorDisclosure = quote.legalDisclosure || [
      quote.vendorSnapshot?.licensedContractorName,
      quote.vendorSnapshot?.licenseType,
      quote.vendorSnapshot?.rocNumber
    ].filter(Boolean).join(' | ');
    drawNotePanel(document, {
      label: contractorDisclosure ? 'Contractor disclosure' : 'Note',
      value: [
        contractorDisclosure,
        'This quote is not an invoice and does not confirm scheduling. Customer approval is handled separately.'
      ].filter(Boolean).join('\n\n')
    });
    addPageFooters(document, { reference: quote.quoteReference });
    document.end();
  });
}

module.exports = { createOutgoingQuotePdf };
