const mongoose = require('mongoose');
require('dotenv').config();
mongoose.set('autoIndex', false);

const Order = require('./models/Order');
const PipelineRecord = require('./models/PipelineRecord');
const Stage = require('./models/Stage');
const { STAGE_DEFINITIONS, WORKFLOW_STATUS, synchronizeWorkflowOrder } = require('./utils/workflowSync');

const apply = process.argv.includes('--apply');

async function duplicates() {
  const duplicateOrderIds = await PipelineRecord.aggregate([
    { $match: { orderId: { $exists: true, $ne: null } } },
    { $group: { _id: '$orderId', count: { $sum: 1 }, records: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } }
  ]);
  const linkedOrders = await Order.find({ pipelineRecordId: { $exists: true, $ne: null } })
    .select('_id orderId pipelineRecordId')
    .lean();
  const directRecords = await PipelineRecord.find({ orderId: { $in: linkedOrders.map(order => order._id) } })
    .select('_id orderId')
    .lean();
  const byOrder = new Map();
  directRecords.forEach(record => {
    const key = String(record.orderId);
    if (!byOrder.has(key)) byOrder.set(key, []);
    byOrder.get(key).push(String(record._id));
  });
  const backlinkConflicts = linkedOrders.flatMap(order => {
    const records = new Set([String(order.pipelineRecordId), ...(byOrder.get(String(order._id)) || [])]);
    return records.size > 1 ? [{ _id: order._id, orderId: order.orderId, count: records.size, records: [...records], source: 'order_backlink' }] : [];
  });
  return [...duplicateOrderIds, ...backlinkConflicts];
}

async function stagePlan() {
  const stages = await Stage.find().sort({ position: 1 }).lean();
  return Object.entries(STAGE_DEFINITIONS).map(([systemKey, definition]) => {
    const matched = stages.find(stage =>
      stage.systemKey === systemKey ||
      definition.aliases.some(pattern => pattern.test(String(stage.name || '').trim()))
    );
    return { systemKey, expectedName: definition.name, matchedId: matched?._id, currentName: matched?.name };
  });
}

async function applyStageKeys(plan) {
  for (const item of plan) {
    if (!item.matchedId) {
      const definition = STAGE_DEFINITIONS[item.systemKey];
      await Stage.create({
        name: definition.name,
        position: definition.position,
        description: `System Pipeline stage: ${definition.name}`,
        systemKey: item.systemKey
      });
      continue;
    }
    const update = { systemKey: item.systemKey };
    if (item.systemKey === 'approved_ready_to_schedule' && item.currentName !== item.expectedName) update.name = item.expectedName;
    await Stage.updateOne({ _id: item.matchedId }, { $set: update });
  }
}

async function resolveBacklinkConflicts(conflicts) {
  const archive = mongoose.connection.collection('pipeline_record_duplicate_archives');
  let resolved = 0;

  for (const conflict of conflicts) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const order = await Order.findById(conflict._id).session(session);
        if (!order?.pipelineRecordId) throw new Error(`Order ${conflict.orderId || conflict._id} no longer has a Pipeline backlink`);

        const records = await PipelineRecord.find({ _id: { $in: conflict.records } })
          .sort({ updatedAt: -1 })
          .session(session);
        const canonical = records.find(record => String(record._id) === String(order.pipelineRecordId));
        if (!canonical) throw new Error(`The canonical Pipeline record for ${order.orderId} is missing`);

        const redundant = records.filter(record => String(record._id) !== String(canonical._id));
        if (!redundant.length) return;

        const fillable = ['customerName', 'email', 'phone', 'priority', 'budget', 'startDate', 'address', 'description', 'notes'];
        for (const duplicate of redundant) {
          for (const field of fillable) {
            if ((canonical[field] === undefined || canonical[field] === null || canonical[field] === '') &&
                duplicate[field] !== undefined && duplicate[field] !== null && duplicate[field] !== '') {
              canonical[field] = duplicate[field];
            }
          }
        }
        if (!canonical.notesHistory) canonical.notesHistory = [];
        const noteIds = new Set(canonical.notesHistory.map(note => String(note._id || JSON.stringify(note))));
        for (const duplicate of redundant) {
          for (const note of duplicate.notesHistory || []) {
            const key = String(note._id || JSON.stringify(note));
            if (!noteIds.has(key)) {
              canonical.notesHistory.push(note);
              noteIds.add(key);
            }
          }
        }

        await archive.insertMany(redundant.map(record => ({
          originalRecordId: record._id,
          orderId: order._id,
          orderReference: order.orderId,
          canonicalRecordId: canonical._id,
          archivedAt: new Date(),
          reason: 'duplicate_order_backlink',
          originalRecord: record.toObject()
        })), { session });

        await PipelineRecord.deleteMany({ _id: { $in: redundant.map(record => record._id) } }, { session });
        canonical.orderId = order._id;
        canonical.orderIdDisplay = canonical.orderIdDisplay || order.orderId;
        canonical.stageSource = canonical.stageSource || 'manual';
        canonical.stageSyncedAt = new Date();
        await canonical.save({ session });

        const stage = await Stage.findById(canonical.stageId).session(session);
        order.pipelineRecordId = canonical._id;
        if (stage?.name) order.pipelineStage = stage.name;
        await order.save({ session });
        resolved += redundant.length;
      });
    } finally {
      await session.endSession();
    }
  }
  return resolved;
}

async function ensureUniqueOrderIndex() {
  const indexes = await PipelineRecord.collection.indexes();
  const orderIndex = indexes.find(index => index.key?.orderId === 1 && Object.keys(index.key).length === 1);
  if (orderIndex && !orderIndex.unique) await PipelineRecord.collection.dropIndex(orderIndex.name);
  await PipelineRecord.collection.createIndex({ orderId: 1 }, { name: 'orderId_1', unique: true, sparse: true, background: true });
  await Stage.collection.createIndex({ systemKey: 1 }, { name: 'systemKey_1', unique: true, sparse: true, background: true });
}

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);

  const [stageAssignments, duplicateRecords, workflowOrders, missingPipeline, inconsistentStatus] = await Promise.all([
    stagePlan(),
    duplicates(),
    Order.countDocuments({ workflowStatus: { $in: Object.keys(WORKFLOW_STATUS) } }),
    Order.countDocuments({ workflowStatus: { $in: Object.keys(WORKFLOW_STATUS) }, pipelineRecordId: { $exists: false } }),
    Order.countDocuments({
      $or: Object.entries(WORKFLOW_STATUS).map(([workflowStatus, mapping]) => ({
        workflowStatus,
        status: { $ne: mapping.orderStatus }
      }))
    })
  ]);

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    workflowOrders,
    missingPipeline,
    inconsistentStatus,
    duplicateOrderLinks: duplicateRecords,
    stageAssignments
  }, null, 2));

  if (!apply) return;
  const directDuplicates = duplicateRecords.filter(item => item.source !== 'order_backlink');
  if (directDuplicates.length) throw new Error('Multiple Pipeline records directly claim the same Order; review the dry-run report before applying');

  const backlinkConflicts = duplicateRecords.filter(item => item.source === 'order_backlink');
  const archivedDuplicates = await resolveBacklinkConflicts(backlinkConflicts);
  const remainingDuplicates = await duplicates();
  if (remainingDuplicates.length) throw new Error('Duplicate Pipeline records remain after safe backlink reconciliation');

  await applyStageKeys(stageAssignments);
  await ensureUniqueOrderIndex();

  let synchronized = 0;
  let skipped = 0;
  const cursor = Order.find({ workflowStatus: { $in: Object.keys(WORKFLOW_STATUS) } }).cursor();
  for await (const order of cursor) {
    try {
      await synchronizeWorkflowOrder(order, order.workflowStatus);
      synchronized += 1;
    } catch (error) {
      skipped += 1;
      console.error(`Skipped ${order.orderId || order._id}: ${error.message}`);
    }
  }

  console.log(JSON.stringify({ applied: true, archivedDuplicates, synchronized, skipped }, null, 2));
}

run()
  .catch(error => {
    console.error(`Workflow/Pipeline synchronization migration failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
