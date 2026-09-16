require('dotenv').config();
const mongoose = require('mongoose');
const Customer = require('./models/Customer');
const Order = require('./models/Order');
const Property = require('./models/Property');
const PropertyMembership = require('./models/PropertyMembership');
const User = require('./models/User');

const APPLY = process.argv.includes('--apply');
const ALL_CUSTOMERS = process.argv.includes('--all-customers');

function clean(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function addressKey(value = {}) {
  return [value.addressLine1 || value.address, value.addressLine2, value.city, value.state, value.postalCode || value.zipCode]
    .map(part => clean(part).toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
    .join('|');
}

function streetKey(value = {}) {
  return clean(value.addressLine1 || value.address).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function legacyAddresses(customer) {
  const candidates = [];
  if (clean(customer.address)) {
    candidates.push({
      label: 'Primary property',
      addressLine1: clean(customer.address),
      city: clean(customer.city),
      state: clean(customer.state),
      postalCode: clean(customer.zipCode)
    });
  }
  (customer.addresses || []).forEach((address, index) => {
    if (!clean(address.address)) return;
    candidates.push({
      label: clean(address.label) || (address.isPrimary ? 'Primary property' : `Property ${index + 1}`),
      addressLine1: clean(address.address),
      city: clean(address.city),
      state: clean(address.state),
      postalCode: clean(address.zipCode)
    });
  });
  const unique = new Map();
  candidates.forEach(candidate => {
    const key = addressKey(candidate);
    if (key && !unique.has(key)) unique.set(key, { ...candidate, legacyAddressKey: key });
  });
  return [...unique.values()];
}

function customerEmails(customer) {
  return new Set([
    clean(customer.email).toLowerCase(),
    ...(customer.emails || []).map(item => clean(item.address).toLowerCase())
  ].filter(Boolean));
}

async function migrate() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 5000 });

  const customerFilter = ALL_CUSTOMERS ? {} : { customerType: 'residential' };
  const customers = await Customer.find(customerFilter).lean();
  const residentialUsers = await User.find({ role: 'residential', isActive: true }).select('_id email').lean();
  const stats = {
    mode: APPLY ? 'apply' : 'dry-run',
    customersScanned: customers.length,
    propertiesExisting: 0,
    propertiesToCreate: 0,
    propertiesCreated: 0,
    ordersLinked: 0,
    ordersAmbiguous: 0,
    membershipsCreated: 0,
    usersWithoutUniqueCustomer: 0
  };

  const propertiesByCustomer = new Map();
  for (const customer of customers) {
    const customerId = String(customer._id);
    const candidates = legacyAddresses(customer);
    const existing = await Property.find({ ownerCustomerId: customer._id }).lean();
    stats.propertiesExisting += existing.length;
    const byKey = new Map(existing.map(property => [property.legacyAddressKey || addressKey(property), property]));
    const properties = [...existing];

    for (const candidate of candidates) {
      if (byKey.has(candidate.legacyAddressKey)) continue;
      stats.propertiesToCreate += 1;
      if (!APPLY) continue;
      const property = await Property.findOneAndUpdate(
        { ownerCustomerId: customer._id, legacyAddressKey: candidate.legacyAddressKey },
        {
          $setOnInsert: {
            ownerCustomerId: customer._id,
            ...candidate,
            country: 'US',
            status: 'active',
            source: 'legacy_customer_address'
          }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      ).lean();
      properties.push(property);
      byKey.set(candidate.legacyAddressKey, property);
      stats.propertiesCreated += 1;
    }
    propertiesByCustomer.set(customerId, properties);

    if (!APPLY || !properties.length) continue;
    const unlinkedOrders = await Order.find({ customerId: customer._id, propertyId: { $exists: false } })
      .select('_id customer.address').lean();
    for (const order of unlinkedOrders) {
      const orderKey = streetKey({ address: order.customer?.address });
      const exact = orderKey ? properties.filter(property => streetKey(property) === orderKey) : [];
      const selected = exact.length === 1 ? exact[0] : (properties.length === 1 ? properties[0] : null);
      if (!selected) {
        stats.ordersAmbiguous += 1;
        continue;
      }
      const result = await Order.updateOne(
        { _id: order._id, propertyId: { $exists: false } },
        { $set: { propertyId: selected._id } }
      );
      stats.ordersLinked += result.modifiedCount || 0;
    }
  }

  const matchingCustomers = customers.map(customer => ({ customer, emails: customerEmails(customer) }));
  for (const user of residentialUsers) {
    const email = clean(user.email).toLowerCase();
    const matches = matchingCustomers.filter(item => item.emails.has(email));
    if (matches.length !== 1) {
      stats.usersWithoutUniqueCustomer += 1;
      continue;
    }
    const customer = matches[0].customer;
    const properties = propertiesByCustomer.get(String(customer._id)) || [];
    for (const property of properties) {
      if (!APPLY) continue;
      const result = await PropertyMembership.updateOne(
        { userId: user._id, propertyId: property._id },
        {
          $setOnInsert: {
            customerId: customer._id,
            relationship: 'owner',
            permissions: {
              view: true,
              requestService: true,
              approveEstimates: true,
              manageBilling: true,
              manageProperty: true
            },
            status: 'active',
            startsAt: new Date()
          }
        },
        { upsert: true }
      );
      stats.membershipsCreated += result.upsertedCount || 0;
    }
  }

  if (APPLY) await Promise.all([Property.createIndexes(), PropertyMembership.createIndexes(), Customer.createIndexes()]);
  console.log(JSON.stringify(stats, null, 2));
  if (!APPLY) {
    console.log('Dry run only. Re-run with --apply after reviewing counts. Use --all-customers only for an intentional all-account backfill.');
  }
}

if (require.main === module) {
  migrate()
    .catch(error => {
      console.error('Residential property migration failed:', error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect();
    });
}

module.exports = { addressKey, customerEmails, legacyAddresses, streetKey };
