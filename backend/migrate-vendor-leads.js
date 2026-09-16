const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const QuoteInvitation = require('./models/QuoteInvitation');
const Vendor = require('./models/Vendor');
const VendorPerformanceEvent = require('./models/VendorPerformanceEvent');
const VendorEstimateDraft = require('./models/VendorEstimateDraft');

const APPLY = process.argv.includes('--apply');
async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const [vendors, distributedLeads] = await Promise.all([Vendor.countDocuments({}), QuoteInvitation.countDocuments({ responseRequired: true })]);
  const missingPerformanceDefaults = await Vendor.countDocuments({ 'leadDistribution.performanceScore': { $exists: false } });
  if (APPLY) {
    await Vendor.updateMany({ 'leadDistribution.performanceScore': { $exists: false } }, { $set: { 'leadDistribution.paused': false, 'leadDistribution.performanceScore': 100 } });
    await Promise.all([Vendor.createIndexes(), QuoteInvitation.createIndexes(), VendorPerformanceEvent.createIndexes(), VendorEstimateDraft.createIndexes()]);
  }
  console.log('Vendor lead migration complete. Existing quotes and invitations were preserved.');
  console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', vendors, distributedLeads, performanceDefaultsToBackfill: missingPerformanceDefaults }, null, 2));
  await mongoose.disconnect();
}
main().catch(async error => { console.error('Vendor lead migration failed:', error.message); await mongoose.disconnect().catch(() => {}); process.exit(1); });
