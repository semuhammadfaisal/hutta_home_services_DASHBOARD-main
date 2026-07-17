const path = require('path'); const mongoose = require('mongoose'); require('dotenv').config({ path: path.join(__dirname, '.env') });
const apply = process.argv.includes('--apply');
async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const models = [require('./models/JobSchedule'), require('./models/VendorScheduleDecision'), require('./models/VendorWorkOrder'), require('./models/Order'), require('./models/EmailOutbox')];
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', customerApprovedOrdersReady: await models[3].countDocuments({ workflowStatus: 'customer_approved' }), note: 'Existing Orders are not modified' }, null, 2));
  if (apply) { await Promise.all(models.map(model => model.createIndexes())); console.log('Stage 5 indexes created.'); } else console.log('No changes made. Re-run with --apply after deployment.');
  await mongoose.disconnect();
}
run().catch(async error => { console.error(error.message); await mongoose.disconnect().catch(() => {}); process.exit(1); });
