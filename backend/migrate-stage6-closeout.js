const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const apply = process.argv.includes('--apply');

async function createModelIndexes(model) {
  const collection = model.collection;
  const existing = await collection.indexes().catch(() => []);
  const byName = new Map(existing.map(index => [index.name, index]));
  for (const [keys, options = {}] of model.schema.indexes()) {
    const requestedName = options.name || Object.entries(keys).map(([key, direction]) => `${key}_${direction}`).join('_');
    const current = byName.get(requestedName);
    if (current) {
      const sameKeys = JSON.stringify(current.key) === JSON.stringify(keys);
      const sameUnique = Boolean(current.unique) === Boolean(options.unique);
      const sameSparse = Boolean(current.sparse) === Boolean(options.sparse);
      const currentPartial = JSON.stringify(current.partialFilterExpression || {});
      const requestedPartial = JSON.stringify(options.partialFilterExpression || {});
      if (sameKeys && sameUnique && sameSparse && currentPartial === requestedPartial) continue;
      throw new Error(`Index ${model.collection.collectionName}.${requestedName} exists with different options; review it before applying Stage 6`);
    }
    await collection.createIndex(keys, { ...options, name: requestedName });
  }
}

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const models = [
    require('./models/JobCompletion'),
    require('./models/CustomerInvoice'),
    require('./models/CustomerSatisfactionDecision'),
    require('./models/Order'),
    require('./models/Payment'),
    require('./models/EmailOutbox')
  ];
  const scheduledReady = await models[3].countDocuments({ workflowStatus: 'scheduled' });
  const legacyCompleted = await models[3].countDocuments({
    status: 'completed',
    workflowStatus: { $nin: ['completed', 'closeout_issue_reported'] }
  });
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    scheduledOrdersReadyForStage6: scheduledReady,
    legacyCompletedOrdersLeftUnchanged: legacyCompleted,
    collections: models.map(model => model.collection.collectionName),
    note: 'No existing Order or Payment data is modified'
  }, null, 2));
  if (apply) {
    for (const model of models) await createModelIndexes(model);
    console.log('Stage 6 indexes created or already present.');
  } else {
    console.log('No changes made. Re-run migrate:stage6-closeout:apply after deployment.');
  }
  await mongoose.disconnect();
}

run().catch(async error => {
  console.error(`Stage 6 closeout migration failed: ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
