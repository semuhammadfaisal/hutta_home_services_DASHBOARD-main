const express = require('express');
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const authenticateToken = require('../middleware/auth');
const checkRole = require('../middleware/rbac');
const { invalidateDashboardStatsCache } = require('../utils/dashboardStatsCache');
const { seedInitialNote, stripNotesFromUpdate } = require('../utils/notes');
const { prepareDocumentUpdate } = require('../utils/documents');
const { retainEntityAttachments } = require('../utils/attachmentRetention');
const { saveWithPersistentAttachmentMetadata } = require('../utils/attachmentMetadata');
const { prefixRegex, cursorFilter, parseLimit, pagePayload } = require('../utils/cursorPagination');
const router = express.Router();

router.get('/list', authenticateToken, async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit);
    const query = {};
    if (req.query.status) query.status = String(req.query.status);
    if (req.query.customerType) query.customerType = String(req.query.customerType);
    const search = prefixRegex(req.query.search);
    if (search) query.$or = [{ normalizedName: search }, { normalizedEmail: search }, { normalizedPhone: search }];
    const after = cursorFilter(req.query.cursor);
    const finalQuery = after ? { $and: [query, after] } : query;
    const [total, rows] = await Promise.all([
      Customer.countDocuments(query),
      Customer.find(finalQuery).select('name email phone address city state zipCode customerType status totalOrders totalSpent createdAt')
        .sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean()
    ]);
    res.json(pagePayload(rows, total, limit));
  } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
});

// Get all customers (paginated)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const [total, customers] = await Promise.all([
      Customer.countDocuments(),
      Customer.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    res.json({
      data: customers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit))
      }
    });
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

    const PipelineRecord = require('../models/PipelineRecord');
    const Stage = require('../models/Stage');
    const Vendor = require('../models/Vendor');

    const orderObjectIds = orders.map(o => o._id);
    const pipelineRows = orderObjectIds.length
      ? await PipelineRecord.find({ orderId: { $in: orderObjectIds } }).select('orderId stageId').lean()
      : [];
    const pipelineByOrderId = new Map(
      pipelineRows.filter(p => p.orderId).map(p => [p.orderId.toString(), p])
    );

    const stageIdStrings = [...new Set(pipelineRows.map(p => p.stageId && p.stageId.toString()).filter(Boolean))];
    const stageObjectIds = stageIdStrings.map(id => new mongoose.Types.ObjectId(id));
    const stages = stageObjectIds.length
      ? await Stage.find({ _id: { $in: stageObjectIds } }).select('name').lean()
      : [];
    const stageById = new Map(stages.map(s => [s._id.toString(), s]));

    const vendorIdStrings = [...new Set(orders.map(o => o.vendor && o.vendor.toString()).filter(Boolean))];
    const vendorObjectIds = vendorIdStrings.map(id => new mongoose.Types.ObjectId(id));
    const vendors = vendorObjectIds.length
      ? await Vendor.find({ _id: { $in: vendorObjectIds } }).select('name category').lean()
      : [];
    const vendorById = new Map(vendors.map(v => [v._id.toString(), v]));

    for (const order of orders) {
      const pr = pipelineByOrderId.get(order._id.toString());
      if (pr && pr.stageId) {
        const st = stageById.get(pr.stageId.toString());
        order.pipelineStage = st ? st.name : null;
      }
      if (order.vendor) {
        const vdoc = vendorById.get(order.vendor.toString());
        if (vdoc) order.vendor = vdoc;
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
    await saveWithPersistentAttachmentMetadata(customer);
    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new customer
router.post('/', authenticateToken, checkRole(['admin', 'manager', 'account_rep']), async (req, res) => {
  try {
    const customerData = { ...req.body };
    delete customerData.documents;
    delete customerData.documentsMode;
    seedInitialNote(customerData, req.body.notes, req);
    const customer = new Customer(customerData);
    await customer.save();
    invalidateDashboardStatsCache();
    res.status(201).json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update customer
router.put('/:id', authenticateToken, checkRole(['admin', 'manager', 'account_rep']), async (req, res) => {
  try {
    const existingCustomer = await Customer.findById(req.params.id).select('documents');
    if (!existingCustomer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    const updateData = prepareDocumentUpdate(existingCustomer.documents, stripNotesFromUpdate(req.body));
    const customer = await Customer.findByIdAndUpdate(
      req.params.id, 
      updateData,
      { new: true }
    );
    
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    
    invalidateDashboardStatsCache();
    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete customer
router.delete('/:id', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    await retainEntityAttachments('customer', customer, req);
    await customer.deleteOne();
    invalidateDashboardStatsCache();
    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
