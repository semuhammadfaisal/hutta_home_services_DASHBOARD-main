const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const apply = process.argv.includes('--apply');

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const Vendor = require('./models/Vendor');
  const Order = require('./models/Order');
  const IncomingQuote = require('./models/IncomingQuote');
  const QuoteInvitation = require('./models/QuoteInvitation');
  const EmailOutbox = require('./models/EmailOutbox');

  const [vendors, unquotedOrders, existingQuotes] = await Promise.all([
    Vendor.countDocuments(),
    Order.countDocuments({ pricingStatus: 'unquoted' }),
    IncomingQuote.countDocuments()
  ]);
  console.log({ mode: apply ? 'apply' : 'dry-run', vendors, unquotedOrders, existingQuotes });
  if (apply) {
    await Promise.all([
      Vendor.createIndexes(),
      Order.createIndexes(),
      IncomingQuote.createIndexes(),
      QuoteInvitation.createIndexes(),
      EmailOutbox.createIndexes()
    ]);
    console.log('Stage 2 indexes created successfully');
  } else {
    console.log('No changes made. Re-run with --apply to create Stage 2 indexes.');
  }
  await mongoose.disconnect();
}

run().catch(async error => {
  console.error(error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
