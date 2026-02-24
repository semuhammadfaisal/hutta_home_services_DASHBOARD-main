const express = require('express');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const Project = require('../models/Project');
const Customer = require('../models/Customer');
const authenticateToken = require('../middleware/auth');
const router = express.Router();

// Get financial report
router.get('/financial', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = {};
    
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const [totalRevenue, totalPayments, pendingPayments, completedOrders] = await Promise.all([
      Order.aggregate([
        { $match: { status: 'completed', ...dateFilter } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Payment.aggregate([
        { $match: { status: 'completed', ...dateFilter } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Payment.aggregate([
        { $match: { status: 'pending', ...dateFilter } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Order.countDocuments({ status: 'completed', ...dateFilter })
    ]);

    res.json({
      totalRevenue: totalRevenue[0]?.total || 0,
      totalPayments: totalPayments[0]?.total || 0,
      pendingPayments: pendingPayments[0]?.total || 0,
      completedOrders
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get orders report
router.get('/orders', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = {};
    
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const [statusBreakdown, monthlyOrders] = await Promise.all([
      Order.aggregate([
        { $match: dateFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Order.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            count: { $sum: 1 },
            revenue: { $sum: '$amount' }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    res.json({
      statusBreakdown,
      monthlyOrders
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get customers report
router.get('/customers', authenticateToken, async (req, res) => {
  try {
    const [customerTypes, topCustomers] = await Promise.all([
      Customer.aggregate([
        { $group: { _id: '$customerType', count: { $sum: 1 } } }
      ]),
      Customer.find().sort({ totalSpent: -1 }).limit(10).select('name email totalSpent totalOrders')
    ]);

    res.json({
      customerTypes,
      topCustomers
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get projects report
router.get('/projects', authenticateToken, async (req, res) => {
  try {
    const [statusBreakdown, budgetAnalysis] = await Promise.all([
      Project.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Project.aggregate([
        {
          $group: {
            _id: null,
            totalBudget: { $sum: '$budget' },
            totalActualCost: { $sum: '$actualCost' },
            avgProgress: { $avg: '$progress' }
          }
        }
      ])
    ]);

    res.json({
      statusBreakdown,
      budgetAnalysis: budgetAnalysis[0] || { totalBudget: 0, totalActualCost: 0, avgProgress: 0 }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;