const express = require('express');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const Employee = require('../models/Employee');
const Payment = require('../models/Payment');
const Stage = require('../models/Stage');
const PipelineRecord = require('../models/PipelineRecord');
const authenticateToken = require('../middleware/auth');
const { startOfMonthMDT } = require('../utils/timezone');
const {
  getDashboardStatsCache,
  setDashboardStatsCache
} = require('../utils/dashboardStatsCache');

const router = express.Router();
const TZ = 'America/Phoenix';

function addMonths(date, months) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function formatMonthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function growthPercent(current, previous) {
  if (!previous) return current ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function parseDateRange(startDate, endDate) {
  const range = {};
  if (startDate) {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    if (!Number.isNaN(start.getTime())) range.$gte = start;
  }
  if (endDate) {
    const end = new Date(`${endDate}T23:59:59.999Z`);
    if (!Number.isNaN(end.getTime())) range.$lte = end;
  }
  return Object.keys(range).length ? range : null;
}

async function getNoBidOrderIds() {
  const noBidStages = await Stage.find({ isNoBid: true }).select('_id').lean();
  if (!noBidStages.length) return [];

  const noBidRecords = await PipelineRecord.find({
    stageId: { $in: noBidStages.map(stage => stage._id) }
  }).select('orderId').lean();

  return noBidRecords.map(record => record.orderId).filter(Boolean);
}

function orderMatch(noBidOrderIds, extra = {}) {
  const match = { ...extra };
  if (noBidOrderIds.length) match._id = { $nin: noBidOrderIds };
  return match;
}

router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const topCustomersRange = parseDateRange(req.query.topStartDate, req.query.topEndDate);
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const cacheKey = `top:${req.query.topStartDate || ''}:${req.query.topEndDate || ''}`;
    const cached = forceRefresh ? null : getDashboardStatsCache(cacheKey);
    if (cached) return res.json(cached);

    const now = new Date();
    const currentMonthStart = startOfMonthMDT();
    const nextMonthStart = addMonths(currentMonthStart, 1);
    const previousMonthStart = addMonths(currentMonthStart, -1);
    const sixMonthsStart = addMonths(currentMonthStart, -5);
    const currentYearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const noBidOrderIds = await getNoBidOrderIds();
    const baseOrderMatch = orderMatch(noBidOrderIds);

    const [
      orderTotals,
      statusBreakdown,
      monthlyTotals,
      revenueTimeline,
      vendorCategories,
      topEmployees,
      recentOrders,
      topCustomers,
      totalCustomers,
      totalVendors,
      totalEmployees,
      paymentTotals,
      monthlyProfit,
      customerTypes
    ] = await Promise.all([
      Order.aggregate([
        { $match: baseOrderMatch },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: { $ifNull: ['$amount', 0] } },
            totalCost: { $sum: { $ifNull: ['$vendorCost', 0] } },
            currentMonthOrders: {
              $sum: { $cond: [{ $and: [{ $gte: ['$createdAt', currentMonthStart] }, { $lt: ['$createdAt', nextMonthStart] }] }, 1, 0] }
            },
            currentMonthRevenue: {
              $sum: { $cond: [{ $and: [{ $gte: ['$createdAt', currentMonthStart] }, { $lt: ['$createdAt', nextMonthStart] }] }, { $ifNull: ['$amount', 0] }, 0] }
            },
            currentYearRevenue: {
              $sum: { $cond: [{ $gte: ['$createdAt', currentYearStart] }, { $ifNull: ['$amount', 0] }, 0] }
            },
            paymentsCollectedFromPaidOrders: {
              $sum: { $cond: [{ $eq: ['$pipelineStage', 'Paid'] }, { $ifNull: ['$amount', 0] }, 0] }
            }
          }
        }
      ]),
      Order.aggregate([
        { $match: baseOrderMatch },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Order.aggregate([
        {
          $match: orderMatch(noBidOrderIds, {
            createdAt: { $gte: previousMonthStart, $lt: nextMonthStart }
          })
        },
        {
          $group: {
            _id: {
              $cond: [
                { $gte: ['$createdAt', currentMonthStart] },
                'current',
                'previous'
              ]
            },
            orders: { $sum: 1 },
            revenue: { $sum: { $ifNull: ['$amount', 0] } }
          }
        }
      ]),
      Order.aggregate([
        { $match: baseOrderMatch },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } },
            amount: { $sum: { $ifNull: ['$amount', 0] } },
            orders: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      Vendor.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Order.aggregate([
        { $match: { ...baseOrderMatch, employee: { $ne: null } } },
        {
          $group: {
            _id: '$employee',
            revenue: { $sum: { $ifNull: ['$amount', 0] } },
            orderCount: { $sum: 1 }
          }
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'employees', localField: '_id', foreignField: '_id', as: 'employee' } },
        { $unwind: '$employee' },
        { $project: { _id: 0, id: '$_id', name: '$employee.name', revenue: 1, orderCount: 1 } }
      ]),
      Order.find(baseOrderMatch)
        .select('orderId customer amount status pipelineStage createdAt')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Order.aggregate([
        { $match: topCustomersRange ? { ...baseOrderMatch, createdAt: topCustomersRange } : baseOrderMatch },
        {
          $group: {
            _id: {
              customerId: '$customerId',
              email: '$customer.email',
              name: '$customer.name'
            },
            name: { $first: '$customer.name' },
            email: { $first: '$customer.email' },
            totalRevenue: { $sum: { $ifNull: ['$amount', 0] } },
            totalOrders: { $sum: 1 }
          }
        },
        { $match: { totalRevenue: { $gt: 0 } } },
        { $sort: { totalRevenue: -1 } },
        { $limit: 10 },
        { $project: { _id: 0, name: 1, email: 1, totalRevenue: 1, totalOrders: 1 } }
      ]),
      Customer.countDocuments(),
      Vendor.countDocuments(),
      Employee.countDocuments(),
      Payment.aggregate([
        {
          $match: {
            order: noBidOrderIds.length ? { $nin: noBidOrderIds } : { $exists: true },
            status: { $in: ['received', 'completed'] }
          }
        },
        { $group: { _id: null, paymentsCollected: { $sum: { $ifNull: ['$amount', 0] } } } }
      ]),
      Order.aggregate([
        {
          $match: orderMatch(noBidOrderIds, {
            createdAt: { $gte: sixMonthsStart, $lt: nextMonthStart }
          })
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: TZ } },
            revenue: { $sum: { $ifNull: ['$amount', 0] } },
            cost: { $sum: { $ifNull: ['$vendorCost', 0] } },
            profit: {
              $sum: {
                $subtract: [
                  { $ifNull: ['$amount', 0] },
                  { $ifNull: ['$vendorCost', 0] }
                ]
              }
            }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      Customer.aggregate([
        { $group: { _id: '$customerType', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ])
    ]);

    const totals = orderTotals[0] || {};
    const currentMonth = monthlyTotals.find(row => row._id === 'current') || {};
    const previousMonth = monthlyTotals.find(row => row._id === 'previous') || {};
    const statusCounts = Object.fromEntries(statusBreakdown.map(row => [row._id || 'unknown', row.count]));
    const paidOrderTotal = totals.paymentsCollectedFromPaidOrders || 0;
    const receivedPaymentTotal = paymentTotals[0]?.paymentsCollected || 0;
    const paymentsCollected = Math.max(paidOrderTotal, receivedPaymentTotal);
    const totalRevenue = totals.totalRevenue || 0;
    const totalCost = totals.totalCost || 0;
    const monthlyProfitByKey = new Map(monthlyProfit.map(row => [row._id, row]));
    const monthlyProfitTimeline = Array.from({ length: 6 }, (_, index) => {
      const monthDate = addMonths(sixMonthsStart, index);
      const month = formatMonthKey(monthDate);
      const row = monthlyProfitByKey.get(month) || {};
      const revenue = row.revenue || 0;
      const cost = row.cost || 0;
      return {
        month,
        revenue,
        cost,
        profit: row.profit ?? (revenue - cost)
      };
    });

    const payload = {
      totalOrders: totals.totalOrders || 0,
      totalCustomers,
      totalVendors,
      totalEmployees,
      totalRevenue,
      paymentsCollected,
      pendingPayments: Math.max(totalRevenue - paymentsCollected, 0),
      monthlyGrowth: {
        orders: growthPercent(currentMonth.orders || 0, previousMonth.orders || 0),
        revenue: growthPercent(currentMonth.revenue || 0, previousMonth.revenue || 0)
      },
      workflow: {
        newRequests: statusCounts.new || 0,
        workOrders: statusCounts['in-progress'] || 0,
        activeWork: (statusCounts['in-progress'] || 0) + (statusCounts.delayed || 0),
        completedWork: statusCounts.completed || 0
      },
      vendorCategories: vendorCategories.reduce((acc, row) => {
        acc[row._id || 'uncategorized'] = row.count;
        return acc;
      }, {}),
      employeeLeaderboard: topEmployees,
      recentActivity: recentOrders,
      topCustomers,
      orderStatusBreakdown: statusBreakdown.map(row => ({
        status: row._id || 'unknown',
        count: row.count || 0
      })),
      monthlyProfitTimeline,
      customerTypeBreakdown: customerTypes.map(row => ({
        type: row._id || 'unknown',
        count: row.count || 0
      })),
      revenueTimeline: revenueTimeline.map(row => ({
        date: row._id,
        amount: row.amount || 0,
        orders: row.orders || 0
      })),
      financialOverview: {
        totalRevenue,
        totalCost,
        totalProfit: totalRevenue - totalCost,
        ytdRevenue: totals.currentYearRevenue || 0,
        monthRevenue: totals.currentMonthRevenue || 0,
        monthSales: totals.currentMonthOrders || 0
      }
    };

    setDashboardStatsCache(cacheKey, payload);
    res.json(payload);
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
