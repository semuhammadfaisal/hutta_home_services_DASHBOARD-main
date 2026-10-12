const clean = (value, max) => String(value ?? '').trim().slice(0, max);

function parseResidentialAccount(body = {}) {
  const data = {
    firstName: clean(body.firstName, 80),
    lastName: clean(body.lastName, 80),
    preferredName: clean(body.preferredName, 80),
    phone: clean(body.phone, 40),
    addressLine1: clean(body.addressLine1, 200),
    city: clean(body.city, 100),
    state: clean(body.state, 50),
    postalCode: clean(body.postalCode, 20)
  };
  const errors = [];
  if (!data.firstName) errors.push('First name is required');
  if (!data.lastName) errors.push('Last name is required');
  if (data.phone && !/^[+()\-\s.0-9]{7,40}$/.test(data.phone)) errors.push('Enter a valid phone number');
  const addressStarted = [data.addressLine1, data.city, data.state, data.postalCode].some(Boolean);
  if (addressStarted) {
    if (!data.addressLine1) errors.push('Street address is required');
    if (!data.city) errors.push('City is required');
    if (!data.state) errors.push('State is required');
    if (!data.postalCode) errors.push('ZIP or postal code is required');
  }
  return { data, errors };
}

function replacePrimary(items, value, create) {
  const list = Array.isArray(items) ? items.map(item => ({ ...(item.toObject ? item.toObject() : item) })) : [];
  const primaryIndex = list.findIndex(item => item.isPrimary === true);
  const index = primaryIndex >= 0 ? primaryIndex : (list.length ? 0 : -1);
  if (!value) {
    if (index >= 0) list.splice(index, 1);
    return list;
  }
  const next = { ...(index >= 0 ? list[index] : {}), ...create(value), label: 'Primary', isPrimary: true };
  list.forEach(item => { item.isPrimary = false; });
  if (index >= 0) list[index] = next;
  else list.unshift(next);
  return list;
}

function syncCustomerFromResidentialAccount(customer, data) {
  customer.name = `${data.firstName} ${data.lastName}`.trim();
  customer.phone = data.phone;
  customer.address = data.addressLine1;
  customer.city = data.city;
  customer.state = data.state;
  customer.zipCode = data.postalCode;
  customer.phones = replacePrimary(customer.phones, data.phone, number => ({ number }));
  const addressValue = data.addressLine1 ? data : null;
  customer.addresses = replacePrimary(customer.addresses, addressValue, address => ({
    address: address.addressLine1,
    city: address.city,
    state: address.state,
    zipCode: address.postalCode
  }));
  return customer;
}

function primary(items = []) {
  return items.find(item => item?.isPrimary) || items[0];
}

function serializeResidentialAccount({ user, customer, profile }) {
  const phone = primary(customer?.phones || [])?.number || customer?.phone || profile?.account?.phone || user?.phone || '';
  const address = primary(customer?.addresses || []) || {};
  return {
    email: user?.email || customer?.email || '',
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    preferredName: profile?.account?.preferredName || '',
    phone,
    addressLine1: address.address || customer?.address || '',
    city: address.city || customer?.city || '',
    state: address.state || customer?.state || '',
    postalCode: address.zipCode || customer?.zipCode || '',
    timezone: profile?.account?.timezone || 'America/Phoenix'
  };
}

module.exports = { parseResidentialAccount, replacePrimary, serializeResidentialAccount, syncCustomerFromResidentialAccount };
