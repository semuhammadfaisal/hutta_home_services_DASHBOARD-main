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
    // Get NO BID stages to exclude from calculations
    const Stage = require('../models/Stage');
    const PipelineRecord = require('../models/PipelineRecord');
    
    const noBidStages = await Stage.find({ isNoBid: true }).select('_id').lean();
    const noBidStageIds = noBidStages.map(s => s._id.toString());
    
    // Get orders in NO BID stages
    const noBidRecords = await PipelineRecord.find({ 
      stageId: { $in: noBidStageIds } 
    }).select('orderId').lean();
    const noBidOrderIds = noBidRecords.map(r => r.orderId).filter(Boolean);
    
    // Exclude NO BID orders from all counts
    const totalOrders = await Order.countDocuments({
      _id: { $nin: noBidOrderIds }
    });
    const activeProjects = await Order.countDocuments({ 
      status: 'in-progress',
      _id: { $nin: noBidOrderIds }
    });
    const completedProjects = await Order.countDocuments({ 
      status: 'completed',
      _id: { $nin: noBidOrderIds }
    });
    const newOrders = await Order.countDocuments({ 
      status: 'new',
      _id: { $nin: noBidOrderIds }
    });
    
    // Calculate monthly revenue (current month) - exclude NO BID orders
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const monthlyRevenueResult = await Order.aggregate([
      { 
        $match: { 
          createdAt: { $gte: startOfMonth },
          status: { $in: ['completed', 'in-progress'] },
          _id: { $nin: noBidOrderIds }
        } 
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    const monthlyRevenue = monthlyRevenueResult[0]?.total || 0;
    
    // Count distinct vendors from orders (exclude NO BID)
    const vendorsCount = await Order.distinct('vendor', {
      _id: { $nin: noBidOrderIds }
    }).then(vendors => 
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
    
    // Filter out orders in NO BID stage
    const Stage = require('../models/Stage');
    const PipelineRecord = require('../models/PipelineRecord');
    
    const noBidStages = await Stage.find({ isNoBid: true }).select('_id').lean();
    const noBidStageIds = noBidStages.map(s => s._id.toString());
    
    const visibleOrders = [];
    
    // For orders without pipelineStage, try to populate from pipeline records
    for (let order of orders) {
      if (!order.pipelineStage && order.pipelineRecordId) {
        try {
          const pipelineRecord = await PipelineRecord.findById(order.pipelineRecordId).lean();
          if (pipelineRecord && pipelineRecord.stageId) {
            const stage = await Stage.findById(pipelineRecord.stageId).select('name isNoBid').lean();
            if (stage) {
              order.pipelineStage = stage.name;
              // Update order with pipelineStage for future efficiency
              await Order.findByIdAndUpdate(order._id, { pipelineStage: stage.name });
              
              // Skip if in NO BID stage
              if (stage.isNoBid) continue;
            }
          }
        } catch (err) {
          console.log('Pipeline stage lookup failed for order:', order._id);
        }
      }
      
      // Check if order is in NO BID stage by checking pipeline record
      if (order.pipelineRecordId) {
        try {
          const pipelineRecord = await PipelineRecord.findById(order.pipelineRecordId).lean();
          if (pipelineRecord && pipelineRecord.stageId) {
            const isNoBid = noBidStageIds.includes(pipelineRecord.stageId.toString());
            if (isNoBid) continue; // Skip NO BID orders
          }
        } catch (err) {
          console.log('NO BID check failed for order:', order._id);
        }
      }
      
      visibleOrders.push(order);
    }
    
    res.json(visibleOrders);
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
    
    const amount = Number(req.body.amount);
    const vendorCost = Number(req.body.vendorCost) || 0;
    const processingFee = Number(req.body.processingFee) || 0;
    const profit = amount - vendorCost - processingFee;
    
    // Prepare order data
    const orderData = {
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
      amount,
      vendorCost,
      processingFee,
      profit,
      startDate: new Date(req.body.startDate),
      endDate: new Date(req.body.endDate),
      status: req.body.status || 'new',
      priority: req.body.priority || 'medium',
      description: req.body.description || '',
      notes: req.body.notes || '',
      // Recurring order fields
      orderType: req.body.orderType || 'one-time'
    };
    
    // Add recurring fields only if orderType is 'recurring'
    if (orderData.orderType === 'recurring') {
      if (!req.body.recurringFrequency) {
        return res.status(400).json({ message: 'Recurring frequency is required for recurring orders' });
      }
      orderData.recurringFrequency = req.body.recurringFrequency;
      orderData.recurringEndDate = req.body.recurringEndDate ? new Date(req.body.recurringEndDate) : null;
      orderData.recurringNotes = req.body.recurringNotes || '';
      
      // Add custom days if frequency is custom
      if (req.body.recurringFrequency === 'custom' && req.body.recurringCustomDays) {
        orderData.recurringCustomDays = Number(req.body.recurringCustomDays);
      }
    }
    
    const order = new Order(orderData);
    
    if (req.body.vendor && mongoose.Types.ObjectId.isValid(req.body.vendor)) {
      order.vendor = req.body.vendor;
    }
    
    if (req.body.employee && mongoose.Types.ObjectId.isValid(req.body.employee)) {
      order.employee = req.body.employee;
    }
    
    await order.save();
    console.log('ORDER SAVED:', order._id, 'with ID:', orderId, 'WO:', workOrderNumber);
    console.log('Customer ID for payment:', customerId);
    
    // Auto-create pending payment for this order
    try {
      const Payment = require('../models/Payment');
      
      // Only create payment if we have a valid customer ID
      if (!customerId) {
        console.error('Cannot create payment: No customer ID available');
        console.error('Customer data:', req.body.customer);
        return res.status(201).json(order);
      }
      
      // Generate unique payment ID (handle gaps from deleted payments)
      let paymentId;
      let paymentAttempts = 0;
      const maxPaymentAttempts = 10;
      
      do {
        const paymentCount = await Payment.countDocuments();
        const timestamp = Date.now();
        paymentId = `PAY-${String(paymentCount + 1 + paymentAttempts).padStart(4, '0')}`;
        
        const existingPayment = await Payment.findOne({ paymentId });
        if (!existingPayment) break;
        
        paymentAttempts++;
      } while (paymentAttempts < maxPaymentAttempts);
      
      if (paymentAttempts >= maxPaymentAttempts) {
        console.error('Unable to generate unique payment ID');
        return res.status(201).json(order);
      }
      
      const payment = new Payment({
        paymentId,
        order: order._id,
        customer: customerId,
        amount: amount,
        paymentMethod: null, // Will be set later when payment is received
        status: 'pending',
        description: `Payment for ${orderId} - ${req.body.service}`,
        dueDate: new Date(req.body.endDate),
        processedBy: req.user.userId
      });
      
      await payment.save();
      console.log('✅ AUTO-CREATED PAYMENT:', payment._id, 'with ID:', paymentId, 'for order:', orderId);
      console.log('Payment details:', { paymentId, orderId, customerId, amount, status: 'pending' });
    } catch (paymentError) {
      console.error('❌ PAYMENT CREATION ERROR:', paymentError.message);
      console.error('Payment error details:', paymentError);
      console.error('Stack:', paymentError.stack);
      // Don't fail the order creation if payment creation fails
    }
    
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
    console.log('=== ORDER UPDATE ===');
    console.log('Order ID:', req.params.id);
    console.log('Update data:', JSON.stringify(req.body, null, 2));
    
    // Get existing order first
    const existingOrder = await Order.findById(req.params.id);
    if (!existingOrder) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // Track what changed for syncing
    const changes = {};
    
    // Prepare update data
    const updateData = {
      ...req.body
    };
    
    // Convert dates if provided
    if (req.body.startDate) {
      updateData.startDate = new Date(req.body.startDate);
      if (existingOrder.startDate?.getTime() !== updateData.startDate.getTime()) {
        changes.startDate = updateData.startDate;
      }
    }
    if (req.body.endDate) {
      updateData.endDate = new Date(req.body.endDate);
    }
    
    // Convert numbers if provided
    if (req.body.amount) {
      updateData.amount = parseFloat(req.body.amount);
      if (existingOrder.amount !== updateData.amount) {
        changes.amount = updateData.amount;
      }
    }
    if (req.body.vendorCost) {
      updateData.vendorCost = parseFloat(req.body.vendorCost);
    }
    if (req.body.processingFee !== undefined) {
      updateData.processingFee = parseFloat(req.body.processingFee) || 0;
    }
    
    // Calculate profit: amount - vendorCost - processingFee
    const amount = updateData.amount || existingOrder.amount;
    const vendorCost = updateData.vendorCost !== undefined ? updateData.vendorCost : existingOrder.vendorCost;
    const processingFee = updateData.processingFee !== undefined ? updateData.processingFee : existingOrder.processingFee;
    updateData.profit = amount - vendorCost - processingFee;
    
    // Track customer changes
    if (req.body.customer) {
      if (req.body.customer.name && req.body.customer.name !== existingOrder.customer?.name) {
        changes.customerName = req.body.customer.name;
      }
      if (req.body.customer.email !== undefined && req.body.customer.email !== existingOrder.customer?.email) {
        changes.email = req.body.customer.email;
      }
      if (req.body.customer.phone !== undefined && req.body.customer.phone !== existingOrder.customer?.phone) {
        changes.phone = req.body.customer.phone;
      }
      if (req.body.customer.address !== undefined && req.body.customer.address !== existingOrder.customer?.address) {
        changes.address = req.body.customer.address;
      }
    }
    
    // Track other changes
    if (req.body.priority && req.body.priority !== existingOrder.priority) {
      changes.priority = req.body.priority;
    }
    if (req.body.description !== undefined && req.body.description !== existingOrder.description) {
      changes.description = req.body.description;
    }
    if (req.body.notes !== undefined && req.body.notes !== existingOrder.notes) {
      changes.notes = req.body.notes;
    }
    
    // Handle recurring order fields
    if (updateData.orderType) {
      if (updateData.orderType === 'recurring') {
        // Validate recurring frequency is provided
        if (!updateData.recurringFrequency && !req.body.recurringFrequency) {
          const existingOrder = await Order.findById(req.params.id);
          if (!existingOrder.recurringFrequency) {
            return res.status(400).json({ message: 'Recurring frequency is required for recurring orders' });
          }
        }
        // Set recurring fields
        if (req.body.recurringFrequency) updateData.recurringFrequency = req.body.recurringFrequency;
        if (req.body.recurringEndDate) updateData.recurringEndDate = new Date(req.body.recurringEndDate);
        if (req.body.recurringNotes !== undefined) updateData.recurringNotes = req.body.recurringNotes;
        
        // Handle custom days
        if (req.body.recurringFrequency === 'custom' && req.body.recurringCustomDays) {
          updateData.recurringCustomDays = Number(req.body.recurringCustomDays);
        } else if (req.body.recurringFrequency && req.body.recurringFrequency !== 'custom') {
          // Clear custom days if switching from custom to another frequency
          updateData.recurringCustomDays = null;
        }
      } else if (updateData.orderType === 'one-time') {
        // Clear recurring fields when switching to one-time
        updateData.recurringFrequency = null;
        updateData.recurringEndDate = null;
        updateData.recurringNotes = null;
        updateData.recurringCustomDays = null;
      }
    }
    
    const order = await Order.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    ).populate('vendor').populate('employee');
    
    console.log('Order updated successfully:', order.orderId);
    
    // Sync changes to Payment
    if (changes.amount !== undefined) {
      try {
        const Payment = require('../models/Payment');
        const payment = await Payment.findOne({ order: order._id });
        
        if (payment) {
          payment.amount = changes.amount;
          await payment.save();
          console.log('✅ Synced payment amount:', payment.paymentId, 'to', changes.amount);
        }
      } catch (paymentError) {
        console.error('❌ Error syncing payment amount:', paymentError.message);
      }
    }
    
    // Sync ALL changes to Pipeline Record
    if (Object.keys(changes).length > 0 && order.pipelineRecordId) {
      try {
        const PipelineRecord = require('../models/PipelineRecord');
        const pipelineRecord = await PipelineRecord.findById(order.pipelineRecordId);
        
        if (pipelineRecord) {
          console.log('Found linked pipeline record:', pipelineRecord._id);
          
          // Sync all changed fields
          if (changes.customerName) pipelineRecord.customerName = changes.customerName;
          if (changes.email !== undefined) pipelineRecord.email = changes.email;
          if (changes.phone !== undefined) pipelineRecord.phone = changes.phone;
          if (changes.address !== undefined) pipelineRecord.address = changes.address;
          if (changes.priority) pipelineRecord.priority = changes.priority;
          if (changes.amount !== undefined) pipelineRecord.budget = changes.amount;
          if (changes.startDate) pipelineRecord.startDate = changes.startDate;
          if (changes.description !== undefined) pipelineRecord.description = changes.description;
          if (changes.notes !== undefined) pipelineRecord.notes = changes.notes;
          
          await pipelineRecord.save();
          console.log('✅ Synced changes to pipeline record:', pipelineRecord._id, changes);
        }
      } catch (pipelineError) {
        console.error('❌ Error syncing to pipeline record:', pipelineError.message);
      }
    }
    
    console.log('=== ORDER UPDATE COMPLETE ===');
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
    
    console.log('Order deleted:', order._id, 'orderId:', order.orderId);
    
    // Clean up associated pipeline record
    if (order.pipelineRecordId) {
      try {
        const PipelineRecord = require('../models/PipelineRecord');
        await PipelineRecord.findByIdAndDelete(order.pipelineRecordId);
        console.log('✅ Associated pipeline record deleted:', order.pipelineRecordId);
      } catch (pipelineError) {
        console.error('❌ Error deleting pipeline record:', pipelineError.message);
      }
    }
    
    // Delete associated payments
    try {
      const Payment = require('../models/Payment');
      const deletedPayments = await Payment.deleteMany({ order: order._id });
      console.log('Deleted', deletedPayments.deletedCount, 'payment(s) associated with order:', order.orderId);
    } catch (paymentError) {
      console.error('Error deleting associated payments:', paymentError);
      // Don't fail the order deletion if payment deletion fails
    }
    
    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;