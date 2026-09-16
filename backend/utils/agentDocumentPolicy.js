const allowed = new Set(['inspection_report', 'supporting_photo', 'supporting_document', 'warranty', 'permit', 'inspection', 'appliance', 'paint', 'filter']);
function clientDocumentAllowed(document) {
  if (!document || document.status === 'archived') return false;
  const kind = document.portalDocumentType || document.complianceDocumentType || document.category;
  return allowed.has(kind);
}
module.exports = { clientDocumentAllowed };
