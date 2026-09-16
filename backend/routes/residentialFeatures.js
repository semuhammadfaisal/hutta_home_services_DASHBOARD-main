const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { GridFSBucket, ObjectId } = require('mongodb');
const Notification = require('../models/Notification');
const Order = require('../models/Order');
const PortalActivity = require('../models/PortalActivity');
const Property = require('../models/Property');
const PropertyMembership = require('../models/PropertyMembership');
const ResidentialAccountProfile = require('../models/ResidentialAccountProfile');
const ResidentialMessage = require('../models/ResidentialMessage');
const ResidentialPropertyProfile = require('../models/ResidentialPropertyProfile');
const ResidentialUtilityReading = require('../models/ResidentialUtilityReading');
const RealEstateTransaction = require('../models/RealEstateTransaction');
const { redactContact } = require('../utils/agentSerializers');

const router = express.Router();
const AUTOPILOT_CONSENT = 'I authorize SMPLfix to automatically approve enabled maintenance services up to the selected per-service threshold. I can disable or change this authorization at any time.';
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const FILE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const writes = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, keyGenerator: req => String(req.user.userId) });
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: MAX_FILE_BYTES }, fileFilter: (_req, file, done) => done(FILE_TYPES.has(file.mimetype) ? null : new Error('Only PDF, JPG, PNG, and WebP files are allowed'), FILE_TYPES.has(file.mimetype)) }).single('document');

const validId = value => mongoose.Types.ObjectId.isValid(String(value || ''));
const text = (value, max) => String(value || '').trim().slice(0, max);
function validFileSignature(file) {
  const buffer = file?.buffer || Buffer.alloc(0);
  if (file?.mimetype === 'application/pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  if (file?.mimetype === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (file?.mimetype === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (file?.mimetype === 'image/webp') return buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
  return false;
}
const activeMembership = userId => ({ userId, status: 'active', 'permissions.view': true, startsAt: { $lte: new Date() }, $or: [{ endsAt: { $exists: false } }, { endsAt: null }, { endsAt: { $gt: new Date() } }] });

async function scopedProperty(req, res, permission = 'view') {
  if (!validId(req.params.propertyId)) { res.status(400).json({ message: 'Invalid property id' }); return null; }
  const membership = await PropertyMembership.findOne({ ...activeMembership(req.user.userId), propertyId: req.params.propertyId }).lean();
  if (!membership || membership.permissions?.[permission] !== true) { res.status(404).json({ message: 'Property not found' }); return null; }
  const property = await Property.findOne({ _id: membership.propertyId, ownerCustomerId: membership.customerId, status: 'active' }).lean();
  if (!property) { res.status(404).json({ message: 'Property not found' }); return null; }
  return { membership, property };
}

async function scopedOrder(req, res, permission = 'view') {
  if (!validId(req.params.orderId)) { res.status(400).json({ message: 'Invalid order id' }); return null; }
  const order = await Order.findById(req.params.orderId).select('_id propertyId customer orderId requestReference service').lean();
  if (!order?.propertyId) { res.status(404).json({ message: 'Order not found' }); return null; }
  req.params.propertyId = String(order.propertyId);
  const found = await scopedProperty(req, res, permission);
  return found ? { ...found, order } : null;
}

async function profileFor(found) {
  return ResidentialPropertyProfile.findOneAndUpdate(
    { propertyId: found.property._id },
    { $setOnInsert: { customerId: found.membership.customerId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

async function accountFor(req) {
  const membership = await PropertyMembership.findOne(activeMembership(req.user.userId)).select('customerId').lean();
  if (!membership) return null;
  const referralCode = `SMPL-${crypto.createHash('sha256').update(String(req.user.userId)).digest('hex').slice(0, 8).toUpperCase()}`;
  return ResidentialAccountProfile.findOneAndUpdate(
    { userId: req.user.userId },
    { $setOnInsert: { customerId: membership.customerId, referralCode } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

function safeAutopilot(profile) {
  const item = profile.toObject ? profile.toObject() : profile;
  return {
    enabled: item.autopilot?.enabled === true,
    autoApprovalEnabled: item.autopilot?.autoApprovalEnabled === true,
    autoApprovalThreshold: Number(item.autopilot?.autoApprovalThreshold || 0),
    consentVersion: item.autopilot?.consentVersion,
    consentedAt: item.autopilot?.consentedAt,
    services: (item.autopilot?.services || []).map(service => ({ key: service.key, label: service.label, enabled: service.enabled === true, frequencyMonths: service.frequencyMonths, nextDueAt: service.nextDueAt })),
    auditHistory: (item.history || []).filter(event => event.action.startsWith('autopilot_')).slice(-20).reverse().map(event => ({ action: event.action, summary: event.summary, occurredAt: event.occurredAt }))
  };
}

function safePassport(profile, propertyId) {
  const item = profile.toObject ? profile.toObject() : profile;
  return {
    entries: (item.passportEntries || []).map(entry => ({ id: entry.entryId, category: entry.category, title: entry.title, value: entry.value, notes: entry.notes, createdAt: entry.createdAt })),
    documents: (item.passportDocuments || []).map(document => ({ id: document.documentId, category: document.category, title: document.title, name: document.name, type: document.type, size: document.size, uploadedAt: document.uploadedAt, downloadUrl: `/api/residential/features/properties/${propertyId}/passport/documents/${encodeURIComponent(document.documentId)}` }))
  };
}

function safeNotification(item) {
  return { id: String(item._id), title: item.title, message: item.message, type: item.type, priority: item.priority, isRead: item.isRead, actionUrl: /^#[a-z-]+$/.test(item.actionUrl || '') ? item.actionUrl : undefined, createdAt: item.createdAt };
}

async function activity(req, found, type, title, summary, orderId) {
  return PortalActivity.create({ userId: req.user.userId, customerId: found.membership.customerId, propertyId: found.property._id, orderId, type, title, summary });
}

function arizonaRecommendations(month = new Date().getUTCMonth() + 1) {
  const cards = [
    { id: 'pre-summer-hvac', months: [3, 4, 5], serviceKey: 'hvac', title: 'Pre-summer AC tune-up', summary: 'Prepare cooling equipment before Arizona peak heat.', urgency: 'seasonal' },
    { id: 'monsoon-roof', months: [6, 7, 8], serviceKey: 'roof', title: 'Monsoon roof & drainage check', summary: 'Inspect roof penetrations, scuppers, and drainage before heavy storms.', urgency: 'seasonal' },
    { id: 'fall-irrigation', months: [9, 10, 11], serviceKey: 'irrigation', title: 'Fall irrigation adjustment', summary: 'Reduce watering and check emitters as temperatures ease.', urgency: 'seasonal' },
    { id: 'winter-water-heater', months: [12, 1, 2], serviceKey: 'water_heater', title: 'Water heater flush', summary: 'Address Arizona mineral buildup and verify safe operation.', urgency: 'seasonal' }
  ];
  return cards.filter(card => card.months.includes(month)).map(({ months, ...card }) => card);
}

router.get('/properties/:propertyId/autopilot', async (req, res, next) => { try { const found = await scopedProperty(req, res); if (!found) return; res.json({ autopilot: safeAutopilot(await profileFor(found)), consentText: AUTOPILOT_CONSENT }); } catch (error) { next(error); } });
router.put('/properties/:propertyId/autopilot', writes, async (req, res, next) => {
  try {
    const found = await scopedProperty(req, res, 'manageProperty'); if (!found) return;
    if (found.membership.permissions?.approveEstimates !== true) return res.status(403).json({ message: 'Estimate approval permission is required' });
    const enabled = req.body?.enabled === true;
    const autoApprovalEnabled = req.body?.autoApprovalEnabled === true;
    const threshold = Number(req.body?.autoApprovalThreshold || 0);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 10000) return res.status(400).json({ message: 'Auto-approval threshold must be between $0 and $10,000' });
    if (autoApprovalEnabled && (req.body?.consentAccepted !== true || text(req.body?.typedName, 160).length < 2)) return res.status(400).json({ message: 'Explicit consent and typed name are required for auto-approval' });
    const profile = await profileFor(found);
    const requested = new Map((req.body?.services || []).map(service => [text(service.key, 60), service]));
    profile.autopilot.enabled = enabled;
    profile.autopilot.autoApprovalEnabled = autoApprovalEnabled;
    profile.autopilot.autoApprovalThreshold = autoApprovalEnabled ? threshold : 0;
    profile.autopilot.services.forEach(service => { const update = requested.get(service.key); if (update) { service.enabled = update.enabled === true; if (Number(update.frequencyMonths) >= 1 && Number(update.frequencyMonths) <= 60) service.frequencyMonths = Number(update.frequencyMonths); } });
    if (autoApprovalEnabled) { profile.autopilot.consentedAt = new Date(); profile.autopilot.consentedBy = req.user.userId; }
    profile.history.push({ action: autoApprovalEnabled ? 'autopilot_consent_recorded' : 'autopilot_settings_updated', actorId: req.user.userId, summary: autoApprovalEnabled ? `Auto-approval enabled up to $${threshold.toFixed(2)} by ${text(req.body.typedName, 160)}` : 'Autopilot settings updated', consentText: autoApprovalEnabled ? AUTOPILOT_CONSENT : undefined });
    await profile.save();
    await activity(req, found, 'autopilot_updated', 'Autopilot settings updated', autoApprovalEnabled ? `Auto-approval threshold set to $${threshold.toFixed(2)}.` : 'Maintenance preferences were updated.');
    res.json({ autopilot: safeAutopilot(profile), consentText: AUTOPILOT_CONSENT });
  } catch (error) { next(error); }
});

router.get('/properties/:propertyId/maintenance', async (req, res, next) => { try { const found = await scopedProperty(req, res); if (!found) return; const profile = await profileFor(found); res.json({ timezone: 'America/Phoenix', items: profile.autopilot.services.filter(service => service.enabled).map(service => ({ id: service.key, title: service.label, dueAt: service.nextDueAt, frequencyMonths: service.frequencyMonths, status: service.nextDueAt && service.nextDueAt < new Date() ? 'due' : 'upcoming' })) }); } catch (error) { next(error); } });
router.get('/properties/:propertyId/seasonal-recommendations', async (req, res, next) => { try { const found = await scopedProperty(req, res); if (!found) return; res.json({ region: 'Arizona', recommendations: arizonaRecommendations() }); } catch (error) { next(error); } });

router.get('/properties/:propertyId/passport', async (req, res, next) => { try { const found = await scopedProperty(req, res); if (!found) return; res.json(safePassport(await profileFor(found), found.property._id)); } catch (error) { next(error); } });
router.post('/properties/:propertyId/passport/entries', writes, async (req, res, next) => { try { const found = await scopedProperty(req, res, 'manageProperty'); if (!found) return; const title = text(req.body?.title, 160); const value = text(req.body?.value, 1000); if (!title || !value) return res.status(400).json({ message: 'Title and value are required' }); const profile = await profileFor(found); profile.passportEntries.push({ category: text(req.body?.category, 30) || 'other', title, value, notes: text(req.body?.notes, 2000), createdBy: req.user.userId }); profile.history.push({ action: 'passport_entry_added', actorId: req.user.userId, summary: title }); await profile.save(); await activity(req, found, 'passport_updated', 'Property Passport updated', title); res.status(201).json(safePassport(profile, found.property._id)); } catch (error) { next(error); } });
router.post('/properties/:propertyId/passport/documents', writes, (req, res, next) => upload(req, res, error => error ? res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ message: error.message }) : next()), async (req, res, next) => {
  let storedId;
  try {
    const found = await scopedProperty(req, res, 'manageProperty'); if (!found) return;
    if (!req.file) return res.status(400).json({ message: 'A document is required' });
    if (!validFileSignature(req.file)) return res.status(400).json({ message: 'Document content does not match its file type' });
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return res.status(503).json({ message: 'File storage is not ready' });
    const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
    const name = text(req.file.originalname, 180).replace(/[^a-zA-Z0-9._-]+/g, '_');
    storedId = await new Promise((resolve, reject) => { const stream = bucket.openUploadStream(`${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${name}`, { metadata: { source: 'residential_passport', propertyId: String(found.property._id), uploadedBy: String(req.user.userId) } }); stream.once('error', reject); stream.once('finish', () => resolve(stream.id)); stream.end(req.file.buffer); });
    const profile = await profileFor(found);
    profile.passportDocuments.push({ category: text(req.body?.category, 30) || 'other', title: text(req.body?.title, 160) || name, name, type: req.file.mimetype, size: req.file.size, fileId: storedId, uploadedBy: req.user.userId });
    profile.history.push({ action: 'passport_document_uploaded', actorId: req.user.userId, summary: name });
    await profile.save(); await activity(req, found, 'passport_document_uploaded', 'Property document added', name);
    res.status(201).json(safePassport(profile, found.property._id));
  } catch (error) { if (storedId && mongoose.connection.db) await new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' }).delete(storedId).catch(() => {}); next(error); }
});
router.get('/properties/:propertyId/passport/documents/:documentId', async (req, res, next) => { try { const found = await scopedProperty(req, res); if (!found) return; const profile = await ResidentialPropertyProfile.findOne({ propertyId: found.property._id }).lean(); const document = profile?.passportDocuments?.find(item => item.documentId === req.params.documentId); if (!document?.fileId || !ObjectId.isValid(String(document.fileId))) return res.status(404).json({ message: 'Document not found' }); if (!mongoose.connection.db) return res.status(503).json({ message: 'File storage is not ready' }); res.set({ 'Content-Type': document.type, 'Content-Disposition': `inline; filename="${text(document.name, 180).replace(/[\r\n"\\]/g, '_')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' }).openDownloadStream(new ObjectId(String(document.fileId))).on('error', next).pipe(res); } catch (error) { next(error); } });

router.get('/properties/:propertyId/utilities', async (req, res, next) => { try { const found = await scopedProperty(req, res); if (!found) return; const readings = await ResidentialUtilityReading.find({ propertyId: found.property._id, customerId: found.membership.customerId }).sort({ periodEnd: -1 }).limit(100).lean(); res.json({ data: readings.map(item => ({ id: String(item._id), utilityType: item.utilityType, periodStart: item.periodStart, periodEnd: item.periodEnd, usage: item.usage, unit: item.unit, cost: item.cost, notes: item.notes })) }); } catch (error) { next(error); } });
router.post('/properties/:propertyId/utilities', writes, async (req, res, next) => { try { const found = await scopedProperty(req, res, 'manageProperty'); if (!found) return; const start = new Date(req.body?.periodStart); const end = new Date(req.body?.periodEnd); const usage = Number(req.body?.usage); const allowedUnits = { electricity: 'kWh', water: 'gallons', gas: 'therms' }; const utilityType = text(req.body?.utilityType, 20); if (!allowedUnits[utilityType] || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end || !Number.isFinite(usage) || usage < 0) return res.status(400).json({ message: 'Enter a valid utility type, period, and usage' }); const reading = await ResidentialUtilityReading.create({ propertyId: found.property._id, customerId: found.membership.customerId, enteredBy: req.user.userId, utilityType, periodStart: start, periodEnd: end, usage, unit: allowedUnits[utilityType], cost: req.body?.cost === '' ? undefined : Number(req.body?.cost), notes: text(req.body?.notes, 500) }); await activity(req, found, 'utility_reading_added', 'Utility reading added', `${utilityType}: ${usage} ${allowedUnits[utilityType]}`); res.status(201).json({ reading: { id: String(reading._id), utilityType, periodStart: start, periodEnd: end, usage, unit: allowedUnits[utilityType], cost: reading.cost, notes: reading.notes } }); } catch (error) { next(error); } });

router.get('/orders/:orderId/messages', async (req, res, next) => { try { const found = await scopedOrder(req, res); if (!found) return; const messages = await ResidentialMessage.find({ orderId: found.order._id, propertyId: found.property._id, status: 'sent' }).sort({ createdAt: 1 }).limit(200).lean(); res.json({ data: messages.map(item => ({ id: String(item._id), sender: item.senderType === 'client' ? 'You' : item.senderType === 'agent' ? 'Real estate agent' : item.senderType === 'vendor' ? 'Service professional' : 'SMPLfix team', body: redactContact(item.body), createdAt: item.createdAt })) }); } catch (error) { next(error); } });
router.post('/orders/:orderId/messages', writes, async (req, res, next) => { try { const found = await scopedOrder(req, res, 'requestService'); if (!found) return; const body = text(req.body?.body, 3000); if (!body) return res.status(400).json({ message: 'Message is required' }); const message = await ResidentialMessage.create({ orderId: found.order._id, propertyId: found.property._id, customerId: found.membership.customerId, senderUserId: req.user.userId, senderType: 'client', body }); const agents = await RealEstateTransaction.find({ customerId: found.membership.customerId, propertyId: found.property._id, status: 'active', accessEndsAt: { $gt: new Date() }, 'permissions.message': true }).select('agentUserId').lean(); await Promise.all([activity(req, found, 'message_sent', 'Message sent through SMPLfix', `Message added to ${found.order.requestReference || found.order.orderId}.`, found.order._id), ...agents.map(item => Notification.create({ userId: item.agentUserId, title: 'New homeowner message', message: `A homeowner replied on ${found.order.requestReference || found.order.orderId}.`, type: 'order', priority: 'medium', actionUrl: '#requests', metadata: { orderId: found.order._id, propertyId: found.property._id } }))]); res.status(201).json({ message: { id: String(message._id), sender: 'You', body: redactContact(message.body), createdAt: message.createdAt } }); } catch (error) { next(error); } });

router.get('/notifications', async (req, res, next) => { try { const items = await Notification.find({ userId: req.user.userId }).sort({ createdAt: -1 }).limit(100).lean(); res.json({ data: items.map(safeNotification), unreadCount: items.filter(item => !item.isRead).length }); } catch (error) { next(error); } });
router.patch('/notifications/:notificationId/read', writes, async (req, res, next) => { try { if (!validId(req.params.notificationId)) return res.status(400).json({ message: 'Invalid notification id' }); const item = await Notification.findOneAndUpdate({ _id: req.params.notificationId, userId: req.user.userId }, { $set: { isRead: true } }, { new: true }).lean(); if (!item) return res.status(404).json({ message: 'Notification not found' }); res.json({ notification: safeNotification(item) }); } catch (error) { next(error); } });

router.get('/account', async (req, res, next) => { try { const profile = await accountFor(req); if (!profile) return res.status(404).json({ message: 'Residential account not found' }); res.json({ account: { email: req.user.email, firstName: req.user.firstName, lastName: req.user.lastName, phone: profile.account?.phone || req.user.phone, preferredName: profile.account?.preferredName, timezone: profile.account?.timezone }, notificationPreferences: profile.notificationPreferences }); } catch (error) { next(error); } });
router.put('/account', writes, async (req, res, next) => { try { const profile = await accountFor(req); if (!profile) return res.status(404).json({ message: 'Residential account not found' }); profile.account.phone = text(req.body?.phone, 40); profile.account.preferredName = text(req.body?.preferredName, 80); const prefs = req.body?.notificationPreferences || {}; for (const key of ['portal', 'email', 'upcomingVisits', 'jobUpdates', 'invoices', 'seasonalRecommendations']) if (typeof prefs[key] === 'boolean') profile.notificationPreferences[key] = prefs[key]; await profile.save(); await PortalActivity.create({ userId: req.user.userId, customerId: profile.customerId, type: 'account_settings_updated', title: 'Account settings updated', summary: 'Contact and notification preferences were updated.' }); res.json({ account: { email: req.user.email, firstName: req.user.firstName, lastName: req.user.lastName, phone: profile.account.phone, preferredName: profile.account.preferredName, timezone: profile.account.timezone }, notificationPreferences: profile.notificationPreferences }); } catch (error) { next(error); } });
router.get('/referrals', async (req, res, next) => { try { const profile = await accountFor(req); if (!profile) return res.status(404).json({ message: 'Residential account not found' }); const referrals = profile.referrals.map(item => ({ id: item.referralId, displayName: item.displayName, status: item.status, rewardAmount: item.rewardAmount, createdAt: item.createdAt })); res.json({ referralCode: profile.referralCode, referralUrl: `/pages/signup.html?ref=${encodeURIComponent(profile.referralCode)}`, totals: { invited: referrals.length, joined: referrals.filter(item => ['joined', 'rewarded'].includes(item.status)).length, rewards: referrals.reduce((sum, item) => sum + Number(item.rewardAmount || 0), 0) }, history: referrals }); } catch (error) { next(error); } });

router.use((error, _req, res, _next) => { console.error('Residential feature error:', error?.name || 'Error', error?.message || ''); res.status(error.status || (['ValidationError', 'CastError'].includes(error.name) ? 400 : 500)).json({ message: error.message || 'Residential feature request failed' }); });

module.exports = router;
module.exports.AUTOPILOT_CONSENT = AUTOPILOT_CONSENT;
module.exports.arizonaRecommendations = arizonaRecommendations;
