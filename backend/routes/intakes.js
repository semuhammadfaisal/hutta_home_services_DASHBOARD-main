const express = require('express');
const mongoose = require('mongoose');
const checkRole = require('../middleware/rbac');
const EmailOutbox = require('../models/EmailOutbox');
const IntakeSubmission = require('../models/IntakeSubmission');
const Order = require('../models/Order');
const { INTAKE_COMPLETION_TTL_MS, encryptToken, generateToken, hashToken } = require('../utils/intakeCompletion');
const { synchronizeWorkflowOrder } = require('../utils/workflowSync');

const router = express.Router();
const allowedRoles = checkRole(['admin', 'manager', 'account_rep']);

router.get('/', allowedRoles, async (req, res) => {
  try {
    const query = {};
    if (req.query.status) query.status = req.query.status;
    const intakes = await IntakeSubmission.find(query)
      .populate('orderId', 'orderId workflowStatus pricingStatus missingData source requestReference requiresIntakeReview')
      .populate('customerId', 'name email phone')
      .populate('matchingCustomerIds', 'name email phone')
      .sort({ receivedAt: -1 })
      .limit(Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200)))
      .lean();
    res.json(intakes);
  } catch (error) {
    console.error('Get website intakes failed:', error?.name || 'unknown');
    res.status(500).json({ message: 'Unable to load website requests' });
  }
});

router.put('/:id/resolve-review', allowedRoles, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let result;
    let sync;
    await session.withTransaction(async () => {
      const intake = await IntakeSubmission.findById(req.params.id).session(session);
      if (!intake) throw Object.assign(new Error('Website request not found'), { status: 404 });
      if (!intake.requiresReview) { result = intake; return; }

      let customerId;
      if (intake.customerMatchReason === 'multiple_email_matches') {
        customerId = String(req.body.customerId || '');
        if (!mongoose.Types.ObjectId.isValid(customerId) || !intake.matchingCustomerIds.some(id => id.toString() === customerId)) {
          throw Object.assign(new Error('Select one of the matching customers'), { status: 400 });
        }
        intake.customerId = customerId;
      }

      const order = await Order.findById(intake.orderId).session(session);
      if (order) {
        if (customerId) order.customerId = customerId;
        order.requiresIntakeReview = false;
        if (intake.completionStatus === 'completed' && !order.missingData?.serviceCategory && !order.missingData?.serviceAddress) {
          order.pricingStatus = 'unquoted';
          order.amount = null;
          sync = await synchronizeWorkflowOrder(order, 'quote_collection', { session });
        } else {
          await order.save({ session });
        }
      }

      intake.requiresReview = false;
      intake.status = 'completed';
      intake.reviewResolvedAt = new Date();
      intake.reviewResolvedBy = req.user.userId;
      await intake.save({ session });
      result = intake;
    });
    res.json(sync ? { ...result.toObject(), sync } : result);
  } catch (error) {
    console.error('Resolve intake review failed:', error?.name || 'unknown');
    res.status(error.status || 500).json({ message: error.message || 'Unable to resolve review' });
  } finally {
    await session.endSession();
  }
});

router.post('/:id/retry-email', allowedRoles, async (req, res) => {
  try {
    const type = req.body.type;
    if (!['website_customer_confirmation', 'website_operations_alert'].includes(type)) {
      return res.status(400).json({ message: 'Invalid email type' });
    }
    const intake = await IntakeSubmission.findById(req.params.id);
    if (!intake) return res.status(404).json({ message: 'Website request not found' });
    const outbox = await EmailOutbox.findOne({ intakeSubmissionId: intake._id, type }).sort({ createdAt: -1 });
    if (!outbox) return res.status(404).json({ message: 'Email message not found' });
    if (outbox.status !== 'permanently_failed') {
      return res.status(409).json({ message: 'Only permanently failed email can be retried' });
    }
    outbox.status = 'pending';
    outbox.attempts = 0;
    outbox.nextAttemptAt = new Date();
    outbox.lockedUntil = null;
    outbox.lockedBy = null;
    outbox.lastErrorCategory = null;
    await outbox.save();
    const field = type === 'website_customer_confirmation' ? 'customerConfirmation' : 'operationsAlert';
    intake[field].status = 'pending';
    intake[field].attempts = 0;
    intake[field].lastErrorCategory = null;
    await intake.save();
    res.json({ success: true, status: 'pending' });
  } catch (error) {
    console.error('Retry intake email failed:', error?.name || 'unknown');
    res.status(500).json({ message: 'Unable to retry email' });
  }
});

router.post('/:id/resend-completion', allowedRoles, async (req, res) => {
  try {
    const intake = await IntakeSubmission.findById(req.params.id).select('+completionTokenHash');
    if (!intake) return res.status(404).json({ message: 'Website request not found' });
    if (intake.completionStatus === 'completed') return res.status(409).json({ message: 'Customer details have already been completed' });
    const order = await Order.findById(intake.orderId);
    if (!order) return res.status(404).json({ message: 'Linked Order not found' });
    const token = generateToken();
    const expiresAt = new Date(Date.now() + INTAKE_COMPLETION_TTL_MS);
    intake.completionTokenHash = hashToken(token);
    intake.completionTokenExpiresAt = expiresAt;
    intake.completionStatus = 'pending';
    intake.completionStartedAt = undefined;
    intake.completionEmailCount = Number(intake.completionEmailCount || 0) + 1;
    intake.customerConfirmation.status = 'pending';
    intake.customerConfirmation.attempts = 0;
    intake.customerConfirmation.lastErrorCategory = null;
    await intake.save();
    await EmailOutbox.create({
      type: 'website_customer_confirmation',
      dedupeKey: `${intake.requestReference}:customer-confirmation:${intake.completionEmailCount}`,
      recipients: [intake.normalizedCustomer.email],
      payload: {
        requestReference: intake.requestReference,
        customerName: intake.normalizedCustomer.name,
        email: intake.normalizedCustomer.email,
        phone: intake.normalizedCustomer.phone,
        serviceDetails: order.description || '',
        orderId: order._id.toString(),
        encryptedToken: encryptToken(token),
        completionTokenExpiresAt: expiresAt
      },
      intakeSubmissionId: intake._id,
      orderId: order._id
    });
    res.json({ success: true, status: 'pending', expiresAt });
  } catch (error) {
    console.error('Resend intake completion failed:', error?.name || 'unknown');
    res.status(500).json({ message: 'Unable to resend completion link' });
  }
});

module.exports = router;
