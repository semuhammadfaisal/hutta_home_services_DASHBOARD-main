const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('Orders Overview is derived from the freshly fetched order list', () => {
  const dashboard = read('assets/js/dashboard-script.js');

  assert.match(dashboard, /return await window\.APIService\.getOrdersFresh\(\)/);
  assert.match(
    dashboard,
    /if \(Array\.isArray\(orders\)\) return this\.buildOrdersOverviewFromOrders\(orders\)/
  );
  assert.match(dashboard, /const total = ordersData\s*\? ordersData\.length/);
  assert.doesNotMatch(
    dashboard,
    /if \(stats\.ordersOverview\?\.version === 'real-orders-v2'\)\s*\{\s*return stats\.ordersOverview/
  );
});

test('Weekly Performance groups orders by creation activity date', () => {
  const dashboard = read('assets/js/dashboard-script.js');

  assert.match(dashboard, /Orders created this week/);
  assert.match(
    dashboard,
    /getOrderActivityDateInput\(order\)\s*\{\s*const value = order\?\.createdAt \|\| order\?\.date \|\| order\?\.scheduleDate/
  );
  assert.match(
    dashboard,
    /buildOrdersWeeklyPerformanceSeries[\s\S]*?const dateInput = this\.getOrderActivityDateInput\(order\)/
  );
});

test('pipeline mutations force an Orders Overview refresh from live data', () => {
  const pipeline = read('assets/js/pipeline-mongodb.js');

  assert.match(pipeline, /async function refreshOrdersOverviewFromLiveData\(\)/);
  assert.match(pipeline, /window\.APIService\?\.clearCache\?\.\(\)/);
  assert.match(pipeline, /window\.dashboard\.forceFreshDashboardStats = true/);
  assert.match(
    pipeline,
    /const stageUpdateResponse = await fetch[\s\S]*?if \(!stageUpdateResponse\.ok\)[\s\S]*?await refreshOrdersOverviewFromLiveData\(\)/
  );
});
