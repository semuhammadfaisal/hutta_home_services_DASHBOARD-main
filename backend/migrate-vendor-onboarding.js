const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const Vendor = require('./models/Vendor');
const { encryptTaxId } = require('./utils/taxIdCrypto');

const APPLY = process.argv.includes('--apply');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  if (APPLY && !process.env.TAX_ID_ENCRYPTION_KEY) throw new Error('TAX_ID_ENCRYPTION_KEY is required in apply mode');
  await mongoose.connect(process.env.MONGODB_URI);
  const vendors = await Vendor.collection.find({}).toArray();
  const summary = { mode: APPLY ? 'apply' : 'dry-run', vendors: vendors.length, onboardingBackfills: 0, taxIdsToEncrypt: 0, taxIdsEncrypted: 0 };

  for (const vendor of vendors) {
    const update = {};
    const unset = {};
    if (!vendor.onboardingSource) {
      update.onboardingSource = 'manual';
      summary.onboardingBackfills++;
    }
    if (!vendor.onboardingStatus) {
      update.onboardingStatus = 'approved';
      summary.onboardingBackfills++;
    }
    if (vendor.einTaxId && !vendor.einTaxIdEncrypted) {
      summary.taxIdsToEncrypt++;
      if (APPLY) {
        const encrypted = encryptTaxId(vendor.einTaxId);
        update.einTaxIdEncrypted = encrypted.encrypted;
        update.einTaxIdIv = encrypted.iv;
        update.einTaxIdTag = encrypted.tag;
        update.einTaxIdLast4 = encrypted.last4;
        unset.einTaxId = '';
        summary.taxIdsEncrypted++;
      }
    }
    if (APPLY && (Object.keys(update).length || Object.keys(unset).length)) {
      const operation = {};
      if (Object.keys(update).length) operation.$set = update;
      if (Object.keys(unset).length) operation.$unset = unset;
      await Vendor.collection.updateOne({ _id: vendor._id }, operation);
    }
  }

  console.log('Vendor onboarding migration complete. No documents were modified or deleted.');
  console.log(JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
}

main().catch(async error => {
  console.error('Vendor onboarding migration failed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
