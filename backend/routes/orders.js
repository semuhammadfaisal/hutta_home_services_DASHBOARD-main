const express = require('express');
const Order = require('../models/Order');
const Vendor = require('../models/Vendor');
const authenticateToken = require('../middleware/auth');
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
      .sort({ createdAt: -1 });
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
router.post('/', authenticateToken, async (req, res) => {
  try {
    const orderCount = await Order.countDocuments();
    const orderId = `ORD-${String(orderCount + 1).padStart(3, '0')}`;
    
    const order = new Order({ ...req.body, orderId });
    await order.save();
    
    const populatedOrder = await Order.findById(order._id).populate('vendor');
    res.status(201).json(populatedOrder);
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update order
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true }
    ).populate('vendor');
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    res.json(order);
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete order
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;