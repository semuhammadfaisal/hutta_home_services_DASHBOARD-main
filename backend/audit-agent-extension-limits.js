require('dotenv').config();
const mongoose = require('mongoose');
const RealEstateTransaction = require('./models/RealEstateTransaction');
const { calculateAccessExpiry } = require('./utils/agentAccess');

async function audit() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 5000 });
  const transactions = await RealEstateTransaction.find({ acceptedAt: { $exists: true, $ne: null } }).select('_id label closeDate accessEndsAt status agentUserId').lean();
  const violations = transactions.flatMap(item => {
    const maximumAccessEndsAt = calculateAccessExpiry(item.closeDate, 30);
    return maximumAccessEndsAt && new Date(item.accessEndsAt) > maximumAccessEndsAt ? [{ id: String(item._id), label: item.label, status: item.status, agentUserId: String(item.agentUserId), accessEndsAt: item.accessEndsAt, maximumAccessEndsAt }] : [];
  });
  console.log(JSON.stringify({ mode: 'dry-run', scanned: transactions.length, violations: violations.length, records: violations }, null, 2));
  if (violations.length) console.log('No records were changed. Review these transactions manually before deployment.');
}

if (require.main === module) audit().catch(error => { console.error('Agent extension audit failed:', error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());

module.exports = { audit };
