const { addPageFooters, createDocument, drawBrandHeader, drawMetadataColumns, drawNotePanel, drawSectionTitle, drawText } = require('./pdfDesign');

const date = value => value ? new Date(value).toLocaleDateString('en-US', { timeZone: 'America/Phoenix', year: 'numeric', month: 'short', day: 'numeric' }) : 'Not available';
const money = value => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function createAgentTransactionPackagePdf(pkg) {
  return new Promise((resolve, reject) => {
    const document = createDocument({ title: `${pkg.transaction.label} transaction package`, subject: 'Client-safe real estate transaction completion package' });
    const chunks = [];
    document.on('data', chunk => chunks.push(chunk)); document.on('end', () => resolve(Buffer.concat(chunks))); document.on('error', reject);
    drawBrandHeader(document, { documentType: 'Transaction File', reference: pkg.packageReference, status: 'Client-safe package', meta: [`Generated ${date(pkg.generatedAt)}`] });
    drawMetadataColumns(document, [
      { label: 'Transaction', value: pkg.transaction.label, lines: [`Close date ${date(pkg.transaction.closeDate)}`] },
      { label: 'Property', value: pkg.property.label, lines: [pkg.property.address] },
      { label: 'Package contents', value: `${pkg.summary.completedJobs} completed job(s)`, lines: [`${pkg.summary.documents} file(s)`, `${pkg.summary.estimates} estimate(s)`, `${pkg.summary.invoices} invoice(s)`] }
    ]);
    drawNotePanel(document, { label: 'Privacy boundary', value: 'This package contains client-facing records only. Payment credentials, raw vendor estimates, vendor private contact information, internal notes, costs, markup, fees, profit, and margin are excluded.' });
    drawSectionTitle(document, 'Service completion summaries');
    if (!pkg.completions.length) drawText(document, 'No completed service records are available yet.', { color: '#77777C' });
    pkg.completions.forEach(item => {
      drawText(document, `${item.service} · ${item.completionReference || item.orderReference}`, { bold: true, size: 10 });
      drawText(document, `Completed ${date(item.completedAt)} · ${item.beforePhotos.length} before photo(s) · ${item.afterPhotos.length} after photo(s)`, { size: 8 });
      drawText(document, item.serviceNotes || 'No client-facing service note was supplied.', { size: 8 }); document.moveDown(.55);
    });
    drawSectionTitle(document, 'Client-facing estimates');
    if (!pkg.estimates.length) drawText(document, 'No client-facing estimates are included.', { color: '#77777C' });
    pkg.estimates.forEach(item => drawText(document, `${item.quoteReference} · ${item.service} · ${money(item.clientTotal)} · ${item.decisionStatus || item.status}`, { size: 8.5 }));
    drawSectionTitle(document, 'Client invoices');
    if (!pkg.invoices.length) drawText(document, 'No client invoices are included.', { color: '#77777C' });
    pkg.invoices.forEach(item => drawText(document, `${item.invoiceNumber} · ${item.service} · ${money(item.clientTotal)} · issued ${date(item.issuedAt)}`, { size: 8.5 }));
    drawSectionTitle(document, 'Authorized documents and warranties');
    if (!pkg.documents.length) drawText(document, 'No additional authorized documents are included.', { color: '#77777C' });
    pkg.documents.forEach(item => drawText(document, `${item.category || 'Document'} · ${item.name}`, { size: 8.5 }));
    addPageFooters(document, { reference: pkg.packageReference }); document.end();
  });
}

module.exports = { createAgentTransactionPackagePdf };
