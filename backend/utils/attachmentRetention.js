const mongoose = require('mongoose');

async function retainEntityAttachments(entityType, entity, req) {
  if (!entity || !Array.isArray(entity.documents) || entity.documents.length === 0) return;
  const collection = mongoose.connection.db.collection('attachment_retention');
  await collection.updateOne(
    { entityType, entityId: String(entity._id) },
    { $set: {
      entityType,
      entityId: String(entity._id),
      entityLabel: entity.name || entity.orderId || '',
      documents: entity.documents.map(document => document.toObject ? document.toObject() : document),
      retainedAt: new Date(),
      retainedBy: String(req?.user?.userId || req?.user?.id || ''),
      retainedByEmail: req?.user?.email || '',
      reason: 'Source entity deleted; attachments permanently retained'
    } },
    { upsert: true }
  );
}

module.exports = { retainEntityAttachments };
