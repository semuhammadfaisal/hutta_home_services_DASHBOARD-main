const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const AgentClientInvitation = require('./models/AgentClientInvitation');

const apply = process.argv.includes('--apply');

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
  const duplicates = await AgentClientInvitation.aggregate([
    { $match: { status: 'pending' } },
    { $group: { _id: { agentUserId: '$agentUserId', homeownerEmail: '$homeownerEmail', propertyFingerprint: '$propertyFingerprint' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 20 }
  ]);
  const plannedIndexes = AgentClientInvitation.schema.indexes().map(([keys, options]) => ({ keys, name: options.name || null, unique: options.unique === true, partialFilterExpression: options.partialFilterExpression || null }));
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', collection: AgentClientInvitation.collection.collectionName, duplicatePendingGroups: duplicates.length, plannedIndexes }, null, 2));
  if (!apply) {
    console.log('No changes made. Re-run with migrate:agent-client-invitations:apply after deployment.');
    return mongoose.disconnect();
  }
  if (duplicates.length) throw new Error('Duplicate pending invitations must be resolved before creating the unique index');
  const exists = await mongoose.connection.db.listCollections({ name: AgentClientInvitation.collection.collectionName }).hasNext();
  if (!exists) await AgentClientInvitation.createCollection();
  for (const [keys, options] of AgentClientInvitation.schema.indexes()) await AgentClientInvitation.collection.createIndex(keys, options);
  console.log('Agent-to-client invitation indexes are ready.');
  await mongoose.disconnect();
}

run().catch(async error => {
  console.error(`Agent-to-client invitation migration failed: ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
