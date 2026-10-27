require('dotenv').config();
const mongoose = require('mongoose');
const CustomerInvoice = require('./models/CustomerInvoice');
const Order = require('./models/Order');
const { invoiceSnapshotHash } = require('./utils/closeout');
const { publicContractorSnapshot, vendorContractorSnapshot } = require('./utils/vendorContractor');

const APPLY = process.argv.includes('--apply');

async function migrate() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 5000 });
  const invoices = await CustomerInvoice.find({ $or: [{ contractorSnapshot: { $exists: false } }, { 'contractorSnapshot.name': { $in: [null, ''] } }] }).lean();
  const stats = { mode: APPLY ? 'apply' : 'dry-run', scanned: invoices.length, eligible: 0, missingVendor: 0, updated: 0 };
  for (const invoice of invoices) {
    const order = await Order.findById(invoice.orderId).populate('vendor', 'name companyName legalBusinessName rocLicenseNumber rocNumber rocLicenseTypeClassification rocClassification').lean();
    if (!order?.vendor) { stats.missingVendor += 1; continue; }
    const contractorSnapshot = publicContractorSnapshot(vendorContractorSnapshot(order.vendor));
    if (!contractorSnapshot.name) { stats.missingVendor += 1; continue; }
    stats.eligible += 1;
    if (!APPLY) continue;
    const snapshotHash = invoiceSnapshotHash({ ...invoice, contractorSnapshot });
    const result = await CustomerInvoice.collection.updateOne({ _id: invoice._id }, { $set: { contractorSnapshot, snapshotHash } });
    stats.updated += result.modifiedCount || 0;
  }
  if (APPLY) await CustomerInvoice.createIndexes();
  console.log(JSON.stringify(stats, null, 2));
  if (!APPLY) console.log('Dry run only. Re-run with --apply after reviewing missing vendor relationships.');
}

if (require.main === module) migrate().catch(error => { console.error('Invoice contractor migration failed:', error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());

module.exports = { migrate };
