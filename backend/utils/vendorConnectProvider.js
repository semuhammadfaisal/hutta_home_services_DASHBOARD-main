const Stripe = require('stripe');
const { buildPublicUrl } = require('./publicAppUrl');

function configured() { return /^sk_(?:test|live)_[A-Za-z0-9]+$/.test(String(process.env.STRIPE_SECRET_KEY || '').trim()); }
function provider() {
  if (!configured()) throw Object.assign(new Error('Stripe Connect onboarding is not configured'), { status: 503 });
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

async function createHostedOnboarding(vendor, stripe = provider()) {
  let accountId = vendor.stripeConnect?.accountId;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      email: vendor.email || undefined,
      business_type: ['individual', 'company'].includes(vendor.businessEntityType?.toLowerCase()) ? vendor.businessEntityType.toLowerCase() : 'company',
      metadata: { smplfix_vendor_id: String(vendor._id) }
    });
    accountId = account.id;
    vendor.stripeConnect = { ...(vendor.stripeConnect?.toObject?.() || vendor.stripeConnect || {}), accountId };
    await vendor.save();
  }
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: buildPublicUrl('/pages/vendor-portal.html', 'stripe=refresh'),
    return_url: buildPublicUrl('/pages/vendor-portal.html', 'stripe=return'),
    type: 'account_onboarding'
  });
  if (!/^https:\/\/(?:connect\.)?stripe\.com\//.test(String(link.url || ''))) throw new Error('Stripe returned an invalid hosted onboarding URL');
  return { url: link.url };
}

async function refreshConnectStatus(vendor, stripe = provider()) {
  const accountId = vendor.stripeConnect?.accountId;
  if (!accountId) return { configured: false, detailsSubmitted: false, chargesEnabled: false, payoutsEnabled: false };
  const account = await stripe.accounts.retrieve(accountId);
  vendor.stripeConnect.detailsSubmitted = Boolean(account.details_submitted);
  vendor.stripeConnect.chargesEnabled = Boolean(account.charges_enabled);
  vendor.stripeConnect.payoutsEnabled = Boolean(account.payouts_enabled);
  vendor.stripeConnect.lastCheckedAt = new Date();
  await vendor.save();
  return { configured: true, detailsSubmitted: vendor.stripeConnect.detailsSubmitted, chargesEnabled: vendor.stripeConnect.chargesEnabled, payoutsEnabled: vendor.stripeConnect.payoutsEnabled };
}

module.exports = { configured, createHostedOnboarding, refreshConnectStatus };
