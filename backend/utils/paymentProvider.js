const { buildPublicUrl } = require('./publicAppUrl');

const STRIPE_API = 'https://api.stripe.com/v1';

function isConfigured() {
  return /^sk_(?:test|live)_[A-Za-z0-9]+$/.test(String(process.env.STRIPE_SECRET_KEY || '').trim());
}

function assertConfigured() {
  if (!isConfigured()) throw Object.assign(new Error('Secure payments are not configured yet'), { status: 503 });
}

async function stripeRequest(path, parameters = {}, method = 'POST', options = {}) {
  assertConfigured();
  const body = new URLSearchParams();
  Object.entries(parameters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') body.append(key, String(value));
  });
  const response = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.STRIPE_SECRET_KEY}:`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(options.idempotencyKey ? { 'Idempotency-Key': String(options.idempotencyKey).slice(0, 255) } : {})
    },
    body: method === 'GET' ? undefined : body
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result?.error?.message || 'Payment provider request failed');
    error.status = response.status >= 500 ? 502 : 400;
    throw error;
  }
  return result;
}

async function getOrCreateCustomer(customer) {
  if (customer.paymentProvider?.name === 'stripe' && customer.paymentProvider?.customerId) {
    return customer.paymentProvider.customerId;
  }
  const created = await stripeRequest('/customers', {
    email: customer.email,
    name: customer.name,
    'metadata[smplfix_customer_id]': String(customer._id)
  });
  customer.paymentProvider = { name: 'stripe', customerId: created.id };
  await customer.save();
  return created.id;
}

function safePaymentMethod(method) {
  return {
    id: String(method.id),
    type: 'card',
    brand: String(method.card?.brand || 'card'),
    last4: String(method.card?.last4 || ''),
    expMonth: Number(method.card?.exp_month),
    expYear: Number(method.card?.exp_year),
    isExpired: Number(method.card?.exp_year) < new Date().getUTCFullYear()
      || (Number(method.card?.exp_year) === new Date().getUTCFullYear() && Number(method.card?.exp_month) < new Date().getUTCMonth() + 1)
  };
}

async function listPaymentMethods(customer) {
  assertConfigured();
  if (!customer.paymentProvider?.customerId) return [];
  const result = await stripeRequest(`/payment_methods?customer=${encodeURIComponent(customer.paymentProvider.customerId)}&type=card`, {}, 'GET');
  return (result.data || []).map(safePaymentMethod);
}

async function createSetupSession(customer) {
  const customerId = await getOrCreateCustomer(customer);
  const returnUrl = buildPublicUrl('/pages/residential-portal.html', 'billing');
  const session = await stripeRequest('/checkout/sessions', {
    mode: 'setup',
    customer: customerId,
    'payment_method_types[0]': 'card',
    success_url: returnUrl,
    cancel_url: returnUrl,
    'metadata[smplfix_customer_id]': String(customer._id)
  });
  return { url: session.url };
}

async function createBillingPortalSession(customer) {
  const customerId = await getOrCreateCustomer(customer);
  const session = await stripeRequest('/billing_portal/sessions', {
    customer: customerId,
    return_url: buildPublicUrl('/pages/residential-portal.html', 'billing')
  });
  return { url: session.url };
}

async function createInvoiceCheckoutSession(customer, invoice, payment) {
  const customerId = await getOrCreateCustomer(customer);
  const amountInCents = Math.round((Number(invoice.amount) + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(amountInCents) || amountInCents < 1) {
    throw Object.assign(new Error('This invoice does not have a payable balance'), { status: 409 });
  }
  const returnBase = buildPublicUrl('/pages/residential-portal.html');
  const session = await stripeRequest('/checkout/sessions', {
    mode: 'payment',
    customer: customerId,
    client_reference_id: String(invoice._id),
    'payment_method_types[0]': 'card',
    'line_items[0][quantity]': 1,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': amountInCents,
    'line_items[0][price_data][product_data][name]': `SMPLfix invoice ${invoice.invoiceNumber}`,
    'line_items[0][price_data][product_data][description]': String(invoice.jobSnapshot?.service || 'Home service').slice(0, 500),
    success_url: `${returnBase}?payment=success&invoice=${encodeURIComponent(invoice._id)}&session_id={CHECKOUT_SESSION_ID}#invoices`,
    cancel_url: `${returnBase}?payment=cancelled&invoice=${encodeURIComponent(invoice._id)}#invoices`,
    'metadata[smplfix_invoice_id]': String(invoice._id),
    'metadata[smplfix_payment_id]': String(payment._id),
    'metadata[smplfix_customer_id]': String(customer._id),
    'payment_intent_data[metadata][smplfix_invoice_id]': String(invoice._id),
    'payment_intent_data[metadata][smplfix_payment_id]': String(payment._id)
  }, 'POST', { idempotencyKey: `residential-invoice-${payment._id}` });
  return { url: session.url };
}

async function retrieveCheckoutSession(sessionId) {
  if (!/^cs_(?:test|live)_[A-Za-z0-9]+$/.test(String(sessionId || ''))) {
    throw Object.assign(new Error('Invalid payment session'), { status: 400 });
  }
  return stripeRequest(`/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=payment_intent`, {}, 'GET');
}

module.exports = {
  createBillingPortalSession,
  createInvoiceCheckoutSession,
  createSetupSession,
  isConfigured,
  listPaymentMethods,
  retrieveCheckoutSession,
  safePaymentMethod,
  stripeRequest
};
