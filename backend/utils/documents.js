function prepareDocumentUpdate(_existingDocuments, requestBody = {}) {
  const update = { ...requestBody };
  // Attachments are changed only through /api/attachments. Entity updates must
  // never replace, merge, archive, or otherwise mutate permanent document data.
  delete update.documents;
  delete update.documentsMode;

  return update;
}

module.exports = { prepareDocumentUpdate };
