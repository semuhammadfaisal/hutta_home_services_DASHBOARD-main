require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mongoose = require('mongoose');
const CommercialLocation = require('./models/CommercialLocation');
const CommercialMembership = require('./models/CommercialMembership');
const CommercialOrganization = require('./models/CommercialOrganization');
const CommercialPortfolio = require('./models/CommercialPortfolio');
const CommercialPortalPreference = require('./models/CommercialPortalPreference');
const CommercialServiceAgreement = require('./models/CommercialServiceAgreement');
const CommercialWarrantyClaim = require('./models/CommercialWarrantyClaim');
const Customer = require('./models/Customer');
const Notification = require('./models/Notification');
const PortalActivity = require('./models/PortalActivity');
const Property = require('./models/Property');
const User = require('./models/User');

const APPLY = process.argv.includes('--apply');
const LOCATIONS = [
  { code: 'T1-SCOTTSDALE', tier: 'tier_1', owner: 'Sonoran Retail Owner LLC', email: 'owner.t1@example.test', label: 'Scottsdale Retail', address: '7420 E Shea Blvd', city: 'Scottsdale', zip: '85260', billing: 'ap-t1@example.test' },
  { code: 'T2-TEMPE', tier: 'tier_2', owner: 'Mill Avenue Holdings LLC', email: 'owner.t2@example.test', label: 'Tempe Offices', address: '60 E Rio Salado Pkwy', city: 'Tempe', zip: '85281', billing: 'ap-t2@example.test' },
  { code: 'T3-MESA', tier: 'tier_3', owner: 'East Valley Medical Owner LLC', email: 'owner.t3@example.test', label: 'Mesa Medical Center', address: '1432 S Dobson Rd', city: 'Mesa', zip: '85202', billing: 'ap-t3@example.test' }
];

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  process.stdout.write(`${APPLY ? 'Applying' : 'Dry run:'} commercial Tier 1/2/3 demo portfolio with ${LOCATIONS.length} owners.\n`);
  if (!APPLY) return { locations: LOCATIONS.length, tiers: LOCATIONS.map(item => item.tier) };
  const organization = await CommercialOrganization.findOneAndUpdate({ organizationCode: 'DEMO-PM-AZ' }, { $setOnInsert: { name: 'Arizona White Glove Property Management', legalName: 'Arizona White Glove Property Management LLC', status: 'active' } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  const portfolio = await CommercialPortfolio.findOneAndUpdate({ organizationId: organization._id, portfolioCode: 'PHOENIX-METRO' }, { $setOnInsert: { name: 'Phoenix Metro Portfolio', description: 'Mixed-owner commercial portfolio spanning all SMPLfix service tiers.' } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  const created = [];
  for (const item of LOCATIONS) {
    const customer = await Customer.findOneAndUpdate({ email: item.email }, { $setOnInsert: { name: item.owner, email: item.email, customerType: 'commercial', status: 'active' } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    const property = await Property.findOneAndUpdate({ ownerCustomerId: customer._id, legacyAddressKey: `commercial-demo:${item.code}` }, { $setOnInsert: { label: item.label, addressLine1: item.address, city: item.city, state: 'AZ', postalCode: item.zip, propertyType: item.tier === 'tier_1' ? 'Retail' : item.tier === 'tier_2' ? 'Office' : 'Medical', source: 'manual' } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    const location = await CommercialLocation.findOneAndUpdate({ organizationId: organization._id, propertyId: property._id }, { $set: { portfolioId: portfolio._id, ownerCustomerId: customer._id, locationCode: item.code, ownerLabel: item.owner, billingContactOverride: { name: `${item.label} Accounts Payable`, email: item.billing }, status: 'active' } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    const managed = item.tier !== 'tier_1';
    const agreement = await CommercialServiceAgreement.findOneAndUpdate({ organizationId: organization._id, propertyId: property._id, status: 'active' }, { $setOnInsert: { portfolioId: portfolio._id, agreementNumber: `DEMO-${item.code}`, tier: item.tier, billingRules: { invoiceMode: managed ? 'consolidated_period' : 'coordination_fee_only', billingPeriod: managed ? 'monthly' : 'per_order', vendorBillsClientDirectly: !managed, consolidatedInvoice: managed }, purchaseOrder: { required: item.tier !== 'tier_1', label: 'Property PO number' }, approvalRules: { allowedRoles: ['owner', 'organization_admin', 'operations_manager', 'portfolio_admin', 'property_admin', 'approver'] }, paymentRules: { allowedRoles: ['owner', 'organization_admin', 'billing_admin', 'portfolio_admin', 'property_admin', 'billing'] }, effectiveFrom: new Date('2026-01-01T07:00:00Z') } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    created.push({ item, customer, property, location, agreement });
  }
  const tierThree = created.find(value => value.item.tier === 'tier_3');
  await CommercialWarrantyClaim.findOneAndUpdate({ claimReference: 'WCL-DEMO-1001' }, { $setOnInsert: { organizationId: organization._id, propertyId: tierThree.property._id, claimReference: 'WCL-DEMO-1001', title: 'Rooftop HVAC compressor warranty', summary: 'Compressor performance declined during the covered service period.', status: 'scheduled', completionDate: new Date('2026-04-18T19:00:00Z'), coverage: { startsAt: new Date('2026-04-18T19:00:00Z'), endsAt: new Date('2027-04-19T06:59:59Z'), description: 'One-year workmanship coverage.' }, vendorSnapshot: { name: 'Desert Climate Services', rocNumber: 'ROC 321654' }, appointments: [{ scheduledStart: new Date('2026-09-22T16:00:00Z'), scheduledEnd: new Date('2026-09-22T18:00:00Z'), status: 'confirmed', publicNote: 'Roof access coordination confirmed.' }] } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  const demoEmail = String(process.env.COMMERCIAL_DEMO_USER_EMAIL || '').trim().toLowerCase(); const user = demoEmail ? await User.findOne({ email: demoEmail, role: 'commercial', isActive: true }) : null;
  if (user) {
    await CommercialMembership.findOneAndUpdate({ userId: user._id, organizationId: organization._id }, { $set: { role: 'organization_admin', propertyAccess: 'all', status: 'active' } }, { upsert: true, setDefaultsOnInsert: true });
    await CommercialPortalPreference.findOneAndUpdate({ userId: user._id, organizationId: organization._id }, { $setOnInsert: { monthlyReports: { enabled: true, deliveryDay: 5, format: 'pdf', propertyIds: created.filter(value => value.item.tier !== 'tier_1').map(value => value.property._id) } } }, { upsert: true, setDefaultsOnInsert: true });
    await Notification.findOneAndUpdate({ userId: user._id, 'metadata.demoKey': 'commercial-warranty' }, { $setOnInsert: { title: 'Warranty appointment confirmed', message: 'Mesa Medical Center warranty visit is confirmed for September 22.', type: 'info', metadata: { demoKey: 'commercial-warranty', organizationId: organization._id, propertyId: tierThree.property._id } } }, { upsert: true });
    await PortalActivity.findOneAndUpdate({ userId: user._id, propertyId: tierThree.property._id, type: 'commercial_demo_warranty' }, { $setOnInsert: { title: 'Warranty visit scheduled', summary: 'Rooftop HVAC compressor inspection confirmed.', occurredAt: new Date('2026-09-14T17:00:00Z') } }, { upsert: true });
  }
  return { organizationId: String(organization._id), locations: created.length, userLinked: Boolean(user) };
}

if (require.main === module) run().then(result => { if (result) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); return mongoose.disconnect(); }).catch(error => { console.error(error.message); process.exitCode = 1; mongoose.disconnect(); });
module.exports = { LOCATIONS, run };
