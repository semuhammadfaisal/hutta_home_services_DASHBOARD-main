const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const { serializeReferral } = require('../utils/agentSerializers');
const { createAgentTransactionPackagePdf } = require('../utils/agentTransactionPackage');
const { agentPortalEnabled } = require('../utils/featureFlags');

test('agent portal feature flag defaults closed in production and supports an explicit pilot enablement', () => {
  const previousNodeEnv = process.env.NODE_ENV; const previousFlag = process.env.AGENT_PORTAL_ENABLED;
  try {
    process.env.NODE_ENV = 'production'; delete process.env.AGENT_PORTAL_ENABLED;
    assert.equal(agentPortalEnabled(), false);
    process.env.AGENT_PORTAL_ENABLED = 'true';
    assert.equal(agentPortalEnabled(), true);
    process.env.AGENT_PORTAL_ENABLED = 'false';
    assert.equal(agentPortalEnabled(), false);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    if (previousFlag === undefined) delete process.env.AGENT_PORTAL_ENABLED; else process.env.AGENT_PORTAL_ENABLED = previousFlag;
  }
  const server = read('backend/server.js'); const auth = read('backend/routes/auth.js');
  assert.match(server, /\['\/api\/agent', '\/api\/agent-admin', '\/api\/residential\/agent-invitations'\], requireAgentPortalEnabled/);
  assert.match(server, /if \(!agentPortalEnabled\(\)\) return res\.status\(404\)/);
  assert.match(auth, /requestedRole === 'real_estate_agent' && !agentPortalEnabled\(\)/);
  assert.match(auth, /residential-invite-signup[\s\S]{0,220}if \(!agentPortalEnabled\(\)\)/);
});

test('transaction package PDF renders client-safe completion records and ignores injected private fields', async () => {
  const pdf = await createAgentTransactionPackagePdf({
    packageReference: 'TXN-DEMO1234', generatedAt: new Date('2026-09-07'),
    transaction: { label: 'Cactus Ridge closing', closeDate: new Date('2026-10-01') },
    property: { label: 'Cactus Ridge', address: '123 Main St, Phoenix, AZ' },
    summary: { completedJobs: 1, documents: 2, estimates: 1, invoices: 1 },
    completions: [{ service: 'HVAC', completionReference: 'COMP-1', completedAt: new Date(), serviceNotes: 'System tested and operating normally.', beforePhotos: [{}], afterPhotos: [{}], vendorCost: 700, internalNotes: 'secret' }],
    estimates: [{ quoteReference: 'OUT-1', service: 'HVAC', clientTotal: 1200, decisionStatus: 'approved', rawVendorEstimate: 'secret' }],
    invoices: [{ invoiceNumber: 'INV-1', service: 'HVAC', clientTotal: 1200, issuedAt: new Date(), paymentCredential: 'secret' }],
    documents: [{ category: 'warranty', name: 'HVAC warranty.pdf', privateVendorContact: 'secret' }]
  });
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.ok(pdf.length > 1000);
  assert.equal(pdf.includes(Buffer.from('secret')), false);
});

test('package and every child file require current transaction document access', () => {
  const route = read('backend/routes/agent.js');
  for (const suffix of ['package', 'package.pdf', 'estimates/:quoteId/pdf', 'invoices/:invoiceId/pdf', 'completion-photos/:phase/:documentId', 'property-documents/:documentId', 'passport-documents/:documentId']) assert.ok(route.includes(suffix), `${suffix} missing`);
  assert.match(route, /scopedTransaction\(req, res, 'viewDocuments'\)/);
  assert.match(route, /CustomerInvoice\.find\(\{ orderId: \{ \$in: orderIds \} \}\)\.select/);
  assert.match(route, /JobCompletion\.find\(\{ orderId: \{ \$in: orderIds \}, status: 'completed' \}\)/);
  assert.match(route, /beforePhotos/);
  assert.match(route, /afterPhotos/);
  assert.match(route, /completionNotes/);
  assert.match(route, /passportDocuments/);
  assert.match(route, /paymentInstructionsSnapshot: \{\}/);
  assert.doesNotMatch(route.slice(route.indexOf('async function buildTransactionPackage'), route.indexOf('async function streamAgentDocument')), /IncomingQuote|vendorCost|markupAmount|coordinationFee|internalNotes|paymentMethod|tokenHash/);
});

test('expired transactions are closed once, membership access is revoked, and archived history has no protected URLs', () => {
  const route = read('backend/routes/agent.js');
  assert.match(route, /status: 'active', accessEndsAt: \{ \$lte: now \}/);
  assert.match(route, /findOneAndUpdate\(\{ _id: item\._id, status: 'active'/);
  assert.match(route, /\$set: \{ status: 'closed' \}/);
  assert.match(route, /PropertyMembership\.updateOne[\s\S]*status: 'revoked'/);
  assert.match(route, /protectedAccessAvailable: false/);
  assert.match(route, /canDownloadPackage: false/);
  const historyBlock = route.slice(route.indexOf("router.get('/transaction-history'"), route.indexOf("router.get('/transactions/:transactionId'"));
  assert.doesNotMatch(historyBlock, /downloadUrl|pdfUrl|customerId|propertyId/);
});

test('referral dashboard exposes attribution counts without rewards, commissions, or payouts', () => {
  const referral = serializeReferral({ _id: new mongoose.Types.ObjectId(), transactionId: new mongoose.Types.ObjectId(), customerId: new mongoose.Types.ObjectId(), propertyId: new mongoose.Types.ObjectId(), attributedAt: new Date(), customerSpend: 99999 }, { convertedJobCount: 2, completedJobCount: 1, rewardStatus: 'earned', rewardUnits: 1, transaction: { label: 'Closed deal', closeDate: new Date(), status: 'closed' }, property: { label: 'Desert Home' } });
  assert.equal(referral.convertedJobCount, 2);
  assert.equal(referral.completedJobCount, 1);
  assert.equal(referral.transaction.archived, true);
  assert.equal(referral.transaction.protectedAccessAvailable, false);
  assert.doesNotMatch(JSON.stringify(referral), /customerSpend|customerId|propertyId|amount|revenue|reward|commission|payout/i);
  const route = read('backend/routes/agent.js'); const script = read('assets/js/agent-portal.js');
  const referralsRoute = route.slice(route.indexOf("router.get('/referrals'"), route.indexOf("router.use((error"));
  assert.doesNotMatch(referralsRoute, /rewardUnits|rewardStatus|unitsPerCompletedJob|rewardLabel/);
  assert.doesNotMatch(script, /rewardUnits|unitsPerCompletedJob|Configured reward/);
});

test('order message relay is logged, redacted, scoped, and notifies both sides', () => {
  const agentRoute = read('backend/routes/agent.js'); const residential = read('backend/routes/residentialFeatures.js');
  assert.match(agentRoute, /scopedOrder\(req, res, 'message'\)/);
  assert.match(agentRoute, /senderType: 'agent'/);
  assert.match(agentRoute, /PortalActivity\.create/);
  assert.match(agentRoute, /Message from your real estate agent/);
  assert.match(residential, /redactContact\(item\.body\)/);
  assert.match(residential, /permissions\.message': true/);
  assert.match(residential, /New homeowner message/);
});

test('agent completion UI exposes packages, archived summaries, referrals, and accessible messaging', () => {
  const html = read('pages/agent-portal.html'); const script = read('assets/js/agent-portal.js'); const api = read('assets/js/api-service.js'); const css = read('assets/css/agent-portal.css');
  for (const id of ['archivedTransactionList', 'packageList', 'referralProgram', 'messageOrder', 'messageList', 'messageForm', 'messageBody', 'messageError']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /aria-live="polite"/);
  assert.match(script, /getAgentTransactionHistory/);
  assert.match(script, /getAgentTransactionPackage/);
  assert.match(script, /getAgentMessages/);
  assert.match(script, /sendAgentMessage/);
  assert.match(api, /async getAgentTransactionHistory/);
  assert.match(api, /async getAgentTransactionPackage/);
  assert.match(css, /\.package-grid/);
  assert.match(css, /\.message-bubble/);
  assert.match(css, /\.archive-panel/);
});

test('agent demo seed is opt-in and release checklist covers security and responsive QA', () => {
  const seed = read('backend/seed-agent-demo.js'); const pkg = JSON.parse(read('backend/package.json')); const checklist = read('backend/AGENT_PORTAL_RELEASE_CHECKLIST.md');
  assert.match(seed, /const APPLY = process\.argv\.includes\('--apply'\)/);
  assert.match(seed, /if \(!APPLY\) return/);
  assert.equal(pkg.scripts['seed:agent-demo:apply'], 'node seed-agent-demo.js --apply');
  for (const phrase of ['expired and revoked', 'raw vendor estimates', 'payment credentials', 'keyboard-only', '390px', 'GridFS']) assert.match(checklist, new RegExp(phrase, 'i'));
});
