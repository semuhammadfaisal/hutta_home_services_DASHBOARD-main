const PHOENIX_TIME_ZONE = 'America/Phoenix';
const DAY_MS = 24 * 60 * 60 * 1000;

function phoenixDayNumber(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PHOENIX_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const part = type => Number(parts.find(item => item.type === type)?.value || 0);
  return Math.floor(Date.UTC(part('year'), part('month') - 1, part('day')) / DAY_MS);
}

function daysFromPhoenixToday(value, now = new Date()) {
  const target = phoenixDayNumber(value);
  const today = phoenixDayNumber(now);
  return target === null || today === null ? null : target - today;
}

function completedOrder(order = {}) {
  return Boolean(order.completedAt) || /completed|invoiced|paid|closed/.test(`${order.status || ''} ${order.workflowStatus || ''}`.toLowerCase());
}

function cancelledOrder(order = {}) {
  return /cancel|void|lost/.test(`${order.status || ''} ${order.workflowStatus || ''}`.toLowerCase());
}

function readinessFor(orders = []) {
  const relevant = orders.filter(order => !cancelledOrder(order));
  if (!relevant.length) return { percent: null, label: 'No work pending', completed: 0, total: 0 };
  const completed = relevant.filter(completedOrder).length;
  return { percent: Math.round((completed / relevant.length) * 100), label: `${completed} of ${relevant.length} complete`, completed, total: relevant.length };
}

function riskRank(level) {
  return ({ critical: 0, high: 1, watch: 2, on_track: 3, ready: 4, unknown: 5 })[level] ?? 5;
}

module.exports = {
  PHOENIX_TIME_ZONE,
  cancelledOrder,
  completedOrder,
  daysFromPhoenixToday,
  phoenixDayNumber,
  readinessFor,
  riskRank
};
