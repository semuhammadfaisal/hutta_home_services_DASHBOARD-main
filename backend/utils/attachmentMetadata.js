const crypto = require('crypto');

function ensurePersistentAttachmentMetadata(entity) {
  let changed = false;
  (entity?.documents || []).forEach((document) => {
    if (!document.documentId || document.$isDefault?.('documentId')) {
      document.documentId = crypto.randomUUID();
      changed = true;
    }
    if (!document.status || document.$isDefault?.('status')) {
      document.status = 'active';
      changed = true;
    }
  });
  if (changed && typeof entity.markModified === 'function') {
    entity.markModified('documents');
  }
  return changed;
}

async function saveWithPersistentAttachmentMetadata(entity) {
  if (ensurePersistentAttachmentMetadata(entity) && typeof entity.save === 'function') {
    await entity.save();
  }
  return entity;
}

module.exports = {
  ensurePersistentAttachmentMetadata,
  saveWithPersistentAttachmentMetadata
};
