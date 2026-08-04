const {
  addPageFooters,
  createDocument,
  drawBrandHeader,
  drawDetailsGrid,
  drawNotice,
  drawSectionTitle,
  drawText
} = require('./pdfDesign');

const when = value => value
  ? new Date(value).toLocaleString('en-US', { timeZone: 'America/Phoenix', dateStyle: 'full', timeStyle: 'short' })
  : 'Not specified';

function createVendorWorkOrderPdf(workOrder) {
  return new Promise((resolve, reject) => {
    const doc = createDocument({ title: `Work Order ${workOrder.workOrderReference}`, subject: 'Vendor work order' });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawBrandHeader(doc, {
      documentType: 'Vendor work order',
      reference: workOrder.workOrderReference,
      status: 'Confirmed',
      meta: [
        `Schedule revision ${workOrder.revisionNumber || 1}`,
        `Generated ${when(workOrder.generatedAt || new Date())}`
      ]
    });
    drawDetailsGrid(doc, [
      { label: 'Vendor', value: workOrder.vendorSnapshot?.name },
      {
        label: 'Vendor contact',
        value: [workOrder.vendorSnapshot?.email, workOrder.vendorSnapshot?.phone].filter(Boolean).join('  |  ')
      },
      { label: 'Customer', value: workOrder.customerSnapshot?.name },
      {
        label: 'Customer contact',
        value: [workOrder.customerSnapshot?.phone, workOrder.customerSnapshot?.email].filter(Boolean).join('  |  ')
      },
      { label: 'Service address', value: workOrder.customerSnapshot?.address },
      { label: 'Request reference', value: workOrder.jobSnapshot?.requestReference || workOrder.jobSnapshot?.orderReference }
    ]);
    drawSectionTitle(doc, 'Confirmed schedule - Arizona time');
    drawDetailsGrid(doc, [
      { label: 'Start', value: when(workOrder.scheduledStart) },
      { label: 'End', value: when(workOrder.scheduledEnd) }
    ]);
    drawSectionTitle(doc, 'Service');
    drawText(doc, workOrder.jobSnapshot?.service, { bold: true, fallback: 'Service' });
    drawSectionTitle(doc, 'Approved scope of work');
    drawText(doc, workOrder.jobSnapshot?.scopeOfWork, { fallback: 'No scope supplied.' });
    drawSectionTitle(doc, 'Access instructions');
    drawText(doc, workOrder.accessInstructions, { fallback: 'No special access instructions.' });
    doc.moveDown(.8);
    drawNotice(doc, 'This work order reflects the vendor-confirmed schedule. Contact smplfix at sales@smplfix.com regarding any required changes.');
    addPageFooters(doc, { reference: workOrder.workOrderReference });
    doc.end();
  });
}

module.exports = { createVendorWorkOrderPdf };
