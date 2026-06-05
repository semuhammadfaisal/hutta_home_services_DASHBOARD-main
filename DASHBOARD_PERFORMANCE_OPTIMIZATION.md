# Dashboard Performance Optimization

## Data Flow Audit

Initial dashboard load previously called multiple aggregate-like and collection endpoints:

- `/api/orders/stats`: KPI totals.
- `/api/vendors`: vendor count and category breakdown.
- `/api/employees`: employee leaderboard.
- `/api/pipeline-records/kpi/payments-collected`: payments collected.
- Deferred overview load:
  - `/api/orders?limit=5000`: employee leaderboard, revenue overview, financial overview, workflow counts, recent activity.
  - `/api/customers?limit=5000`: customer count fallback and top customers.
  - `/api/payments?limit=5000`: financial overview.

The dashboard overview now loads from:

- `/api/dashboard/stats`: KPI totals, payments collected, pending payments, monthly growth, workflow counts, vendor category counts, employee leaderboard, recent activity, revenue timeline, financial summary, and top customers.

Full collection endpoints remain available for their respective pages and user-initiated workflows.

## New Endpoint

`GET /api/dashboard/stats`

Returns only aggregate data required by the dashboard overview. The endpoint uses MongoDB aggregate queries, `countDocuments`, limited recent records, and a small grouped revenue timeline instead of loading thousands of orders, customers, payments, vendors, or employees into the browser.

The endpoint supports optional top-customer date filters:

- `topStartDate=YYYY-MM-DD`
- `topEndDate=YYYY-MM-DD`

## Caching

Dashboard stats are cached server-side for 60 seconds by default.

Config:

- `DASHBOARD_STATS_CACHE_MS`

Cache invalidation runs after mutations to:

- Orders
- Customers
- Vendors
- Employees
- Payments
- Pipeline records
- Pipeline stages

Pipeline invalidation is included because payments collected and NO BID exclusions depend on stage and pipeline record state.

## Before vs After

Before:

- `/orders?limit=5000`: about 2.25s
- `/customers?limit=5000`: about 1.29s
- `/payments?limit=5000`: about 1.52s
- Initial overview also fetched vendors, employees, order stats, and payment KPI separately.

After:

- Initial dashboard overview uses one stats request: `/api/dashboard/stats`.
- Large list requests are removed from the dashboard boot path.
- Top Customers uses aggregated stats, including date filtering, rather than full customers and orders.
- Revenue and financial overview first paint use aggregate summaries.

Expected impact:

- Fewer initial network requests.
- Less database read volume.
- Smaller JSON payloads.
- Lower browser memory usage and fewer overview re-renders.
- Better scalability for 10,000+ records.

## Verification

Syntax checks passed for:

- `backend/routes/dashboard.js`
- `backend/server.js`
- `assets/js/api-service.js`
- `assets/js/dashboard-script.js`
- `assets/js/top-customers.js`

Runtime API timing should be measured against a connected database in the deployment environment.
