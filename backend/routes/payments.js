const express = require('express');
const Payment = require('../models/Payment');
const authenticateToken = require('../middleware/auth');
const checkRole = require('../middleware/rbac');
const router = express.Router();

function normalizeMilestones(milestones = [], paymentAmount = 0) {
  if (!Array.isArray(milestones)) return [];

  const normalized = milestones.map((milestone, index) => {
    const amount = Number(milestone.amount || 0);
    const rawStatus = milestone.status || 'pending';
    const status = ['pending', 'received', 'completed', 'failed', 'cancelled'].includes(rawStatus)
      ? rawStatus
      : 'pending';

    return {
      _id: milestone._id,
      title: String(milestone.title || `Milestone ${index + 1}`).trim(),
      amount,
      dueDate: milestone.dueDate || null,
      receivedDate: milestone.receivedDate || ((status === 'received' || status === 'completed') ? new Date() : null),
      status,
      notes: String(milestone.notes || '').trim()
    };
  }).filter(milestone => milestone.title && milestone.amount >= 0);

  const totalMilestoneAmount = normalized.reduce((sum, milestone) => sum + milestone.amount, 0);
  if (normalized.length && totalMilestoneAmount - Number(paymentAmount || 0) > 0.009) {
    const error = new Error('Milestone total cannot exceed payment amount');
    error.status = 400;
    throw error;
  }

  return normalized;
}

function buildPaymentPayload(body, existingPayment = null) {
  const payload = { ...body };
  const paymentAmount = Number(body.amount ?? existingPayment?.amount ?? 0);

  if (body.amount !== undefined) {
    payload.amount = paymentAmount;
  }

  if (body.milestones !== undefined || existingPayment?.milestones?.length) {
    const sourceMilestones = body.milestones !== undefined ? body.milestones : existingPayment?.milestones || [];
    const milestones = normalizeMilestones(sourceMilestones, paymentAmount);
    const receivedMilestones = milestones.filter(m => m.status === 'received' || m.status === 'completed');
    const completedMilestones = milestones.filter(m => m.status === 'completed');
    const receivedAmount = receivedMilestones.reduce((sum, milestone) => sum + milestone.amount, 0);

    payload.milestones = milestones;

    if (milestones.length) {
      if (completedMilestones.length === milestones.length) {
        payload.status = 'completed';
      } else if (receivedMilestones.length > 0) {
        payload.status = 'received';
      } else if (milestones.some(m => m.status === 'failed')) {
        payload.status = 'failed';
      } else if (milestones.some(m => m.status === 'cancelled') && milestones.every(m => m.status === 'cancelled' || m.status === 'pending')) {
        payload.status = 'cancelled';
      } else {
        payload.status = 'pending';
      }

      if (receivedAmount > 0) {
        payload.paymentDate = receivedMilestones
          .map(m => m.receivedDate)
          .filter(Boolean)
          .sort((a, b) => new Date(a) - new Date(b))[0] || payload.paymentDate || existingPayment?.paymentDate || null;
      } else if (!body.paymentDate) {
        payload.paymentDate = null;
      }
    }
  }

  return payload;
}

// Get all payments
router.get('/', authenticateToken, async (req, res) => {
  try {
    const payments = await Payment.find()
      .populate('customer', 'name email')
      .populate('order', 'orderId service employee vendor')
      .populate({ path: 'order', populate: { path: 'employee', select: 'name email phone' } })
      .populate({ path: 'order', populate: { path: 'vendor', select: 'name email phone' } })
      .populate('project', 'projectId name')
      .populate('processedBy', 'firstName lastName')
      .sort({ createdAt: -1 });
    res.json(payments);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Server error' });
  }
});

// Get single payment
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('customer')
      .populate({ path: 'order', populate: { path: 'employee', select: 'name email phone' } })
      .populate({ path: 'order', populate: { path: 'vendor', select: 'name email phone' } })
      .populate('project')
      .populate('processedBy');
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    res.json(payment);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new payment
router.post('/', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const paymentCount = await Payment.countDocuments();
    const paymentId = `PAY-${String(paymentCount + 1).padStart(4, '0')}`;

    const paymentPayload = buildPaymentPayload(req.body);
    const payment = new Payment({
      ...paymentPayload,
      paymentId,
      processedBy: req.user.userId 
    });
    await payment.save();
    
    const populatedPayment = await Payment.findById(payment._id)
      .populate('customer', 'name email')
      .populate('order', 'orderId service')
      .populate('project', 'projectId name')
      .populate('processedBy', 'firstName lastName');
    
    res.status(201).json(populatedPayment);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update payment
router.put('/:id', authenticateToken, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    console.log('Update payment request from user:', req.user);
    console.log('Request body:', req.body);
    
    const oldPayment = await Payment.findById(req.params.id);
    if (!oldPayment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const updatePayload = buildPaymentPayload(req.body, oldPayment);
    const payment = await Payment.findByIdAndUpdate(
      req.params.id, 
      updatePayload,
      { new: true }
    )
    .populate('customer', 'name email')
    .populate('order', 'orderId service pipelineStage')
    .populate('project', 'projectId name')
    .populate('processedBy', 'firstName lastName');
    
    // If payment status changed to 'received' or 'completed', update pipeline stage
    if ((updatePayload.status === 'received' || updatePayload.status === 'completed') && 
        oldPayment.status !== 'received' && oldPayment.status !== 'completed') {
      
      if (payment.order) {
        const Order = require('../models/Order');
        const PipelineRecord = require('../models/PipelineRecord');
        const Stage = require('../models/Stage');
        
        // Find 'Paid' stage
        const paidStage = await Stage.findOne({ name: 'Paid' });
        
        if (paidStage && payment.order.pipelineRecordId) {
          // Update pipeline record to 'Paid' stage
          await PipelineRecord.findByIdAndUpdate(payment.order.pipelineRecordId, {
            stageId: paidStage._id
          });
          
          // Update order's pipelineStage field
          await Order.findByIdAndUpdate(payment.order._id, {
            pipelineStage: 'Paid'
          });
          
          console.log(`Payment ${payment.paymentId} received - moved order to Paid stage`);
        }
      }
    }
    
    console.log('Payment updated successfully');
    res.json(payment);
  } catch (error) {
    console.error('Update payment error:', error);
    res.status(error.status || 500).json({ message: error.message || 'Server error', error: error.message });
  }
});

// Delete payment
router.delete('/:id', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const payment = await Payment.findByIdAndDelete(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    res.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;