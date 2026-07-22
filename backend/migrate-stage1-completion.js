const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const IntakeSubmission = require('./models/IntakeSubmission');
const Order = require('./models/Order');

const APPLY = process.argv.includes('--apply');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const missingCompletionState = await IntakeSubmission.collection.countDocuments({ completionStatus: { $exists: false } });
  const summary = { mode: APPLY ? 'apply' : 'dry-run', existingIntakesAwaitingCompletionState: missingCompletionState };
  if (APPLY) {
    await IntakeSubmission.collection.updateMany(
      { completionStatus: { $exists: false } },
      { $set: { completionStatus: 'pending', completionEmailCount: 0 } }
    );
    await Promise.all([IntakeSubmission.createIndexes(), Order.createIndexes()]);
  }
  console.log('Stage 1 customer completion migration complete. No Orders, Payments, quotes, or emails were created.');
  console.log(JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
}

main().catch(async error => {
  console.error('Stage 1 customer completion migration failed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
