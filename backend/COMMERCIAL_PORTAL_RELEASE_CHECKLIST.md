# Commercial Client Portal production release checklist

## Data and migrations

- Run `node migrate-commercial-accounts.js` and review every `needsTierReview` and `needsBillingSnapshotReview` item.
- After review, run the migration with `--apply`; confirm all commercial and warranty indexes build successfully.
- Run `node seed-commercial-demo.js` only for a non-production demo environment. Use `--apply` and `COMMERCIAL_DEMO_USER_EMAIL` to attach the demo portfolio to an existing commercial user.
- Confirm every location has the correct owner, billing contact override, active service agreement, tier, PO rule, and payment roles.

## Authorization and privacy

- Test organization-, portfolio-, and property-scoped users against a second owner’s locations.
- Confirm Tier 1 never receives vendor charges and Tier 2 never receives Tier 3 warranty navigation or documents.
- Confirm consolidated-invoice PDFs require access to every property on the invoice.
- Confirm property managers cannot read organization-wide owner or billing contact lists unless they hold organization-wide authorization.
- Search API JSON and PDFs for vendor cost, raw vendor invoices, markup, profit, margin, private notes, payment credentials, and unscoped owner data.

## Operations

- Commercial approval now requires an explicitly selected/created organization, unless the user already has active organization access. Choose the least-privilege initial membership role in the staff approval dialog. Properties, owners and service agreements still require reviewed setup; approval does not invent them.
- The backend starts the commercial report worker automatically after MongoDB connects. It polls every 15 minutes, prevents overlapping local runs, and uses database claims with one-hour stale-lease recovery. Set `COMMERCIAL_REPORT_SCHEDULER_ENABLED=false` to disable it on a host. No separate desktop automation is needed.
- Verify approval email provider acceptance/failure feedback and actual inbox delivery separately. Reassigning the commercial role retries approval email; acceptance is not an inbox-delivery guarantee.
- Verify estimate review/approval/change requests, scoped user-access editing, job completion photos/notes, and monthly PDF/CSV exports with real test accounts. Retry a request after an interrupted response and confirm the same order returns.
- Current verification uses isolated automated tests, including temporary HTTP routes with mocked records. No production database migration, real email delivery, persistent server startup, or complete browser/database journey has been performed by these tests.

- Confirm monthly report delivery runs in `America/Phoenix`, honors days 1–28, and rechecks property permissions at send time.
- Verify claim coverage, appointments, documents, resolution, and contractor snapshots against the source order.
- Verify notification links resolve to an authorized commercial route and inaccessible records return 404.
- Reconcile invoice totals and canonical payments for each tier before release.

## Quality and rollout

- Run `npm test` from `backend` and resolve any failures introduced by the release.
- Test 1,000-property portfolios for dashboard, activity, documents, invoices, and reports; inspect MongoDB slow-query logs.
- Run keyboard-only, screen-reader, 320 px mobile, tablet, desktop, reduced-motion, offline, empty, error, and expired-access checks.
- Back up MongoDB, deploy to staging, perform a Tier 1/2/3 smoke test, and retain a rollback build.
- Monitor authorization failures, query latency, report-delivery failures, warranty-document errors, and PDF generation after rollout.
