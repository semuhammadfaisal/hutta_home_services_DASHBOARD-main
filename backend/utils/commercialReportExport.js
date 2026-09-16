const { createDocument, drawBrandHeader, drawSectionTitle, drawText, addPageFooters } = require('./pdfDesign');
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
function reportCsv(reports) {
  const rows = [['Period', 'Property', 'Client billed amount', 'Consolidated total', 'Paid', 'Balance due']];
  reports.forEach(report => report.properties.forEach(property => rows.push([report.period, property.propertyLabel, property.total, report.total, report.paid, report.balanceDue])));
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
function reportPdf(reports) {
  return new Promise((resolve, reject) => {
    const doc = createDocument({ title: 'Commercial Monthly Summary' }), chunks = [];
    doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    drawBrandHeader(doc, { documentType: 'Monthly Summary', reference: 'Client-facing report' });
    reports.forEach(report => {
      drawSectionTitle(doc, report.period);
      drawText(doc, `Billed $${report.total.toFixed(2)} · Paid $${report.paid.toFixed(2)} · Due $${report.balanceDue.toFixed(2)}`);
      report.properties.forEach(property => drawText(doc, `${property.propertyLabel} · $${property.total.toFixed(2)}`));
    });
    if (!reports.length) drawText(doc, 'No authorized invoices in this period.');
    addPageFooters(doc, { reference: 'Commercial Summary' }); doc.end();
  });
}
module.exports = { reportCsv, reportPdf, csvCell };
