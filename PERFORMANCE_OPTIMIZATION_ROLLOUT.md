# Performance V2 rollout

This release keeps all existing APIs for compatibility and adds bounded cursor APIs used by the primary CRM lists.

## Render

The service now installs only `backend` dependencies, uses `/api/health/ready`, keeps a 2–20 MongoDB connection pool, and limits the in-process email worker to three messages per cycle. Keep Render and Atlas in the same or nearest region.

Required Cloudinary variables already used by the deployment enable direct signed uploads. If they are absent, the browser automatically uses the existing authenticated GridFS upload route.

## Atlas migration

From the Render Web Shell at `/project/src`, inspect first:

```bash
npm run migrate:performance-v2
```

Then apply the normalized search backfill and indexes:

```bash
npm run migrate:performance-v2:apply
```

The apply command processes 500 documents per batch, creates model indexes, and prints query execution statistics. It does not delete records or existing indexes.

## Verification

```bash
npm run perf:budget
npm --prefix backend test
```

Production checks:

- `/api/health/ready` returns `200`.
- Dashboard compressed initial resources remain below 500 KB.
- Orders, Customers, Vendors, and Employees return no more than 50 rows per page.
- Pipeline loads 25 cards per stage and shows Load more when applicable.
- Slow requests appear as PII-free `request_performance` JSON log entries.
- Browser `window.HuttaPerformance.metrics` contains navigation, API, LCP, CLS, and long-task measurements.
