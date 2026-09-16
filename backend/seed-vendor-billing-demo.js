const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const JobCompletion = require('./models/JobCompletion');
const Order = require('./models/Order');
const User = require('./models/User');
const Vendor = require('./models/Vendor');
const VendorInvoice = require('./models/VendorInvoice');
const VendorPayout = require('./models/VendorPayout');
const VendorPortalMembership = require('./models/VendorPortalMembership');

const APPLY = process.argv.includes('--apply');
const value = name => process.argv.find(item => item.startsWith(`${name}=`))?.slice(name.length + 1);
async function uploadFixture(invoiceNumber, vendorId, assignmentId) {
  const data = Buffer.from(`%PDF-1.4\n% SMPLfix vendor billing demo\n${invoiceNumber}\n%%EOF`); const sha256 = crypto.createHash('sha256').update(data).digest('hex'); const documentId = crypto.randomUUID();
  const stream = new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' }).openUploadStream(`${invoiceNumber}.pdf`, { metadata: { source: 'vendor-invoice-demo', vendorId: String(vendorId), assignmentId: String(assignmentId), documentId, sha256, linkStatus: 'linked' } });
  const fileId = await new Promise((resolve, reject) => { stream.once('error', reject); stream.once('finish', () => resolve(stream.id)); stream.end(data); }); return { documentId, name: `${invoiceNumber}.pdf`, mimeType: 'application/pdf', size: data.length, fileId, sha256 };
}
async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required'); const email = String(value('--vendor-email') || '').toLowerCase(); if (!email) throw new Error('Pass --vendor-email=vendor@example.com');
  await mongoose.connect(process.env.MONGODB_URI); const vendor = await Vendor.findOne({ email }); if (!vendor) throw new Error('Vendor not found');
  const orders = await Order.find({ 'vendorAssignments.vendor': vendor._id }); const eligible = [];
  for (const order of orders) for (const assignment of order.vendorAssignments.filter(item => String(item.vendor) === String(vendor._id) && ['completion_submitted', 'completed'].includes(item.status) && !item.vendorInvoiceId)) { const completion = await JobCompletion.findOne({ orderId: order._id, assignmentId: assignment._id, vendorId: vendor._id, status: 'completed' }); if (completion) eligible.push({ order, assignment, completion }); }
  console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', vendor: vendor.name, eligibleAssignments: eligible.length }, null, 2)); if (!APPLY) return mongoose.disconnect();
  const membership = await VendorPortalMembership.findOne({ vendorId: vendor._id, status: 'active' }); const user = membership ? await User.findOne({ _id: membership.userId, role: 'vendor', isActive: true }) : null; if (!user) throw new Error('An active login for this vendor is required for demo attribution');
  for (const [index, entry] of eligible.slice(0, 2).entries()) { const invoiceNumber = `DEMO-${new Date().getUTCFullYear()}-${String(index + 1).padStart(3, '0')}`; const sourceDocument = await uploadFixture(invoiceNumber, vendor._id, entry.assignment._id); const amount = index ? 315 : 185; const lane = vendor.licensedTrade ? 'owner_billed' : (entry.assignment.billingLane || 'smplfix_direct'); const invoice = await VendorInvoice.create({ assignmentId: entry.assignment._id, orderId: entry.order._id, vendorId: vendor._id, jobCompletionId: entry.completion._id, invoiceNumber, normalizedInvoiceNumber: invoiceNumber, billingLane: lane, servicePeriodStart: entry.assignment.scheduledStart || new Date(), servicePeriodEnd: entry.assignment.scheduledEnd || new Date(), lineItems: [{ description: index ? 'Completed materials and service' : 'Completed service visit', quantity: 1, unit: 'job', unitPrice: amount, amount }], amount, notes: 'Realistic opt-in demo record', sourceDocument, status: lane === 'owner_billed' ? 'approved' : 'under_review', submittedBy: user._id, history: [{ action: 'demo_seeded', actorType: 'system' }], demoData: true }); if (lane === 'smplfix_direct') await VendorPayout.create({ vendorInvoiceId: invoice._id, assignmentId: entry.assignment._id, orderId: entry.order._id, vendorId: vendor._id, amount, status: index ? 'scheduled' : 'pending', providerReference: index ? `po_demo_${Date.now()}` : undefined, scheduledFor: index ? new Date(Date.now() + 3 * 86400000) : undefined, history: [{ status: index ? 'scheduled' : 'pending', message: 'Demo payout state' }], demoData: true }); entry.assignment.vendorInvoiceId = invoice._id; await entry.order.save(); }
  await mongoose.disconnect();
}
main().catch(async error => { console.error('Vendor billing demo seed failed:', error.message); await mongoose.disconnect().catch(() => {}); process.exit(1); });
