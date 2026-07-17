const express = require('express');
const PDFDocument = require('pdfkit');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const Customer = require('../models/Customer');
const Employee = require('../models/Employee');
const Vendor = require('../models/Vendor');
const Project = require('../models/Project');
const PipelineRecord = require('../models/PipelineRecord');
const Stage = require('../models/Stage');
const authenticateToken = require('../middleware/auth');
const checkRole = require('../middleware/rbac');
const { dateInputToMDT, endOfDayMDT } = require('../utils/timezone');
const { buildAnalytics, recordsToCsv, idOf, lower } = require('../utils/reportAnalytics');
const memCache = require('../utils/memoryCache');

const router = express.Router();
const REPORT_ROLES = ['admin'];
const SORTABLE_RECORD_FIELDS = new Set(['date', 'order', 'customer', 'service', 'employee', 'vendor', 'status', 'revenue', 'cost', 'profit', 'paymentStatus']);
const reportInFlight = new Map();
const REPORT_CACHE_MS = Number(process.env.REPORT_CACHE_MS || 30000);

function defaultPeriod() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 30);
  return { start, end };
}

function parsePeriod(query = {}) {
  if (!query.startDate && !query.endDate) return defaultPeriod();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(query.startDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(query.endDate || '')) {
    const error = new Error('startDate and endDate must both use YYYY-MM-DD');
    error.status = 400;
    throw error;
  }
  const start = dateInputToMDT(query.startDate);
  const end = endOfDayMDT(query.endDate);
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    const error = new Error('The report date range is invalid');
    error.status = 400;
    throw error;
  }
  return { start, end };
}

function parseFilters(query = {}) {
  const allowed = ['customerId', 'employeeId', 'vendorId', 'service', 'orderStatus', 'paymentStatus', 'pipelineStageId', 'city', 'state', 'zip'];
  return allowed.reduce((result, key) => {
    if (query[key] !== undefined && String(query[key]).trim()) result[key] = String(query[key]).trim();
    return result;
  }, {});
}

function uniqueOptions(values) {
  return [...new Set(values.filter(Boolean).map(value => String(value).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function buildFilterOptions({ customers, employees, vendors, stages, allServices, allStatuses }) {
  const addresses = customers.flatMap(customer => [customer, ...(customer.addresses || [])]);
  return {
    customers: customers.map(customer => ({ id: idOf(customer), label: customer.name })).filter(item => item.id && item.label).sort((a, b) => a.label.localeCompare(b.label)),
    employees: employees.map(employee => ({ id: idOf(employee), label: employee.name })).filter(item => item.id && item.label).sort((a, b) => a.label.localeCompare(b.label)),
    vendors: vendors.map(vendor => ({ id: idOf(vendor), label: vendor.name })).filter(item => item.id && item.label).sort((a, b) => a.label.localeCompare(b.label)),
    services: uniqueOptions(allServices),
    orderStatuses: uniqueOptions(allStatuses),
    paymentStatuses: ['bidding', 'pending', 'received', 'completed', 'failed', 'refunded', 'cancelled'],
    pipelineStages: stages.filter(stage => !stage.isNoBid && !/^(lost|no bid|no-bid)$/i.test(stage.name || '')).map(stage => ({ id: idOf(stage), label: stage.name })).sort((a, b) => a.label.localeCompare(b.label)),
    cities: uniqueOptions(addresses.map(address => address.city)),
    states: uniqueOptions(addresses.map(address => address.state)),
    zips: uniqueOptions(addresses.map(address => address.zipCode))
  };
}

async function loadReport(query = {}) {
  const period = parsePeriod(query);
  const filters = parseFilters(query);
  const orderDateMatch = { createdAt: { $gte: period.start, $lte: period.end } };
  const pipelineDateMatch = { createdAt: { $gte: period.start, $lte: period.end } };

  const [customers, employees, vendors, stages, orders, allServices, allStatuses] = await Promise.all([
    Customer.find().select('name city state zipCode addresses').lean(),
    Employee.find({ isActive: true }).select('name role status').lean(),
    Vendor.find({}).select('name category status').lean(),
    Stage.find().sort({ position: 1 }).lean(),
    Order.find(orderDateMatch)
      .select('orderId workOrderNumber customerId customer service amount vendorCost processingFee vendor employee startDate scheduleDate endDate status priority orderType pipelineRecordId pipelineStage createdAt updatedAt')
      .populate('employee', 'name role status')
      .populate('vendor', 'name category status')
      .lean(),
    Order.distinct('service'),
    Order.distinct('status')
  ]);

  const orderIds = orders.map(order => order._id);
  const pipelineRecordIds = orders.map(order => order.pipelineRecordId).filter(Boolean);
  const excludedStages = stages.filter(stage => stage.isNoBid || /^(lost|no bid|no-bid)$/i.test(stage.name || ''));
  const excludedStageIds = excludedStages.map(stage => stage._id);
  const [excludedRecords, pipelineRecords, payments] = await Promise.all([
    excludedStageIds.length ? PipelineRecord.find({ stageId: { $in: excludedStageIds } }).select('orderId').lean() : [],
    PipelineRecord.find({
      $or: [pipelineDateMatch, { orderId: { $in: orderIds } }, { _id: { $in: pipelineRecordIds } }]
    }).populate('stageId', 'name isNoBid position').populate('orderId', 'status amount orderId').lean(),
    Payment.find({ order: { $in: orderIds } })
      .select('paymentId invoiceNumber order customer amount status paymentDate dueDate milestones createdAt updatedAt')
      .populate('order', 'orderId workOrderNumber customer amount status createdAt')
      .populate('customer', 'name email')
      .lean()
  ]);

  const excludedOrderIds = [
    ...excludedRecords.map(record => idOf(record.orderId)).filter(Boolean),
    ...excludedRecords.map(record => `pipeline:${idOf(record)}`).filter(value => value !== 'pipeline:')
  ];
  const analytics = buildAnalytics({
    customers,
    employees,
    vendors,
    stages,
    orders,
    payments,
    pipelineRecords,
    excludedOrderIds,
    excludedStageIds: excludedStageIds.map(idOf)
  }, filters, period);

  const generatedAt = new Date();
  return {
    meta: {
      generatedAt,
      timezone: 'America/Phoenix',
      period: { start: period.start, end: period.end },
      filters,
      definitions: {
        revenue: 'Sum of active order amounts created in the selected period, excluding cancelled and lost/no-bid work.',
        collectedPayments: 'Received/completed payment or milestone amounts whose received date is in the selected period.',
        grossProfit: 'Revenue minus vendor cost and processing fees for qualifying orders.',
        profitMargin: 'Gross profit divided by revenue, expressed as a percentage. Zero revenue returns a zero margin.',
        totalOrders: 'Count of active orders created in the selected period, excluding cancelled and lost/no-bid work.',
        completedOrders: 'Qualifying active orders whose order status is completed.',
        outstandingBalance: 'Pending payment or milestone amounts attached to qualifying orders.',
        averageOrderValue: 'Revenue divided by qualifying orders.',
        completionRate: 'Completed qualifying orders divided by the total qualifying order count.',
        pipelineConversion: 'Eligible non-lost pipeline records with a completed linked order divided by all eligible pipeline records.',
        recurringServices: 'Qualifying orders whose order type is recurring.'
      }
    },
    summary: analytics.summary,
    charts: analytics.charts,
    tables: analytics.tables,
    filterOptions: buildFilterOptions({ customers, employees, vendors, stages, allServices, allStatuses }),
    dataQuality: analytics.dataQuality,
    records: analytics.records
  };
}

function reportCacheKey(query = {}) {
  const ignored = new Set(['page', 'pageSize', 'sort', 'direction', 'format']);
  return `reports:v2:${Object.entries(query).filter(([key]) => !ignored.has(key)).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('&')}`;
}

async function loadReportCached(query = {}) {
  const key = reportCacheKey(query); const cached = memCache.get(key);
  if (cached) return cached;
  if (reportInFlight.has(key)) return reportInFlight.get(key);
  const pending = loadReport(query).then(report => { memCache.set(key, report, REPORT_CACHE_MS); return report; }).finally(() => reportInFlight.delete(key));
  reportInFlight.set(key, pending); return pending;
}

function sortRecords(records, sort = 'date', direction = 'desc') {
  const key = SORTABLE_RECORD_FIELDS.has(sort) ? sort : 'date';
  const modifier = lower(direction) === 'asc' ? 1 : -1;
  return [...records].sort((first, second) => {
    const a = first[key];
    const b = second[key];
    if (typeof a === 'number' || typeof b === 'number') return (Number(a || 0) - Number(b || 0)) * modifier;
    if (key === 'date') return ((new Date(a).getTime() || 0) - (new Date(b).getTime() || 0)) * modifier;
    return String(a || '').localeCompare(String(b || '')) * modifier;
  });
}

function currency(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
}

function writePdf(res, report) {
  const document = new PDFDocument({ margin: 48, size: 'LETTER', info: { Title: 'Hutta Home Services - Reports & Analytics' } });
  document.pipe(res);
  document.fillColor('#0056b8').fontSize(20).text('Hutta Home Services');
  document.fillColor('#172033').fontSize(18).text('Reports & Analytics Executive Summary', { continued: false });
  document.moveDown(0.4).fillColor('#667085').fontSize(9)
    .text(`Period: ${new Date(report.meta.period.start).toLocaleDateString('en-US')} - ${new Date(report.meta.period.end).toLocaleDateString('en-US')}`)
    .text(`Generated: ${new Date(report.meta.generatedAt).toLocaleString('en-US', { timeZone: report.meta.timezone })} (${report.meta.timezone})`);
  document.moveDown();

  const metrics = [
    ['Revenue', currency(report.summary.revenue)],
    ['Collected Payments', currency(report.summary.collectedPayments)],
    ['Gross Profit', currency(report.summary.grossProfit)],
    ['Profit Margin', `${Number(report.summary.profitMargin || 0).toFixed(1)}%`],
    ['Total Orders', String(report.summary.totalOrders)],
    ['Completed Orders', String(report.summary.completedOrders)],
    ['Outstanding Balance', currency(report.summary.outstandingBalance)],
    ['Average Order Value', currency(report.summary.averageOrderValue)]
  ];
  metrics.forEach(([label, value], index) => {
    const x = index % 2 === 0 ? 48 : 310;
    const y = 140 + Math.floor(index / 2) * 44;
    document.roundedRect(x, y, 244, 34, 5).fillAndStroke('#f6f8fb', '#d9e2ef');
    document.fillColor('#667085').fontSize(8).text(label, x + 10, y + 7, { width: 130 });
    document.fillColor('#172033').fontSize(11).text(value, x + 130, y + 6, { width: 100, align: 'right' });
  });
  document.y = 335;
  document.fillColor('#172033').fontSize(13).text('Top services');
  document.moveDown(0.4);
  (report.tables.topServices || []).slice(0, 8).forEach(item => {
    document.fillColor('#344054').fontSize(9).text(`${item.label}: ${currency(item.value)} revenue / ${currency(item.profit)} profit`);
  });
  document.moveDown();
  document.fillColor('#172033').fontSize(13).text('Calculation notes');
  document.moveDown(0.4);
  Object.values(report.meta.definitions).forEach(definition => document.fillColor('#667085').fontSize(8).text(`• ${definition}`, { paragraphGap: 3 }));
  if (report.dataQuality.warnings.length) {
    document.moveDown().fillColor('#b54708').fontSize(10).text('Data quality warnings');
    report.dataQuality.warnings.forEach(warning => document.fontSize(8).text(`• ${warning}`));
  }
  document.end();
}

router.get('/analytics', authenticateToken, checkRole(REPORT_ROLES), async (req, res) => {
  try {
    const report = await loadReportCached(req.query);
    const { records, ...analytics } = report;
    res.json(analytics);
  } catch (error) {
    console.error('Analytics report error:', error);
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Reports could not be loaded' });
  }
});

router.get('/records', authenticateToken, checkRole(REPORT_ROLES), async (req, res) => {
  try {
    const report = await loadReportCached(req.query);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(10, Number.parseInt(req.query.pageSize, 10) || 25));
    const sorted = sortRecords(report.records, req.query.sort, req.query.direction);
    const start = (page - 1) * pageSize;
    res.json({
      meta: report.meta,
      rows: sorted.slice(start, start + pageSize),
      pagination: { page, pageSize, total: sorted.length, pages: Math.max(1, Math.ceil(sorted.length / pageSize)) }
    });
  } catch (error) {
    console.error('Report records error:', error);
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Report records could not be loaded' });
  }
});

router.get('/export', authenticateToken, checkRole(REPORT_ROLES), async (req, res) => {
  try {
    const report = await loadReportCached(req.query);
    const stamp = new Date().toISOString().slice(0, 10);
    if (lower(req.query.format) === 'csv') {
      const csv = recordsToCsv(sortRecords(report.records, req.query.sort, req.query.direction));
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="hutta-report-details-${stamp}.csv"`,
        'Cache-Control': 'private, no-store'
      });
      return res.send(`\uFEFF${csv}`);
    }
    if (lower(req.query.format) === 'pdf') {
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="hutta-report-summary-${stamp}.pdf"`,
        'Cache-Control': 'private, no-store'
      });
      return writePdf(res, report);
    }
    return res.status(400).json({ message: 'format must be csv or pdf' });
  } catch (error) {
    console.error('Report export error:', error);
    if (!res.headersSent) res.status(error.status || 500).json({ message: error.status ? error.message : 'Report export could not be generated' });
  }
});

// Legacy endpoints remain available for older clients while using the trusted report contract.
router.get('/financial', authenticateToken, checkRole(REPORT_ROLES), async (req, res) => {
  try {
    const report = await loadReportCached(req.query);
    res.json({
      totalRevenue: report.summary.revenue,
      totalPayments: report.summary.collectedPayments,
      pendingPayments: report.summary.outstandingBalance,
      completedOrders: report.summary.completedOrders
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Server error' });
  }
});

router.get('/orders', authenticateToken, checkRole(REPORT_ROLES), async (req, res) => {
  try {
    const report = await loadReportCached(req.query);
    res.json({ statusBreakdown: report.charts.ordersByStatus, monthlyOrders: report.charts.revenueProfitTrend });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Server error' });
  }
});

router.get('/customers', authenticateToken, checkRole(REPORT_ROLES), async (_req, res) => {
  try {
    const [customerTypes, topCustomers] = await Promise.all([
      Customer.aggregate([{ $group: { _id: '$customerType', count: { $sum: 1 } } }]),
      Customer.find().sort({ totalSpent: -1 }).limit(10).select('name email totalSpent totalOrders').lean()
    ]);
    res.json({ customerTypes, topCustomers });
  } catch (_error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/projects', authenticateToken, checkRole(REPORT_ROLES), async (_req, res) => {
  try {
    const [statusBreakdown, budgetAnalysis] = await Promise.all([
      Project.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Project.aggregate([{ $group: { _id: null, totalBudget: { $sum: '$budget' }, totalActualCost: { $sum: '$actualCost' }, avgProgress: { $avg: '$progress' } } }])
    ]);
    res.json({ statusBreakdown, budgetAnalysis: budgetAnalysis[0] || { totalBudget: 0, totalActualCost: 0, avgProgress: 0 } });
  } catch (_error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
module.exports.__test = { parsePeriod, parseFilters, sortRecords, buildFilterOptions, writePdf };
