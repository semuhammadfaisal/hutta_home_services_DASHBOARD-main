const express = require('express');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const authenticateToken = require('../middleware/auth');
const checkRole = require('../middleware/rbac');
const EmailOutbox = require('../models/EmailOutbox');
const CustomerQuoteDecision = require('../models/CustomerQuoteDecision');
const IncomingQuote = require('../models/IncomingQuote');
const Notification = require('../models/Notification');
const Order = require('../models/Order');
const OutgoingQuote = require('../models/OutgoingQuote');
const QuoteSettings = require('../models/QuoteSettings');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const { createOutgoingQuotePdf } = require('../utils/quotePdf');
const { invalidateDashboardStatsCache } = require('../utils/dashboardStatsCache');
const memCache = require('../utils/memoryCache');
const { synchronizeWorkflowOrder } = require('../utils/workflowSync');
const {
  calculatePricing, cleanText, encryptToken, generateToken, hashToken,
  legalDisclosure, nextOutgoingQuoteReference, publicQuote
} = require('../utils/outgoingQuotes');
const {
  APPROVAL_CONSENT_TEXT,
  MAX_DECISION_BODY_BYTES,
  cleanDecisionText,
  parseApprovalRecipients,
  parseDecisionPayload,
  publicDecision,
  quoteSnapshotHash,
  sha256
} = require('../utils/customerQuoteDecisions');

const router = express.Router();
const staffRoles = checkRole(['admin', 'manager', 'account_rep']);
const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
const decisionLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const STAGE4_EMAIL_TYPES = [
  'customer_quote_approval_confirmation',
  'staff_quote_approval_alert',
  'customer_quote_change_confirmation',
  'staff_quote_change_alert'
];

function actorId(req) { return req.user?.userId || req.user?.id; }
function validId(value) { return mongoose.Types.ObjectId.isValid(String(value || '')); }
function invalidateCaches() { memCache.del('orders:stats:v2'); invalidateDashboardStatsCache(); }
async function settings(session) {
  return QuoteSettings.findOneAndUpdate({ key: 'global' }, { $setOnInsert: { key: 'global' } }, { new: true, upsert: true, setDefaultsOnInsert: true, session });
}
function currentPublicQuoteQuery(token) {
  return OutgoingQuote.findOne({ publicTokenHash: hashToken(token), status: 'sent', validUntil: { $gt: new Date() } });
}
function noStore(res) { res.set('Cache-Control', 'no-store, max-age=0'); res.set('Pragma', 'no-cache'); }

router.get('/public/view', publicLimiter, async (req, res, next) => {
  try {
    noStore(res);
    if (!req.query.token) return res.status(400).json({ message: 'Quote token is required' });
    const quote = await currentPublicQuoteQuery(req.query.token).lean();
    if (!quote) return res.status(404).json({ message: 'This quote link is invalid, expired, or no longer current' });
    const decision = await CustomerQuoteDecision.findOne({ outgoingQuoteId: quote._id }).lean();
    res.json(publicQuote(quote, publicDecision(decision), APPROVAL_CONSENT_TEXT));
  } catch (error) { next(error); }
});

router.get('/public/pdf', publicLimiter, async (req, res, next) => {
  try {
    noStore(res);
    if (!req.query.token) return res.status(400).json({ message: 'Quote token is required' });
    const quote = await currentPublicQuoteQuery(req.query.token).lean();
    if (!quote) return res.status(404).json({ message: 'This quote link is invalid, expired, or no longer current' });
    const config = await settings();
    const pdf = await createOutgoingQuotePdf(quote, config.toObject());
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="${quote.quoteReference}.pdf"`);
    res.send(pdf);
  } catch (error) { next(error); }
});

function decisionOutboxMessages(quote, order, decision, token) {
  const approved = decision.decision === 'approved';
  const customerType = approved ? 'customer_quote_approval_confirmation' : 'customer_quote_change_confirmation';
  const staffType = approved ? 'staff_quote_approval_alert' : 'staff_quote_change_alert';
  const payload = {
    decision: decision.decision,
    customerName: quote.customerSnapshot?.name,
    typedName: decision.typedName,
    quoteReference: quote.quoteReference,
    requestReference: quote.jobSnapshot?.requestReference || quote.jobSnapshot?.orderReference,
    revisionNumber: quote.revisionNumber,
    customerTotal: quote.customerTotal,
    validUntil: quote.validUntil,
    decisionAt: decision.decisionAt,
    changeRequestMessage: decision.changeRequestMessage,
    orderId: String(order._id)
  };
  const messages = [{
    type: customerType,
    dedupeKey: `${quote._id}:${customerType}`,
    recipients: [String(quote.customerSnapshot.email).trim().toLowerCase()],
    payload: { ...payload, encryptedToken: encryptToken(token) },
    orderId: order._id,
    outgoingQuoteId: quote._id
  }];
  const staffEmails = parseApprovalRecipients(process.env.QUOTE_APPROVAL_NOTIFICATION_EMAILS, process.env.INTAKE_NOTIFICATION_EMAILS);
  if (staffEmails.length) messages.push({
    type: staffType,
    dedupeKey: `${quote._id}:${staffType}`,
    recipients: staffEmails,
    payload,
    orderId: order._id,
    outgoingQuoteId: quote._id
  });
  return messages;
}

router.post('/public/decision', decisionLimiter, async (req, res, next) => {
  noStore(res);
  const bodyBytes = Buffer.byteLength(JSON.stringify(req.body || {}));
  if (bodyBytes > MAX_DECISION_BODY_BYTES) return res.status(413).json({ message: 'Decision request is too large' });
  const token = cleanDecisionText(req.body?.token, 500);
  if (token.length < 20) return res.status(400).json({ message: 'A valid quote token is required' });
  const { payload, errors } = parseDecisionPayload(req.body);
  if (errors.length) return res.status(400).json({ message: errors.join('. ') });

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const quote = await OutgoingQuote.findOne({
        publicTokenHash: hashToken(token),
        status: 'sent',
        validUntil: { $gt: new Date() }
      }).session(session);
      if (!quote) throw Object.assign(new Error('This quote is invalid, expired, or no longer current'), { status: 404 });

      const wantedDecision = payload.action === 'approve' ? 'approved' : 'changes_requested';
      const existing = await CustomerQuoteDecision.findOne({ outgoingQuoteId: quote._id }).session(session);
      if (existing) {
        if (existing.decision !== wantedDecision) throw Object.assign(new Error('A different decision has already been recorded for this quote'), { status: 409 });
        result = { success: true, status: existing.decision, quoteReference: existing.quoteReference, decisionAt: existing.decisionAt, duplicate: true };
        return;
      }
      if ((quote.customerDecisionStatus || 'pending') !== 'pending') throw Object.assign(new Error('This quote is no longer awaiting a customer decision'), { status: 409 });

      const order = await Order.findOne({
        _id: quote.orderId,
        currentOutgoingQuoteId: quote._id,
        workflowStatus: 'quote_sent'
      }).session(session);
      if (!order) throw Object.assign(new Error('This quote is no longer the current Order quote'), { status: 409 });

      const decisionAt = new Date();
      const [decision] = await CustomerQuoteDecision.create([{
        outgoingQuoteId: quote._id,
        orderId: order._id,
        customerId: quote.customerId,
        decision: wantedDecision,
        typedName: payload.typedName,
        termsAccepted: wantedDecision === 'approved' && payload.termsAccepted,
        changeRequestMessage: wantedDecision === 'changes_requested' ? payload.changeRequestMessage : undefined,
        decisionAt,
        quoteReference: quote.quoteReference,
        revisionNumber: quote.revisionNumber,
        consentText: APPROVAL_CONSENT_TEXT,
        termsHash: sha256(quote.termsAndConditions),
        quoteSnapshotHash: quoteSnapshotHash(quote),
        ipAddress: cleanDecisionText(req.ip, 128),
        userAgent: cleanDecisionText(req.get('user-agent'), 1000)
      }], { session });

      quote.customerDecisionStatus = wantedDecision;
      quote.history.push({
        action: wantedDecision === 'approved' ? 'customer_approved' : 'customer_changes_requested',
        message: wantedDecision === 'approved' ? `Approved by ${payload.typedName}` : payload.changeRequestMessage
      });
      await quote.save({ session });

      if (wantedDecision === 'approved') {
        order.approvedOutgoingQuoteId = quote._id;
        order.customerApprovedAt = decisionAt;
      } else {
        order.approvedOutgoingQuoteId = undefined;
        order.customerApprovedAt = undefined;
      }
      const sync = await synchronizeWorkflowOrder(order, wantedDecision === 'approved' ? 'customer_approved' : 'quote_changes_requested', { session });

      const staff = await User.find({ isActive: true, role: { $in: ['admin', 'manager', 'account_rep'] } }).select('_id').session(session).lean();
      if (staff.length) await Notification.insertMany(staff.map(user => ({
        userId: user._id,
        title: wantedDecision === 'approved' ? 'Customer approved quote' : 'Customer requested quote changes',
        message: wantedDecision === 'approved'
          ? `${quote.customerSnapshot?.name || 'Customer'} approved ${quote.quoteReference}.`
          : `${quote.customerSnapshot?.name || 'Customer'} requested changes to ${quote.quoteReference}.`,
        type: wantedDecision === 'approved' ? 'success' : 'warning',
        priority: 'high',
        actionUrl: '#customer-approvals',
        metadata: { orderId: order._id, outgoingQuoteId: quote._id, customerQuoteDecisionId: decision._id, decision: wantedDecision }
      })), { session });

      await EmailOutbox.insertMany(decisionOutboxMessages(quote, order, decision, token), { session });
      result = { success: true, status: wantedDecision, quoteReference: quote.quoteReference, decisionAt, duplicate: false, sync };
    });
    invalidateCaches();
    return res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) {
    if (error?.code === 11000) {
      const quote = await OutgoingQuote.findOne({ publicTokenHash: hashToken(token) }).select('_id quoteReference').lean();
      const existing = quote ? await CustomerQuoteDecision.findOne({ outgoingQuoteId: quote._id }).lean() : null;
      const wantedDecision = payload.action === 'approve' ? 'approved' : 'changes_requested';
      if (existing?.decision === wantedDecision) return res.json({ success: true, status: existing.decision, quoteReference: existing.quoteReference, decisionAt: existing.decisionAt, duplicate: true });
      if (existing) return res.status(409).json({ message: 'A different decision has already been recorded for this quote' });
    }
    return next(error);
  } finally {
    await session.endSession();
  }
});

router.use(authenticateToken, staffRoles);

router.get('/settings', async (_req, res, next) => {
  try { res.json(await settings()); } catch (error) { next(error); }
});

router.put('/settings', checkRole(['admin']), async (req, res, next) => {
  try {
    const update = {
      defaultMarkupType: ['percentage', 'fixed'].includes(req.body.defaultMarkupType) ? req.body.defaultMarkupType : 'percentage',
      defaultMarkupValue: Number(req.body.defaultMarkupValue),
      defaultValidityDays: Number(req.body.defaultValidityDays),
      termsAndConditions: cleanText(req.body.termsAndConditions, 30000),
      company: {
        name: cleanText(req.body.company?.name, 300) || 'smplfix',
        address: cleanText(req.body.company?.address, 500), phone: cleanText(req.body.company?.phone, 100),
        email: cleanText(req.body.company?.email, 300), website: cleanText(req.body.company?.website, 300),
        logo: cleanText(req.body.company?.logo, 500) || '/assets/images/smplfix-logo-ink.png'
      },
      updatedBy: actorId(req)
    };
    calculatePricing(0, update.defaultMarkupType, update.defaultMarkupValue);
    if (!Number.isInteger(update.defaultValidityDays) || update.defaultValidityDays < 1 || update.defaultValidityDays > 365) return res.status(400).json({ message: 'Default validity must be between 1 and 365 days' });
    res.json(await QuoteSettings.findOneAndUpdate({ key: 'global' }, { $set: update }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }));
  } catch (error) { next(error); }
});

router.get('/approvals', async (_req, res, next) => {
  try {
    const orders = await Order.find({ $or: [{ workflowStatus: { $in: ['quote_sent', 'quote_changes_requested', 'customer_approved'] } }, { approvedOutgoingQuoteId: { $exists: true, $ne: null } }] })
      .select('orderId requestReference customer service amount workflowStatus currentOutgoingQuoteId approvedOutgoingQuoteId customerApprovedAt updatedAt')
      .sort({ updatedAt: -1 }).lean();
    const quoteIds = orders.map(order => order.currentOutgoingQuoteId).filter(Boolean);
    const [quotes, decisions, messages] = await Promise.all([
      OutgoingQuote.find({ _id: { $in: quoteIds } }).select('quoteReference revisionNumber customerTotal validUntil sentAt customerDecisionStatus orderId').lean(),
      CustomerQuoteDecision.find({ outgoingQuoteId: { $in: quoteIds } }).select('-ipAddress -userAgent').lean(),
      EmailOutbox.find({ outgoingQuoteId: { $in: quoteIds }, type: { $in: STAGE4_EMAIL_TYPES } })
        .select('outgoingQuoteId type recipients status attempts sentAt lastAttemptAt lastErrorCategory createdAt').sort({ createdAt: -1 }).lean()
    ]);
    const quoteById = new Map(quotes.map(quote => [String(quote._id), quote]));
    const decisionByQuote = new Map(decisions.map(decision => [String(decision.outgoingQuoteId), decision]));
    res.json(orders.map(order => {
      const quote = quoteById.get(String(order.currentOutgoingQuoteId));
      return {
        ...order,
        outgoingQuote: quote || null,
        decision: quote ? decisionByQuote.get(String(quote._id)) || null : null,
        emailMessages: quote ? messages.filter(message => String(message.outgoingQuoteId) === String(quote._id)) : []
      };
    }));
  } catch (error) { next(error); }
});

router.get('/approvals/:orderId', async (req, res, next) => {
  try {
    if (!validId(req.params.orderId)) return res.status(400).json({ message: 'Invalid Order id' });
    const order = await Order.findById(req.params.orderId)
      .select('orderId requestReference customer service amount workflowStatus currentOutgoingQuoteId approvedOutgoingQuoteId customerApprovedAt updatedAt').lean();
    if (!order?.currentOutgoingQuoteId) return res.status(404).json({ message: 'Customer approval record not found' });
    const [quote, decision, emailMessages] = await Promise.all([
      OutgoingQuote.findById(order.currentOutgoingQuoteId).lean(),
      CustomerQuoteDecision.findOne({ outgoingQuoteId: order.currentOutgoingQuoteId }).lean(),
      EmailOutbox.find({ outgoingQuoteId: order.currentOutgoingQuoteId, type: { $in: STAGE4_EMAIL_TYPES } })
        .select('outgoingQuoteId type recipients status attempts sentAt lastAttemptAt lastErrorCategory createdAt').sort({ createdAt: -1 }).lean()
    ]);
    if (!quote) return res.status(404).json({ message: 'Outgoing quote not found' });
    if (decision && !['admin', 'manager'].includes(req.user.role)) {
      delete decision.ipAddress;
      delete decision.userAgent;
    }
    res.json({ order, outgoingQuote: quote, decision, emailMessages });
  } catch (error) { next(error); }
});

router.post('/approvals/outbox/:messageId/retry', async (req, res, next) => {
  try {
    const message = await EmailOutbox.findOne({ _id: req.params.messageId, type: { $in: STAGE4_EMAIL_TYPES }, status: 'permanently_failed' });
    if (!message) return res.status(409).json({ message: 'Only a permanently failed customer-decision email can be retried' });
    Object.assign(message, { status: 'pending', attempts: 0, nextAttemptAt: new Date(), lockedUntil: undefined, lockedBy: undefined, lastErrorCategory: undefined });
    await message.save();
    res.json({ success: true, status: 'pending' });
  } catch (error) { next(error); }
});

router.get('/orders', async (_req, res, next) => {
  try {
    const orders = await Order.find({ workflowStatus: { $in: ['vendor_selected', 'outgoing_quote_draft', 'quote_sent', 'quote_changes_requested'] } })
      .populate('vendor', 'name legalBusinessName').sort({ updatedAt: -1 }).lean();
    const ids = orders.map(item => item._id);
    const quotes = await OutgoingQuote.find({ orderId: { $in: ids } }).sort({ revisionNumber: -1 }).lean();
    const byOrder = new Map();
    for (const quote of quotes) if (!byOrder.has(String(quote.orderId))) byOrder.set(String(quote.orderId), quote);
    res.json(orders.map(order => ({ ...order, outgoingQuote: byOrder.get(String(order._id)) || null })));
  } catch (error) { next(error); }
});

router.get('/orders/:orderId', async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId).populate('vendor').lean();
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const [quotes, messages, config] = await Promise.all([
      OutgoingQuote.find({ orderId: order._id }).sort({ revisionNumber: -1 }).lean(),
      EmailOutbox.find({ orderId: order._id, type: 'customer_outgoing_quote' }).sort({ createdAt: -1 }).lean(),
      settings()
    ]);
    res.json({ order, quotes, emailMessages: messages, settings: config });
  } catch (error) { next(error); }
});

router.post('/orders/:orderId/convert', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const existing = await OutgoingQuote.findOne({ orderId: req.params.orderId, status: 'draft' }).session(session);
      if (existing) { result = existing; return; }
      const order = await Order.findOne({ _id: req.params.orderId, workflowStatus: 'vendor_selected', pricingStatus: 'unquoted' }).session(session);
      if (!order) throw Object.assign(new Error('Only a vendor-selected, unquoted Order can be converted'), { status: 409 });
      const incoming = await IncomingQuote.findOne({ _id: order.selectedIncomingQuoteId, orderId: order._id, status: 'selected' }).session(session);
      const vendor = await Vendor.findById(order.vendor).session(session);
      if (!incoming || !vendor) throw Object.assign(new Error('Selected quote or vendor is unavailable'), { status: 409 });
      const config = await settings(session);
      const price = calculatePricing(incoming.total, config.defaultMarkupType, config.defaultMarkupValue);
      const reference = await nextOutgoingQuoteReference(session);
      const vendorData = {
        companyName: vendor.name, licensedContractorName: vendor.legalBusinessName || vendor.name,
        contractorLicenseNumber: vendor.contractorLicenseNumber || '', licenseType: vendor.rocLicenseTypeClassification || '',
        rocNumber: vendor.rocLicenseNumber || '', rocLicenseExpirationDate: vendor.rocLicenseExpirationDate,
        coiOnFile: Boolean(vendor.certificateOfInsuranceOnFile), insuranceExpirationDate: vendor.insuranceExpirationDate
      };
      [result] = await OutgoingQuote.create([{
        quoteReference: reference, orderId: order._id, customerId: order.customerId, vendorId: vendor._id, incomingQuoteId: incoming._id,
        customerSnapshot: order.customer, jobSnapshot: { requestReference: order.requestReference, orderReference: order.orderId, service: order.service, description: order.description },
        vendorSnapshot: vendorData, scopeOfWork: incoming.scopeOfWork, estimatedDuration: incoming.estimatedDuration,
        earliestAvailableDate: incoming.earliestAvailableDate, siteAccessRequired: incoming.siteAccessRequired,
        accessNotes: incoming.accessNotes, exclusionsConditions: incoming.exclusionsConditions,
        ...price, markupType: config.defaultMarkupType, markupValue: config.defaultMarkupValue,
        termsAndConditions: config.termsAndConditions,
        legalDisclosure: legalDisclosure(vendorData),
        validUntil: new Date(Date.now() + config.defaultValidityDays * 86400000),
        history: [{ action: 'created', actorId: actorId(req), actorEmail: req.user.email }]
      }], { session });
      order.amount = null; order.pricingStatus = 'unquoted';
      const sync = await synchronizeWorkflowOrder(order, 'outgoing_quote_draft', { session });
      result = { ...result.toObject(), sync };
    });
    invalidateCaches();
    res.status(201).json(result);
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await OutgoingQuote.findOne({ orderId: req.params.orderId, status: 'draft' });
      if (existing) return res.json(existing);
    }
    next(error);
  } finally { await session.endSession(); }
});

router.patch('/:quoteId', async (req, res, next) => {
  try {
    const quote = await OutgoingQuote.findOne({ _id: req.params.quoteId, status: 'draft' });
    if (!quote) return res.status(409).json({ message: 'Only draft quotes can be edited' });
    const textFields = ['scopeOfWork', 'accessNotes', 'exclusionsConditions', 'termsAndConditions'];
    for (const field of textFields) if (req.body[field] !== undefined) quote[field] = cleanText(req.body[field], field === 'termsAndConditions' ? 30000 : 10000);
    if (req.body.customerSnapshot) {
      for (const field of ['name', 'email', 'phone', 'address']) if (req.body.customerSnapshot[field] !== undefined) quote.customerSnapshot[field] = cleanText(req.body.customerSnapshot[field], 500);
    }
    if (req.body.jobSnapshot) for (const field of ['service', 'description']) if (req.body.jobSnapshot[field] !== undefined) quote.jobSnapshot[field] = cleanText(req.body.jobSnapshot[field], 10000);
    if (req.body.vendorSnapshot) for (const field of ['companyName', 'licensedContractorName', 'contractorLicenseNumber', 'licenseType', 'rocNumber']) if (req.body.vendorSnapshot[field] !== undefined) quote.vendorSnapshot[field] = cleanText(req.body.vendorSnapshot[field], 500);
    if (req.body.estimatedDuration) quote.estimatedDuration = req.body.estimatedDuration;
    if (req.body.earliestAvailableDate !== undefined) quote.earliestAvailableDate = req.body.earliestAvailableDate || undefined;
    if (req.body.siteAccessRequired !== undefined) quote.siteAccessRequired = Boolean(req.body.siteAccessRequired);
    if (req.body.validUntil !== undefined) quote.validUntil = new Date(req.body.validUntil);
    if (req.body.markupType !== undefined || req.body.markupValue !== undefined) {
      quote.markupType = req.body.markupType ?? quote.markupType;
      quote.markupValue = req.body.markupValue ?? quote.markupValue;
    }
    Object.assign(quote, calculatePricing(quote.vendorCost, quote.markupType, quote.markupValue));
    quote.legalDisclosure = legalDisclosure(quote.vendorSnapshot);
    quote.history.push({ action: 'edited', actorId: actorId(req), actorEmail: req.user.email, message: 'Draft fields updated' });
    await quote.save();
    res.json(quote);
  } catch (error) { next(error); }
});

function validateSend(quote, vendor) {
  const errors = [];
  const email = String(quote.customerSnapshot?.email || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) errors.push('A valid customer email is required');
  if (!quote.termsAndConditions?.trim()) errors.push('Approved terms and conditions are required');
  if (!(new Date(quote.validUntil) > new Date())) errors.push('Quote expiration must be in the future');
  for (const [value, label] of [[quote.vendorSnapshot?.licensedContractorName, 'Licensed contractor name'], [quote.vendorSnapshot?.contractorLicenseNumber, 'Contractor license number'], [quote.vendorSnapshot?.licenseType, 'License type'], [quote.vendorSnapshot?.rocNumber, 'ROC number']]) if (!String(value || '').trim()) errors.push(`${label} is required`);
  const now = new Date();
  if (!vendor?.certificateOfInsuranceOnFile) errors.push('Vendor COI must be on file');
  if (!vendor?.insuranceExpirationDate || new Date(vendor.insuranceExpirationDate) <= now) errors.push('Vendor insurance must be current');
  if (vendor?.rocLicenseExpirationDate && new Date(vendor.rocLicenseExpirationDate) <= now) errors.push('Vendor ROC license is expired');
  return errors;
}

function outgoingOutbox(quote, token, sendNumber = 1) {
  return {
    type: 'customer_outgoing_quote', dedupeKey: `${quote._id}:customer_outgoing_quote:${sendNumber}`,
    recipients: [String(quote.customerSnapshot.email).trim().toLowerCase()],
    payload: { encryptedToken: encryptToken(token), customerName: quote.customerSnapshot.name, quoteReference: quote.quoteReference, requestReference: quote.jobSnapshot.requestReference || quote.jobSnapshot.orderReference, customerTotal: quote.customerTotal, validUntil: quote.validUntil },
    orderId: quote.orderId, outgoingQuoteId: quote._id
  };
}

router.post('/:quoteId/send', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    let sent;
    await session.withTransaction(async () => {
      const quote = await OutgoingQuote.findOne({ _id: req.params.quoteId, status: 'draft' }).session(session);
      if (!quote) throw Object.assign(new Error('Only a draft quote can be sent'), { status: 409 });
      const [order, incoming, vendor] = await Promise.all([
        Order.findById(quote.orderId).session(session), IncomingQuote.findById(quote.incomingQuoteId).session(session), Vendor.findById(quote.vendorId).session(session)
      ]);
      if (!order || !incoming || !vendor || String(order.selectedIncomingQuoteId) !== String(incoming._id) || incoming.status !== 'selected') throw Object.assign(new Error('The selected vendor quote is no longer current'), { status: 409 });
      const errors = validateSend(quote, vendor);
      if (errors.length) throw Object.assign(new Error(errors.join('. ')), { status: 409 });
      const token = generateToken();
      quote.publicTokenHash = hashToken(token); quote.status = 'sent'; quote.sentAt = new Date(); quote.sentBy = actorId(req); quote.deliveryStatus = 'pending'; quote.customerDecisionStatus = 'pending';
      quote.legalDisclosure = legalDisclosure(quote.vendorSnapshot);
      quote.history.push({ action: 'sent', actorId: actorId(req), actorEmail: req.user.email });
      if (quote.previousVersionId) {
        await OutgoingQuote.updateOne({ _id: quote.previousVersionId, status: 'sent' }, { $set: { status: 'superseded', supersededAt: new Date(), supersededBy: actorId(req) }, $unset: { publicTokenHash: '' }, $push: { history: { action: 'superseded', actorId: actorId(req), actorEmail: req.user.email } } }, { session });
      }
      await quote.save({ session });
      await EmailOutbox.create([outgoingOutbox(quote, token)], { session });
      order.currentOutgoingQuoteId = quote._id; order.amount = quote.customerTotal; order.pricingStatus = 'quoted'; order.profit = quote.customerTotal - Number(order.vendorCost || 0) - Number(order.processingFee || 0);
      const sync = await synchronizeWorkflowOrder(order, 'quote_sent', { session });
      sent = { ...quote.toObject(), sync };
    });
    invalidateCaches(); res.json(sent);
  } catch (error) { next(error); } finally { await session.endSession(); }
});

router.get('/:quoteId/pdf', async (req, res, next) => {
  try {
    noStore(res);
    const quote = await OutgoingQuote.findById(req.params.quoteId).lean();
    if (!quote) return res.status(404).json({ message: 'Quote not found' });
    const config = await settings();
    const pdf = await createOutgoingQuotePdf(quote, config.toObject());
    res.set('Content-Type', 'application/pdf'); res.set('Content-Disposition', `inline; filename="${quote.quoteReference}.pdf"`); res.send(pdf);
  } catch (error) { next(error); }
});

router.post('/:quoteId/revise', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    let draft;
    await session.withTransaction(async () => {
      const existing = await OutgoingQuote.findOne({ orderId: { $exists: true }, status: 'draft', previousVersionId: req.params.quoteId }).session(session);
      if (existing) { draft = existing; return; }
      const source = await OutgoingQuote.findOne({ _id: req.params.quoteId, status: 'sent', customerDecisionStatus: { $ne: 'approved' } }).select('-publicTokenHash').lean().session(session);
      if (!source) throw Object.assign(new Error('Only a sent quote that is not approved can be revised'), { status: 409 });
      const reference = await nextOutgoingQuoteReference(session);
      const data = { ...source, _id: undefined, quoteReference: reference, revisionNumber: source.revisionNumber + 1, previousVersionId: source._id, status: 'draft', deliveryStatus: 'not_sent', customerDecisionStatus: 'not_requested', sentAt: undefined, sentBy: undefined, publicTokenHash: undefined, createdAt: undefined, updatedAt: undefined, history: [{ action: 'revision_created', actorId: actorId(req), actorEmail: req.user.email }] };
      [draft] = await OutgoingQuote.create([data], { session });
      const order = await Order.findById(source.orderId).session(session);
      if (order) {
        const sync = await synchronizeWorkflowOrder(order, 'outgoing_quote_draft', { session });
        draft = { ...draft.toObject(), sync };
      }
    });
    res.status(201).json(draft);
  } catch (error) { next(error); } finally { await session.endSession(); }
});

router.post('/:quoteId/void', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const quote = await OutgoingQuote.findOne({ _id: req.params.quoteId, status: { $in: ['draft', 'sent'] }, customerDecisionStatus: { $ne: 'approved' } }).session(session);
      if (!quote) throw Object.assign(new Error('Only a draft or current unapproved quote can be voided'), { status: 409 });
      const order = await Order.findById(quote.orderId).session(session);
      quote.status = 'voided'; quote.voidedAt = new Date(); quote.voidedBy = actorId(req); quote.publicTokenHash = undefined;
      quote.history.push({ action: 'voided', actorId: actorId(req), actorEmail: req.user.email, message: cleanText(req.body.reason, 1000) });
      await quote.save({ session });
      if (quote.status === 'voided' && (!order.currentOutgoingQuoteId || String(order.currentOutgoingQuoteId) === String(quote._id))) {
        order.currentOutgoingQuoteId = undefined; order.amount = null; order.pricingStatus = 'unquoted'; order.profit = 0;
        const sync = await synchronizeWorkflowOrder(order, 'vendor_selected', { session });
        result = { ...quote.toObject(), sync };
      } else if (order.workflowStatus === 'outgoing_quote_draft') {
        const sync = await synchronizeWorkflowOrder(order, 'vendor_selected', { session });
        result = { ...quote.toObject(), sync };
      } else result = quote;
    });
    invalidateCaches(); res.json(result);
  } catch (error) { next(error); } finally { await session.endSession(); }
});

router.post('/:quoteId/resend', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const quote = await OutgoingQuote.findOne({ _id: req.params.quoteId, status: 'sent', customerDecisionStatus: 'pending', validUntil: { $gt: new Date() } }).select('+publicTokenHash').session(session);
      if (!quote) throw Object.assign(new Error('Only a current, unexpired quote awaiting a decision can be resent'), { status: 409 });
      const token = generateToken(); quote.publicTokenHash = hashToken(token); quote.deliveryStatus = 'pending';
      const sendNumber = 1 + await EmailOutbox.countDocuments({ outgoingQuoteId: quote._id, type: 'customer_outgoing_quote' }).session(session);
      quote.history.push({ action: 'resent', actorId: actorId(req), actorEmail: req.user.email });
      await quote.save({ session }); await EmailOutbox.create([outgoingOutbox(quote, token, sendNumber)], { session });
      result = { success: true, deliveryStatus: quote.deliveryStatus };
    });
    res.json(result);
  } catch (error) { next(error); } finally { await session.endSession(); }
});

router.post('/outbox/:messageId/retry', async (req, res, next) => {
  try {
    const message = await EmailOutbox.findOne({ _id: req.params.messageId, type: 'customer_outgoing_quote', status: 'permanently_failed' });
    if (!message) return res.status(409).json({ message: 'Only a permanently failed outgoing quote email can be retried' });
    Object.assign(message, { status: 'pending', attempts: 0, nextAttemptAt: new Date(), lockedUntil: undefined, lockedBy: undefined, lastErrorCategory: undefined });
    await message.save(); await OutgoingQuote.updateOne({ _id: message.outgoingQuoteId }, { $set: { deliveryStatus: 'pending' } });
    res.json({ success: true, status: 'pending' });
  } catch (error) { next(error); }
});

router.use((error, _req, res, _next) => {
  console.error('Outgoing quote error:', error?.name || 'Error', error?.message || '');
  res.status(error.status || (error.name === 'ValidationError' ? 400 : 500)).json({ message: error.message || 'Outgoing quote request failed' });
});

module.exports = router;
