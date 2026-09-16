const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { GridFSBucket, ObjectId } = require('mongodb');
const AgentInvitation = require('../models/AgentInvitation');
const AgentClientInvitation = require('../models/AgentClientInvitation');
const AgentReferralAttribution = require('../models/AgentReferralAttribution');
const Counter = require('../models/Counter');
const Customer = require('../models/Customer');
const CustomerInvoice = require('../models/CustomerInvoice');
const JobCompletion = require('../models/JobCompletion');
const Notification = require('../models/Notification');
const Order = require('../models/Order');
const OutgoingQuote = require('../models/OutgoingQuote');
const JobSchedule = require('../models/JobSchedule');
const PortalActivity = require('../models/PortalActivity');
const Property = require('../models/Property');
const PropertyMembership = require('../models/PropertyMembership');
const RealEstateAgentProfile = require('../models/RealEstateAgentProfile');
const RealEstateTransaction = require('../models/RealEstateTransaction');
const ResidentialMessage = require('../models/ResidentialMessage');
const ResidentialPropertyProfile = require('../models/ResidentialPropertyProfile');
const User = require('../models/User');
const { calculateAccessExpiry, createInvitationToken, hashInvitationToken, membershipPermissions, propertyFingerprint, agentPermissions } = require('../utils/agentAccess');
const { redactContact, serializeAgentProfile, serializeClient, serializeClientInvitation, serializeMessage, serializeOrder, serializeProperty, serializeReferral, serializeTransaction } = require('../utils/agentSerializers');
const { sendAgentClientInvitationEmail } = require('../utils/emailService');
const { ensureAgentProfile } = require('../utils/agentProfileProvisioning');
const { buildPublicUrl } = require('../utils/publicAppUrl');
const { SERVICE_CATEGORIES } = require('../utils/residentialRequests');
const { deadlineRisk, median, validateAgentRequest } = require('../utils/agentRequests');
const { synchronizeWorkflowOrder } = require('../utils/workflowSync');
const { createOutgoingQuotePdf } = require('../utils/quotePdf');
const { createCustomerInvoicePdf } = require('../utils/invoicePdf');
const { createAgentTransactionPackagePdf } = require('../utils/agentTransactionPackage');
const VendorAvailabilitySlot = require('../models/VendorAvailabilitySlot');
const Vendor = require('../models/Vendor');
const { activeCompliance } = require('../utils/vendorLeadDistribution');
const { createAgentArchive } = require('../utils/agentArchive');
const { clientDocumentAllowed } = require('../utils/agentDocumentPolicy');

const router = express.Router();
router.use(async (req, res, next) => {
  try {
    const profile = await ensureAgentProfile(req.user.userId);
    if (!profile || profile.status !== 'active') return res.status(403).json({ message: 'An active, non-suspended agent profile is required' });
    next();
  } catch (error) { next(error); }
});
const FILE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const writes = rateLimit({ windowMs: 15 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false, keyGenerator: req => String(req.user.userId), message: { message: 'Too many agent portal updates. Please wait and try again.' } });
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: 10 * 1024 * 1024 }, fileFilter: (_req, file, done) => { const allowed = FILE_TYPES.has(String(file.mimetype || '').toLowerCase()); done(allowed ? null : new Error('Only PDF, JPG, PNG, and WebP files are allowed'), allowed); } }).single('document');
const requestUpload = multer({ storage: multer.memoryStorage(), limits: { files: 5, fileSize: 10 * 1024 * 1024 }, fileFilter: (_req, file, done) => { const allowed = FILE_TYPES.has(String(file.mimetype || '').toLowerCase()); done(allowed ? null : new Error('Only PDF, JPG, PNG, and WebP files are allowed'), allowed); } }).fields([{ name: 'inspectionReport', maxCount: 1 }, { name: 'supportingFiles', maxCount: 4 }]);
const validId = value => mongoose.Types.ObjectId.isValid(String(value || ''));
const clean = (value, max) => String(value || '').trim().slice(0, max);
const nowFilter = (userId, now = new Date()) => ({ agentUserId: userId, status: 'active', accessEndsAt: { $gt: now } });

function validFileSignature(file) {
  const buffer = file?.buffer || Buffer.alloc(0); const mime = String(file?.mimetype || '').toLowerCase();
  if (mime === 'application/pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === 'image/webp') return buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
  return false;
}

function uploadDocument(req, res, next) {
  upload(req, res, error => error ? res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ message: error.message }) : next());
}
function uploadRequestDocuments(req, res, next) {
  requestUpload(req, res, error => error ? res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ message: error.message }) : next());
}
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));

function invitationUrl(token) {
  return buildPublicUrl('/pages/agent-invitation.html', `invitation=${encodeURIComponent(token)}`);
}

async function deliverClientInvitation(invitation, profile, rawToken) {
  try {
    await sendAgentClientInvitationEmail({ recipients: [invitation.homeownerEmail], homeownerName: invitation.homeownerName, agentName: profile.displayName, brokerageName: profile.brokerageName, transactionLabel: invitation.transactionLabel, closeDate: invitation.closeDate, token: rawToken, expiresAt: invitation.expiresAt });
    invitation.deliveryStatus = 'sent'; invitation.sentAt = new Date(); invitation.deliveryError = undefined; invitation.history.push({ action: 'sent', actorId: invitation.agentUserId });
  } catch (error) {
    invitation.deliveryStatus = 'failed'; invitation.deliveryError = clean(error?.message, 1000); invitation.history.push({ action: 'delivery_failed', actorId: invitation.agentUserId, reason: 'Email delivery failed' });
  }
  await invitation.save();
}

async function activeMembership(transaction, userId, now = new Date(), session = null) {
  const query = PropertyMembership.findOne({ userId, propertyId: transaction.propertyId, customerId: transaction.customerId, relationship: 'agent', sourceTransactionId: transaction._id, status: 'active', 'permissions.view': true, startsAt: { $lte: now }, endsAt: { $gt: now } });
  if (session) query.session(session);
  return query.lean();
}

async function visibleTransactions(userId) {
  await expireAgentTransactions(userId);
  const transactions = await RealEstateTransaction.find(nowFilter(userId)).sort({ closeDate: 1 }).lean();
  const visible = [];
  for (const transaction of transactions) if (await activeMembership(transaction, userId)) visible.push(transaction);
  return visible;
}

async function expireAgentTransactions(userId, now = new Date()) {
  const expired = await RealEstateTransaction.find({ agentUserId: userId, status: 'active', accessEndsAt: { $lte: now } }).select('_id customerId propertyId label accessEndsAt').lean();
  for (const item of expired) {
    const updated = await RealEstateTransaction.findOneAndUpdate({ _id: item._id, status: 'active', accessEndsAt: { $lte: now } }, { $set: { status: 'closed' }, $push: { accessHistory: { action: 'expired', actorId: userId, previousEndsAt: item.accessEndsAt, newEndsAt: item.accessEndsAt, reason: 'Transaction access expired automatically' } } }, { new: true }).lean();
    if (!updated) continue;
    await Promise.all([
      PropertyMembership.updateOne({ userId, sourceTransactionId: item._id, relationship: 'agent', status: 'active' }, { $set: { status: 'revoked', endsAt: item.accessEndsAt, revokedAt: now } }),
      PortalActivity.create({ userId, customerId: item.customerId, propertyId: item.propertyId, type: 'agent_access_expired', title: 'Transaction access archived', summary: item.label }),
      Notification.create({ userId, title: 'Transaction moved to history', message: `Access to ${item.label} expired at the transaction boundary. Protected records are no longer available.`, type: 'info', priority: 'medium', actionUrl: '#transactions', metadata: { transactionId: item._id } })
    ]);
  }
  return expired.length;
}

async function scopedTransaction(req, res, permission = 'viewStatus') {
  if (!validId(req.params.transactionId)) { res.status(400).json({ message: 'Invalid transaction id' }); return null; }
  const transaction = await RealEstateTransaction.findOne({ _id: req.params.transactionId, ...nowFilter(req.user.userId) }).lean();
  const membership = transaction ? await activeMembership(transaction, req.user.userId) : null;
  if (!transaction || transaction.permissions?.[permission] !== true || !membership || (permission === 'requestService' && membership.permissions?.requestService !== true)) { res.status(404).json({ message: 'Transaction not found' }); return null; }
  return transaction;
}

async function scopedOrder(req, res, permission = 'viewStatus') {
  if (!validId(req.params.orderId)) { res.status(400).json({ message: 'Invalid order id' }); return null; }
  const order = await Order.findById(req.params.orderId).populate('vendor', 'name legalBusinessName companyName category rocNumber rocLicenseNumber').lean();
  if (!order?.propertyId) { res.status(404).json({ message: 'Order not found' }); return null; }
  const transaction = await RealEstateTransaction.findOne({ ...nowFilter(req.user.userId), propertyId: order.propertyId, customerId: order.customerId, [`permissions.${permission}`]: true }).lean();
  if (!transaction || !(await activeMembership(transaction, req.user.userId))) { res.status(404).json({ message: 'Order not found' }); return null; }
  return { order, transaction };
}

async function enrichOrders(orders, transactions = []) {
  if (!orders.length) return [];
  const orderIds = orders.map(item => item._id);
  const [quotes, schedules] = await Promise.all([
    OutgoingQuote.find({ orderId: { $in: orderIds }, status: 'sent' }).select('orderId quoteReference status customerDecisionStatus sentAt validUntil earliestAvailableDate revisionNumber').sort({ revisionNumber: -1 }).lean(),
    JobSchedule.find({ orderId: { $in: orderIds }, status: 'accepted' }).select('orderId status proposedStart proposedEnd timezone revisionNumber').sort({ revisionNumber: -1 }).lean()
  ]);
  const quoteMap = new Map(); const scheduleMap = new Map();
  quotes.forEach(item => { if (!quoteMap.has(String(item.orderId))) quoteMap.set(String(item.orderId), item); });
  schedules.forEach(item => { if (!scheduleMap.has(String(item.orderId))) scheduleMap.set(String(item.orderId), item); });
  const transactionMap = new Map(transactions.map(item => [`${item.customerId}:${item.propertyId}`, item]));
  return orders.map(order => {
    const quote = quoteMap.get(String(order._id)); const confirmedSchedule = scheduleMap.get(String(order._id));
    const transaction = transactionMap.get(`${order.customerId}:${order.propertyId}`) || {};
    return serializeOrder(order, { quote, confirmedSchedule, deadlineRisk: deadlineRisk(order, transaction, quote, confirmedSchedule) });
  });
}

async function storeRequestFiles(files, transaction, userId) {
  const incoming = [...(files?.inspectionReport || []).map(file => ({ file, kind: 'inspection_report' })), ...(files?.supportingFiles || []).map(file => ({ file, kind: String(file.mimetype).startsWith('image/') ? 'supporting_photo' : 'supporting_document' }))];
  if (!incoming.length) return { documents: [], storedIds: [] };
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) throw Object.assign(new Error('File storage is not ready'), { status: 503 });
  if (incoming.some(item => !validFileSignature(item.file))) throw Object.assign(new Error('A document content signature does not match its file type'), { status: 400 });
  const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' }); const documents = []; const storedIds = [];
  try {
    for (const item of incoming) {
      const name = clean(item.file.originalname, 180).replace(/[^a-zA-Z0-9._-]+/g, '_') || item.kind;
      const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${name}`;
      const fileId = await new Promise((resolve, reject) => { const stream = bucket.openUploadStream(filename, { metadata: { source: 'agent_service_request', documentType: item.kind, transactionId: String(transaction._id), propertyId: String(transaction.propertyId), uploadedBy: String(userId), originalRetained: true } }); stream.once('error', reject); stream.once('finish', () => resolve(stream.id)); stream.end(item.file.buffer); });
      storedIds.push(fileId); documents.push({ documentId: crypto.randomUUID(), name, url: `/uploads/${encodeURIComponent(filename)}`, type: item.file.mimetype, size: item.file.size, storageProvider: 'gridfs', fileId, uploadedBy: String(userId), portalDocumentType: item.kind });
    }
    return { documents, storedIds };
  } catch (error) { await Promise.all(storedIds.map(fileId => bucket.delete(fileId).catch(() => {}))); throw error; }
}

function safePackageDocument(document, category, downloadUrl) {
  if (!document || document.status === 'archived') return null;
  const safe = { id: document.documentId, name: redactContact(document.title || document.name || 'Document'), category, type: document.type, size: document.size, uploadedAt: document.uploadedAt, downloadUrl };
  Object.defineProperty(safe, '_fileId', { value: document.fileId, enumerable: false });
  return safe;
}

async function buildTransactionPackage(transaction) {
  const orders = await Order.find({ customerId: transaction.customerId, propertyId: transaction.propertyId }).select('_id orderId requestReference service description workflowStatus documents createdAt completedAt customerInvoiceId currentOutgoingQuoteId approvedOutgoingQuoteId').sort({ createdAt: 1 }).lean();
  const orderIds = orders.map(item => item._id);
  const [property, completions, quotes, invoices, passport] = await Promise.all([
    Property.findById(transaction.propertyId).select('label addressLine1 addressLine2 city state postalCode documents').lean(),
    JobCompletion.find({ orderId: { $in: orderIds }, status: 'completed' }).select('orderId completionReference completionNotes completedAt beforePhotos afterPhotos jobSnapshot').lean(),
    OutgoingQuote.find({ orderId: { $in: orderIds }, status: 'sent' }).select('orderId quoteReference revisionNumber status customerDecisionStatus customerSnapshot jobSnapshot scopeOfWork estimatedDuration earliestAvailableDate siteAccessRequired accessNotes exclusionsConditions customerTotal termsAndConditions legalDisclosure validUntil sentAt vendorSnapshot').sort({ revisionNumber: -1 }).lean(),
    CustomerInvoice.find({ orderId: { $in: orderIds } }).select('_id orderId invoiceNumber amount issuedAt dueDate terms companySnapshot customerSnapshot jobSnapshot quoteSnapshot snapshotHash').lean(),
    ResidentialPropertyProfile.findOne({ propertyId: transaction.propertyId, customerId: transaction.customerId }).select('passportDocuments').lean()
  ]);
  const orderMap = new Map(orders.map(item => [String(item._id), item]));
  const packageReference = `TXN-${String(transaction._id).slice(-8).toUpperCase()}`;
  const safeQuotes = quotes.map(quote => ({ id: String(quote._id), quoteReference: quote.quoteReference, orderId: String(quote.orderId), service: quote.jobSnapshot?.service || orderMap.get(String(quote.orderId))?.service, status: quote.status, decisionStatus: quote.customerDecisionStatus, clientTotal: quote.customerTotal, sentAt: quote.sentAt, validUntil: quote.validUntil, pdfUrl: `/api/agent/transactions/${transaction._id}/estimates/${quote._id}/pdf` }));
  const safeInvoices = invoices.map(invoice => ({ id: String(invoice._id), invoiceNumber: invoice.invoiceNumber, orderId: String(invoice.orderId), service: invoice.jobSnapshot?.service || orderMap.get(String(invoice.orderId))?.service, clientTotal: invoice.amount, issuedAt: invoice.issuedAt, dueDate: invoice.dueDate, pdfUrl: `/api/agent/transactions/${transaction._id}/invoices/${invoice._id}/pdf` }));
  const safeCompletions = completions.map(completion => {
    const order = orderMap.get(String(completion.orderId));
    const photos = phase => (completion[`${phase}Photos`] || []).filter(item => item.status !== 'archived').map(item => safePackageDocument(item, `${phase}_photo`, `/api/agent/transactions/${transaction._id}/completion-photos/${phase}/${encodeURIComponent(item.documentId)}`));
    return { id: String(completion._id), orderId: String(completion.orderId), orderReference: order?.orderId, completionReference: completion.completionReference, service: completion.jobSnapshot?.service || order?.service, completedAt: completion.completedAt, serviceNotes: redactContact(completion.completionNotes), beforePhotos: photos('before'), afterPhotos: photos('after') };
  });
  const documents = [];
  (transaction.documents || []).filter(Boolean).forEach(item => documents.push(safePackageDocument(item, item.portalDocumentType || 'transaction_document', `/api/agent/transactions/${transaction._id}/documents/${encodeURIComponent(item.documentId)}`)));
  (property?.documents || []).filter(clientDocumentAllowed).forEach(item => documents.push(safePackageDocument(item, item.complianceDocumentType || 'property_document', `/api/agent/transactions/${transaction._id}/property-documents/${encodeURIComponent(item.documentId)}`)));
  orders.forEach(order => (order.documents || []).filter(clientDocumentAllowed).forEach(item => documents.push(safePackageDocument(item, item.portalDocumentType || item.complianceDocumentType || 'order_document', `/api/agent/orders/${order._id}/documents/${encodeURIComponent(item.documentId)}`))));
  (passport?.passportDocuments || []).filter(clientDocumentAllowed).forEach(item => documents.push(safePackageDocument(item, item.category || 'property_passport', `/api/agent/transactions/${transaction._id}/passport-documents/${encodeURIComponent(item.documentId)}`)));
  const cleanDocuments = documents.filter(Boolean);
  return { packageReference, generatedAt: new Date(), transaction: { id: String(transaction._id), label: transaction.label, closeDate: transaction.closeDate }, property: { label: property?.label || 'Property', address: [property?.addressLine1, property?.addressLine2, property?.city, property?.state, property?.postalCode].filter(Boolean).join(', ') }, estimates: safeQuotes, invoices: safeInvoices, completions: safeCompletions, documents: cleanDocuments, summary: { orders: orders.length, completedJobs: safeCompletions.length, estimates: safeQuotes.length, invoices: safeInvoices.length, documents: cleanDocuments.length + safeCompletions.reduce((sum, item) => sum + item.beforePhotos.length + item.afterPhotos.length, 0) }, pdfUrl: `/api/agent/transactions/${transaction._id}/package.pdf`, capabilities: { canDownload: true, canApproveEstimates: false, canManageBilling: false } };
}

async function streamAgentDocument(document, res, next) {
  try {
    if (!document || document.status === 'archived' || !document.fileId || !ObjectId.isValid(String(document.fileId))) return res.status(404).json({ message: 'Document not found' });
    if (!mongoose.connection.db) return res.status(503).json({ message: 'File storage is not ready' });
    const filename = clean(document.name || document.title || 'document', 180).replace(/[\r\n"\\]/g, '_');
    res.set({ 'Content-Type': document.type || 'application/octet-stream', 'Content-Disposition': `inline; filename="${filename}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' }).openDownloadStream(new ObjectId(String(document.fileId))).once('error', next).pipe(res);
  } catch (error) { next(error); }
}

router.post('/invitations/accept', writes, async (req, res, next) => {
  const rawToken = String(req.body?.token || '');
  if (rawToken.length < 32 || rawToken.length > 100) return res.status(400).json({ message: 'A valid invitation token is required' });
  const tokenHash = hashInvitationToken(rawToken);
  const session = await mongoose.startSession();
  try {
    let accepted;
    await session.withTransaction(async () => {
      const now = new Date();
      const invitation = await AgentInvitation.findOneAndUpdate(
        { tokenHash, agentUserId: req.user.userId, agentEmail: String(req.user.email).toLowerCase(), status: 'pending', expiresAt: { $gt: now } },
        { $set: { status: 'processing' } }, { new: true, session, select: '+tokenHash' }
      );
      if (!invitation) throw Object.assign(new Error('This invitation is invalid, expired, revoked, or already used'), { status: 410 });
      const transaction = await RealEstateTransaction.findOne({ _id: invitation.transactionId, agentUserId: req.user.userId, customerId: invitation.customerId, propertyId: invitation.propertyId, status: 'invited', accessEndsAt: { $gt: now } }).session(session);
      if (!transaction) throw Object.assign(new Error('This transaction access is no longer available'), { status: 410 });
      const owner = await PropertyMembership.exists({ propertyId: invitation.propertyId, customerId: invitation.customerId, relationship: 'owner', status: 'active' }).session(session);
      const property = await Property.exists({ _id: invitation.propertyId, ownerCustomerId: invitation.customerId, status: 'active' }).session(session);
      if (!owner || !property) throw Object.assign(new Error('The homeowner account or property is unavailable'), { status: 409 });
      await PropertyMembership.findOneAndUpdate(
        { userId: req.user.userId, propertyId: invitation.propertyId },
        { $set: { customerId: invitation.customerId, relationship: 'agent', permissions: membershipPermissions(transaction.permissions), status: 'active', startsAt: now, endsAt: transaction.accessEndsAt, revokedAt: null, sourceTransactionId: transaction._id, accessApprovedBy: invitation.createdBy }, $setOnInsert: { createdBy: invitation.createdBy } },
        { upsert: true, new: true, session, setDefaultsOnInsert: true }
      );
      transaction.status = 'active'; transaction.acceptedAt = now; transaction.accessHistory.push({ action: 'accepted', actorId: req.user.userId, newEndsAt: transaction.accessEndsAt }); await transaction.save({ session });
      invitation.status = 'accepted'; invitation.acceptedAt = now; invitation.acceptedBy = req.user.userId; invitation.history.push({ action: 'accepted', actorId: req.user.userId }); await invitation.save({ session });
      await AgentReferralAttribution.updateOne({ transactionId: transaction._id }, { $setOnInsert: { agentUserId: req.user.userId, customerId: transaction.customerId, propertyId: transaction.propertyId, source: 'agent_invitation', status: 'attributed', attributedAt: now } }, { upsert: true, session });
      await PortalActivity.create([{ userId: req.user.userId, customerId: transaction.customerId, propertyId: transaction.propertyId, type: 'agent_access_accepted', title: 'Real estate agent access accepted', summary: `${transaction.label} access ends ${transaction.accessEndsAt.toISOString()}.` }], { session });
      accepted = transaction;
    });
    res.json({ transaction: serializeTransaction(accepted) });
  } catch (error) {
    if (error.status === 410) {
      const now = new Date();
      const expired = await AgentInvitation.findOneAndUpdate({ tokenHash, agentUserId: req.user.userId, status: 'pending', expiresAt: { $lte: now } }, { $set: { status: 'expired' }, $push: { history: { action: 'expired', actorId: req.user.userId } } }, { new: true });
      if (expired) await RealEstateTransaction.updateOne({ _id: expired.transactionId, status: 'invited' }, { $set: { status: 'closed', accessEndsAt: now }, $push: { accessHistory: { action: 'expired', actorId: req.user.userId, newEndsAt: now } } });
    }
    next(error);
  } finally { await session.endSession(); }
});

router.get('/me', async (req, res, next) => {
  try {
    const profile = await ensureAgentProfile(req.user.userId);
    if (!profile) return res.status(403).json({ message: 'An approved active agent account is required' });
    if (profile.status !== 'active') return res.status(403).json({ message: 'Agent profile is suspended. Please contact SMPLfix support.' });
    res.set('Cache-Control', 'no-store').json({ agent: serializeAgentProfile(profile, req.user) });
  } catch (error) { next(error); }
});

router.get('/client-invitations', async (req, res, next) => {
  try {
    const now = new Date();
    await AgentClientInvitation.updateMany({ agentUserId: req.user.userId, status: 'pending', expiresAt: { $lte: now } }, { $set: { status: 'expired' }, $push: { history: { action: 'expired', occurredAt: now } } });
    const invitations = await AgentClientInvitation.find({ agentUserId: req.user.userId }).sort({ createdAt: -1 }).limit(250).lean();
    res.json({ data: invitations.map(item => serializeClientInvitation(item)) });
  } catch (error) { next(error); }
});

router.get('/client-invitation-properties', async (req, res, next) => {
  try {
    const memberships = await PropertyMembership.find({ userId: req.user.userId, relationship: 'agent' }).select('propertyId').lean();
    const properties = await Property.find({ _id: { $in: memberships.map(item => item.propertyId) }, status: 'active' }).lean();
    res.json({ data: properties.map(serializeProperty) });
  } catch (error) { next(error); }
});

router.post('/client-invitations', writes, async (req, res, next) => {
  try {
    const homeownerEmail = clean(req.body?.homeownerEmail, 254).toLowerCase();
    if (!validEmail(homeownerEmail)) return res.status(400).json({ message: 'A valid homeowner email is required' });
    const closeDate = clean(req.body?.closeDate, 10); const graceDays = req.body?.accessRule === 'close_plus_days' ? Number(req.body?.graceDays || 0) : 0; const accessEndsAt = calculateAccessExpiry(closeDate, graceDays);
    if (!accessEndsAt || accessEndsAt <= new Date()) return res.status(400).json({ message: 'A future close date is required' });
    const profile = await RealEstateAgentProfile.findOne({ userId: req.user.userId, status: 'active' });
    if (!profile) return res.status(409).json({ message: 'An active agent profile is required' });
    let existingProperty; let existingCustomerId; let proposedProperty;
    if (req.body?.existingPropertyId) {
      if (!validId(req.body.existingPropertyId)) return res.status(400).json({ message: 'The selected property is unavailable' });
      const priorMembership = await PropertyMembership.findOne({ userId: req.user.userId, propertyId: req.body.existingPropertyId, relationship: 'agent' }).lean();
      existingProperty = priorMembership ? await Property.findOne({ _id: req.body.existingPropertyId, ownerCustomerId: priorMembership.customerId, status: 'active' }).lean() : null;
      const customer = existingProperty ? await Customer.findById(existingProperty.ownerCustomerId).select('email emails').lean() : null;
      const customerEmails = [customer?.email, ...(customer?.emails || []).map(item => item.address)].filter(Boolean).map(value => String(value).toLowerCase());
      if (!existingProperty || !customerEmails.includes(homeownerEmail)) return res.status(409).json({ message: 'The selected property cannot be invited with this email' });
      const currentlyLinked = await PropertyMembership.exists({ userId: req.user.userId, propertyId: existingProperty._id, relationship: 'agent', status: 'active', endsAt: { $gt: new Date() } });
      if (currentlyLinked) return res.status(409).json({ message: 'This property is already linked to your active portfolio' });
      existingCustomerId = existingProperty.ownerCustomerId;
      proposedProperty = { label: existingProperty.label, addressLine1: existingProperty.addressLine1, addressLine2: existingProperty.addressLine2, city: existingProperty.city, state: existingProperty.state, postalCode: existingProperty.postalCode, propertyType: existingProperty.propertyType };
    } else {
      proposedProperty = { label: clean(req.body?.property?.label, 120) || 'Transaction property', addressLine1: clean(req.body?.property?.addressLine1, 240), addressLine2: clean(req.body?.property?.addressLine2, 240), city: clean(req.body?.property?.city, 120), state: clean(req.body?.property?.state, 80) || 'AZ', postalCode: clean(req.body?.property?.postalCode, 24), propertyType: clean(req.body?.property?.propertyType, 80) };
      if (!proposedProperty.addressLine1 || !proposedProperty.city || !proposedProperty.state || !proposedProperty.postalCode) return res.status(400).json({ message: 'A complete proposed property address is required' });
    }
    const fingerprint = existingProperty ? `property:${existingProperty._id}` : `address:${propertyFingerprint(proposedProperty)}`;
    await AgentClientInvitation.updateMany({ agentUserId: req.user.userId, homeownerEmail, propertyFingerprint: fingerprint, status: 'pending', expiresAt: { $lte: new Date() } }, { $set: { status: 'expired' }, $push: { history: { action: 'expired' } } });
    const duplicate = await AgentClientInvitation.exists({ agentUserId: req.user.userId, homeownerEmail, propertyFingerprint: fingerprint, status: { $in: ['pending', 'processing'] }, expiresAt: { $gt: new Date() } });
    if (duplicate) return res.status(409).json({ message: 'A pending invitation already exists for this homeowner and property' });
    const rawToken = createInvitationToken(); const expiresAt = new Date(Date.now() + Math.min(14, Math.max(1, Number(req.body?.expiresInDays) || 7)) * 86400000); const shouldEmail = req.body?.delivery === 'email';
    const invitation = await AgentClientInvitation.create({ tokenHash: hashInvitationToken(rawToken), agentUserId: req.user.userId, homeownerEmail, homeownerName: clean(req.body?.homeownerName, 160), existingCustomerId, existingPropertyId: existingProperty?._id, proposedProperty, propertyFingerprint: fingerprint, transactionLabel: clean(req.body?.transactionLabel, 180) || proposedProperty?.label || existingProperty?.label || existingProperty?.addressLine1 || 'Property transaction', closeDate: new Date(`${closeDate}T07:00:00.000Z`), accessRule: req.body?.accessRule === 'close_plus_days' ? 'close_plus_days' : 'at_close', graceDays, accessEndsAt, permissions: agentPermissions(req.body?.permissions), status: 'pending', expiresAt, deliveryStatus: shouldEmail ? 'pending' : 'copy_only', createdBy: req.user.userId, history: [{ action: 'created', actorId: req.user.userId }] });
    await PortalActivity.create({ userId: req.user.userId, type: 'client_invitation_created', title: 'Homeowner invitation created', summary: `${invitation.transactionLabel} invitation created for ${homeownerEmail}.` });
    const homeowner = await User.findOne({ email: homeownerEmail, role: 'residential', isActive: true }).select('_id').lean();
    if (homeowner) await Notification.create({ userId: homeowner._id, title: 'Agent invitation ready to review', message: `${profile.displayName} invited you to connect a property transaction. Sign in to review the permission scope.`, type: 'info', actionUrl: '/pages/agent-invitation.html', metadata: { invitationId: invitation._id } });
    if (shouldEmail) await deliverClientInvitation(invitation, profile, rawToken);
    res.status(201).json({ invitation: serializeClientInvitation(invitation), inviteUrl: invitationUrl(rawToken) });
  } catch (error) { next(error); }
});

router.post('/client-invitations/:invitationId/resend', writes, async (req, res, next) => {
  try {
    if (!validId(req.params.invitationId)) return res.status(400).json({ message: 'Invalid invitation id' });
    const profile = await RealEstateAgentProfile.findOne({ userId: req.user.userId, status: 'active' });
    if (!profile) return res.status(409).json({ message: 'An active agent profile is required' });
    const rawToken = createInvitationToken(); const expiresAt = new Date(Date.now() + 7 * 86400000);
    const invitation = await AgentClientInvitation.findOneAndUpdate({ _id: req.params.invitationId, agentUserId: req.user.userId, status: 'pending' }, { $set: { tokenHash: hashInvitationToken(rawToken), expiresAt, deliveryStatus: 'pending' } }, { new: true }).select('+deliveryError');
    if (!invitation) return res.status(404).json({ message: 'Pending invitation not found' });
    await deliverClientInvitation(invitation, profile, rawToken);
    res.json({ invitation: serializeClientInvitation(invitation), inviteUrl: invitationUrl(rawToken) });
  } catch (error) { next(error); }
});

router.post('/client-invitations/:invitationId/revoke', writes, async (req, res, next) => {
  try {
    if (!validId(req.params.invitationId)) return res.status(400).json({ message: 'Invalid invitation id' }); const reason = clean(req.body?.reason, 1000) || 'Revoked by inviting agent'; const now = new Date();
    const invitation = await AgentClientInvitation.findOneAndUpdate({ _id: req.params.invitationId, agentUserId: req.user.userId, status: 'pending' }, { $set: { status: 'revoked', revokedAt: now, revokedBy: req.user.userId, revocationReason: reason }, $push: { history: { action: 'revoked', actorId: req.user.userId, reason } } }, { new: true }).lean();
    if (!invitation) return res.status(404).json({ message: 'Pending invitation not found' });
    await PortalActivity.create({ userId: req.user.userId, type: 'client_invitation_revoked', title: 'Homeowner invitation revoked', summary: invitation.transactionLabel });
    res.json({ invitation: serializeClientInvitation(invitation) });
  } catch (error) { next(error); }
});

router.get('/portfolio', async (req, res, next) => {
  try {
    const valid = await visibleTransactions(req.user.userId);
    const [customers, properties] = await Promise.all([Customer.find({ _id: { $in: valid.map(item => item.customerId) } }).select('_id name status').lean(), Property.find({ _id: { $in: valid.map(item => item.propertyId) } }).lean()]);
    const customerMap = new Map(customers.map(item => [String(item._id), item])); const propertyMap = new Map(properties.map(item => [String(item._id), item]));
    res.json({ data: valid.map(item => serializeTransaction(item, { customer: customerMap.get(String(item.customerId)), property: propertyMap.get(String(item.propertyId)) })) });
  } catch (error) { next(error); }
});

router.get('/clients', async (req, res, next) => {
  try {
    const allowed = await visibleTransactions(req.user.userId);
    const customerIds = [...new Set(allowed.map(item => String(item.customerId)))];
    const customers = await Customer.find({ _id: { $in: customerIds } }).select('_id name status').lean();
    res.json({ data: customers.map(serializeClient) });
  } catch (error) { next(error); }
});

router.get('/properties', async (req, res, next) => {
  try {
    const allowed = await visibleTransactions(req.user.userId);
    const properties = await Property.find({ _id: { $in: allowed.map(item => item.propertyId) }, status: 'active' }).lean();
    res.json({ data: properties.map(serializeProperty) });
  } catch (error) { next(error); }
});

router.get('/transactions', async (req, res, next) => { try { const transactions = await visibleTransactions(req.user.userId); res.json({ data: transactions.map(serializeTransaction) }); } catch (error) { next(error); } });
router.get('/transaction-history', async (req, res, next) => {
  try {
    await expireAgentTransactions(req.user.userId);
    const items = await RealEstateTransaction.find({ agentUserId: req.user.userId, status: { $in: ['closed', 'revoked'] } }).select('_id label closeDate accessEndsAt status revokedAt updatedAt').sort({ closeDate: -1 }).limit(200).lean();
    res.json({ data: items.map(item => ({ id: String(item._id), label: item.label, closeDate: item.closeDate, archivedAt: item.revokedAt || item.accessEndsAt || item.updatedAt, status: item.status, protectedAccessAvailable: false, capabilities: { canOpen: false, canDownloadPackage: false, canMessage: false } })) });
  } catch (error) { next(error); }
});
router.get('/transactions/:transactionId', async (req, res, next) => { try { const transaction = await scopedTransaction(req, res); if (!transaction) return; const [customer, property] = await Promise.all([Customer.findById(transaction.customerId).select('_id name status').lean(), Property.findById(transaction.propertyId).lean()]); res.json({ transaction: serializeTransaction(transaction, { customer, property }) }); } catch (error) { next(error); } });
router.get('/transactions/:transactionId/orders', async (req, res, next) => { try { const transaction = await scopedTransaction(req, res); if (!transaction) return; const orders = await Order.find({ propertyId: transaction.propertyId, customerId: transaction.customerId }).populate('vendor', 'name legalBusinessName companyName category rocNumber rocLicenseNumber').sort({ createdAt: -1 }).lean(); res.json({ data: await enrichOrders(orders, [transaction]) }); } catch (error) { next(error); } });

router.get('/orders', async (req, res, next) => {
  try {
    const transactions = await visibleTransactions(req.user.userId);
    if (!transactions.length) return res.json({ data: [] });
    const pairs = transactions.map(item => ({ propertyId: item.propertyId, customerId: item.customerId }));
    const orders = await Order.find({ $or: pairs }).populate('vendor', 'name legalBusinessName companyName category rocNumber rocLicenseNumber').sort({ createdAt: -1 }).limit(500).lean();
    res.json({ data: await enrichOrders(orders, transactions) });
  } catch (error) { next(error); }
});

router.get('/activity', async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));
    const items = await PortalActivity.find({ userId: req.user.userId }).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ data: items.map(item => ({ id: String(item._id), type: item.type, title: redactContact(item.title), summary: redactContact(item.summary), propertyId: item.propertyId ? String(item.propertyId) : null, orderId: item.orderId ? String(item.orderId) : null, createdAt: item.createdAt })) });
  } catch (error) { next(error); }
});

router.get('/notifications', async (req, res, next) => {
  try {
    const items = await Notification.find({ userId: req.user.userId }).sort({ createdAt: -1 }).limit(100).lean();
    const data = items.map(item => ({ id: String(item._id), title: redactContact(item.title), message: redactContact(item.message), type: item.type, priority: item.priority, isRead: item.isRead === true, createdAt: item.createdAt }));
    res.json({ data, unreadCount: data.filter(item => !item.isRead).length });
  } catch (error) { next(error); }
});

router.patch('/notifications/:notificationId/read', writes, async (req, res, next) => {
  try {
    if (!validId(req.params.notificationId)) return res.status(400).json({ message: 'Invalid notification id' });
    const item = await Notification.findOneAndUpdate({ _id: req.params.notificationId, userId: req.user.userId }, { $set: { isRead: true } }, { new: true }).lean();
    if (!item) return res.status(404).json({ message: 'Notification not found' });
    res.json({ notification: { id: String(item._id), title: redactContact(item.title), message: redactContact(item.message), type: item.type, priority: item.priority, isRead: true, createdAt: item.createdAt } });
  } catch (error) { next(error); }
});

router.post('/transactions/:transactionId/documents', writes, uploadDocument, async (req, res, next) => {
  let storedId;
  try {
    const transaction = await scopedTransaction(req, res, 'uploadInspection'); if (!transaction) return;
    if (!req.file) return res.status(400).json({ message: 'An inspection report is required' });
    if (!validFileSignature(req.file)) return res.status(400).json({ message: 'Document content does not match its file type' });
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return res.status(503).json({ message: 'File storage is not ready' });
    const name = clean(req.file.originalname, 180).replace(/[^a-zA-Z0-9._-]+/g, '_') || 'inspection-report';
    const filename = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${name}`;
    const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
    storedId = await new Promise((resolve, reject) => { const stream = bucket.openUploadStream(filename, { metadata: { source: 'agent_inspection', transactionId: String(transaction._id), propertyId: String(transaction.propertyId), uploadedBy: String(req.user.userId) } }); stream.once('error', reject); stream.once('finish', () => resolve(stream.id)); stream.end(req.file.buffer); });
    const document = { documentId: crypto.randomUUID(), name, url: `/uploads/${encodeURIComponent(filename)}`, type: req.file.mimetype, size: req.file.size, storageProvider: 'gridfs', fileId: storedId, uploadedBy: String(req.user.userId) };
    const updated = await RealEstateTransaction.findOneAndUpdate({ _id: transaction._id, ...nowFilter(req.user.userId) }, { $push: { documents: document } }, { new: true });
    if (!updated) throw Object.assign(new Error('Transaction access expired before the upload completed'), { status: 409 });
    await PortalActivity.create({ userId: req.user.userId, customerId: transaction.customerId, propertyId: transaction.propertyId, type: 'agent_inspection_uploaded', title: 'Inspection report uploaded', summary: name });
    res.status(201).json({ transaction: serializeTransaction(updated) });
  } catch (error) { if (storedId && mongoose.connection.db) await new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' }).delete(storedId).catch(() => {}); next(error); }
});

router.get('/transactions/:transactionId/documents/:documentId', async (req, res, next) => {
  try {
    const transaction = await scopedTransaction(req, res, 'viewDocuments'); if (!transaction) return;
    const document = (transaction.documents || []).find(item => item.status !== 'archived' && item.documentId === req.params.documentId);
    if (!document?.fileId || !ObjectId.isValid(String(document.fileId))) return res.status(404).json({ message: 'Document not found' });
    if (!mongoose.connection.db) return res.status(503).json({ message: 'File storage is not ready' });
    const filename = clean(document.name, 180).replace(/[\r\n"\\]/g, '_');
    res.set({ 'Content-Type': document.type || 'application/octet-stream', 'Content-Disposition': `inline; filename="${filename}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' }).openDownloadStream(new ObjectId(String(document.fileId))).on('error', next).pipe(res);
  } catch (error) { next(error); }
});

router.get('/transactions/:transactionId/package', async (req, res, next) => {
  try { const transaction = await scopedTransaction(req, res, 'viewDocuments'); if (!transaction) return; res.set('Cache-Control', 'private, no-store').json({ package: await buildTransactionPackage(transaction) }); } catch (error) { next(error); }
});
router.get('/transactions/:transactionId/package.pdf', async (req, res, next) => {
  try {
    const transaction = await scopedTransaction(req, res, 'viewDocuments'); if (!transaction) return;
    const pkg = await buildTransactionPackage(transaction); const pdf = await createAgentTransactionPackagePdf(pkg);
    await PortalActivity.create({ userId: req.user.userId, customerId: transaction.customerId, propertyId: transaction.propertyId, type: 'agent_transaction_package_downloaded', title: 'Transaction package downloaded', summary: pkg.packageReference });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${pkg.packageReference}.pdf"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }).send(pdf);
  } catch (error) { next(error); }
});
router.get('/transactions/:transactionId/package.zip', writes, async (req, res, next) => {
  try {
    const transaction = await scopedTransaction(req, res, 'viewDocuments'); if (!transaction) return;
    const pkg = await buildTransactionPackage(transaction);
    const entries = [{ name: `${pkg.packageReference}-summary.pdf`, buffer: await createAgentTransactionPackagePdf(pkg) }];
    let totalBytes = entries[0].buffer.length;
    const omitted = [];
    const documents = [...pkg.documents, ...pkg.completions.flatMap(item => [...item.beforePhotos, ...item.afterPhotos])].filter(Boolean);
    if (documents.length + pkg.estimates.length + pkg.invoices.length > 245) return res.status(413).json({ message: 'Too many files; download individual documents instead' });
    const append = (name, buffer) => { totalBytes += buffer.length; if (totalBytes > 80 * 1024 * 1024) throw Object.assign(new Error('Package exceeds 80 MB; download files individually'), { status: 413 }); entries.push({ name, buffer }); };
    for (const quote of pkg.estimates) {
      const raw = await OutgoingQuote.findOne({ _id: quote.id, orderId: quote.orderId, status: 'sent' }).select('quoteReference revisionNumber customerSnapshot jobSnapshot scopeOfWork estimatedDuration customerTotal termsAndConditions legalDisclosure validUntil sentAt vendorSnapshot').lean();
      if (raw) append(`${quote.quoteReference}-estimate.pdf`, await createOutgoingQuotePdf({ quoteReference: raw.quoteReference, revisionNumber: raw.revisionNumber, customerSnapshot: { name: raw.customerSnapshot?.name, address: raw.customerSnapshot?.address }, jobSnapshot: { service: raw.jobSnapshot?.service, description: raw.jobSnapshot?.description }, scopeOfWork: raw.scopeOfWork, estimatedDuration: raw.estimatedDuration, customerTotal: raw.customerTotal, termsAndConditions: raw.termsAndConditions, legalDisclosure: raw.legalDisclosure, validUntil: raw.validUntil, sentAt: raw.sentAt, vendorSnapshot: { licensedContractorName: raw.vendorSnapshot?.licensedContractorName, rocNumber: raw.vendorSnapshot?.rocNumber, licenseType: raw.vendorSnapshot?.licenseType } }));
    }
    for (const invoice of pkg.invoices) {
      const raw = await CustomerInvoice.findOne({ _id: invoice.id, orderId: invoice.orderId }).select('invoiceNumber amount issuedAt dueDate terms companySnapshot customerSnapshot jobSnapshot quoteSnapshot snapshotHash').lean();
      if (raw) append(`${invoice.invoiceNumber}-invoice.pdf`, await createCustomerInvoicePdf({ ...raw, paymentInstructionsSnapshot: {}, contractor: undefined }));
    }
    for (const doc of documents) {
      if (!doc._fileId || !ObjectId.isValid(String(doc._fileId))) { omitted.push({ name: doc.name, reason: 'File not available in protected storage' }); continue; }
      const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
      const stored = await bucket.find({ _id: new ObjectId(String(doc._fileId)) }).next();
      if (!stored) { omitted.push({ name: doc.name, reason: 'Stored file missing' }); continue; }
      if (stored.length > 10 * 1024 * 1024 || totalBytes + stored.length > 80 * 1024 * 1024) throw Object.assign(new Error('Package file limits exceeded; download individually'), { status: 413 });
      const chunks = []; for await (const chunk of bucket.openDownloadStream(stored._id)) chunks.push(chunk);
      append(doc.name, Buffer.concat(chunks));
    }
    append('manifest.json', Buffer.from(JSON.stringify({ reference: pkg.packageReference, files: entries.map(item => item.name), omitted }, null, 2)));
    const archive = await createAgentArchive(entries);
    // Access can expire/revoke while the archive is being assembled.
    if (!(await scopedTransaction(req, res, 'viewDocuments'))) return;
    const currentProfile = await ensureAgentProfile(req.user.userId);
    if (currentProfile?.status !== 'active') return res.status(403).json({ message: 'Agent access is no longer active' });
    await PortalActivity.create({ userId: req.user.userId, customerId: transaction.customerId, propertyId: transaction.propertyId, type: 'agent_transaction_bundle_downloaded', title: 'Transaction bundle downloaded', summary: pkg.packageReference });
    res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${pkg.packageReference}.zip"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }).send(archive);
  } catch (error) { next(error); }
});
router.get('/transactions/:transactionId/estimates/:quoteId/pdf', async (req, res, next) => {
  try {
    const transaction = await scopedTransaction(req, res, 'viewDocuments'); if (!transaction) return;
    if (!validId(req.params.quoteId)) return res.status(400).json({ message: 'Invalid estimate id' });
    const orders = await Order.find({ customerId: transaction.customerId, propertyId: transaction.propertyId }).select('_id').lean();
    const quote = await OutgoingQuote.findOne({ _id: req.params.quoteId, orderId: { $in: orders.map(item => item._id) }, status: 'sent' }).lean(); if (!quote) return res.status(404).json({ message: 'Estimate not found' });
    const pdf = await createOutgoingQuotePdf({ quoteReference: quote.quoteReference, revisionNumber: quote.revisionNumber, customerSnapshot: { name: quote.customerSnapshot?.name, address: quote.customerSnapshot?.address }, jobSnapshot: quote.jobSnapshot, scopeOfWork: quote.scopeOfWork, estimatedDuration: quote.estimatedDuration, earliestAvailableDate: quote.earliestAvailableDate, siteAccessRequired: quote.siteAccessRequired, accessNotes: quote.accessNotes, exclusionsConditions: quote.exclusionsConditions, customerTotal: quote.customerTotal, termsAndConditions: quote.termsAndConditions, legalDisclosure: quote.legalDisclosure, validUntil: quote.validUntil, sentAt: quote.sentAt, vendorSnapshot: { licensedContractorName: quote.vendorSnapshot?.licensedContractorName, licenseType: quote.vendorSnapshot?.licenseType, rocNumber: quote.vendorSnapshot?.rocNumber } });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${clean(quote.quoteReference, 80)}.pdf"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }).send(pdf);
  } catch (error) { next(error); }
});
router.get('/transactions/:transactionId/invoices/:invoiceId/pdf', async (req, res, next) => {
  try {
    const transaction = await scopedTransaction(req, res, 'viewDocuments'); if (!transaction) return;
    if (!validId(req.params.invoiceId)) return res.status(400).json({ message: 'Invalid invoice id' });
    const order = await Order.findOne({ customerId: transaction.customerId, propertyId: transaction.propertyId, customerInvoiceId: req.params.invoiceId }).select('_id').lean();
    const invoice = order ? await CustomerInvoice.findOne({ _id: req.params.invoiceId, orderId: order._id }).lean() : null; if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    const pdf = await createCustomerInvoicePdf({ ...invoice, paymentInstructionsSnapshot: {}, contractor: undefined });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${clean(invoice.invoiceNumber, 80)}.pdf"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }).send(pdf);
  } catch (error) { next(error); }
});
router.get('/transactions/:transactionId/completion-photos/:phase/:documentId', async (req, res, next) => {
  try {
    const transaction = await scopedTransaction(req, res, 'viewDocuments'); if (!transaction) return;
    if (!['before', 'after'].includes(req.params.phase)) return res.status(400).json({ message: 'Invalid photo phase' });
    const orders = await Order.find({ customerId: transaction.customerId, propertyId: transaction.propertyId }).select('_id').lean();
    const completion = await JobCompletion.findOne({ orderId: { $in: orders.map(item => item._id) }, status: 'completed', [`${req.params.phase}Photos.documentId`]: req.params.documentId }).lean();
    return streamAgentDocument((completion?.[`${req.params.phase}Photos`] || []).find(item => item.documentId === req.params.documentId), res, next);
  } catch (error) { next(error); }
});
router.get('/transactions/:transactionId/property-documents/:documentId', async (req, res, next) => { try { const transaction = await scopedTransaction(req, res, 'viewDocuments'); if (!transaction) return; const property = await Property.findOne({ _id: transaction.propertyId, ownerCustomerId: transaction.customerId }).select('documents').lean(); return streamAgentDocument((property?.documents || []).find(item => clientDocumentAllowed(item) && item.documentId === req.params.documentId), res, next); } catch (error) { next(error); } });
router.get('/transactions/:transactionId/passport-documents/:documentId', async (req, res, next) => { try { const transaction = await scopedTransaction(req, res, 'viewDocuments'); if (!transaction) return; const profile = await ResidentialPropertyProfile.findOne({ propertyId: transaction.propertyId, customerId: transaction.customerId }).select('passportDocuments').lean(); return streamAgentDocument((profile?.passportDocuments || []).find(item => clientDocumentAllowed(item) && item.documentId === req.params.documentId), res, next); } catch (error) { next(error); } });

router.get('/transactions/:transactionId/request-guidance', async (req, res, next) => {
  try {
    const transaction = await scopedTransaction(req, res, 'requestService'); if (!transaction) return;
    const serviceCategory = clean(req.query.serviceCategory, 120);
    if (!SERVICE_CATEGORIES.includes(serviceCategory)) return res.status(400).json({ message: 'Select a valid service category' });
    const since = new Date(Date.now() - (180 * 86400000));
    const historicalQuotes = await OutgoingQuote.find({ status: 'sent', sentAt: { $gte: since }, 'jobSnapshot.service': serviceCategory }).select('orderId sentAt').sort({ sentAt: -1 }).limit(100).lean();
    const historicalOrders = historicalQuotes.length ? await Order.find({ _id: { $in: historicalQuotes.map(item => item.orderId) } }).select('_id createdAt').lean() : [];
    const createdMap = new Map(historicalOrders.map(item => [String(item._id), new Date(item.createdAt)]));
    const turnaroundHours = historicalQuotes.map(item => {
      const created = createdMap.get(String(item.orderId));
      return created && item.sentAt ? (new Date(item.sentAt).getTime() - created.getTime()) / 3600000 : NaN;
    }).filter(value => Number.isFinite(value) && value >= 0 && value <= 720);
    const observedMedian = median(turnaroundHours);
    const property = await Property.findById(transaction.propertyId).select('postalCode').lean();
    const slots = await VendorAvailabilitySlot.find({ serviceCategory, postalCodes: property?.postalCode, status: 'confirmed_available', startsAt: { $gt: new Date() } }).sort({ startsAt: 1 }).limit(100).lean();
    let nextSlot = null;
    for (const slot of slots) {
      const vendor = await Vendor.findById(slot.vendorId).lean();
      if (!activeCompliance(vendor)) continue;
      const conflict = await JobSchedule.exists({ vendorId: slot.vendorId, status: { $in: ['pending_vendor', 'accepted'] }, proposedStart: { $lt: slot.endsAt }, proposedEnd: { $gt: slot.startsAt } });
      if (!conflict) { nextSlot = slot; break; }
    }
    res.json({
      serviceCategory,
      estimateTurnaround: observedMedian == null ? null : { medianHours: Math.round(observedMedian * 10) / 10, sampleSize: turnaroundHours.length, source: 'historical_sent_estimates' },
      nextSchedulingAvailability: nextSlot ? { date: nextSlot.startsAt, endsAt: nextSlot.endsAt, source: 'staff_confirmed_vendor_calendar', guaranteed: false } : null,
      generatedAt: new Date()
    });
  } catch (error) { next(error); }
});

router.post('/transactions/:transactionId/requests', writes, uploadRequestDocuments, async (req, res, next) => {
  let storedIds = [];
  let session;
  try {
    const transaction = await scopedTransaction(req, res, 'requestService'); if (!transaction) return;
    const key = clean(req.get('Idempotency-Key'), 100); if (!/^[A-Za-z0-9._:-]{16,100}$/.test(key)) return res.status(400).json({ message: 'A valid Idempotency-Key is required' });
    const portalSubmissionKey = `agent:${req.user.userId}:${key}`;
    const duplicate = await Order.findOne({ portalSubmissionKey }).populate('vendor', 'name legalBusinessName companyName category rocNumber rocLicenseNumber').lean();
    if (duplicate) return res.json({ duplicate: true, order: (await enrichOrders([duplicate], [transaction]))[0] });
    const validated = validateAgentRequest(req.body, transaction);
    if (validated.errors.length) return res.status(400).json({ message: validated.errors.join('. '), errors: validated.errors });
    const stored = await storeRequestFiles(req.files, transaction, req.user.userId); storedIds = stored.storedIds;
    session = await mongoose.startSession();
    let order; let wasDuplicate = false;
    await session.withTransaction(async () => {
      const currentTransaction = await RealEstateTransaction.findOne({ _id: transaction._id, ...nowFilter(req.user.userId), 'permissions.requestService': true }).session(session).lean();
      const currentMembership = currentTransaction ? await activeMembership(currentTransaction, req.user.userId, new Date(), session) : null;
      if (!currentTransaction || !currentMembership || currentMembership.permissions?.requestService !== true) throw Object.assign(new Error('Transaction access expired or was revoked before submission completed'), { status: 409 });
      const existing = await Order.findOne({ portalSubmissionKey }).session(session);
      if (existing) { order = existing; wasDuplicate = true; return; }
      const [customer, property, counter, owners, staff] = await Promise.all([
        Customer.findById(transaction.customerId).select('name email phone').session(session).lean(),
        Property.findById(transaction.propertyId).session(session).lean(),
        Counter.findOneAndUpdate({ _id: 'agent_request' }, { $inc: { value: 1 } }, { new: true, upsert: true, setDefaultsOnInsert: true, session }),
        PropertyMembership.find({ propertyId: transaction.propertyId, customerId: transaction.customerId, relationship: 'owner', status: 'active' }).select('userId').session(session).lean(),
        User.find({ role: { $in: ['admin', 'manager', 'account_rep'] }, status: { $ne: 'inactive' } }).select('_id').session(session).lean()
      ]);
      if (!customer || !property) throw Object.assign(new Error('Transaction records are unavailable'), { status: 409 });
      const now = new Date(); const payload = validated.payload;
      const requestReference = `AREQ-${String(counter.value).padStart(6, '0')}`;
      [order] = await Order.create([{
        orderId: requestReference, requestReference, customerId: customer._id, propertyId: property._id,
        customer: { name: customer.name, email: customer.email, phone: customer.phone, address: [property.addressLine1, property.city, property.state, property.postalCode].filter(Boolean).join(', ') },
        service: payload.serviceCategory, description: payload.scopeOfWork, amount: null, vendorCost: 0, processingFee: 0, profit: 0,
        pricingStatus: 'unquoted', source: 'agent_portal', status: 'new', workflowStatus: 'request_received', portalSubmissionKey,
        priority: ['urgent', 'emergency'].includes(payload.urgency) ? 'high' : payload.urgency === 'soon' ? 'medium' : 'low',
        customerIntake: { preferredTiming: payload.preferredTiming, accessInstructions: payload.accessInstructions, completedAt: now },
        residentialRequest: { serviceCategory: payload.serviceCategory, urgency: payload.urgency, preferredTiming: payload.preferredTiming, accessInstructions: payload.accessInstructions, targetCompletionDeadline: payload.targetCompletionDeadline, transactionId: transaction._id, submittedBy: req.user.userId, submittedByRole: 'real_estate_agent', isEmergency: payload.urgency === 'emergency' },
        documents: stored.documents,
        customerRequestHistory: [{ type: 'submitted', requestedBy: req.user.userId, requestedAt: now, preferredTiming: payload.preferredTiming }]
      }], { session });
      await synchronizeWorkflowOrder(order, 'request_received', { session });
      await PortalActivity.insertMany([
        { userId: req.user.userId, customerId: customer._id, propertyId: property._id, orderId: order._id, type: 'agent_service_requested', title: 'Service requested', summary: `${payload.serviceCategory} · ${requestReference}`, occurredAt: now, metadata: { submittedByRole: 'real_estate_agent', transactionId: transaction._id, targetCompletionDeadline: payload.targetCompletionDeadline } },
        ...owners.map(owner => ({ userId: owner.userId, customerId: customer._id, propertyId: property._id, orderId: order._id, type: 'agent_service_requested', title: 'Your agent requested service', summary: `${payload.serviceCategory} · ${requestReference}`, occurredAt: now }))
      ], { session });
      await Notification.insertMany([
        ...owners.map(owner => ({ userId: owner.userId, title: 'Your agent requested service', message: `${payload.serviceCategory} was requested for ${property.label || property.addressLine1}. You retain estimate approval and payment control.`, type: 'order', priority: payload.urgency === 'emergency' ? 'high' : 'medium', actionUrl: '#home', metadata: { orderId: order._id, propertyId: property._id, transactionId: transaction._id } })),
        ...staff.map(user => ({ userId: user._id, title: payload.urgency === 'emergency' ? 'Emergency agent request' : 'New agent service request', message: `${customer.name} has a ${payload.serviceCategory} request submitted by an authorized agent.`, type: 'order', priority: ['urgent', 'emergency'].includes(payload.urgency) ? 'high' : 'medium', actionUrl: '#service-requests/overview', metadata: { orderId: order._id, propertyId: property._id, transactionId: transaction._id } }))
      ], { session });
    });
    if (wasDuplicate && storedIds.length && mongoose.connection.db) { const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' }); await Promise.all(storedIds.map(fileId => bucket.delete(fileId).catch(() => {}))); storedIds = []; }
    const enriched = (await enrichOrders([order.toObject ? order.toObject() : order], [transaction]))[0];
    res.status(wasDuplicate ? 200 : 201).json({ duplicate: wasDuplicate, order: enriched });
  } catch (error) {
    if (storedIds.length && mongoose.connection.db) { const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' }); await Promise.all(storedIds.map(fileId => bucket.delete(fileId).catch(() => {}))); }
    if (error?.code === 11000) return res.status(409).json({ message: 'This request was already submitted' }); next(error);
  } finally { if (session) await session.endSession(); }
});

router.get('/orders/:orderId', async (req, res, next) => { try { const found = await scopedOrder(req, res); if (!found) return; res.json({ order: (await enrichOrders([found.order], [found.transaction]))[0], transaction: serializeTransaction(found.transaction) }); } catch (error) { next(error); } });
router.get('/orders/:orderId/documents/:documentId', async (req, res, next) => { try { const found = await scopedOrder(req, res, 'viewDocuments'); if (!found) return; const document = (found.order.documents || []).find(item => clientDocumentAllowed(item) && item.documentId === req.params.documentId); if (!document?.fileId || !ObjectId.isValid(String(document.fileId))) return res.status(404).json({ message: 'Document not found' }); if (!mongoose.connection.db) return res.status(503).json({ message: 'File storage is not ready' }); const filename = clean(document.name, 180).replace(/[\r\n"\\]/g, '_'); res.set({ 'Content-Type': document.type || 'application/octet-stream', 'Content-Disposition': `inline; filename="${filename}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' }).openDownloadStream(new ObjectId(String(document.fileId))).on('error', next).pipe(res); } catch (error) { next(error); } });
router.get('/orders/:orderId/messages', async (req, res, next) => { try { const found = await scopedOrder(req, res, 'message'); if (!found) return; const messages = await ResidentialMessage.find({ orderId: found.order._id, propertyId: found.order.propertyId, status: 'sent' }).sort({ createdAt: 1 }).limit(200).lean(); res.json({ data: messages.map(serializeMessage) }); } catch (error) { next(error); } });
router.post('/orders/:orderId/messages', writes, async (req, res, next) => { try { const found = await scopedOrder(req, res, 'message'); if (!found) return; const body = clean(req.body?.body, 3000); if (!body) return res.status(400).json({ message: 'Message is required' }); const message = await ResidentialMessage.create({ orderId: found.order._id, propertyId: found.order.propertyId, customerId: found.order.customerId, senderUserId: req.user.userId, senderType: 'agent', body }); const owners = await PropertyMembership.find({ propertyId: found.order.propertyId, customerId: found.order.customerId, relationship: 'owner', status: 'active' }).select('userId').lean(); await Promise.all([PortalActivity.create({ userId: req.user.userId, customerId: found.order.customerId, propertyId: found.order.propertyId, orderId: found.order._id, type: 'agent_message_sent', title: 'Real estate agent sent a message', summary: `Message added to ${found.order.requestReference || found.order.orderId}.` }), ...(owners.map(owner => Notification.create({ userId: owner.userId, title: 'Message from your real estate agent', message: `A new message was added to ${found.order.requestReference || found.order.orderId}.`, type: 'order', priority: 'medium', actionUrl: '#messages', metadata: { orderId: found.order._id, propertyId: found.order.propertyId } })))]); res.status(201).json({ message: serializeMessage(message) }); } catch (error) { next(error); } });

router.get('/referrals', async (req, res, next) => { try {
  await expireAgentTransactions(req.user.userId);
  const [referrals, profile] = await Promise.all([AgentReferralAttribution.find({ agentUserId: req.user.userId }).sort({ attributedAt: -1 }).lean(), RealEstateAgentProfile.findOne({ userId: req.user.userId }).select('referralCode referralProgram').lean()]);
  const transactions = await RealEstateTransaction.find({ _id: { $in: referrals.map(item => item.transactionId) } }).select('_id label closeDate status').lean(); const transactionMap = new Map(transactions.map(item => [String(item._id), item]));
  const properties = await Property.find({ _id: { $in: referrals.map(item => item.propertyId) } }).select('_id label').lean(); const propertyMap = new Map(properties.map(item => [String(item._id), item]));
  const orders = referrals.length ? await Order.find({ $or: referrals.map(item => ({ customerId: item.customerId, propertyId: item.propertyId })) }).select('customerId propertyId workflowStatus status createdAt completedAt').lean() : [];
  let convertedClients = 0; let convertedJobs = 0; let completedJobs = 0; let rewardUnits = 0;
  const data = referrals.map(item => { const related = orders.filter(order => String(order.customerId) === String(item.customerId) && String(order.propertyId) === String(item.propertyId)); const converted = related.length; const completed = related.filter(order => order.completedAt || order.workflowStatus === 'completed').length; if (converted) convertedClients += 1; convertedJobs += converted; completedJobs += completed; const units = profile?.referralProgram?.enabled === false ? 0 : completed * Number(profile?.referralProgram?.unitsPerCompletedJob || 0); rewardUnits += units; return serializeReferral(item, { status: converted ? 'converted' : 'attributed', convertedAt: related[0]?.createdAt, convertedJobCount: converted, completedJobCount: completed, rewardStatus: units > 0 ? 'earned' : 'not_eligible', rewardUnits: units, transaction: transactionMap.get(String(item.transactionId)), property: propertyMap.get(String(item.propertyId)) }); });
  res.json({ data, totals: { leads: referrals.length, convertedClients, convertedJobs, completedJobs, rewardUnits }, program: { referralCode: profile?.referralCode, enabled: profile?.referralProgram?.enabled !== false, rewardLabel: profile?.referralProgram?.rewardLabel || 'SMPLfix referral credit', unitsPerCompletedJob: Number(profile?.referralProgram?.unitsPerCompletedJob || 0) } });
} catch (error) { next(error); } });

router.use((error, _req, res, _next) => { console.error('Agent portal error:', error?.name || 'Error', error?.message || ''); if (error?.code === 11000) return res.status(409).json({ message: 'A pending invitation already exists for this homeowner and property' }); res.status(error.status || (['ValidationError', 'CastError'].includes(error.name) ? 400 : 500)).json({ message: error.message || 'Agent portal request failed' }); });
module.exports = router;
