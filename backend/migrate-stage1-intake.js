const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const Order = require('./models/Order');

const APPLY = process.argv.includes('--apply');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);

  const [missingSource, missingPricingStatus] = await Promise.all([
    Order.collection.countDocuments({ source: { $exists: false } }),
    Order.collection.countDocuments({ pricingStatus: { $exists: false } })
  ]);
  const summary = {
    mode: APPLY ? 'apply' : 'dry-run',
    sourceBackfills: missingSource,
    pricingStatusBackfills: missingPricingStatus
  };

  if (APPLY) {
    await Order.collection.updateMany({ source: { $exists: false } }, { $set: { source: 'manual' } });
    await Order.collection.updateMany({ pricingStatus: { $exists: false } }, { $set: { pricingStatus: 'quoted' } });
    await Promise.all([
      require('./models/IntakeSubmission').createIndexes(),
      require('./models/EmailOutbox').createIndexes(),
      Order.createIndexes()
    ]);
  }

  console.log('Stage 1 intake migration complete. No orders were deleted and no payments were created.');
  console.log(JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
}

main().catch(async error => {
  console.error('Stage 1 intake migration failed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
