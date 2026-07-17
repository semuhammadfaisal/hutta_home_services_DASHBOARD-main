const express = require('express');
const mongoose = require('mongoose');
const checkRole = require('../middleware/rbac');
const EmailOutbox = require('../models/EmailOutbox');
const IntakeSubmission = require('../models/IntakeSubmission');
const Order = require('../models/Order');

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
  try {
    const intake = await IntakeSubmission.findById(req.params.id);
    if (!intake) return res.status(404).json({ message: 'Website request not found' });
    if (!intake.requiresReview) return res.json(intake);

    if (intake.customerMatchReason === 'multiple_email_matches') {
      const customerId = String(req.body.customerId || '');
      if (!mongoose.Types.ObjectId.isValid(customerId) || !intake.matchingCustomerIds.some(id => id.toString() === customerId)) {
        return res.status(400).json({ message: 'Select one of the matching customers' });
      }
      intake.customerId = customerId;
      await Order.updateOne({ _id: intake.orderId }, { $set: { customerId, requiresIntakeReview: false } });
    } else {
      await Order.updateOne({ _id: intake.orderId }, { $set: { requiresIntakeReview: false } });
    }

    intake.requiresReview = false;
    intake.status = 'completed';
    intake.reviewResolvedAt = new Date();
    intake.reviewResolvedBy = req.user.userId;
    await intake.save();
    res.json(intake);
  } catch (error) {
    console.error('Resolve intake review failed:', error?.name || 'unknown');
    res.status(500).json({ message: 'Unable to resolve review' });
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
    const outbox = await EmailOutbox.findOne({ intakeSubmissionId: intake._id, type });
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

module.exports = router;
