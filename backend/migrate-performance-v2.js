const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { normalizeSearch } = require('./utils/cursorPagination');
const models = {
  orders: require('./models/Order'), customers: require('./models/Customer'), vendors: require('./models/Vendor'),
  employees: require('./models/Employee'), payments: require('./models/Payment'), pipelineRecords: require('./models/PipelineRecord')
};
const apply = process.argv.includes('--apply');
const BATCH_SIZE = 500;
const mappings = {
  orders: d => ({ normalizedOrderId: normalizeSearch(d.orderId), normalizedRequestReference: normalizeSearch(d.requestReference), normalizedCustomerName: normalizeSearch(d.customer?.name), normalizedCustomerEmail: normalizeSearch(d.customer?.email), normalizedCustomerPhone: normalizeSearch(d.customer?.phone) }),
  customers: d => ({ normalizedName: normalizeSearch(d.name), normalizedEmail: normalizeSearch(d.email), normalizedPhone: normalizeSearch(d.phone) }),
  vendors: d => ({ normalizedName: normalizeSearch(d.name), normalizedEmail: normalizeSearch(d.email) }),
  employees: d => ({ normalizedName: normalizeSearch(d.name), normalizedEmail: normalizeSearch(d.email) }),
  payments: d => ({ normalizedPaymentId: normalizeSearch(d.paymentId), normalizedInvoiceNumber: normalizeSearch(d.invoiceNumber) })
};
async function backfill(name, Model, mapper) {
  if (!mapper) return 0;
  const cursor = Model.find({}).lean().cursor(); let operations = []; let count = 0;
  for await (const document of cursor) {
    operations.push({ updateOne: { filter: { _id: document._id }, update: { $set: mapper(document) } } });
    if (operations.length === BATCH_SIZE) { await Model.bulkWrite(operations, { ordered: false }); count += operations.length; operations = []; }
  }
  if (operations.length) { await Model.bulkWrite(operations, { ordered: false }); count += operations.length; }
  return count;
}
async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000, autoIndex: false });
  const report = {};
  for (const [name, Model] of Object.entries(models)) report[name] = { documents: await Model.estimatedDocumentCount(), indexes: (await Model.collection.indexes()).map(index => index.name) };
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', batchSize: BATCH_SIZE, collections: report }, null, 2));
  if (!apply) { console.log('No changes made. Re-run with --apply to backfill search fields and create indexes.'); return; }
  for (const [name, Model] of Object.entries(models)) {
    const updated = await backfill(name, Model, mappings[name]); await Model.createIndexes();
    console.log(`${name}: normalized ${updated} documents and synchronized indexes`);
  }
  const explain = await models.orders.find({ normalizedOrderId: /^ord/ }).select('_id').limit(10).explain('executionStats');
  const stats = explain.executionStats || {};
  console.log(JSON.stringify({ verification: { ordersPrefixSearch: { nReturned: stats.nReturned, totalDocsExamined: stats.totalDocsExamined, totalKeysExamined: stats.totalKeysExamined } } }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
