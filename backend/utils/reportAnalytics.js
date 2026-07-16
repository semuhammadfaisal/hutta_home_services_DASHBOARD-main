const PAID_STATUSES = new Set(['received', 'completed']);
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled']);

function text(value) {
  return String(value ?? '').trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function idOf(value) {
  return text(value?._id ?? value);
}

function validDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function inRange(value, start, end) {
  const date = validDate(value);
  return Boolean(date && date >= start && date <= end);
}

function customerName(order) {
  return text(order?.customer?.name) || 'Unknown customer';
}

function customerId(order) {
  return idOf(order?.customerId || order?.customer?._id);
}

function orderProfit(order) {
  return number(order.amount) - number(order.vendorCost) - number(order.processingFee);
}

function isActiveOrder(order, excludedOrderIds = new Set()) {
  return !CANCELLED_STATUSES.has(lower(order.status)) &&
    !excludedOrderIds.has(idOf(order._id)) &&
    !excludedOrderIds.has(`pipeline:${idOf(order.pipelineRecordId)}`);
}

function orderMatches(order, filters = {}, context = {}) {
  if (filters.customerId) {
    const selected = context.customersById?.get(filters.customerId);
    const legacyNameMatch = selected && lower(customerName(order)) === lower(selected.name);
    if (customerId(order) !== filters.customerId && !legacyNameMatch) return false;
  }
  if (filters.employeeId && idOf(order.employee) !== filters.employeeId) return false;
  if (filters.vendorId && idOf(order.vendor) !== filters.vendorId) return false;
  if (filters.service && lower(order.service) !== lower(filters.service)) return false;
  if (filters.orderStatus && lower(order.status) !== lower(filters.orderStatus)) return false;
  if (filters.pipelineStageId) {
    const record = context.pipelineByOrderId?.get(idOf(order._id)) || context.pipelineByRecordId?.get(idOf(order.pipelineRecordId));
    if (idOf(record?.stageId) !== filters.pipelineStageId) return false;
  }

  const customer = context.customerForOrder?.(order);
  const addresses = [
    customer,
    ...(customer?.addresses || []),
    { address: order?.customer?.address }
  ].filter(Boolean);
  if (filters.city && !addresses.some(item => lower(item.city) === lower(filters.city))) return false;
  if (filters.state && !addresses.some(item => lower(item.state) === lower(filters.state))) return false;
  if (filters.zip && !addresses.some(item => lower(item.zipCode) === lower(filters.zip))) return false;
  return true;
}

function paymentLines(payment, start, end, warnings) {
  const milestones = Array.isArray(payment.milestones) ? payment.milestones : [];
  if (milestones.length) {
    return milestones.map(milestone => {
      const status = lower(milestone.status);
      const receivedDate = validDate(milestone.receivedDate);
      if (PAID_STATUSES.has(status) && !receivedDate) warnings.missingPaymentDates += 1;
      return {
        status,
        amount: number(milestone.amount),
        collected: PAID_STATUSES.has(status) && Boolean(receivedDate && receivedDate >= start && receivedDate <= end),
        outstanding: status === 'pending',
        date: receivedDate,
        source: milestone.title || payment.invoiceNumber || payment.paymentId
      };
    });
  }

  const status = lower(payment.status);
  const paidDate = validDate(payment.paymentDate);
  if (PAID_STATUSES.has(status) && !paidDate) warnings.missingPaymentDates += 1;
  return [{
    status,
    amount: number(payment.amount),
    collected: PAID_STATUSES.has(status) && Boolean(paidDate && paidDate >= start && paidDate <= end),
    outstanding: status === 'pending',
    date: paidDate,
    source: payment.invoiceNumber || payment.paymentId
  }];
}

function bucketKey(date, rangeDays) {
  const value = validDate(date);
  if (!value) return '';
  if (rangeDays <= 45) return value.toISOString().slice(0, 10);
  return value.toISOString().slice(0, 7);
}

function aggregateRows(items, keyFactory, seedFactory, updater) {
  const map = new Map();
  items.forEach(item => {
    const key = keyFactory(item);
    if (!map.has(key)) map.set(key, seedFactory(item, key));
    updater(map.get(key), item);
  });
  return Array.from(map.values());
}

function buildAnalytics(data, filters, period) {
  const start = period.start;
  const end = period.end;
  const rangeDays = Math.max(1, Math.ceil((end - start) / 86400000));
  const warnings = { missingPaymentDates: 0, legacyCustomerMatches: 0, missingCustomerLinks: 0 };
  const customersById = new Map((data.customers || []).map(customer => [idOf(customer), customer]));
  const customersByName = new Map((data.customers || []).map(customer => [lower(customer.name), customer]));
  const pipelineByOrderId = new Map((data.pipelineRecords || []).filter(record => record.orderId).map(record => [idOf(record.orderId), record]));
  const pipelineByRecordId = new Map((data.pipelineRecords || []).map(record => [idOf(record), record]));
  const excludedOrderIds = new Set(data.excludedOrderIds || []);
  const context = {
    customersById,
    pipelineByOrderId,
    pipelineByRecordId,
    customerForOrder(order) {
      const linked = customersById.get(customerId(order));
      if (linked) return linked;
      const legacy = customersByName.get(lower(customerName(order)));
      if (legacy) warnings.legacyCustomerMatches += 1;
      else warnings.missingCustomerLinks += 1;
      return legacy;
    }
  };

  const orders = (data.orders || []).filter(order =>
    inRange(order.createdAt, start, end) &&
    isActiveOrder(order, excludedOrderIds) &&
    orderMatches(order, filters, context)
  );
  const orderIds = new Set(orders.map(order => idOf(order._id)));
  const payments = (data.payments || []).filter(payment => {
    if (!orderIds.has(idOf(payment.order))) return false;
    return !filters.paymentStatus || lower(payment.status) === lower(filters.paymentStatus) ||
      (payment.milestones || []).some(milestone => lower(milestone.status) === lower(filters.paymentStatus));
  });

  let collectedPayments = 0;
  let outstandingBalance = 0;
  const paymentStatusMap = new Map();
  const outstandingInvoices = [];
  const paymentRecords = [];
  payments.forEach(payment => {
    const lines = paymentLines(payment, start, end, warnings)
      .filter(line => !filters.paymentStatus || line.status === lower(filters.paymentStatus));
    lines.forEach(line => {
      paymentStatusMap.set(line.status || 'unknown', (paymentStatusMap.get(line.status || 'unknown') || 0) + line.amount);
      paymentRecords.push({
        paymentId: idOf(payment._id),
        date: line.date || payment.dueDate || payment.createdAt || '',
        invoice: line.source,
        customer: text(payment.customer?.name) || customerName(payment.order),
        order: text(payment.order?.orderId),
        status: line.status || 'unknown',
        amount: line.amount
      });
      if (line.collected) collectedPayments += line.amount;
      if (line.outstanding) {
        outstandingBalance += line.amount;
        outstandingInvoices.push({
          paymentId: idOf(payment._id),
          invoice: line.source,
          customer: text(payment.customer?.name) || customerName(payment.order),
          order: text(payment.order?.orderId),
          dueDate: payment.dueDate || '',
          amount: line.amount,
          status: 'pending'
        });
      }
    });
  });

  const revenue = orders.reduce((sum, order) => sum + number(order.amount), 0);
  const grossProfit = orders.reduce((sum, order) => sum + orderProfit(order), 0);
  const completedOrders = orders.filter(order => lower(order.status) === 'completed').length;
  const summary = {
    revenue,
    collectedPayments,
    grossProfit,
    profitMargin: revenue ? (grossProfit / revenue) * 100 : 0,
    totalOrders: orders.length,
    completedOrders,
    outstandingBalance,
    averageOrderValue: orders.length ? revenue / orders.length : 0,
    completionRate: orders.length ? (completedOrders / orders.length) * 100 : 0
  };

  const trendMap = new Map();
  orders.forEach(order => {
    const key = bucketKey(order.createdAt, rangeDays);
    const row = trendMap.get(key) || { label: key, revenue: 0, profit: 0 };
    row.revenue += number(order.amount);
    row.profit += orderProfit(order);
    trendMap.set(key, row);
  });
  const ordersByStatus = aggregateRows(orders, order => lower(order.status) || 'unknown', (_item, key) => ({ label: key, value: 0 }), row => { row.value += 1; });
  const revenueByService = aggregateRows(orders, order => text(order.service) || 'Uncategorized', (_item, key) => ({ label: key, value: 0, profit: 0, orders: 0 }), (row, order) => {
    row.value += number(order.amount);
    row.profit += orderProfit(order);
    row.orders += 1;
  }).sort((a, b) => b.value - a.value);

  const customerRows = aggregateRows(orders, order => customerName(order), (item, key) => ({ customerId: customerId(item) || idOf(customersByName.get(lower(key))), customer: key, revenue: 0, profit: 0, orders: 0 }), (row, order) => {
    row.revenue += number(order.amount);
    row.profit += orderProfit(order);
    row.orders += 1;
  }).sort((a, b) => b.revenue - a.revenue);
  const employeeRows = aggregateRows(orders, order => text(order.employee?.name) || 'Unassigned', (item, key) => ({ employeeId: idOf(item.employee), employee: key, revenue: 0, profit: 0, orders: 0, completed: 0 }), (row, order) => {
    row.revenue += number(order.amount);
    row.profit += orderProfit(order);
    row.orders += 1;
    if (lower(order.status) === 'completed') row.completed += 1;
  }).sort((a, b) => b.revenue - a.revenue);
  const vendorRows = aggregateRows(orders, order => text(order.vendor?.name) || 'Unassigned', (item, key) => ({ vendorId: idOf(item.vendor), vendor: key, revenue: 0, cost: 0, profit: 0, orders: 0 }), (row, order) => {
    row.revenue += number(order.amount);
    row.cost += number(order.vendorCost);
    row.profit += orderProfit(order);
    row.orders += 1;
  }).sort((a, b) => b.revenue - a.revenue);
  const recurringOrders = orders.filter(order => order.orderType === 'recurring');

  const eligiblePipeline = (data.pipelineRecords || []).filter(record => {
    if (!inRange(record.createdAt, start, end)) return false;
    if ((data.excludedStageIds || []).includes(idOf(record.stageId))) return false;
    if (filters.pipelineStageId && idOf(record.stageId) !== filters.pipelineStageId) return false;
    if (filters.customerId) {
      const selected = customersById.get(filters.customerId);
      if (!selected || lower(record.customerName) !== lower(selected.name)) return false;
    }
    return true;
  });
  const wonPipeline = eligiblePipeline.filter(record => lower(record.orderId?.status) === 'completed').length;
  summary.pipelineConversion = eligiblePipeline.length ? (wonPipeline / eligiblePipeline.length) * 100 : 0;
  const pipelineStages = aggregateRows(eligiblePipeline, record => text(record.stageId?.name) || 'Unassigned', (item, key) => ({ stageId: idOf(item.stageId), stage: key, records: 0, value: 0 }), (row, record) => {
    row.records += 1;
    row.value += number(record.budget || record.orderId?.amount);
  });

  const records = orders.map(order => {
    const orderPayments = payments.filter(payment => idOf(payment.order) === idOf(order._id));
    const statuses = [...new Set(orderPayments.flatMap(payment => (payment.milestones?.length ? payment.milestones.map(item => lower(item.status)) : [lower(payment.status)])))].filter(Boolean);
    return {
      id: idOf(order._id),
      date: order.createdAt,
      order: order.orderId || order.workOrderNumber || idOf(order._id),
      customer: customerName(order),
      service: order.service || 'Uncategorized',
      employee: order.employee?.name || 'Unassigned',
      vendor: order.vendor?.name || 'Unassigned',
      status: order.status || 'unknown',
      revenue: number(order.amount),
      cost: number(order.vendorCost) + number(order.processingFee),
      profit: orderProfit(order),
      paymentStatus: statuses.join(', ') || 'not invoiced',
      recurring: order.orderType === 'recurring'
    };
  });

  return {
    summary,
    charts: {
      revenueProfitTrend: Array.from(trendMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
      ordersByStatus,
      revenueByService,
      paymentStatus: Array.from(paymentStatusMap, ([label, value]) => ({ label, value }))
    },
    tables: {
      topCustomers: customerRows.slice(0, 10),
      topServices: revenueByService.slice(0, 10),
      employeePerformance: employeeRows.slice(0, 10),
      vendorPerformance: vendorRows.slice(0, 10),
      outstandingInvoices: outstandingInvoices.sort((a, b) => b.amount - a.amount).slice(0, 25),
      paymentRecords: paymentRecords.sort((a, b) => (validDate(b.date)?.getTime() || 0) - (validDate(a.date)?.getTime() || 0)).slice(0, 50),
      pipelineStages,
      recurringServices: aggregateRows(recurringOrders, order => text(order.service) || 'Uncategorized', (_item, key) => ({ service: key, orders: 0, revenue: 0, profit: 0 }), (row, order) => {
        row.orders += 1;
        row.revenue += number(order.amount);
        row.profit += orderProfit(order);
      }).sort((a, b) => b.revenue - a.revenue)
    },
    records,
    dataQuality: {
      warnings: [
        warnings.missingPaymentDates ? `${warnings.missingPaymentDates} paid payment entries were excluded because they have no received date.` : '',
        warnings.legacyCustomerMatches ? `${warnings.legacyCustomerMatches} order matches used legacy embedded customer names.` : '',
        warnings.missingCustomerLinks ? `${warnings.missingCustomerLinks} orders are not linked to a customer record.` : ''
      ].filter(Boolean),
      ...warnings
    }
  };
}

function csvEscape(value) {
  const string = value instanceof Date ? value.toISOString() : text(value);
  if (/^[=+\-@]/.test(string)) return `"'${string.replace(/"/g, '""')}"`;
  return /[",\r\n]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
}

function recordsToCsv(records) {
  const columns = [
    ['date', 'Date'], ['order', 'Order'], ['customer', 'Customer'], ['service', 'Service'],
    ['employee', 'Assigned Employee'], ['vendor', 'Vendor'], ['status', 'Order Status'],
    ['revenue', 'Revenue'], ['cost', 'Cost'], ['profit', 'Profit'], ['paymentStatus', 'Payment Status']
  ];
  return [
    columns.map(([, label]) => csvEscape(label)).join(','),
    ...records.map(record => columns.map(([key]) => csvEscape(record[key])).join(','))
  ].join('\r\n');
}

module.exports = {
  buildAnalytics,
  recordsToCsv,
  orderProfit,
  isActiveOrder,
  orderMatches,
  paymentLines,
  validDate,
  inRange,
  idOf,
  lower,
  number
};
