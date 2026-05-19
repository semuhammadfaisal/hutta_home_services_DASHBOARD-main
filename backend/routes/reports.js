const express = require('express');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const Project = require('../models/Project');
const Customer = require('../models/Customer');
const Employee = require('../models/Employee');
const PipelineRecord = require('../models/PipelineRecord');
const Stage = require('../models/Stage');
const authenticateToken = require('../middleware/auth');
const checkRole = require('../middleware/rbac');
const { dateInputToMDT, endOfDayMDT } = require('../utils/timezone');
const router = express.Router();

function buildCreatedAtFilter(startDate, endDate) {
  if (!startDate || !endDate) return {};
  return {
    createdAt: {
      $gte: dateInputToMDT(startDate),
      $lte: endOfDayMDT(endDate)
    }
  };
}

function escapeRegex(value = '') {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildOrderReportFilter(query = {}, startDate, endDate) {
  const filter = buildCreatedAtFilter(startDate, endDate);
  if (query.customer) filter['customer.name'] = new RegExp(escapeRegex(query.customer), 'i');
  if (query.service) filter.service = new RegExp(escapeRegex(query.service), 'i');
  if (query.status) filter.status = query.status;
  if (query.property) {
    filter.$or = [
      { 'customer.address': new RegExp(escapeRegex(query.property), 'i') },
      { 'customer.name': new RegExp(escapeRegex(query.property), 'i') }
    ];
  }
  if (query.location) {
    const locationClauses = [
      { 'customer.address': new RegExp(escapeRegex(query.location), 'i') },
      { 'customer.name': new RegExp(escapeRegex(query.location), 'i') }
    ];
    filter.$or = filter.$or ? [...filter.$or, ...locationClauses] : locationClauses;
  }
  return filter;
}

async function getExcludedPipelineOrderIds() {
  const excludedStages = await Stage.find({
    $or: [
      { isNoBid: true },
      { name: /^(lost|no bid|no-bid)$/i }
    ]
  }).select('_id').lean();

  const excludedStageIds = excludedStages.map(stage => stage._id);
  if (!excludedStageIds.length) {
    return { excludedStageIds, excludedRecordIds: [], excludedOrderIds: [] };
  }

  const excludedRecords = await PipelineRecord.find({
    stageId: { $in: excludedStageIds }
  }).select('orderId').lean();

  return {
    excludedStageIds,
    excludedRecordIds: excludedRecords.map(record => record._id).filter(Boolean),
    excludedOrderIds: excludedRecords.map(record => record.orderId).filter(Boolean)
  };
}

function percentChange(current, previous) {
  if (!previous && !current) return 0;
  if (!previous) return 100;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function compactMonth(date) {
  return date.toLocaleString('en-US', { month: 'short', timeZone: 'America/Denver' });
}

function normalizeStatus(value = '') {
  return String(value).toLowerCase();
}

function isClosedStatus(status) {
  return ['completed', 'cancelled', 'canceled', 'closed', 'paid'].includes(normalizeStatus(status));
}

function isCompletedStatus(status) {
  return ['completed', 'closed', 'paid'].includes(normalizeStatus(status));
}

function getHealth(status) {
  if (status === 'risk') return 'risk';
  if (status === 'warn') return 'warn';
  return 'good';
}

function validReportDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  // Reject empty/epoch defaults and obviously corrupt future dates.
  const minDate = new Date('2000-01-01T00:00:00.000Z');
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 1);
  if (date < minDate || date > maxDate) return null;
  return date;
}

function paymentPaidDate(payment) {
  const directPaymentDate = validReportDate(payment.paymentDate);
  if (directPaymentDate) return directPaymentDate;

  const milestonePaidDates = (payment.milestones || [])
    .filter(milestone => ['received', 'completed'].includes(milestone.status))
    .map(milestone => validReportDate(milestone.receivedDate))
    .filter(Boolean)
    .sort((a, b) => a - b);

  return milestonePaidDates[0] || null;
}

function orderCompletionDate(order) {
  return validReportDate(order?.endDate);
}

function daysBetween(start, end) {
  const startDate = validReportDate(start);
  const endDate = validReportDate(end);
  if (!startDate || !endDate) return null;

  const days = Math.max(0, Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)));
  return days > 3650 ? null : days;
}

function paymentCompletionToPaidDays(payment) {
  return daysBetween(orderCompletionDate(payment.order), paymentPaidDate(payment));
}

async function sumOrders(match) {
  const result = await Order.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
  ]);
  return result[0] || { total: 0, count: 0 };
}

// Get consolidated enterprise analytics report
router.get('/analytics', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const orderFilter = buildOrderReportFilter(req.query, startDate, endDate);
    const { excludedStageIds, excludedRecordIds, excludedOrderIds } = await getExcludedPipelineOrderIds();
    orderFilter._id = { ...(orderFilter._id || {}), $nin: excludedOrderIds };
    orderFilter.pipelineRecordId = { ...(orderFilter.pipelineRecordId || {}), $nin: excludedRecordIds };
    orderFilter.pipelineStage = { ...(orderFilter.pipelineStage || {}), $not: /^(lost|no bid|no-bid)$/i };

    if (req.query.technician) {
      const technicianIds = await Employee.find({ name: new RegExp(escapeRegex(req.query.technician), 'i') }).distinct('_id');
      orderFilter.employee = { $in: technicianIds };
    }
    const dateFilter = buildCreatedAtFilter(startDate, endDate);
    const periodStart = startDate ? dateInputToMDT(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const periodEnd = endDate ? endOfDayMDT(endDate) : new Date();
    const periodMs = Math.max(periodEnd - periodStart, 1);
    const previousEnd = new Date(periodStart.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - periodMs);
    const previousDateFilter = { createdAt: { $gte: previousStart, $lte: previousEnd } };

    const [
      currentOrdersSummary,
      previousOrdersSummary,
      completedOrdersSummary,
      previousCompletedOrdersSummary,
      allOrders,
      completedOrders,
      openOrders,
      overdueOrders,
      payments,
      pendingPayments,
      customers,
      employees,
      projects,
      pipelineRecords
    ] = await Promise.all([
      sumOrders(orderFilter),
      sumOrders({ ...orderFilter, ...previousDateFilter }),
      sumOrders({ ...orderFilter, status: 'completed' }),
      sumOrders({ ...orderFilter, ...previousDateFilter, status: 'completed' }),
      Order.find(orderFilter).populate('employee', 'name role status').lean(),
      Order.find({ ...orderFilter, status: 'completed' }).populate('employee', 'name role status').lean(),
      Order.find({ ...orderFilter, status: { $nin: ['completed', 'cancelled', 'canceled'] } }).populate('employee', 'name role status').lean(),
      Order.find({ ...orderFilter, endDate: { $lt: new Date() }, status: { $nin: ['completed', 'cancelled', 'canceled'] } }).lean(),
      Payment.find({ ...dateFilter, order: { $nin: excludedOrderIds } }).populate('order', 'endDate createdAt amount service orderType customer pipelineStage').populate('customer', 'name email totalSpent totalOrders customerType status').lean(),
      Payment.find({ ...dateFilter, status: { $in: ['pending'] }, order: { $nin: excludedOrderIds } }).populate('customer', 'name').lean(),
      Customer.find().lean(),
      Employee.find({ isActive: true }).lean(),
      Project.find(dateFilter).populate('customer', 'name').populate('assignedEmployees', 'name role status').lean(),
      PipelineRecord.find({ ...dateFilter, stageId: { $nin: excludedStageIds } }).populate('stageId', 'name type isNoBid').lean()
    ]);

    const filterOptions = {
      customers: [...new Set(customers.map(customer => customer.name).filter(Boolean))].sort(),
      properties: [...new Set([
        ...customers.flatMap(customer => (customer.addresses || []).map(address => address.label || address.address).filter(Boolean)),
        ...projects.map(project => project.name).filter(Boolean)
      ])].sort(),
      technicians: employees.map(employee => employee.name).filter(Boolean).sort(),
      services: [...new Set(allOrders.map(order => order.service).filter(Boolean))].sort(),
      statuses: [...new Set(allOrders.map(order => order.status).filter(Boolean))].sort(),
      locations: [...new Set(customers.flatMap(customer => [
        customer.city,
        customer.state,
        ...(customer.addresses || []).map(address => address.city || address.state || address.address)
      ]).filter(Boolean))].sort()
    };

    const totalRevenue = currentOrdersSummary.total || 0;
    const previousRevenue = previousOrdersSummary.total || 0;
    const outstandingPayments = pendingPayments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
    const openWorkOrders = openOrders.length;
    const averageJobValue = currentOrdersSummary.count ? totalRevenue / currentOrdersSummary.count : 0;
    const previousAverageJobValue = previousOrdersSummary.count ? previousRevenue / previousOrdersSummary.count : 0;
    const quoteConversionRate = currentOrdersSummary.count ? (completedOrdersSummary.count / currentOrdersSummary.count) * 100 : 0;
    const previousQuoteConversionRate = previousOrdersSummary.count ? (previousCompletedOrdersSummary.count / previousOrdersSummary.count) * 100 : 0;
    const paidPayments = payments.filter(payment => ['received', 'completed'].includes(payment.status));
    const paymentDays = paidPayments
      .map(payment => paymentCompletionToPaidDays(payment))
      .filter(value => value !== null);
    const averagePaymentTime = paymentDays.length ? paymentDays.reduce((sum, value) => sum + value, 0) / paymentDays.length : 0;
    const paymentSpeedBands = [
      { label: 'Within 7 days', value: paymentDays.length ? Math.round((paymentDays.filter(days => days <= 7).length / paymentDays.length) * 100) : 0 },
      { label: 'Within 14 days', value: paymentDays.length ? Math.round((paymentDays.filter(days => days <= 14).length / paymentDays.length) * 100) : 0 },
      { label: 'Within 30 days', value: paymentDays.length ? Math.round((paymentDays.filter(days => days <= 30).length / paymentDays.length) * 100) : 0 }
    ];
    const recurringRevenue = allOrders.filter(order => order.orderType === 'recurring').reduce((sum, order) => sum + (order.amount || 0), 0);
    const recurringRevenuePercent = totalRevenue ? (recurringRevenue / totalRevenue) * 100 : 0;

    const revenueByServiceMap = new Map();
    const profitByServiceMap = new Map();
    const revenueByPropertyMap = new Map();
    allOrders.forEach(order => {
      const service = order.service || 'Uncategorized';
      revenueByServiceMap.set(service, (revenueByServiceMap.get(service) || 0) + (order.amount || 0));
      profitByServiceMap.set(service, (profitByServiceMap.get(service) || 0) + (order.profit || ((order.amount || 0) - (order.vendorCost || 0) - (order.processingFee || 0))));
      const property = order.customer?.address || order.customer?.name || 'Unassigned property';
      revenueByPropertyMap.set(property, (revenueByPropertyMap.get(property) || 0) + (order.amount || 0));
    });

    const monthlyRevenueMap = new Map();
    allOrders.forEach(order => {
      const created = new Date(order.createdAt);
      const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`;
      monthlyRevenueMap.set(key, (monthlyRevenueMap.get(key) || 0) + (order.amount || 0));
    });

    const yoyRevenueMap = new Map();
    allOrders.forEach(order => {
      const year = String(new Date(order.createdAt).getFullYear());
      yoyRevenueMap.set(year, (yoyRevenueMap.get(year) || 0) + (order.amount || 0));
    });

    const agingBuckets = { Current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    pendingPayments.forEach(payment => {
      const due = payment.dueDate || payment.createdAt;
      const age = daysBetween(due, new Date()) || 0;
      if (age <= 0) agingBuckets.Current += payment.amount || 0;
      else if (age <= 30) agingBuckets['1-30'] += payment.amount || 0;
      else if (age <= 60) agingBuckets['31-60'] += payment.amount || 0;
      else if (age <= 90) agingBuckets['61-90'] += payment.amount || 0;
      else agingBuckets['90+'] += payment.amount || 0;
    });

    const customerRevenueMap = new Map();
    allOrders.forEach(order => {
      const name = order.customer?.name || 'Unknown customer';
      const existing = customerRevenueMap.get(name) || { customer: name, revenue: 0, jobs: 0, speedValues: [], health: 'good' };
      existing.revenue += order.amount || 0;
      existing.jobs += 1;
      customerRevenueMap.set(name, existing);
    });
    paidPayments.forEach(payment => {
      const name = payment.customer?.name || payment.order?.customer?.name;
      if (!name || !customerRevenueMap.has(name)) return;
      const existing = customerRevenueMap.get(name);
      const speed = paymentCompletionToPaidDays(payment);
      if (speed !== null) existing.speedValues.push(speed);
    });
    pendingPayments.forEach(payment => {
      const name = payment.customer?.name;
      if (!name || !customerRevenueMap.has(name)) return;
      const age = daysBetween(payment.dueDate || payment.createdAt, new Date()) || 0;
      if (age > 30) customerRevenueMap.get(name).health = 'risk';
      else if (age > 0 && customerRevenueMap.get(name).health !== 'risk') customerRevenueMap.get(name).health = 'warn';
    });

    const topCustomers = Array.from(customerRevenueMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map(customer => ({
        ...customer,
        speed: customer.speedValues.length ? `${Math.round(customer.speedValues.reduce((sum, value) => sum + value, 0) / customer.speedValues.length)}d` : 'N/A'
      }));

    const repeatJobFrequency = Array.from(customerRevenueMap.values())
      .sort((a, b) => b.jobs - a.jobs)
      .slice(0, 10)
      .map(customer => ({
        customer: customer.customer,
        jobs: customer.jobs,
        repeatFrequency: customer.jobs > 1 ? `${customer.jobs} jobs` : '1 job',
        revenue: customer.revenue
      }));

    const avgPayDaysByCustomer = Array.from(customerRevenueMap.values())
      .map(customer => ({
        customer: customer.customer,
        avgDays: customer.speedValues.length ? Math.round(customer.speedValues.reduce((sum, value) => sum + value, 0) / customer.speedValues.length) : null,
        paidPayments: customer.speedValues.length
      }))
      .filter(customer => customer.avgDays !== null)
      .sort((a, b) => b.avgDays - a.avgDays)
      .slice(0, 10);

    const openByClient = new Map();
    openOrders.forEach(order => {
      const name = order.customer?.name || 'Unknown customer';
      const existing = openByClient.get(name) || { client: name, open: 0, overdue: 0, backlog: 'Low', sla: '100%', status: 'good' };
      existing.open += 1;
      if (order.endDate && new Date(order.endDate) < new Date()) existing.overdue += 1;
      openByClient.set(name, existing);
    });
    const operationsTable = Array.from(openByClient.values()).map(row => {
      const overdueRate = row.open ? row.overdue / row.open : 0;
      row.backlog = row.open >= 8 ? 'High' : row.open >= 4 ? 'Medium' : 'Low';
      row.sla = `${Math.max(0, Math.round((1 - overdueRate) * 100))}%`;
      row.status = overdueRate > 0.35 ? 'risk' : overdueRate > 0 ? 'warn' : 'good';
      return row;
    }).sort((a, b) => b.open - a.open).slice(0, 10);

    const completedOnTime = completedOrders.filter(order => !order.endDate || new Date(order.endDate) >= new Date(order.updatedAt || order.createdAt)).length;
    const emergencyJobs = allOrders.filter(order => ['urgent', 'high'].includes(order.priority)).length;
    const scheduledJobs = Math.max(allOrders.length - emergencyJobs, 0);
    const scheduledPercent = allOrders.length ? Math.round((scheduledJobs / allOrders.length) * 100) : 0;
    const slaCompliance = openOrders.length ? Math.round(((openOrders.length - overdueOrders.length) / openOrders.length) * 100) : 100;
    const backlogCleared = currentOrdersSummary.count ? Math.round((completedOrdersSummary.count / currentOrdersSummary.count) * 100) : 0;
    const firstVisitCompletion = completedOrders.length ? Math.round((completedOnTime / completedOrders.length) * 100) : 0;
    const heatmap = allOrders.map(order => {
      const date = new Date(order.startDate || order.createdAt);
      return {
        day: date.getDay(),
        hour: date.getHours(),
        value: 1
      };
    });

    const repMap = new Map();
    completedOrders.forEach(order => {
      const name = order.employee?.name || 'Unassigned';
      const existing = repMap.get(name) || { name, rawRevenue: 0, won: 0, total: 0, cycleValues: [] };
      existing.rawRevenue += order.amount || 0;
      existing.won += 1;
      existing.total += 1;
      const cycle = daysBetween(order.createdAt, order.endDate || order.updatedAt);
      if (cycle !== null) existing.cycleValues.push(cycle);
      repMap.set(name, existing);
    });
    allOrders.forEach(order => {
      const name = order.employee?.name || 'Unassigned';
      if (!repMap.has(name)) repMap.set(name, { name, rawRevenue: 0, won: 0, total: 0, cycleValues: [] });
      repMap.get(name).total += isCompletedStatus(order.status) ? 0 : 1;
    });

    const recurringCustomers = customers.filter(customer => customer.customerType === 'recurring').length;
    const activeCustomers = customers.filter(customer => customer.status === 'active').length;
    const retentionRate = customers.length ? Math.round((activeCustomers / customers.length) * 100) : 0;
    const fastPayCustomers = topCustomers.filter(customer => parseInt(customer.speed, 10) <= 14).length;
    const complaintCustomers = customers.filter(customer => /complaint|issue|unhappy|refund/i.test(customer.notes || '')).length;
    const atRiskUnpaidCustomers = topCustomers.filter(customer => customer.health === 'risk').length;
    const highRiskUnpaid = pendingPayments.map(payment => {
      const age = daysBetween(payment.dueDate || payment.createdAt, new Date()) || 0;
      return {
        label: payment.customer?.name || 'Unknown customer',
        value: age
      };
    }).filter(item => item.value > 0).sort((a, b) => b.value - a.value).slice(0, 8);

    const maintenanceProjects = projects.filter(project => project.status !== 'cancelled');
    const maintenanceCompletion = maintenanceProjects.map(project => ({
      label: project.name,
      value: Math.round(project.progress || 0)
    })).slice(0, 8);
    const technicianUtilization = employees.map(employee => {
      const assigned = allOrders.filter(order => String(order.employee?._id || '') === String(employee._id)).length;
      return {
        label: employee.name,
        value: Math.min(100, Math.round((assigned / Math.max(allOrders.length, 1)) * 100))
      };
    }).sort((a, b) => b.value - a.value).slice(0, 8);

    const pipelineCount = pipelineRecords.length;
    const newLeadsMonthlyMap = new Map();
    pipelineRecords.forEach(record => {
      const created = new Date(record.createdAt);
      const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`;
      newLeadsMonthlyMap.set(key, (newLeadsMonthlyMap.get(key) || 0) + 1);
    });
    const funnel = [
      { label: 'New Leads', value: pipelineCount || allOrders.length, width: 100 },
      { label: 'Qualified', value: pipelineRecords.filter(record => !/lost|cancel|no bid/i.test(record.stageId?.name || '')).length || openOrders.length, width: 80 },
      { label: 'Quoted', value: allOrders.length, width: 62 },
      { label: 'Accepted', value: completedOrders.length + openOrders.length, width: 46 },
      { label: 'Won', value: completedOrders.length, width: 34 }
    ];

    const lostDealMap = new Map();
    allOrders.filter(order => /cancel|lost|no bid/i.test(order.status) || /lost|no bid/i.test(order.pipelineStage || '')).forEach(order => {
      const reason = order.pipelineStage || order.status || 'Lost';
      lostDealMap.set(reason, (lostDealMap.get(reason) || 0) + 1);
    });

    res.json({
      generatedAt: new Date(),
      filters: req.query,
      filterOptions,
      kpis: [
        { label: 'Total Revenue', value: totalRevenue, format: 'currency', icon: 'fa-dollar-sign', trend: percentChange(totalRevenue, previousRevenue), compare: `${percentChange(totalRevenue, previousRevenue)}% vs previous period` },
        { label: 'Revenue Growth %', value: percentChange(totalRevenue, previousRevenue), format: 'percent', icon: 'fa-arrow-trend-up', trend: percentChange(totalRevenue, previousRevenue), compare: 'Compared with previous period' },
        { label: 'Outstanding Payments', value: outstandingPayments, format: 'currency', icon: 'fa-file-invoice-dollar', trend: 0, compare: `${pendingPayments.length} pending payments` },
        { label: 'Open Work Orders', value: openWorkOrders, format: 'number', icon: 'fa-briefcase', trend: 0, compare: `${overdueOrders.length} overdue` },
        { label: 'Average Job Value', value: averageJobValue, format: 'currency', icon: 'fa-receipt', trend: percentChange(averageJobValue, previousAverageJobValue), compare: `${currentOrdersSummary.count} jobs in range` },
        { label: 'Quote Conversion Rate', value: quoteConversionRate, format: 'percent', icon: 'fa-bullseye', trend: Number((quoteConversionRate - previousQuoteConversionRate).toFixed(1)), compare: `${completedOrdersSummary.count} completed of ${currentOrdersSummary.count}` },
        { label: 'Average Payment Time', value: averagePaymentTime, format: 'days', icon: 'fa-clock', trend: 0, compare: `${paymentDays.length} paid payments analyzed` },
        { label: 'Recurring Revenue %', value: recurringRevenuePercent, format: 'percent', icon: 'fa-rotate', trend: 0, compare: `${recurringCustomers} recurring customers` }
      ],
      revenueByService: Array.from(revenueByServiceMap, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      monthlyRevenue: Array.from(monthlyRevenueMap, ([key, value]) => ({ label: compactMonth(new Date(`${key}-02T00:00:00`)), value })),
      yoyRevenue: Array.from(yoyRevenueMap, ([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label)),
      averageJobValue,
      quoteConversionRate,
      recurringSplit: [
        { label: 'Recurring', value: Math.round(recurringRevenuePercent) },
        { label: 'One-time', value: Math.max(0, 100 - Math.round(recurringRevenuePercent)) }
      ],
      paymentSpeedBands,
      aging: Object.entries(agingBuckets).map(([label, value]) => ({ label, value })),
      revenueByProperty: Array.from(revenueByPropertyMap, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8),
      topCustomers,
      repeatJobFrequency,
      avgPayDaysByCustomer,
      profitByCategory: Array.from(profitByServiceMap, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      operations: {
        statusCards: [
          { label: 'Overdue work orders', value: overdueOrders.length, status: getHealth(overdueOrders.length ? 'risk' : 'good') },
          { label: 'Pending client approval', value: openOrders.filter(order => /approval|pending/i.test(order.status)).length, status: 'warn' },
          { label: 'SLA compliance', value: `${slaCompliance}%`, status: getHealth(slaCompliance < 85 ? 'risk' : slaCompliance < 95 ? 'warn' : 'good') }
        ],
        progress: [
          { label: 'Work order backlog cleared', value: backlogCleared },
          { label: 'Emergency jobs share', value: currentOrdersSummary.count ? Math.round((emergencyJobs / currentOrdersSummary.count) * 100) : 0 },
          { label: 'Scheduled jobs share', value: scheduledPercent },
          { label: 'Completed by target date', value: firstVisitCompletion }
        ],
        table: operationsTable,
        overdueWorkOrders: overdueOrders.slice(0, 10).map(order => ({
          orderId: order.orderId,
          customer: order.customer?.name || 'Unknown customer',
          service: order.service,
          dueDate: order.endDate ? new Date(order.endDate).toLocaleDateString('en-US') : 'No due date',
          amount: order.amount || 0,
          status: order.status || 'open'
        })),
        pendingApprovalJobs: openOrders.filter(order => /approval|pending/i.test(order.status)).slice(0, 10).map(order => ({
          orderId: order.orderId,
          customer: order.customer?.name || 'Unknown customer',
          service: order.service,
          amount: order.amount || 0,
          status: order.status || 'pending'
        })),
        timeline: allOrders.slice(0, 8).map(order => ({
          title: `${order.service} - ${order.customer?.name || 'Unknown customer'}`,
          meta: `${order.status} / ${order.priority}`,
          time: new Date(order.updatedAt || order.createdAt).toLocaleDateString('en-US')
        })),
        heatmap
      },
      sales: {
        funnel,
        newLeadsMonthly: Array.from(newLeadsMonthlyMap, ([key, value]) => ({ label: compactMonth(new Date(`${key}-02T00:00:00`)), value })),
        leadSources: [],
        reps: Array.from(repMap.values()).sort((a, b) => b.rawRevenue - a.rawRevenue).slice(0, 4).map(rep => ({
          name: rep.name,
          revenue: rep.rawRevenue,
          close: rep.total ? `${Math.round((rep.won / rep.total) * 100)}%` : '0%',
          cycle: rep.cycleValues.length ? `${Math.round(rep.cycleValues.reduce((sum, value) => sum + value, 0) / rep.cycleValues.length)}d` : 'N/A'
        })),
        lostDeals: Array.from(lostDealMap, ([label, value]) => ({ label, value }))
      },
      customers: {
        retention: [{ label: 'Active', value: retentionRate }, { label: 'Inactive', value: Math.max(0, 100 - retentionRate) }],
        behavior: [
          { label: 'Repeat service customers', value: customers.length ? Math.round((recurringCustomers / customers.length) * 100) : 0 },
          { label: 'Complaint-free accounts', value: customers.length ? Math.round(((customers.length - complaintCustomers) / customers.length) * 100) : 0 },
          { label: 'Fast-pay customers', value: topCustomers.length ? Math.round((fastPayCustomers / topCustomers.length) * 100) : 0 },
          { label: 'At-risk unpaid customers', value: topCustomers.length ? Math.round((atRiskUnpaidCustomers / topCustomers.length) * 100) : 0 }
        ],
        rankings: customers.sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0)).slice(0, 10).map(customer => ({
          customer: customer.name,
          clv: customer.totalSpent || 0,
          repeat: `${customer.totalOrders || 0}x`,
          complaints: /complaint|issue|unhappy|refund/i.test(customer.notes || '') ? 1 : 0,
          health: customer.status === 'active' ? 'good' : 'warn'
        })),
        highRiskUnpaid
      },
      scheduling: {
        maintenance: maintenanceCompletion,
        upcomingMaintenanceByProperty: projects.filter(project => project.startDate && new Date(project.startDate) >= new Date()).sort((a, b) => new Date(a.startDate) - new Date(b.startDate)).slice(0, 10).map(project => ({
          property: project.location || project.name,
          customer: project.customer?.name || 'Unassigned customer',
          date: new Date(project.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          progress: project.progress || 0,
          status: project.status
        })),
        renewals: projects.filter(project => project.endDate && new Date(project.endDate) >= new Date()).sort((a, b) => new Date(a.endDate) - new Date(b.endDate)).slice(0, 8).map(project => ({
          account: project.customer?.name || project.name,
          date: new Date(project.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          value: project.budget || 0,
          status: project.progress >= 75 ? 'good' : project.progress >= 40 ? 'warn' : 'risk'
        })),
        utilization: technicianUtilization,
        heatmap,
        calendar: projects.filter(project => project.startDate || project.endDate).slice(0, 28).map(project => ({
          day: new Date(project.startDate || project.endDate).getDate(),
          label: project.name
        }))
      }
    });
  } catch (error) {
    console.error('Analytics report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get financial report
router.get('/financial', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = buildCreatedAtFilter(startDate, endDate);

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
router.get('/orders', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = buildCreatedAtFilter(startDate, endDate);

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
router.get('/customers', authenticateToken, checkRole(['admin']), async (req, res) => {
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
router.get('/projects', authenticateToken, checkRole(['admin']), async (req, res) => {
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
