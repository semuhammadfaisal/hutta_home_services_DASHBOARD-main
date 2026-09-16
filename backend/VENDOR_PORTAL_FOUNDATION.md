# Vendor Portal foundation

The Vendor Portal uses the existing `Vendor` record. `VendorPortalMembership.userId` is unique, so one login can resolve to exactly one vendor while multiple controlled team users can share that vendor. The browser never supplies a vendor ID for vendor-scoped APIs.

## Lead distribution and bidding

- Staff dispatches a shared Order to 1–20 qualified vendors with `POST /api/incoming-quotes/orders/:orderId/leads/distribute`. The request requires an idempotency key, response deadline, bid deadline, and selected vendor IDs.
- Eligibility uses trade classification, service area, `approved_active` compliance, current license/insurance dates, paused state, rating, and performance score. The full batch is rejected atomically when any selected vendor is ineligible.
- Each vendor receives a separate `QuoteInvitation`, draft `IncomingQuote`, and immutable client-safe snapshot. Customer email/phone, competing vendor identities, raw notes, and internal pricing are excluded.
- Vendors respond through their authenticated portal or a hashed-token quote link. Accepting records a commitment to bid but never assigns the Order. Declines require a controlled reason and explanation.
- Only an accepted, unexpired invitation may submit an estimate. Vendor scope always comes from the authenticated membership or token, never a request vendor ID.
- Schedule `npm run vendor:lead-performance` to record response misses and accepted bids that pass their due date. `VendorPerformanceEvent` dedupe keys make these events idempotent.
- Before release, dry-run `npm run migrate:vendor-leads`, review the counts, and then run `npm run migrate:vendor-leads:apply`.

## Estimate document parsing

- Accepted leads use one responsive estimate workspace on desktop and mobile web. Desktop supports drag-and-drop or file selection; mobile additionally exposes the rear camera.
- PDF, JPEG, PNG, and WebP originals up to 20 MB are signature-checked and retained in private GridFS storage before parsing begins.
- Parsing is optional. Configure `VENDOR_ESTIMATE_PARSER_PROVIDER=http_json`, `VENDOR_ESTIMATE_PARSER_URL`, `VENDOR_ESTIMATE_PARSER_API_KEY`, and optionally `VENDOR_ESTIMATE_PARSER_MODEL`. Without all required provider credentials, the original is preserved and manual entry remains available.
- Parser output is only a draft. Vendors must review/edit scope, category, description, quantity, unit, unit price, calculated line total, notes, availability, access requirements, and attachments, then explicitly confirm submission.
- Submitted vendor line items and original source files remain in the incoming-quote/internal-review workflow. They are not included in residential, commercial, agent, outgoing-quote, or customer-document serializers.

## Assignments, schedules, and completion

- Awarded work remains on the shared Order as an independently identified `vendorAssignments` entry. `JobSchedule`, `VendorWorkOrder`, and `JobCompletion` carry that assignment ID so multiple vendors can work the same Order without seeing each other's assignment, pricing, messages, or evidence.
- Vendors see only the assignment selected by both its assignment ID and the authenticated membership's Vendor ID. Responses never include customer email/phone, other vendors, vendor cost, markup, profit, or margin.
- Schedule acceptance rechecks compliance through the scheduled end and checks the vendor's other confirmed visits for an overlap. Change requests, en-route/in-progress transitions, completion notes, and before/after evidence are audited.
- Completion accepts up to five JPEG, PNG, or WebP files per category at 10 MB each. The assignment's rules decide whether service notes, before photos, and after photos are required.
- Assignment messages are stored in a dedicated vendor/staff relay. Email addresses and US phone numbers are replaced before persistence, and customer/vendor direct contact fields are not serialized.
- ROC, COI, and required workers-compensation dates produce 45-day portal warnings. Expired or visit-period-invalid compliance blocks dispatch and schedule acceptance.
- Before release, dry-run `npm run migrate:vendor-assignments`, review the counts, back up MongoDB, and then run `npm run migrate:vendor-assignments:apply`. This replaces legacy one-order scheduling/completion indexes with assignment-aware partial indexes without deleting records.

## Vendor invoices, payouts, and performance

- One invoice may be submitted per completed vendor assignment. Invoice number, service period, editable line items, declared amount, notes, and an original PDF/image are required and retained in private GridFS storage.
- The server recalculates line totals. Differences from the declared amount, selected vendor estimate, or confirmed service window are accepted only as internal-review flags and are never silently approved.
- The assignment's billing lane is snapshotted on the invoice. Licensed vendors are always `owner_billed`, display `Billed to owner`, and never receive a SMPLfix payout queue. Direct-lane invoices create one Stripe Connect payout record.
- Vendor payout statuses are `pending`, `approved`, `scheduled`, `paid`, `failed`, and `disputed`. Only staff may transition them. Vendor responses may show the Stripe payout reference but never the Connect account ID or bank details.
- The 90-day performance summary is factual and vendor-facing: response timeliness, estimate submission, schedule acceptance, completion documentation, and compliance checklist health. It includes sample sizes and no private ranking, customer rating, internal margin, or hidden performance score.
- Compliance and payout reminders appear in the portal. See `VENDOR_PORTAL_RELEASE_CHECKLIST.md` before production enablement.

## Status lifecycle

`pending` → `compliance_incomplete` → `under_review` → `approved_active`.

Staff may move an application to `rejected` or `suspended`. Only `approved_active` sets the existing `isActive` dispatch flag. Existing approved manual vendors are grandfathered as active by the dry-run-first onboarding migration.

## Required configuration

- `TAX_ID_ENCRYPTION_KEY`: 32-byte AES key encoded as 64 hexadecimal characters or base64.
- `STRIPE_SECRET_KEY`: enables hosted Stripe Connect Express onboarding. SMPLfix stores the connected account ID and provider status flags only.
- `AZ_ROC_VERIFICATION_URL` and `AZ_ROC_VERIFICATION_API_KEY`: optional JSON provider adapter. With neither configured, ROC verification reports `not_configured` and manual review remains available.

## Deployment sequence

1. Back up the database and run `npm run migrate:vendor-onboarding` in dry-run mode.
2. Review portal-status and Tax ID encryption counts.
3. Configure the encryption key and run `npm run migrate:vendor-onboarding:apply` once.
4. Verify Vendor and VendorPortalMembership indexes.
5. Test self-registration, document upload/download, Stripe return/refresh, staff approval, rejection, suspension, and a second team login.
6. Dry-run and apply the vendor-assignment migration, then test two vendors assigned to one Order with overlapping and non-overlapping visits.

Do not put bank information, raw Tax IDs, Stripe secrets, ROC provider credentials, or private vendor notes into portal responses, logs, screenshots, or seed data.
