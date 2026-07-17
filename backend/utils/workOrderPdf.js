const PDFDocument = require('pdfkit');
const path = require('path');

const when = value => new Date(value).toLocaleString('en-US', { timeZone: 'America/Phoenix', dateStyle: 'full', timeStyle: 'short' });
function createVendorWorkOrderPdf(workOrder) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 48, info: { Title: `Work Order ${workOrder.workOrderReference}`, Author: 'Hutta Home Services' } });
    const chunks = []; doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    try { doc.image(path.resolve(__dirname, '../../assets/images/logo.png'), 48, 40, { width: 105 }); } catch (_error) { /* text branding remains */ }
    doc.fillColor('#0056b8').fontSize(22).text('Hutta Home Services', 175, 48, { align: 'right' });
    doc.moveTo(48, 105).lineTo(564, 105).strokeColor('#d7e3f1').stroke();
    doc.fillColor('#172033').fontSize(25).text('VENDOR WORK ORDER', 48, 126);
    doc.fillColor('#526178').fontSize(10).text(`Work order: ${workOrder.workOrderReference}  •  Schedule revision ${workOrder.revisionNumber}`);
    doc.text(`Generated: ${when(workOrder.generatedAt || new Date())}`); doc.moveDown(1.2);
    const section = (title, lines) => { doc.fillColor('#0056b8').fontSize(11).text(title); doc.fillColor('#27364b').fontSize(10); lines.filter(Boolean).forEach(line => doc.text(line, { lineGap: 2 })); doc.moveDown(1); };
    section('VENDOR', [workOrder.vendorSnapshot?.name, workOrder.vendorSnapshot?.email, workOrder.vendorSnapshot?.phone]);
    section('CUSTOMER AND SERVICE LOCATION', [workOrder.customerSnapshot?.name, workOrder.customerSnapshot?.phone, workOrder.customerSnapshot?.email, workOrder.customerSnapshot?.address]);
    section('CONFIRMED SCHEDULE — ARIZONA TIME', [`Start: ${when(workOrder.scheduledStart)}`, `End: ${when(workOrder.scheduledEnd)}`]);
    section('SERVICE', [workOrder.jobSnapshot?.service, `Request: ${workOrder.jobSnapshot?.requestReference || workOrder.jobSnapshot?.orderReference || '—'}`]);
    section('APPROVED SCOPE OF WORK', [workOrder.jobSnapshot?.scopeOfWork || 'No scope supplied.']);
    section('ACCESS INSTRUCTIONS', [workOrder.accessInstructions || 'No special access instructions.']);
    doc.moveDown(1).fillColor('#8a97a8').fontSize(8).text('This work order reflects the vendor-confirmed schedule. Contact Hutta Home Services at sales@huttas.com regarding any required changes.', { align: 'center' });
    doc.end();
  });
}
module.exports = { createVendorWorkOrderPdf };
