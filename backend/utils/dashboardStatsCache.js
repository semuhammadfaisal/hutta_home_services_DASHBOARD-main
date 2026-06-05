const memCache = require('./memoryCache');

const DASHBOARD_STATS_CACHE_PREFIX = 'dashboard:stats:';
const DASHBOARD_STATS_TTL_MS = parseInt(process.env.DASHBOARD_STATS_CACHE_MS || '60000', 10);

function getDashboardStatsCache(key = 'default') {
  return memCache.get(`${DASHBOARD_STATS_CACHE_PREFIX}${key}`);
}

function setDashboardStatsCache(key = 'default', payload, ttlMs = DASHBOARD_STATS_TTL_MS) {
  memCache.set(`${DASHBOARD_STATS_CACHE_PREFIX}${key}`, payload, ttlMs);
}

function invalidateDashboardStatsCache() {
  memCache.clearPrefix(DASHBOARD_STATS_CACHE_PREFIX);
}

module.exports = {
  DASHBOARD_STATS_TTL_MS,
  getDashboardStatsCache,
  setDashboardStatsCache,
  invalidateDashboardStatsCache
};
