const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Portal Accounts is a staff-only hybrid CRM workspace', () => {
  const server = read('backend/server.js');
  const page = read('pages/admin-dashboard.html');
  assert.match(server, /app\.use\('\/api\/portal-admin', staffOnly/);
  for (const value of ['portalAccountsNav', 'portal-accounts', 'portalAccountsOverview', 'portalAccountsDirectory', 'portalAccountDetail']) assert.match(page, new RegExp(`id="${value}"`));
  for (const type of ['overview', 'residential', 'commercial', 'agents', 'vendors']) assert.match(page, new RegExp(`data-portal-type="${type}"`));
});

test('directories and profiles aggregate canonical portal domain records', () => {
  const route = read('backend/routes/portalAdmin.js');
  for (const endpoint of ["'/overview'", "'/accounts'", "'/residential/:customerId/workspace'", "'/commercial/:organizationId/workspace'", "'/agents/:agentUserId/workspace'", "'/vendors/:vendorId/workspace'"]) assert.ok(route.includes(endpoint));
  for (const model of ['PropertyMembership', 'CommercialMembership', 'CommercialLocation', 'CommercialServiceAgreement', 'RealEstateTransaction', 'VendorPortalMembership', 'Order']) assert.match(route, new RegExp(model));
  assert.match(route, /safeUser/);
  assert.match(route, /safeCustomer/);
  assert.match(route, /safeOrder/);
  assert.match(route, /safeVendor/);
  assert.doesNotMatch(route, /paymentId: id\(invoice\.paymentId\)/);
  assert.match(route, /paymentStatus: invoice\.paymentId \? 'paid' : 'open'/);
  assert.match(route, /publicOnboarding\(await homeownerOnboarding/);
  assert.match(route, /addressLine1: rx/);
  assert.match(route, /requestReference: rx/);
  assert.match(route, /commercialContext\.purchaseOrderNumber/);
});

test('account representatives are read-only while managers can use relationship-safe actions', () => {
  const route = read('backend/routes/portalAdmin.js');
  assert.match(route, /MANAGE_ROLES = new Set\(\['admin', 'manager'\]\)/);
  assert.match(route, /requireManager/);
  assert.match(route, /Property\.findOne\(\{ _id: propertyId, ownerCustomerId: customerId/);
  assert.match(route, /CommercialLocation\.findOne\(\{ _id: locationId, organizationId/);
  assert.match(route, /Order customer and property must match the transaction/);
  assert.match(route, /preservedSource: order\.source/);
  assert.match(route, /source: 'manual'/);
});

test('all portal-account mutations create audit records and do not enable impersonation', () => {
  const route = read('backend/routes/portalAdmin.js');
  for (const event of ['portal_admin_residential_order_created', 'portal_admin_commercial_order_created', 'portal_admin_agent_order_linked', 'portal_admin_agent_transaction_order_created', 'portal_admin_residential_membership_saved', 'portal_admin_commercial_membership_saved']) assert.match(route, new RegExp(event));
  assert.doesNotMatch(route, /impersonat/i);
  assert.doesNotMatch(route, /passwordHash|resetPasswordToken|tokenHash|einTaxIdEncrypted|stripeConnect\.accountId/);
});

test('vendor order attachment validates active compliance and audits every mutation', () => {
  const orders = read('backend/routes/orders.js');
  const vendorAdmin = read('backend/routes/vendorPortalAdmin.js');
  assert.match(orders, /vendorAssignmentProblems/);
  assert.match(orders, /complianceChecklist/);
  assert.match(orders, /vendorComplianceOverrides/);
  assert.match(orders, /order_vendor_assignment_created/);
  assert.match(orders, /order_vendor_assignment_updated/);
  assert.match(orders, /order_vendor_assignment_removed/);
  assert.match(vendorAdmin, /vendors\/:vendorId\/team\/:membershipId/);
  assert.match(vendorAdmin, /requireManager/);
});

test('Portal Accounts UI supports direct routes, profile tabs, actions, mobile, focus, and reduced motion', () => {
  const script = read('assets/js/portal-accounts-admin.js');
  const css = read('assets/css/portal-accounts-admin.css');
  assert.match(script, /#portal-accounts\//);
  assert.match(script, /popstate/);
  assert.match(script, /data-detail-tab/);
  assert.match(script, /data-open-order/);
  for (const action of ['residential-order', 'commercial-order', 'agent-order', 'agent-link', 'vendor-assign', 'residential-member', 'commercial-member', 'vendor-member']) assert.match(script, new RegExp(action));
  assert.match(script, /data-toggle-member/);
  assert.match(script, /data-toggle-property-member/);
  assert.match(script, /commercial\/property-members/);
  assert.match(script, /name="locationId"/);
  assert.match(script, /data-agent-access/);
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test('integrity audit is explicitly dry-run and covers every required relationship', () => {
  const audit = read('backend/audit-portal-accounts.js');
  const pkg = read('package.json');
  assert.match(pkg, /audit:portal-accounts/);
  assert.match(audit, /mode: 'dry-run'/);
  assert.match(audit, /--apply.*not supported/);
  for (const check of ['orphanedPropertyMemberships', 'orphanedCommercialMemberships', 'locationsWithoutAgreements', 'expiredAgentAccess', 'mismatchedAgentMemberships', 'inactiveVendorAssignments', 'mismatchedOrders']) assert.match(audit, new RegExp(check));
});
