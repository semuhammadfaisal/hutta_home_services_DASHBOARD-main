require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mongoose = require('mongoose');
const AgentReferralAttribution = require('./models/AgentReferralAttribution');
const Notification = require('./models/Notification');
const Order = require('./models/Order');
const RealEstateAgentProfile = require('./models/RealEstateAgentProfile');
const RealEstateTransaction = require('./models/RealEstateTransaction');
const ResidentialMessage = require('./models/ResidentialMessage');

const APPLY = process.argv.includes('--apply');
async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const transactions = await RealEstateTransaction.find({ status: 'active', accessEndsAt: { $gt: new Date() } }).limit(20).lean();
  process.stdout.write(`${APPLY ? 'Applying' : 'Dry run:'} agent demo enrichment for ${transactions.length} active transaction(s).\n`);
  if (!APPLY) return;
  for (const transaction of transactions) {
    await RealEstateAgentProfile.updateOne({ userId: transaction.agentUserId }, { $set: { 'referralProgram.enabled': true, 'referralProgram.rewardLabel': 'SMPLfix referral credit', 'referralProgram.unitsPerCompletedJob': 1 } });
    await AgentReferralAttribution.updateOne({ transactionId: transaction._id }, { $setOnInsert: { agentUserId: transaction.agentUserId, customerId: transaction.customerId, propertyId: transaction.propertyId, source: 'agent_invitation', status: 'attributed', attributedAt: transaction.acceptedAt || transaction.createdAt } }, { upsert: true });
    const order = await Order.findOne({ customerId: transaction.customerId, propertyId: transaction.propertyId }).sort({ createdAt: -1 }).lean();
    if (order) await ResidentialMessage.updateOne({ orderId: order._id, senderType: 'staff', body: 'SMPLfix coordination is active for this transaction. Reply here to keep communication attached to the work item.' }, { $setOnInsert: { orderId: order._id, propertyId: transaction.propertyId, customerId: transaction.customerId, senderType: 'staff', body: 'SMPLfix coordination is active for this transaction. Reply here to keep communication attached to the work item.' } }, { upsert: true });
    await Notification.updateOne({ userId: transaction.agentUserId, 'metadata.demoKey': `transaction-package:${transaction._id}` }, { $setOnInsert: { userId: transaction.agentUserId, title: 'Transaction file workspace ready', message: `Completion records for ${transaction.label} will be packaged in Documents as work is completed.`, type: 'info', priority: 'low', actionUrl: '#documents', metadata: { demoKey: `transaction-package:${transaction._id}`, transactionId: transaction._id } } }, { upsert: true });
  }
}
if (require.main === module) run().then(() => mongoose.disconnect()).catch(error => { console.error(error.message); process.exitCode = 1; mongoose.disconnect(); });
module.exports = { run };
