const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const QuoteInvitation = require('./models/QuoteInvitation');
const Notification = require('./models/Notification');
const User = require('./models/User');
const { recordPerformanceEvent } = require('./utils/vendorLeadResponses');

async function run(now = new Date()) {
  const staff = await User.find({ isActive: true, role: { $in: ['admin', 'manager', 'account_rep'] } }).select('_id').lean();
  const notify = async (invitation, title, message) => {
    if (staff.length) await Notification.insertMany(staff.map(user => ({ userId: user._id, title, message, type: 'warning', priority: 'high', actionUrl: '#incoming-quotes', metadata: { invitationId: invitation._id, orderId: invitation.orderId, vendorId: invitation.vendorId } })));
  };
  const expiredResponses = await QuoteInvitation.find({ responseRequired: true, status: { $in: ['sent', 'delivery_failed'] }, responseDueAt: { $lte: now } });
  let noResponse = 0;
  for (const invitation of expiredResponses) {
    const changed = await QuoteInvitation.findOneAndUpdate({ _id: invitation._id, status: { $in: ['sent', 'delivery_failed'] }, responseDueAt: { $lte: now } }, { $set: { status: 'expired', respondedAt: now }, $push: { responseHistory: { action: 'expired', actorType: 'system', message: 'Vendor did not respond by the response deadline', createdAt: now } } }, { new: true });
    if (!changed) continue;
    await recordPerformanceEvent({ invitation: changed, type: 'lead_no_response', responseTimeMs: Math.max(0, now - new Date(changed.sentAt || changed.createdAt)), metadata: { responseDueAt: changed.responseDueAt } });
    await notify(changed, 'Vendor lead response missed', 'A vendor did not answer a lead by its response deadline.');
    noResponse++;
  }

  const overdueBids = await QuoteInvitation.find({ responseRequired: true, status: 'accepted_to_bid', bidDueAt: { $lte: now }, bidDueMissedAt: { $exists: false } });
  let missedBids = 0;
  for (const invitation of overdueBids) {
    const changed = await QuoteInvitation.findOneAndUpdate({ _id: invitation._id, status: 'accepted_to_bid', bidDueAt: { $lte: now }, bidDueMissedAt: { $exists: false } }, { $set: { bidDueMissedAt: now }, $push: { responseHistory: { action: 'bid_due_missed', actorType: 'system', message: 'Accepted lead passed its bid deadline without an estimate', createdAt: now } } }, { new: true });
    if (!changed) continue;
    await recordPerformanceEvent({ invitation: changed, type: 'bid_due_missed', metadata: { bidDueAt: changed.bidDueAt } });
    await notify(changed, 'Vendor estimate overdue', 'A vendor accepted a lead but did not submit its estimate by the bid deadline.');
    missedBids++;
  }
  return { noResponse, missedBids };
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const summary = await run();
  console.log(JSON.stringify(summary));
  await mongoose.disconnect();
}

if (require.main === module) main().catch(async error => { console.error(error.message); await mongoose.disconnect().catch(() => {}); process.exit(1); });
module.exports = { run };
