const express = require('express');
const mongoose = require('mongoose');
const { GridFSBucket, ObjectId } = require('mongodb');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const VendorPortalMembership = require('../models/VendorPortalMembership');
const SecurityAuditEvent = require('../models/SecurityAuditEvent');
const Order = require('../models/Order');
const VendorAssignmentMessage = require('../models/VendorAssignmentMessage');
const VendorInvoice = require('../models/VendorInvoice');
const VendorPayout = require('../models/VendorPayout');
const { complianceChecklist } = require('../utils/vendorCompliance');
const { serializeMembership, serializeVendor } = require('../utils/vendorSerializers');
const { serializeVendorInvoice } = require('../utils/vendorBilling');

const router = express.Router();
const STATUS_VALUES = new Set(['pending', 'compliance_incomplete', 'under_review', 'approved_active', 'rejected', 'suspended']);
function clean(value, max = 1000) { return String(value || '').trim().slice(0, max); }
function safeMessage(value) { return clean(value, 3000).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[contact hidden]').replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, '[contact hidden]'); }

router.post('/assignments/:assignmentId/messages', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.assignmentId)) return res.status(404).json({ message: 'Assignment not found' });
    const order = await Order.findOne({ 'vendorAssignments._id': req.params.assignmentId }); const assignment = order?.vendorAssignments?.id(req.params.assignmentId);
    if (!order || !assignment) return res.status(404).json({ message: 'Assignment not found' });
    const body = safeMessage(req.body.body); if (!body) return res.status(400).json({ message: 'Message is required' });
    const message = await VendorAssignmentMessage.create({ assignmentId: assignment._id, orderId: order._id, vendorId: assignment.vendor, senderType: 'staff', senderUserId: req.user.userId, body });
    await SecurityAuditEvent.create({ action: 'staff_vendor_assignment_message_sent', userId: req.user.userId, userEmail: req.user.email, entityType: 'VendorAssignment', entityId: String(assignment._id), metadata: { orderId: order._id, vendorId: assignment.vendor, messageId: message._id }, ipAddress: req.ip, userAgent: clean(req.get('user-agent'), 500) });
    res.status(201).json({ message: { id: String(message._id), sender: 'SMPLfix', body: message.body, sentAt: message.createdAt } });
  } catch (error) { next(error); }
});

router.get('/invoices', async (_req, res, next) => {
  try {
    const invoices = await VendorInvoice.find({}).sort({ submittedAt: -1 }).limit(500); const payouts = await VendorPayout.find({ vendorInvoiceId: { $in: invoices.map(item => item._id) } }).select('+providerReference').lean(); const byInvoice = new Map(payouts.map(item => [String(item.vendorInvoiceId), item]));
    res.json({ invoices: invoices.map(item => serializeVendorInvoice(item, byInvoice.get(String(item._id)))) });
  } catch (error) { next(error); }
});

router.patch('/invoices/:invoiceId/review', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.invoiceId) || !['approved', 'rejected', 'disputed'].includes(req.body.status)) return res.status(400).json({ message: 'Valid invoice and review status are required' });
    const invoice = await VendorInvoice.findById(req.params.invoiceId); if (!invoice) return res.status(404).json({ message: 'Vendor invoice not found' });
    if (!['under_review', 'submitted', 'disputed'].includes(invoice.status)) return res.status(409).json({ message: 'This invoice is no longer awaiting review' });
    invoice.status = req.body.status; invoice.reviewedAt = new Date(); invoice.reviewedBy = req.user.userId; invoice.reviewNotes = clean(req.body.notes, 3000); invoice.requiresInternalReview = req.body.status !== 'approved'; invoice.history.push({ action: `review_${req.body.status}`, actorType: 'staff', actorId: req.user.userId, message: invoice.reviewNotes }); await invoice.save();
    let payout = await VendorPayout.findOne({ vendorInvoiceId: invoice._id }).select('+providerReference');
    if (payout && req.body.status === 'approved' && ['pending', 'disputed'].includes(payout.status)) { payout.status = 'approved'; payout.updatedBy = req.user.userId; payout.history.push({ status: 'approved', actorId: req.user.userId, message: invoice.reviewNotes || 'Invoice approved' }); await payout.save(); }
    if (payout && req.body.status === 'disputed') { payout.status = 'disputed'; payout.disputeMessage = invoice.reviewNotes || 'Invoice requires clarification'; payout.updatedBy = req.user.userId; payout.history.push({ status: 'disputed', actorId: req.user.userId, message: payout.disputeMessage }); await payout.save(); }
    await SecurityAuditEvent.create({ action: `vendor_invoice_${req.body.status}`, userId: req.user.userId, userEmail: req.user.email, entityType: 'VendorInvoice', entityId: String(invoice._id), metadata: { vendorId: invoice.vendorId, assignmentId: invoice.assignmentId, payoutId: payout?._id || null }, ipAddress: req.ip, userAgent: clean(req.get('user-agent'), 500) });
    res.json({ invoice: serializeVendorInvoice(invoice, payout) });
  } catch (error) { next(error); }
});

router.get('/invoices/:invoiceId/document', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.invoiceId)) return res.status(404).json({ message: 'Invoice document not found' });
    const invoice = await VendorInvoice.findById(req.params.invoiceId).select('+sourceDocument.fileId'); const file = invoice?.sourceDocument;
    if (!file?.fileId || !ObjectId.isValid(String(file.fileId))) return res.status(404).json({ message: 'Invoice document not found' });
    const name = clean(file.name, 160).replace(/["\\\r\n]/g, '_'); res.set({ 'Content-Type': file.mimeType, 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' }).openDownloadStream(new ObjectId(String(file.fileId))).on('error', next).pipe(res);
  } catch (error) { next(error); }
});

router.patch('/payouts/:payoutId/status', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.payoutId)) return res.status(404).json({ message: 'Payout not found' });
    const payout = await VendorPayout.findById(req.params.payoutId).select('+providerReference'); if (!payout) return res.status(404).json({ message: 'Payout not found' });
    const transitions = { pending: ['approved', 'disputed'], approved: ['scheduled', 'disputed'], scheduled: ['paid', 'failed', 'disputed'], failed: ['scheduled', 'disputed'], disputed: ['approved'], paid: [] }; const status = clean(req.body.status, 30);
    if (!transitions[payout.status]?.includes(status)) return res.status(409).json({ message: `Payout cannot move from ${payout.status} to ${status}` });
    const providerReference = clean(req.body.providerReference, 180); if (['scheduled', 'paid'].includes(status) && !providerReference && !payout.providerReference) return res.status(400).json({ message: 'Stripe Connect payout reference is required' });
    payout.status = status; if (providerReference) payout.providerReference = providerReference; payout.scheduledFor = status === 'scheduled' ? new Date(req.body.scheduledFor || Date.now()) : payout.scheduledFor; payout.paidAt = status === 'paid' ? new Date() : payout.paidAt; payout.failureMessage = status === 'failed' ? clean(req.body.message, 1000) : ''; payout.disputeMessage = status === 'disputed' ? clean(req.body.message, 1000) : ''; payout.updatedBy = req.user.userId; payout.history.push({ status, actorId: req.user.userId, message: clean(req.body.message, 1000) }); await payout.save();
    const invoice = await VendorInvoice.findById(payout.vendorInvoiceId); if (invoice) { if (status === 'paid') invoice.status = 'paid'; if (status === 'disputed') invoice.status = 'disputed'; if (['approved', 'scheduled'].includes(status)) invoice.status = 'approved'; invoice.history.push({ action: `payout_${status}`, actorType: 'staff', actorId: req.user.userId }); await invoice.save(); }
    await SecurityAuditEvent.create({ action: `vendor_payout_${status}`, userId: req.user.userId, userEmail: req.user.email, entityType: 'VendorPayout', entityId: String(payout._id), metadata: { vendorId: payout.vendorId, assignmentId: payout.assignmentId, vendorInvoiceId: payout.vendorInvoiceId, provider: 'stripe_connect' }, ipAddress: req.ip, userAgent: clean(req.get('user-agent'), 500) });
    res.json({ invoice: serializeVendorInvoice(invoice, payout) });
  } catch (error) { next(error); }
});

router.patch('/vendors/:vendorId/status', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.vendorId) || !STATUS_VALUES.has(req.body.status)) return res.status(400).json({ message: 'Valid vendor and status are required' });
    if (['rejected', 'suspended'].includes(req.body.status) && !clean(req.body.reason)) return res.status(400).json({ message: 'A reason is required' });
    const vendor = await Vendor.findById(req.params.vendorId).select('+stripeConnect.accountId');
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    if (req.body.status === 'approved_active') {
      const incomplete = complianceChecklist(vendor).filter(item => !item.complete).map(item => item.key);
      if (incomplete.length) return res.status(409).json({ message: 'Vendor compliance is incomplete', incomplete });
      if (vendor.rocVerification?.staffReviewRequired) return res.status(409).json({ message: 'ROC verification mismatch requires resolution before approval' });
    }
    const previousStatus = vendor.portalStatus;
    vendor.portalStatus = req.body.status; vendor.portalStatusReason = clean(req.body.reason); vendor.portalStatusUpdatedAt = new Date(); vendor.isActive = req.body.status === 'approved_active';
    if (req.body.status === 'approved_active') vendor.onboardingStatus = 'approved';
    if (req.body.status === 'rejected') vendor.onboardingStatus = 'rejected';
    await vendor.save();
    await SecurityAuditEvent.create({ action: 'vendor_portal_status_changed', userId: req.user.userId, userEmail: req.user.email, entityType: 'vendor', entityId: String(vendor._id), metadata: { previousStatus, nextStatus: vendor.portalStatus, reason: vendor.portalStatusReason }, ipAddress: req.ip, userAgent: clean(req.get('user-agent'), 500) });
    res.json({ vendor: serializeVendor(vendor) });
  } catch (error) { next(error); }
});

// Staff-controlled linking supports vendor teams without letting a vendor choose another Vendor record.
router.post('/vendors/:vendorId/team', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.vendorId)) return res.status(400).json({ message: 'Invalid vendor id' });
    const email = clean(req.body.email, 254).toLowerCase(); const role = ['admin', 'member'].includes(req.body.role) ? req.body.role : 'member';
    const [vendor, user] = await Promise.all([Vendor.findById(req.params.vendorId), User.findOne({ email, role: 'vendor', isActive: true })]);
    if (!vendor || !user) return res.status(404).json({ message: 'Vendor and an active vendor login are required' });
    if (await VendorPortalMembership.exists({ userId: user._id })) return res.status(409).json({ message: 'This login is already assigned to a vendor' });
    const requested = req.body.permissions || {};
    const membership = await VendorPortalMembership.create({ userId: user._id, vendorId: vendor._id, role, invitedBy: req.user.userId, permissions: { profile: role === 'admin' && requested.profile === true, compliance: role === 'admin' && requested.compliance === true, team: false, assignments: requested.assignments !== false, invoices: requested.invoices === true } });
    res.status(201).json({ membership: serializeMembership(membership) });
  } catch (error) { next(error); }
});

module.exports = router;
