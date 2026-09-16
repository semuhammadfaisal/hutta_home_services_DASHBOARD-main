const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const JobCompletion = require('./models/JobCompletion');
const JobSchedule = require('./models/JobSchedule');
const Order = require('./models/Order');
const VendorAssignmentMessage = require('./models/VendorAssignmentMessage');
const Vendor = require('./models/Vendor');
const VendorInvoice = require('./models/VendorInvoice');
const VendorPayout = require('./models/VendorPayout');
const VendorWorkOrder = require('./models/VendorWorkOrder');

const APPLY = process.argv.includes('--apply');
async function dropIfPresent(collection, name) { const indexes = await collection.indexes(); if (indexes.some(index => index.name === name)) await collection.dropIndex(name); }
async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const [orders, assignments] = await Promise.all([Order.countDocuments({ 'vendorAssignments.0': { $exists: true } }), Order.aggregate([{ $project: { count: { $size: { $ifNull: ['$vendorAssignments', []] } } } }, { $group: { _id: null, count: { $sum: '$count' } } }])]);
  if (APPLY) {
    const licensedVendorIds = await Vendor.find({ licensedTrade: true }).distinct('_id');
    await Order.updateMany({ 'vendorAssignments.0': { $exists: true } }, { $set: { 'vendorAssignments.$[item].status': 'assigned', 'vendorAssignments.$[item].completionRules': { requireServiceNotes: true, requireBeforePhotos: true, requireAfterPhotos: true } } }, { arrayFilters: [{ 'item.status': { $exists: false } }] });
    if (licensedVendorIds.length) await Order.updateMany({ 'vendorAssignments.vendor': { $in: licensedVendorIds } }, { $set: { 'vendorAssignments.$[item].billingLane': 'owner_billed' } }, { arrayFilters: [{ 'item.vendor': { $in: licensedVendorIds } }] });
    await Order.updateMany({ 'vendorAssignments.billingLane': { $exists: false } }, { $set: { 'vendorAssignments.$[item].billingLane': 'smplfix_direct' } }, { arrayFilters: [{ 'item.billingLane': { $exists: false } }] });
    await dropIfPresent(JobSchedule.collection, 'one_pending_schedule_per_order');
    await dropIfPresent(JobSchedule.collection, 'orderId_1_revisionNumber_1');
    await dropIfPresent(JobCompletion.collection, 'orderId_1');
    await Promise.all([Order.createIndexes(), JobSchedule.createIndexes(), VendorWorkOrder.createIndexes(), JobCompletion.createIndexes(), VendorAssignmentMessage.createIndexes(), VendorInvoice.createIndexes(), VendorPayout.createIndexes()]);
  }
  console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', ordersWithAssignments: orders, assignments: assignments[0]?.count || 0 }, null, 2));
  await mongoose.disconnect();
}
main().catch(async error => { console.error('Vendor assignment migration failed:', error.message); await mongoose.disconnect().catch(() => {}); process.exit(1); });
