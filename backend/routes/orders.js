const express = require('express');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const authenticateToken = require('../middleware/auth');
const checkRole = require('../middleware/rbac');
const router = express.Router();

// Get dashboard stats - MUST be before /:id route
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const activeProjects = await Order.countDocuments({ status: 'in-progress' });
    const completedProjects = await Order.countDocuments({ status: 'completed' });
    const newOrders = await Order.countDocuments({ status: 'new' });
    
    // Calculate monthly revenue (current month)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const monthlyRevenueResult = await Order.aggregate([
      { 
        $match: { 
          createdAt: { $gte: startOfMonth },
          status: { $in: ['completed', 'in-progress'] }
        } 
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    const monthlyRevenue = monthlyRevenueResult[0]?.total || 0;
    
    // Count distinct vendors from orders
    const vendorsCount = await Order.distinct('vendor').then(vendors => 
      vendors.filter(v => v != null).length
    );
    
    // Get actual vendor and employee counts from their collections
    const Vendor = require('../models/Vendor');
    const Employee = require('../models/Employee');
    const totalVendors = await Vendor.countDocuments();
    const totalEmployees = await Employee.countDocuments();

    res.json({
      totalOrders,
      activeProjects,
      completedProjects,
      newOrders,
      monthlyRevenue,
      vendorsCount,
      totalVendors,
      totalEmployees
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all orders
router.get('/', authenticateToken, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('vendor', 'name category')
      .populate('employee', 'name')
      .sort({ createdAt: -1 })
      .lean();
    
    // For orders without pipelineStage, try to populate from pipeline records
    for (let order of orders) {
      if (!order.pipelineStage && order.pipelineRecordId) {
        try {
          const PipelineRecord = require('../models/PipelineRecord');
          const Stage = require('../models/Stage');
          
          const pipelineRecord = await PipelineRecord.findById(order.pipelineRecordId).lean();
          if (pipelineRecord && pipelineRecord.stageId) {
            const stage = await Stage.findById(pipelineRecord.stageId).select('name').lean();
            if (stage) {
              order.pipelineStage = stage.name;
              // Update order with pipelineStage for future efficiency
              await Order.findByIdAndUpdate(order._id, { pipelineStage: stage.name });
            }
          }
        } catch (err) {
          console.log('Pipeline stage lookup failed for order:', order._id);
        }
      }
    }
    
    res.json(orders);
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get single order
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('vendor');
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json(order);
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create new order
router.post('/', authenticateToken, checkRole(['admin', 'manager', 'account_rep']), async (req, res) => {
  try {
    console.log('ORDER REQUEST:', JSON.stringify(req.body, null, 2));
    
    // Check if customer exists, if not create one
    let customerId = null;
    if (req.body.customer && req.body.customer.email) {
      let customer = await Customer.findOne({ 
        email: req.body.customer.email,
        name: req.body.customer.name 
      });
      
      if (!customer) {
        // Create new customer
        customer = new Customer({
          name: req.body.customer.name,
          email: req.body.customer.email,
          phone: req.body.customer.phone || '',
          address: req.body.customer.address || '',
          customerType: 'one-time',
          status: 'active'
        });
        await customer.save();
        console.log('Created new customer:', customer._id);
      }
      customerId = customer._id;
    }
    
    // Generate unique order ID
    let orderId;
    let attempts = 0;
    const maxAttempts = 5;
    
    do {
      const orderCount = await Order.countDocuments();
      const timestamp = Date.now() + attempts;
      orderId = `ORD-${String(orderCount + 1 + attempts).padStart(3, '0')}-${timestamp.toString().slice(-4)}`;
      
      const existingOrder = await Order.findOne({ orderId });
      if (!existingOrder) break;
      
      attempts++;
    } while (attempts < maxAttempts);
    
    if (attempts >= maxAttempts) {
      return res.status(500).json({ message: 'Unable to generate unique order ID' });
    }
    
    // Generate work order number per customer (WO-01, WO-02, etc.)
    const customerEmail = req.body.customer.email;
    const customerOrderCount = await Order.countDocuments({ 
      'customer.email': customerEmail,
      workOrderNumber: { $exists: true } 
    });
    const workOrderNumber = `WO-${String(customerOrderCount + 1).padStart(2, '0')}`;
    
    const order = new Order({
      orderId,
      workOrderNumber,
      customerId,
      customer: {
        name: req.body.customer.name,
        email: req.body.customer.email,
        phone: req.body.customer.phone || '',
        address: req.body.customer.address || ''
      },
      service: req.body.service,
      amount: Number(req.body.amount),
      vendorCost: Number(req.body.vendorCost) || 0,
      startDate: new Date(req.body.startDate),
      endDate: new Date(req.body.endDate),
      status: req.body.status || 'new',
      priority: req.body.priority || 'medium',
      description: req.body.description || '',
      notes: req.body.notes || ''
    });
    
    if (req.body.vendor && mongoose.Types.ObjectId.isValid(req.body.vendor)) {
      order.vendor = req.body.vendor;
    }
    
    if (req.body.employee && mongoose.Types.ObjectId.isValid(req.body.employee)) {
      order.employee = req.body.employee;
    }
    
    await order.save();
    console.log('ORDER SAVED:', order._id, 'with ID:', orderId, 'WO:', workOrderNumber);
    
    res.status(201).json(order);
  } catch (error) {
    console.error('ORDER ERROR:', error.message);
    
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Duplicate order detected. Please try again.' });
    }
    
    res.status(500).json({ message: error.message });
  }
});

// Update order
router.put('/:id', authenticateToken, checkRole(['admin', 'manager', 'account_rep']), async (req, res) => {
  try {
    console.log('Updating order:', req.params.id, 'with data:', JSON.stringify(req.body, null, 2));
    
    // Prepare update data
    const updateData = {
      ...req.body
    };
    
    // Convert dates if provided
    if (req.body.startDate) {
      updateData.startDate = new Date(req.body.startDate);
    }
    if (req.body.endDate) {
      updateData.endDate = new Date(req.body.endDate);
    }
    
    // Convert numbers if provided
    if (req.body.amount) {
      updateData.amount = parseFloat(req.body.amount);
    }
    if (req.body.vendorCost) {
      updateData.vendorCost = parseFloat(req.body.vendorCost);
    }
    
    const order = await Order.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    ).populate('vendor');
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    console.log('Order updated successfully:', order._id);
    res.json(order);
  } catch (error) {
    console.error('Update order error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete order
router.delete('/:id', authenticateToken, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // Clean up associated pipeline record
    if (order.pipelineRecordId) {
      const PipelineRecord = require('../models/PipelineRecord');
      await PipelineRecord.findByIdAndDelete(order.pipelineRecordId);
    }
    
    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;