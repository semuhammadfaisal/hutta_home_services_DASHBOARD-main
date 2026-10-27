const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const User = require('./models/User');
const Customer = require('./models/Customer');
const Property = require('./models/Property');
const PropertyMembership = require('./models/PropertyMembership');
const CommercialOrganization = require('./models/CommercialOrganization');
const CommercialLocation = require('./models/CommercialLocation');
const CommercialMembership = require('./models/CommercialMembership');
const CommercialServiceAgreement = require('./models/CommercialServiceAgreement');
const RealEstateTransaction = require('./models/RealEstateTransaction');
const Vendor = require('./models/Vendor');
const Order = require('./models/Order');

async function audit() {
  const now = new Date();
  const [users, customers, properties, propertyMemberships, organizations, locations, commercialMemberships, agreements, transactions, vendors, orders] = await Promise.all([
    User.find({}).select('_id role isActive').lean(), Customer.find({}).select('_id status').lean(), Property.find({}).select('_id ownerCustomerId status').lean(), PropertyMembership.find({}).lean(), CommercialOrganization.find({}).select('_id status').lean(), CommercialLocation.find({}).lean(), CommercialMembership.find({}).lean(), CommercialServiceAgreement.find({ status: 'active' }).select('_id organizationId propertyId').lean(), RealEstateTransaction.find({}).select('_id agentUserId customerId propertyId status accessEndsAt').lean(), Vendor.find({}).select('_id isActive portalStatus').lean(), Order.find({}).select('_id orderId customerId propertyId commercialContext vendorAssignments').lean()
  ]);
  const key = value => String(value || '');
  const userIds = new Set(users.map(x => key(x._id))); const customerIds = new Set(customers.map(x => key(x._id))); const propertyMap = new Map(properties.map(x => [key(x._id), x])); const organizationIds = new Set(organizations.map(x => key(x._id))); const locationIds = new Set(locations.map(x => key(x._id))); const vendorMap = new Map(vendors.map(x => [key(x._id), x])); const agreementKeys = new Set(agreements.map(x => `${key(x.organizationId)}:${key(x.propertyId)}`));
  const orphanedPropertyMemberships = propertyMemberships.filter(m => !userIds.has(key(m.userId)) || !customerIds.has(key(m.customerId)) || !propertyMap.has(key(m.propertyId)) || key(propertyMap.get(key(m.propertyId))?.ownerCustomerId) !== key(m.customerId)).map(m => key(m._id));
  const orphanedCommercialMemberships = commercialMemberships.filter(m => !userIds.has(key(m.userId)) || !organizationIds.has(key(m.organizationId))).map(m => key(m._id));
  const locationsWithoutAgreements = locations.filter(l => l.status === 'active' && !agreementKeys.has(`${key(l.organizationId)}:${key(l.propertyId)}`)).map(l => ({ id: key(l._id), organizationId: key(l.organizationId), propertyId: key(l.propertyId) }));
  const expiredAgentAccess = transactions.filter(t => t.status === 'active' && (!t.accessEndsAt || new Date(t.accessEndsAt) <= now)).map(t => key(t._id));
  const mismatchedAgentMemberships = transactions.filter(t => t.status === 'active' && !propertyMemberships.some(m => key(m.sourceTransactionId) === key(t._id) && key(m.userId) === key(t.agentUserId) && key(m.customerId) === key(t.customerId) && key(m.propertyId) === key(t.propertyId) && m.relationship === 'agent' && m.status === 'active')).map(t => key(t._id));
  const inactiveVendorAssignments = orders.flatMap(order => (order.vendorAssignments || []).filter(a => { const v = vendorMap.get(key(a.vendor)); return !v || !v.isActive || v.portalStatus !== 'approved_active'; }).map(a => ({ orderId: key(order._id), reference: order.orderId, assignmentId: key(a._id), vendorId: key(a.vendor) })));
  const mismatchedOrders = orders.filter(order => { const property = propertyMap.get(key(order.propertyId)); if (!property || key(property.ownerCustomerId) !== key(order.customerId)) return true; const context = order.commercialContext; if (context?.organizationId && (!organizationIds.has(key(context.organizationId)) || !locationIds.has(key(context.locationId)))) return true; return false; }).map(order => ({ id: key(order._id), reference: order.orderId }));
  return { mode: 'dry-run', generatedAt: new Date().toISOString(), counts: { orphanedPropertyMemberships: orphanedPropertyMemberships.length, orphanedCommercialMemberships: orphanedCommercialMemberships.length, locationsWithoutAgreements: locationsWithoutAgreements.length, expiredAgentAccess: expiredAgentAccess.length, mismatchedAgentMemberships: mismatchedAgentMemberships.length, inactiveVendorAssignments: inactiveVendorAssignments.length, mismatchedOrders: mismatchedOrders.length }, details: { orphanedPropertyMemberships, orphanedCommercialMemberships, locationsWithoutAgreements, expiredAgentAccess, mismatchedAgentMemberships, inactiveVendorAssignments, mismatchedOrders } };
}

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  if (process.argv.includes('--apply')) throw new Error('This integrity audit is intentionally dry-run only; --apply is not supported');
  await mongoose.connect(uri);
  try { console.log(JSON.stringify(await audit(), null, 2)); } finally { await mongoose.disconnect(); }
}

if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { audit };
