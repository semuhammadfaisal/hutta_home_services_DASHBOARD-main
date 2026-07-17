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
const DASHBOARD_STATS_CACHE_VERSION = 'business-health-active-pipeline-orders-v6-approved-vendors';
const APPROVED_VENDOR_MATCH = {
  $or: [
    { onboardingSource: { $exists: false } },
    { onboardingSource: 'manual' },
    { onboardingStatus: 'approved' }
  ]
};

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

function safePercent(value, total, decimals = 0) {
  if (!total) return 0;
  return Number(((value / total) * 100).toFixed(decimals));
}

function daysBetween(start, end) {
  if (!start || !end) return null;
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return null;
  return Math.max(0, Math.round((endTime - startTime) / (1000 * 60 * 60 * 24)));
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

async function getExcludedPipelineStageIds() {
  const excludedStages = await Stage.find({
    $or: [
      { isNoBid: true },
      { name: /^(no\s*bid|lost|cancelled|canceled)$/i }
    ]
  }).select('_id').lean();

  return excludedStages.map(stage => stage._id);
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

function normalizeOrderText(value) {
  return String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
}

function getOrdersOverviewStatus(order) {
  const status = normalizeOrderText(order.status);
  const stage = normalizeOrderText(order.pipelineStage);
  const combined = `${status} ${stage}`;

  if (/(cancel|lost)/.test(combined)) return 'cancelled';
  if (status === 'delayed' || /delayed|on-hold|hold/.test(stage)) return 'delayed';
  if (status === 'completed' || /completed|complete|paid|closed|done/.test(stage)) return 'completed';
  if (status === 'in-progress' || /in-progress|work|active|scheduled|assigned|dispatch/.test(stage)) return 'inProgress';
  if (status === 'new' || /new|lead|request|intake/.test(stage)) return 'newOrders';
  return null;
}

function buildOrdersOverview(orders = []) {
  const overview = {
    version: 'real-orders-v2',
    newOrders: 0,
    inProgress: 0,
    completed: 0,
    delayed: 0,
    cancelled: 0,
    highPriority: 0
  };

  orders.forEach(order => {
    const bucket = getOrdersOverviewStatus(order);
    if (bucket) overview[bucket] += 1;
    if (['high', 'urgent'].includes(normalizeOrderText(order.priority))) {
      overview.highPriority += 1;
    }
  });

  return overview;
}

function isCompletedOrder(order = {}) {
  return getOrdersOverviewStatus(order) === 'completed';
}

function isActiveOrder(order = {}) {
  return ['newOrders', 'inProgress', 'delayed'].includes(getOrdersOverviewStatus(order));
}

function getOrderRevenue(order = {}) {
  return Number(order.amount || 0);
}

function getOrderCost(order = {}) {
  return Number(order.vendorCost || 0) + Number(order.processingFee || 0);
}

function getOrderProfit(order = {}) {
  const explicit = Number(order.profit || 0);
  return explicit || (getOrderRevenue(order) - getOrderCost(order));
}

function buildExecutiveInsights({
  orders = [],
  totalRevenue = 0,
  totalCost = 0,
  paymentsCollected = 0,
  totalCustomers = 0,
  activeCustomers = 0,
  recurringCustomers = 0,
  totalEmployees = 0,
  activeEmployees = 0,
  availableEmployees = 0,
  busyEmployees = 0,
  pipelineUnassignedRecords = null,
  totalPipelineRecords = null,
  topCustomers = [],
  payments = [],
  vendorPayments = {}
}) {
  const now = new Date();
  const totalOrders = orders.length;
  const activeOrders = orders.filter(isActiveOrder);
  const completedOrders = orders.filter(isCompletedOrder);
  const delayedOrders = orders.filter(order => getOrdersOverviewStatus(order) === 'delayed');
  const highPriorityOrders = orders.filter(order => ['high', 'urgent'].includes(normalizeOrderText(order.priority)));
  const unassignedOrders = activeOrders.filter(order => !order.employee);
  const unassignedWorkCount = pipelineUnassignedRecords !== null ? Number(pipelineUnassignedRecords || 0) : unassignedOrders.length;
  const unassignedWorkTotal = totalPipelineRecords !== null ? Number(totalPipelineRecords || 0) : activeOrders.length;
  const negativeMarginOrders = orders.filter(order => getOrderRevenue(order) > 0 && getOrderProfit(order) < 0);
  const lowMarginOrders = orders.filter(order => {
    const revenue = getOrderRevenue(order);
    return revenue > 0 && safePercent(getOrderProfit(order), revenue, 1) < 20;
  });
  const completedCycleDays = completedOrders
    .map(order => daysBetween(order.createdAt, order.endDate || order.updatedAt))
    .filter(value => value !== null);
  const avgCycleDays = completedCycleDays.length
    ? Math.round(completedCycleDays.reduce((sum, value) => sum + value, 0) / completedCycleDays.length)
    : 0;
  const overduePayments = payments.filter(payment => {
    if (!payment.dueDate || ['received', 'completed'].includes(payment.status)) return false;
    return new Date(payment.dueDate) < now;
  });
  const overdueReceivables = overduePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const pendingReceivables = Math.max(totalRevenue - paymentsCollected, 0);
  const grossProfit = totalRevenue - totalCost;
  const grossMargin = safePercent(grossProfit, totalRevenue, 1);
  const collectionRate = safePercent(paymentsCollected, totalRevenue, 1);
  const completionRate = safePercent(completedOrders.length, totalOrders, 1);
  const activeWorkHealthRate = activeOrders.length
    ? safePercent(activeOrders.length - delayedOrders.length, activeOrders.length, 1)
    : completionRate;
  const backlogRate = safePercent(activeOrders.length, totalOrders, 1);
  const retentionRate = safePercent(recurringCustomers, totalCustomers, 1);
  const activeEmployeeBase = activeEmployees || totalEmployees;
  const assignedEmployeeCount = new Set(activeOrders
    .map(order => order.employee)
    .filter(Boolean)
    .map(employee => String(employee))).size;
  const utilizationRate = Math.min(100, safePercent(assignedEmployeeCount, Math.max(activeEmployeeBase, 1), 1));
  const customerHealthRate = safePercent(activeCustomers, totalCustomers, 1);
  const concentrationRisk = safePercent(topCustomers.slice(0, 5).reduce((sum, customer) => sum + Number(customer.totalRevenue || 0), 0), totalRevenue, 1);
  const recurringRevenue = orders
    .filter(order => order.orderType === 'recurring')
    .reduce((sum, order) => sum + getOrderRevenue(order), 0);
  const vendorPayable = Number(vendorPayments.pendingAmount || 0);

  const healthItems = [
    {
      key: 'cash',
      label: 'Cash Health',
      value: `${collectionRate}%`,
      status: collectionRate >= 80 ? 'good' : collectionRate >= 55 ? 'watch' : 'risk',
      detail: `$${pendingReceivables.toLocaleString()} pending AR`
    },
    {
      key: 'margin',
      label: 'Margin Health',
      value: `${grossMargin}%`,
      status: grossMargin >= 35 ? 'good' : grossMargin >= 20 ? 'watch' : 'risk',
      detail: `$${grossProfit.toLocaleString()} gross profit`
    },
    {
      key: 'operations',
      label: 'Operations Health',
      value: `${activeWorkHealthRate}%`,
      status: activeWorkHealthRate >= 90 ? 'good' : activeWorkHealthRate >= 70 ? 'watch' : 'risk',
      detail: `${delayedOrders.length} delayed of ${activeOrders.length} active jobs`
    },
    {
      key: 'capacity',
      label: 'Capacity Health',
      value: `${utilizationRate}%`,
      status: utilizationRate <= 85 ? 'good' : utilizationRate <= 105 ? 'watch' : 'risk',
      detail: `${assignedEmployeeCount}/${activeEmployeeBase} active employees assigned`
    },
    {
      key: 'customer',
      label: 'Customer Health',
      value: `${customerHealthRate}%`,
      status: customerHealthRate >= 85 ? 'good' : customerHealthRate >= 65 ? 'watch' : 'risk',
      detail: `${activeCustomers}/${totalCustomers} active customers`
    }
  ];

  const exceptionQueue = [
    {
      type: 'cash',
      title: 'Overdue Receivables',
      value: `$${overdueReceivables.toLocaleString()}`,
      detail: `${overduePayments.length} payment${overduePayments.length === 1 ? '' : 's'} past due`,
      priority: overdueReceivables > 0 ? 'high' : 'low',
      action: 'Review collections'
    },
    {
      type: 'jobs',
      title: 'Delayed Work',
      value: delayedOrders.length.toLocaleString(),
      detail: `${highPriorityOrders.length} high-priority order${highPriorityOrders.length === 1 ? '' : 's'}`,
      priority: delayedOrders.length ? 'high' : 'low',
      action: 'Open orders'
    },
    {
      type: 'margin',
      title: 'Margin Leakage',
      value: negativeMarginOrders.length.toLocaleString(),
      detail: `${lowMarginOrders.length} jobs below 20% margin`,
      priority: negativeMarginOrders.length ? 'high' : lowMarginOrders.length ? 'medium' : 'low',
      action: 'Review pricing'
    },
    {
      type: 'dispatch',
      title: 'Unassigned Active Work',
      value: unassignedWorkCount.toLocaleString(),
      detail: `${unassignedWorkTotal.toLocaleString()} pipeline records checked`,
      priority: unassignedWorkCount ? 'medium' : 'low',
      action: 'Assign resources'
    }
  ];

  return {
    executiveHealth: {
      grossMargin,
      collectionRate,
      completionRate,
      activeWorkHealthRate,
      backlogRate,
      retentionRate,
      utilizationRate,
      customerHealthRate,
      concentrationRisk,
      healthItems
    },
    revenueControl: {
      bookedRevenue: totalRevenue,
      collectedRevenue: paymentsCollected,
      pendingReceivables,
      overdueReceivables,
      vendorPayable,
      grossProfit,
      grossMargin,
      collectionRate,
      recurringRevenue,
      recurringRevenuePercent: safePercent(recurringRevenue, totalRevenue, 1)
    },
    jobAnalytics: {
      activeJobs: activeOrders.length,
      delayedJobs: delayedOrders.length,
      highPriorityJobs: highPriorityOrders.length,
      unassignedJobs: unassignedWorkCount,
      totalPipelineRecords: unassignedWorkTotal,
      avgCycleDays,
      completionRate,
      lowMarginJobs: lowMarginOrders.length,
      negativeMarginJobs: negativeMarginOrders.length
    },
    customerAnalytics: {
      recurringCustomers,
      retentionRate,
      concentrationRisk,
      averageCustomerRevenue: totalCustomers ? Math.round(totalRevenue / totalCustomers) : 0,
      atRiskCustomers: topCustomers.filter(customer => Number(customer.totalOrders || 0) <= 1).length
    },
    businessHealth: {
      forecastRevenue: Math.round(totalRevenue),
      operatingLeverage: grossMargin,
      cashRisk: overdueReceivables,
      capacityLoad: utilizationRate,
      activeEmployees,
      availableEmployees,
      busyEmployees,
      activeCustomers,
      exceptionCount: exceptionQueue.filter(item => item.priority !== 'low').length
    },
    exceptionQueue
  };
}

router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const topCustomersRange = parseDateRange(req.query.topStartDate, req.query.topEndDate);
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const cacheKey = `${DASHBOARD_STATS_CACHE_VERSION}:top:${req.query.topStartDate || ''}:${req.query.topEndDate || ''}`;
    const cached = forceRefresh ? null : getDashboardStatsCache(cacheKey);
    if (cached) return res.json(cached);

    const now = new Date();
    const currentMonthStart = startOfMonthMDT();
    const nextMonthStart = addMonths(currentMonthStart, 1);
    const previousMonthStart = addMonths(currentMonthStart, -1);
    const sixMonthsStart = addMonths(currentMonthStart, -5);
    const currentYearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const [noBidOrderIds, excludedPipelineStageIds] = await Promise.all([
      getNoBidOrderIds(),
      getExcludedPipelineStageIds()
    ]);
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
      employeeHealthSummary,
      customerHealthSummary,
      paymentTotals,
      monthlyProfit,
      customerTypes,
      serviceCategories,
      topVendors,
      highestRevenueJobs,
      ordersOverviewOrders,
      pipelineAssignmentSummary,
      paymentAgingRows,
      vendorPaymentSummary
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
        { $match: APPROVED_VENDOR_MATCH },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Order.aggregate([
        { $match: { ...baseOrderMatch, employee: { $ne: null } } },
        {
          $group: {
            _id: '$employee',
            revenue: { $sum: { $ifNull: ['$amount', 0] } },
            profit: {
              $sum: {
                $subtract: [
                  { $ifNull: ['$amount', 0] },
                  { $add: [{ $ifNull: ['$vendorCost', 0] }, { $ifNull: ['$processingFee', 0] }] }
                ]
              }
            },
            completedCount: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            },
            delayedCount: {
              $sum: { $cond: [{ $eq: ['$status', 'delayed'] }, 1, 0] }
            },
            orderCount: { $sum: 1 }
          }
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'employees', localField: '_id', foreignField: '_id', as: 'employee' } },
        { $unwind: '$employee' },
        { $project: { _id: 0, id: '$_id', name: '$employee.name', revenue: 1, profit: 1, completedCount: 1, delayedCount: 1, orderCount: 1 } }
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
      Vendor.countDocuments(APPROVED_VENDOR_MATCH),
      Employee.countDocuments(),
      Employee.aggregate([
        {
          $group: {
            _id: null,
            activeEmployees: { $sum: { $cond: [{ $ne: ['$isActive', false] }, 1, 0] } },
            availableEmployees: { $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] } },
            busyEmployees: { $sum: { $cond: [{ $eq: ['$status', 'busy'] }, 1, 0] } },
            offlineEmployees: { $sum: { $cond: [{ $in: ['$status', ['offline', 'on-leave']] }, 1, 0] } }
          }
        }
      ]),
      Customer.aggregate([
        {
          $group: {
            _id: null,
            activeCustomers: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
            inactiveCustomers: { $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] } }
          }
        }
      ]),
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
      ]),
      Order.aggregate([
        { $match: baseOrderMatch },
        {
          $project: {
            serviceLabel: {
              $trim: {
                input: {
                  $ifNull: ['$service', 'Uncategorized']
                }
              }
            },
            amount: { $ifNull: ['$amount', 0] },
            cost: { $add: [{ $ifNull: ['$vendorCost', 0] }, { $ifNull: ['$processingFee', 0] }] },
            profit: {
              $cond: [
                { $ne: [{ $ifNull: ['$profit', 0] }, 0] },
                { $ifNull: ['$profit', 0] },
                {
                  $subtract: [
                    { $ifNull: ['$amount', 0] },
                    { $add: [{ $ifNull: ['$vendorCost', 0] }, { $ifNull: ['$processingFee', 0] }] }
                  ]
                }
              ]
            },
            isRecurring: { $eq: ['$orderType', 'recurring'] },
            isCompleted: {
              $or: [
                { $eq: ['$status', 'completed'] },
                { $regexMatch: { input: { $ifNull: ['$pipelineStage', ''] }, regex: /completed|paid|closed|done/i } }
              ]
            },
            isDelayed: {
              $or: [
                { $eq: ['$status', 'delayed'] },
                { $regexMatch: { input: { $ifNull: ['$pipelineStage', ''] }, regex: /delayed|hold/i } }
              ]
            }
          }
        },
        {
          $group: {
            _id: {
              $cond: [
                { $eq: ['$serviceLabel', ''] },
                'Uncategorized',
                '$serviceLabel'
              ]
            },
            orders: { $sum: 1 },
            revenue: { $sum: '$amount' },
            cost: { $sum: '$cost' },
            profit: { $sum: '$profit' },
            recurringOrders: { $sum: { $cond: ['$isRecurring', 1, 0] } },
            completedOrders: { $sum: { $cond: ['$isCompleted', 1, 0] } },
            delayedOrders: { $sum: { $cond: ['$isDelayed', 1, 0] } }
          }
        },
        { $sort: { revenue: -1, orders: -1, _id: 1 } },
        {
          $project: {
            _id: 0,
            key: '$_id',
            label: '$_id',
            orders: 1,
            revenue: 1,
            cost: 1,
            profit: 1,
            recurringOrders: 1,
            completedOrders: 1,
            delayedOrders: 1
          }
        }
      ]),
      Order.aggregate([
        { $match: { ...baseOrderMatch, vendor: { $ne: null } } },
        {
          $group: {
            _id: '$vendor',
            revenue: { $sum: { $ifNull: ['$amount', 0] } },
            cost: { $sum: { $ifNull: ['$vendorCost', 0] } },
            profit: {
              $sum: {
                $subtract: [
                  { $ifNull: ['$amount', 0] },
                  { $ifNull: ['$vendorCost', 0] }
                ]
              }
            },
            completedCount: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            },
            delayedCount: {
              $sum: { $cond: [{ $eq: ['$status', 'delayed'] }, 1, 0] }
            },
            orderCount: { $sum: 1 }
          }
        },
        { $sort: { revenue: -1, orderCount: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'vendors', localField: '_id', foreignField: '_id', as: 'vendor' } },
        { $unwind: '$vendor' },
        {
          $project: {
            _id: 0,
            id: '$_id',
            name: '$vendor.name',
            category: '$vendor.category',
            revenue: 1,
            cost: 1,
            profit: 1,
            completedCount: 1,
            delayedCount: 1,
            orderCount: 1
          }
        }
      ]),
      Order.find(baseOrderMatch)
        .select('orderId customer service amount vendorCost profit status pipelineStage createdAt')
        .sort({ amount: -1, createdAt: -1 })
        .limit(1)
        .lean(),
      Order.find(baseOrderMatch)
        .select('orderId amount vendorCost processingFee profit status priority pipelineStage orderType employee vendor createdAt updatedAt scheduleDate startDate endDate customer service')
        .lean(),
      PipelineRecord.aggregate([
        {
          $match: excludedPipelineStageIds.length
            ? { stageId: { $nin: excludedPipelineStageIds } }
            : {}
        },
        {
          $lookup: {
            from: 'orders',
            localField: 'orderId',
            foreignField: '_id',
            as: 'linkedOrder'
          }
        },
        {
          $unwind: {
            path: '$linkedOrder',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $group: {
            _id: null,
            totalRecords: { $sum: 1 },
            unassignedRecords: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: [{ $ifNull: ['$orderId', null] }, null] },
                      { $eq: [{ $ifNull: ['$linkedOrder.employee', null] }, null] }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]),
      Payment.find({
        order: noBidOrderIds.length ? { $nin: noBidOrderIds } : { $exists: true }
      })
        .select('amount status dueDate paymentDate vendorPaymentAmount vendorPaymentStatus vendorPaymentDate createdAt')
        .lean(),
      Payment.aggregate([
        {
          $match: {
            order: noBidOrderIds.length ? { $nin: noBidOrderIds } : { $exists: true }
          }
        },
        {
          $group: {
            _id: null,
            pendingAmount: {
              $sum: {
                $cond: [
                  { $eq: ['$vendorPaymentStatus', 'pending'] },
                  { $ifNull: ['$vendorPaymentAmount', 0] },
                  0
                ]
              }
            },
            paidAmount: {
              $sum: {
                $cond: [
                  { $eq: ['$vendorPaymentStatus', 'paid'] },
                  { $ifNull: ['$vendorPaymentAmount', 0] },
                  0
                ]
              }
            }
          }
        }
      ])
    ]);

    const mostRequestedService = [...serviceCategories].sort((a, b) => {
      if ((b.orders || 0) !== (a.orders || 0)) return (b.orders || 0) - (a.orders || 0);
      if ((b.revenue || 0) !== (a.revenue || 0)) return (b.revenue || 0) - (a.revenue || 0);
      return String(a.label || '').localeCompare(String(b.label || ''));
    })[0] || null;
    const highestRevenueJob = highestRevenueJobs[0] ? {
      id: highestRevenueJobs[0]._id,
      orderId: highestRevenueJobs[0].orderId,
      customerName: highestRevenueJobs[0].customer?.name || 'Customer',
      service: highestRevenueJobs[0].service || 'Service',
      revenue: highestRevenueJobs[0].amount || 0,
      cost: highestRevenueJobs[0].vendorCost || 0,
      profit: highestRevenueJobs[0].profit ?? ((highestRevenueJobs[0].amount || 0) - (highestRevenueJobs[0].vendorCost || 0)),
      status: highestRevenueJobs[0].pipelineStage || highestRevenueJobs[0].status || 'unknown'
    } : null;

    const totals = orderTotals[0] || {};
    const currentMonth = monthlyTotals.find(row => row._id === 'current') || {};
    const previousMonth = monthlyTotals.find(row => row._id === 'previous') || {};
    const statusCounts = Object.fromEntries(statusBreakdown.map(row => [row._id || 'unknown', row.count]));
    const ordersOverview = buildOrdersOverview(ordersOverviewOrders);
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
    const recurringCustomers = customerTypes
      .filter(row => row._id === 'recurring')
      .reduce((sum, row) => sum + Number(row.count || 0), 0);
    const employeeHealth = employeeHealthSummary[0] || {};
    const customerHealth = customerHealthSummary[0] || {};
    const pipelineAssignment = pipelineAssignmentSummary[0] || {};
    const insightMetrics = buildExecutiveInsights({
      orders: ordersOverviewOrders,
      totalRevenue,
      totalCost,
      paymentsCollected,
      totalCustomers,
      activeCustomers: Number(customerHealth.activeCustomers || 0),
      recurringCustomers,
      totalEmployees,
      activeEmployees: Number(employeeHealth.activeEmployees || 0),
      availableEmployees: Number(employeeHealth.availableEmployees || 0),
      busyEmployees: Number(employeeHealth.busyEmployees || 0),
      pipelineUnassignedRecords: Number(pipelineAssignment.unassignedRecords || 0),
      totalPipelineRecords: Number(pipelineAssignment.totalRecords || 0),
      topCustomers,
      payments: paymentAgingRows,
      vendorPayments: vendorPaymentSummary[0] || {}
    });
    const vendorPerformance = {
      topVendors: topVendors.map(vendor => ({
        ...vendor,
        margin: safePercent(Number(vendor.profit || 0), Number(vendor.revenue || 0), 1),
        reliability: safePercent(Number(vendor.completedCount || 0), Number(vendor.orderCount || 0), 1),
        delayRate: safePercent(Number(vendor.delayedCount || 0), Number(vendor.orderCount || 0), 1)
      })),
      pendingPayables: Number(vendorPaymentSummary[0]?.pendingAmount || 0),
      paidPayables: Number(vendorPaymentSummary[0]?.paidAmount || 0)
    };
    const employeePerformance = {
      totalEmployees,
      utilizationRate: insightMetrics.executiveHealth.utilizationRate,
      topEmployees: topEmployees.map(employee => ({
        ...employee,
        margin: safePercent(Number(employee.profit || 0), Number(employee.revenue || 0), 1),
        completionRate: safePercent(Number(employee.completedCount || 0), Number(employee.orderCount || 0), 1),
        delayRate: safePercent(Number(employee.delayedCount || 0), Number(employee.orderCount || 0), 1)
      }))
    };
    const servicePerformance = serviceCategories.slice(0, 8).map(service => ({
      ...service,
      margin: safePercent(Number(service.profit || 0), Number(service.revenue || 0), 1),
      completionRate: safePercent(Number(service.completedOrders || 0), Number(service.orders || 0), 1),
      delayRate: safePercent(Number(service.delayedOrders || 0), Number(service.orders || 0), 1),
      recurringShare: safePercent(Number(service.recurringOrders || 0), Number(service.orders || 0), 1)
    }));

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
      ordersOverview,
      monthlyProfitTimeline,
      customerTypeBreakdown: customerTypes.map(row => ({
        type: row._id || 'unknown',
        count: row.count || 0
      })),
      serviceCategoryOverview: serviceCategories,
      topPerformance: {
        topCustomer: topCustomers[0] || null,
        topVendor: topVendors[0] || null,
        topEmployee: topEmployees[0] || null,
        mostRequestedService,
        highestRevenueJob
      },
      ...insightMetrics,
      employeePerformance,
      vendorPerformance,
      servicePerformance,
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
