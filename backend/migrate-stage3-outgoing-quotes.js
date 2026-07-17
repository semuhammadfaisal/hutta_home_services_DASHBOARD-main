const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const QuoteSettings = require('./models/QuoteSettings');

async function run() {
  const apply = process.argv.includes('--apply');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const exists = await QuoteSettings.exists({ key: 'global' });
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', globalQuoteSettingsExists: Boolean(exists), defaults: { markup: '20%', validityDays: 30, termsConfigured: false } }, null, 2));
  if (apply && !exists) {
    await QuoteSettings.create({ key: 'global', defaultMarkupType: 'percentage', defaultMarkupValue: 20, defaultValidityDays: 30, termsAndConditions: '' });
    console.log('Created global Stage 3 quote settings. Configure approved terms before sending a quote.');
  }
  if (apply) {
    await Promise.all([
      mongoose.connection.collection('outgoingquotes').createIndex({ quoteReference: 1 }, { unique: true }),
      mongoose.connection.collection('outgoingquotes').createIndex({ orderId: 1, revisionNumber: 1 }, { unique: true }),
      mongoose.connection.collection('outgoingquotes').createIndex({ publicTokenHash: 1 }, { unique: true, sparse: true }),
      mongoose.connection.collection('outgoingquotes').createIndex({ orderId: 1 }, { unique: true, partialFilterExpression: { status: 'draft' }, name: 'one_outgoing_draft_per_order' })
    ]);
  }
  await mongoose.disconnect();
}

run().catch(error => { console.error(error.message); process.exitCode = 1; });
