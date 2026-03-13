const express = require('express');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const authenticateToken = require('../middleware/auth');
const checkRole = require('../middleware/rbac');
const router = express.Router();

// Get all customers
router.get('/', authenticateToken, async (req, res) => {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 });
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get customer profile with orders - MUST be before /:id route
router.get('/:id/profile', authenticateToken, async (req, res) => {
  try {
    console.log('Fetching profile for customer:', req.params.id);
    
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    
    console.log('Customer found:', customer.email);
    
    // Find orders
    const orders = await Order.find({
      $or: [
        { customerId: req.params.id },
        { 'customer.email': customer.email }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
    
    console.log('Orders found:', orders.length);
    
    // Populate pipeline stage info
    const PipelineRecord = require('../models/PipelineRecord');
    const Stage = require('../models/Stage');
    
    for (let order of orders) {
      try {
        // Find pipeline record by orderId
        const pipelineRecord = await PipelineRecord.findOne({ orderId: order._id }).lean();
        if (pipelineRecord && pipelineRecord.stageId) {
          const stage = await Stage.findById(pipelineRecord.stageId).select('name').lean();
          order.pipelineStage = stage ? stage.name : null;
        }
      } catch (err) {
        console.log('Pipeline record not found for order:', order._id);
      }
      
      // Populate vendor info
      if (order.vendor) {
        try {
          const Vendor = require('../models/Vendor');
          const vendor = await Vendor.findById(order.vendor).select('name category').lean();
          order.vendor = vendor;
        } catch (err) {
          console.log('Vendor not found for order:', order._id);
        }
      }
    }
    
    // Find payments
    let payments = [];
    try {
      payments = await Payment.find({ customer: req.params.id })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
    } catch (err) {
      console.log('Payments query failed:', err.message);
    }
    
    const stats = {
      totalOrders: orders.length,
      completedOrders: orders.filter(o => o.status === 'completed').length,
      activeOrders: orders.filter(o => ['new', 'in-progress'].includes(o.status)).length,
      totalSpent: orders.reduce((sum, o) => sum + (o.amount || 0), 0),
      totalPaid: payments.filter(p => p.status === 'completed').reduce((sum, p) => sum + (p.amount || 0), 0)
    };
    
    console.log('Sending profile response');
    res.json({
      customer,
      orders,
      payments,
      stats
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get single customer
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new customer
router.post('/', authenticateToken, checkRole(['admin', 'manager', 'account_rep']), async (req, res) => {
  try {
    const customer = new Customer(req.body);
    await customer.save();
    res.status(201).json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update customer
router.put('/:id', authenticateToken, checkRole(['admin', 'manager', 'account_rep']), async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true }
    );
    
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    
    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete customer
router.delete('/:id', authenticateToken, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;