require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mongoose = require('mongoose');
const CommercialLocation = require('./models/CommercialLocation');
const CommercialMembership = require('./models/CommercialMembership');
const CommercialPortfolioMembership = require('./models/CommercialPortfolioMembership');
const CommercialPortalPreference = require('./models/CommercialPortalPreference');
const CommercialOrganization = require('./models/CommercialOrganization');
const CommercialPortfolio = require('./models/CommercialPortfolio');
const CommercialPropertyMembership = require('./models/CommercialPropertyMembership');
const CommercialUserInvitation = require('./models/CommercialUserInvitation');
const CommercialAuditEvent = require('./models/CommercialAuditEvent');
const CommercialServiceAgreement = require('./models/CommercialServiceAgreement');
const CommercialWarrantyClaim = require('./models/CommercialWarrantyClaim');
const Customer = require('./models/Customer');
const CustomerInvoice = require('./models/CustomerInvoice');
const Order = require('./models/Order');
const Property = require('./models/Property');
const User = require('./models/User');

const APPLY = process.argv.includes('--apply');
const MODELS = [CommercialOrganization, CommercialPortfolio, CommercialLocation, CommercialMembership, CommercialPortfolioMembership, CommercialPropertyMembership, CommercialServiceAgreement, CommercialUserInvitation, CommercialAuditEvent, CommercialPortalPreference, CommercialWarrantyClaim, CustomerInvoice];

function tierFrom(customer) {
  const value = (customer.customFields || []).find(field => /commercial\s*tier|service\s*tier/i.test(field.name || ''))?.value;
  const normalized = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['1', 'tier1', 'coordination'].includes(normalized)) return 'tier_1';
  if (['2', 'tier2', 'managedservices'].includes(normalized)) return 'tier_2';
  if (['3', 'tier3', 'fullservice'].includes(normalized)) return 'tier_3';
  return null;
}

function agreementDefaults(tier) {
  if (tier === 'tier_1') return { invoiceMode: 'coordination_fee_only', vendorBillsClientDirectly: true, consolidatedInvoice: false };
  return { invoiceMode: 'consolidated_period', vendorBillsClientDirectly: false, consolidatedInvoice: true };
}

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const customers = await Customer.find({ customerType: 'commercial', status: { $ne: 'inactive' } }).sort({ _id: 1 }).lean();
  const summary = { customers: customers.length, organizations: 0, portfolios: 0, locations: 0, agreements: 0, memberships: 0, ordersLinked: 0, invoicesLinked: 0, needsTierReview: [], needsBillingSnapshotReview: [] };

  for (const customer of customers) {
    const organizationCode = `COM-${String(customer._id).slice(-8).toUpperCase()}`;
    const organizationSpec = { organizationCode, name: customer.name, legalName: customer.name, primaryCustomerId: customer._id, ownerContacts: [{ customerId: customer._id, name: customer.name, email: customer.email, phone: customer.phone, isPrimary: true }], billingContacts: customer.email ? [{ customerId: customer._id, name: customer.name, email: customer.email, phone: customer.phone, isPrimary: true }] : [] };
    let organization = await CommercialOrganization.findOne({ organizationCode }).lean();
    if (!organization && APPLY) organization = (await CommercialOrganization.create(organizationSpec)).toObject();
    if (!organization) organization = { _id: new mongoose.Types.ObjectId(), ...organizationSpec };
    summary.organizations += 1;

    const portfolioSpec = { organizationId: organization._id, name: 'Primary portfolio', portfolioCode: 'PRIMARY' };
    let portfolio = await CommercialPortfolio.findOne({ organizationId: organization._id, portfolioCode: 'PRIMARY' }).lean();
    if (!portfolio && APPLY) portfolio = (await CommercialPortfolio.create(portfolioSpec)).toObject();
    if (!portfolio) portfolio = { _id: new mongoose.Types.ObjectId(), ...portfolioSpec };
    summary.portfolios += 1;

    const tier = tierFrom(customer);
    if (!tier) summary.needsTierReview.push({ customerId: String(customer._id), name: customer.name, reason: 'No explicit Commercial Tier custom field' });
    const properties = await Property.find({ ownerCustomerId: customer._id, status: 'active' }).sort({ _id: 1 }).lean();
    for (const property of properties) {
      const locationSpec = { organizationId: organization._id, portfolioId: portfolio._id, propertyId: property._id, ownerCustomerId: customer._id, locationCode: `LOC-${String(property._id).slice(-8).toUpperCase()}`, ownerLabel: customer.name };
      let location = await CommercialLocation.findOne({ organizationId: organization._id, propertyId: property._id }).lean();
      if (!location && APPLY) location = (await CommercialLocation.create(locationSpec)).toObject();
      if (!location) location = { _id: new mongoose.Types.ObjectId(), ...locationSpec };
      summary.locations += 1;

      let agreement = tier ? await CommercialServiceAgreement.findOne({ organizationId: organization._id, propertyId: property._id, status: 'active' }).lean() : null;
      if (tier && !agreement && APPLY) {
        agreement = (await CommercialServiceAgreement.create({ organizationId: organization._id, portfolioId: portfolio._id, propertyId: property._id, agreementNumber: `AGR-${String(property._id).slice(-8).toUpperCase()}`, tier, billingRules: { ...agreementDefaults(tier), billingPeriod: 'monthly' }, purchaseOrder: { required: false }, approvalRules: { allowedRoles: ['owner', 'organization_admin', 'operations_manager', 'portfolio_admin', 'property_admin', 'approver'] }, paymentRules: { allowedRoles: ['owner', 'organization_admin', 'billing_admin', 'portfolio_admin', 'property_admin', 'billing'] } })).toObject();
      }
      if (agreement) summary.agreements += 1;

      if (APPLY) {
        const orderResult = await Order.updateMany({ customerId: customer._id, propertyId: property._id, 'commercialContext.organizationId': { $exists: false } }, { $set: { 'commercialContext.organizationId': organization._id, 'commercialContext.portfolioId': portfolio._id, 'commercialContext.locationId': location._id, 'commercialContext.ownerCustomerId': customer._id, 'commercialContext.billingContact': location.billingContactOverride || organization.billingContacts?.find(item => item.isPrimary) || {}, ...(agreement ? { 'commercialContext.serviceAgreementId': agreement._id } : {}) } });
        summary.ordersLinked += orderResult.modifiedCount;
        if (agreement) {
          const orderIds = await Order.find({ customerId: customer._id, propertyId: property._id }).distinct('_id');
          const invoiceResult = await CustomerInvoice.updateMany({ orderId: { $in: orderIds }, 'commercialBilling.organizationId': { $exists: false } }, { $set: { 'commercialBilling.organizationId': organization._id, 'commercialBilling.serviceAgreementId': agreement._id } });
          summary.invoicesLinked += invoiceResult.modifiedCount;
          const legacyInvoices = await CustomerInvoice.find({ orderId: { $in: orderIds }, 'commercialBilling.snapshotVersion': { $exists: false } }).select('_id invoiceNumber').lean();
          summary.needsBillingSnapshotReview.push(...legacyInvoices.map(invoice => ({ invoiceId: String(invoice._id), invoiceNumber: invoice.invoiceNumber, reason: 'Historical tier and invoice kind require staff verification; migration will not infer them' })));
        }
      }
    }

    if (customer.email) {
      const user = await User.findOne({ email: String(customer.email).trim().toLowerCase(), role: 'commercial', isActive: true }).lean();
      if (user) {
        summary.memberships += 1;
        if (APPLY) await CommercialMembership.updateOne({ userId: user._id, organizationId: organization._id }, { $setOnInsert: { role: 'owner', propertyAccess: 'all', permissions: { viewPortfolio: true, requestService: true, approveEstimates: true, viewInvoices: true, makePayments: true, manageUsers: true, viewReports: true } } }, { upsert: true, setDefaultsOnInsert: true });
      }
    }
  }

  if (APPLY) await Promise.all(MODELS.map(Model => Model.createIndexes()));
  process.stdout.write(`${APPLY ? 'Applied' : 'Dry run'} commercial account migration\n${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

if (require.main === module) run().then(() => mongoose.disconnect()).catch(error => { console.error(error); process.exitCode = 1; mongoose.disconnect(); });
module.exports = { agreementDefaults, run, tierFrom };
