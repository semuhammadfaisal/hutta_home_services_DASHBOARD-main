const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const apply = process.argv.includes('--apply');

async function ensureIndexes(model) {
  for (const [keys, options = {}] of model.schema.indexes()) {
    await model.collection.createIndex(keys, options);
  }
}

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const CloseoutSettings = require('./models/CloseoutSettings');
  const CustomerSatisfactionDecision = require('./models/CustomerSatisfactionDecision');
  const Order = require('./models/Order');
  const PaymentProofSubmission = require('./models/PaymentProofSubmission');
  const indexes = await CustomerSatisfactionDecision.collection.indexes().catch(() => []);
  const legacyUnique = indexes.find(index =>
    index.unique &&
    JSON.stringify(index.key) === JSON.stringify({ jobCompletionId: 1 })
  );
  const historicalCompleted = await Order.countDocuments({ workflowStatus: 'completed' });
  const scheduled = await Order.countDocuments({ workflowStatus: 'scheduled' });
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    historicalCompletedOrdersLeftUnchanged: historicalCompleted,
    scheduledOrdersUsingNewCloseoutFlow: scheduled,
    legacyDecisionIndexToReplace: legacyUnique?.name || null,
    collections: [
      CloseoutSettings.collection.collectionName,
      PaymentProofSubmission.collection.collectionName,
      CustomerSatisfactionDecision.collection.collectionName
    ]
  }, null, 2));
  if (apply) {
    if (legacyUnique) await CustomerSatisfactionDecision.collection.dropIndex(legacyUnique.name);
    await CloseoutSettings.updateOne(
      { key: 'global' },
      { $setOnInsert: { key: 'global' } },
      { upsert: true, setDefaultsOnInsert: true }
    );
    // Manage only indexes introduced or structurally changed by this migration.
    // Rebuilding indexes for legacy collections can conflict with production
    // indexes that intentionally use different uniqueness options.
    for (const model of [
      CloseoutSettings,
      PaymentProofSubmission,
      CustomerSatisfactionDecision
    ]) await ensureIndexes(model);
    console.log('Stage 6 customer closeout settings and indexes are ready.');
  } else {
    console.log('No changes made. Re-run with :apply after deployment.');
  }
  await mongoose.disconnect();
}

run().catch(async error => {
  console.error(`Stage 6 customer closeout migration failed: ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
