const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const { publicContractorSnapshot, vendorContractorSnapshot } = require('../utils/vendorContractor');

test('contractor identity is derived from the assigned vendor and reduced for customer views', () => {
  const vendor = {
    name: 'Friendly Trade Name', legalBusinessName: 'Verified Legal Contractor LLC',
    rocClassification: 'CR-39', rocLicenseNumber: 'ROC-12345',
    rocLicenseExpirationDate: new Date('2027-01-01T00:00:00.000Z'),
    email: 'private@example.com', phone: '555-0100', internalCost: 900
  };
  const snapshot = vendorContractorSnapshot(vendor);
  assert.equal(snapshot.licensedContractorName, 'Verified Legal Contractor LLC');
  assert.equal(snapshot.licenseType, 'CR-39');
  assert.equal(snapshot.rocNumber, 'ROC-12345');
  const safe = publicContractorSnapshot(snapshot);
  assert.deepEqual(safe, { name: 'Verified Legal Contractor LLC', licenseType: 'CR-39', rocNumber: 'ROC-12345' });
  assert.doesNotMatch(JSON.stringify(safe), /private@example|555-0100|internalCost|900/);

  const route = read('backend/routes/outgoingQuotes.js');
  const browser = read('assets/js/outgoing-quotes.js');
  assert.match(route, /req\.body\.vendorSnapshot !== undefined/);
  assert.match(route, /Contractor identity is managed from the assigned vendor record/);
  assert.match(route, /vendorContractorSnapshot\(vendor\)/);
  assert.doesNotMatch(browser, /vendorSnapshot:\s*\{/);
  assert.match(browser, /Locked to assigned vendor/);
});

test('issued invoices and every agent package surface use a safe immutable contractor snapshot', () => {
  const model = read('backend/models/CustomerInvoice.js');
  const closeout = read('backend/routes/closeout.js');
  const agent = read('backend/routes/agent.js');
  const invoicePdf = read('backend/utils/invoicePdf.js');
  const packagePdf = read('backend/utils/agentTransactionPackage.js');
  const migration = read('backend/migrate-invoice-contractors.js');
  assert.match(model, /contractorSnapshot:[^\n]*immutable:\s*true/);
  assert.match(closeout, /contractorSnapshot:\s*publicContractorSnapshot\(vendorContractorSnapshot\(vendor\)\)/);
  assert.match(agent, /invoice\.contractorSnapshot\?\.name/);
  assert.match(agent, /publicContractorSnapshot\(vendorContractorSnapshot\(order\?\.vendor\)\)/);
  assert.match(invoicePdf, /Service contractor/);
  assert.match(packagePdf, /item\.contractor\.rocNumber/);
  assert.match(migration, /--apply/);
  assert.match(migration, /invoiceSnapshotHash/);
});

test('agent notifications are durable, deduplicated, transition-based, and transaction-linked', () => {
  const worker = read('backend/utils/agentNotifications.js');
  const state = read('backend/models/AgentNotificationState.js');
  const notification = read('backend/models/Notification.js');
  const outbox = read('backend/models/EmailOutbox.js');
  const server = read('backend/server.js');
  const route = read('backend/routes/agent.js');
  const portal = read('assets/js/agent-portal.js');
  assert.match(notification, /dedupeKey:[^\n]*unique:\s*true[^\n]*sparse:\s*true/);
  assert.match(outbox, /agent_portal_update/);
  assert.match(outbox, /homeowner_agent_action_reminder/);
  assert.match(state, /deadlineRiskByOrder/);
  assert.match(state, /packageReady/);
  assert.match(worker, /15 \* 60 \* 1000/);
  assert.match(worker, /rank\(risk\.level\) > rank\(previous\.level\)/);
  assert.match(worker, /package-ready:/);
  assert.match(server, /createAgentNotificationWorker/);
  assert.match(route, /actionUrl: \/\^#transactions/);
  assert.match(portal, /item\?\.actionUrl/);
  assert.match(portal, /showTransaction\(decodeURIComponent/);
});

test('transaction detail is a refreshable aggregate workspace with work, messages, documents, package and onboarding', () => {
  const route = read('backend/routes/agent.js');
  const api = read('assets/js/api-service.js');
  const html = read('pages/agent-portal.html');
  const portal = read('assets/js/agent-portal.js');
  assert.match(route, /get\('\/transactions\/:transactionId\/workspace'/);
  assert.match(route, /buildTransactionWorkspace/);
  for (const key of ['workItems', 'messages', 'documents', 'package', 'onboarding', 'capabilities']) assert.match(route, new RegExp(`${key}`));
  assert.match(api, /async getAgentTransactionWorkspace\(transactionId\)/);
  assert.match(html, /data-view="transaction-detail"/);
  for (const tab of ['work', 'messages', 'documents', 'onboarding']) assert.match(portal, new RegExp(`data-workspace-tab="${tab}"`));
  assert.match(portal, /route\.match\(\/\^transactions\\\/\(\[a-f0-9\]\{24\}\)\$\/i\)/);
  assert.match(portal, /hashchange/);
});

test('homeowner onboarding is privacy-safe and reminders are rate-limited and queued', () => {
  const onboarding = read('backend/utils/agentOnboarding.js');
  const route = read('backend/routes/agent.js');
  const notifications = read('backend/utils/agentNotifications.js');
  for (const id of ['invitation_delivered', 'invitation_opened', 'account_activated', 'property_confirmed', 'consent_accepted', 'access_active', 'homeowner_profile', 'property_profile_complete', 'ready_for_service']) assert.match(onboarding, new RegExp(id));
  assert.doesNotMatch(onboarding, /cardNumber|paymentMethod|passwordHash/);
  assert.match(route, /get\('\/transactions\/:transactionId\/onboarding'/);
  assert.match(route, /post\('\/transactions\/:transactionId\/onboarding\/reminder'/);
  assert.match(route, /now\.getTime\(\) - 86400000/);
  assert.match(route, /weekly >= 3/);
  assert.match(notifications, /homeowner_agent_action_reminder/);
  assert.match(route, /onboarding_reminder_sent/);
});

test('homeowners can correct only proposed properties and must reconfirm before acceptance', () => {
  const route = read('backend/routes/agentClientInvitations.js');
  const model = read('backend/models/AgentClientInvitation.js');
  const html = read('pages/agent-invitation.html');
  const portal = read('assets/js/agent-invitation.js');
  assert.match(route, /existingPropertyId && req\.body\?\.propertyCorrections/);
  assert.match(route, /allowed = \['label', 'addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'propertyType'\]/);
  assert.match(route, /validateProperty/);
  assert.match(route, /residentialAddressKey/);
  assert.match(route, /requires staff review/);
  assert.match(model, /property_corrected/);
  for (const id of ['correctedPropertyLabel', 'correctedAddressLine1', 'correctedAddressLine2', 'correctedCity', 'correctedState', 'correctedPostalCode', 'correctedPropertyType']) assert.ok(html.includes(`id="${id}"`), `${id} missing`);
  assert.match(portal, /propertyCorrections/);
  assert.match(portal, /element\.propertyConfirmed\.checked = false/);
});

test('staff extensions stop at close plus 30 Arizona days and expose the maximum date', () => {
  const route = read('backend/routes/agentAdmin.js');
  const browser = read('assets/js/agent-directory-admin.js');
  const audit = read('backend/audit-agent-extension-limits.js');
  assert.match(route, /calculateAccessExpiry\(transaction\.closeDate, 30\)/);
  assert.match(route, /AGENT_EXTENSION_LIMIT/);
  assert.match(route, /payload\.maximumAccessEndsAt/);
  assert.match(route, /existingMembership\.endsAt = newEndsAt/);
  assert.match(route, /previousEndsAt, newEndsAt, reason/);
  assert.match(browser, /maximumAccessEndsAt/);
  assert.match(browser, /extendAgentAdminTransaction/);
  assert.match(audit, /dry-run/);
  assert.doesNotMatch(audit, /updateMany|deleteMany/);
});

test('public marketing pages describe the correct portals and preselect the existing signup roles', () => {
  const home = read('index.html');
  const agents = read('pages/real-estate-agents.html');
  const propertyManagement = read('pages/property-management.html');
  const login = read('assets/js/login-script.js');
  assert.match(home, /real-estate-agents\.html/);
  assert.match(home, /property-management\.html/);
  assert.match(agents, /transaction/i);
  assert.match(agents, /inspection/i);
  assert.match(agents, /homeowner/i);
  assert.match(agents, /portal=real_estate_agent/);
  assert.match(propertyManagement, /Multi-property visibility/);
  assert.match(propertyManagement, /portal=commercial/);
  assert.match(login, /params\.get\('portal'\)/);
});
