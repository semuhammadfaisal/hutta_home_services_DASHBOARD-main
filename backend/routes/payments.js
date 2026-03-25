const express = require('express');
const Payment = require('../models/Payment');
const authenticateToken = require('../middleware/auth');
const checkRole = require('../middleware/rbac');
const router = express.Router();

// Get all payments
router.get('/', authenticateToken, async (req, res) => {
  try {
    const payments = await Payment.find()
      .populate('customer', 'name email')
      .populate('order', 'orderId service')
      .populate('project', 'projectId name')
      .populate('processedBy', 'firstName lastName')
      .sort({ createdAt: -1 });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single payment
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('customer')
      .populate('order')
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
    
    const payment = new Payment({ 
      ...req.body, 
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
router.put('/:id', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const oldPayment = await Payment.findById(req.params.id);
    if (!oldPayment) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    
    const payment = await Payment.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true }
    )
    .populate('customer', 'name email')
    .populate('order', 'orderId service pipelineStage')
    .populate('project', 'projectId name')
    .populate('processedBy', 'firstName lastName');
    
    // If payment status changed to 'received' or 'completed', update pipeline stage
    if ((req.body.status === 'received' || req.body.status === 'completed') && 
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
    
    res.json(payment);
  } catch (error) {
    console.error('Update payment error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
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