const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const apply = process.argv.includes('--apply');

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const CustomerQuoteDecision = require('./models/CustomerQuoteDecision');
  const EmailOutbox = require('./models/EmailOutbox');
  const Order = require('./models/Order');
  const OutgoingQuote = require('./models/OutgoingQuote');

  const [sentWithoutState, otherWithoutState, decisions] = await Promise.all([
    OutgoingQuote.countDocuments({ status: 'sent', customerDecisionStatus: { $exists: false } }),
    OutgoingQuote.countDocuments({ status: { $ne: 'sent' }, customerDecisionStatus: { $exists: false } }),
    CustomerQuoteDecision.countDocuments()
  ]);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', sentQuotesToMarkPending: sentWithoutState, otherQuotesToMarkNotRequested: otherWithoutState, existingDecisions: decisions }, null, 2));

  if (apply) {
    const [sentUpdate, otherUpdate] = await Promise.all([
      OutgoingQuote.updateMany({ status: 'sent', customerDecisionStatus: { $exists: false } }, { $set: { customerDecisionStatus: 'pending' } }),
      OutgoingQuote.updateMany({ status: { $ne: 'sent' }, customerDecisionStatus: { $exists: false } }, { $set: { customerDecisionStatus: 'not_requested' } })
    ]);
    await Promise.all([
      CustomerQuoteDecision.createIndexes(),
      EmailOutbox.createIndexes(),
      Order.createIndexes(),
      OutgoingQuote.createIndexes()
    ]);
    console.log(JSON.stringify({ sentQuotesUpdated: sentUpdate.modifiedCount, otherQuotesUpdated: otherUpdate.modifiedCount, indexesCreated: true }, null, 2));
  } else {
    console.log('No changes made. Re-run with --apply after deployment.');
  }
  await mongoose.disconnect();
}

run().catch(async error => {
  console.error(error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
