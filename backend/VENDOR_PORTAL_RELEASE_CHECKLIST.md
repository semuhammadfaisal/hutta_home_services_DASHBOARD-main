# Vendor Portal release checklist

## Database and configuration

- Back up MongoDB, run `npm run migrate:vendor-assignments`, review counts, then run `npm run migrate:vendor-assignments:apply`.
- Confirm the legacy one-order schedule/completion indexes were replaced and VendorInvoice/VendorPayout unique indexes exist.
- Confirm `STRIPE_SECRET_KEY` is configured in the deployment environment and each direct-lane vendor completed hosted Stripe Connect onboarding.
- Never store or log bank account or routing details. Only the Connect account identifier and payout reference may be retained.

## Financial authorization

- Verify a vendor cannot list, submit, or download another vendor's invoice or assignment.
- Verify team members without the `invoices` permission cannot see invoice forms or financial endpoints.
- Verify only completed, authorized assignments accept one invoice and duplicate assignment, invoice-number, and document-hash submissions return 409.
- Verify server-calculated line totals drive the invoice and discrepancies create internal-review flags.
- Verify licensed vendors and owner-billed assignments display `Billed to owner` and create no VendorPayout.
- Verify direct-lane invoices create one pending payout and only staff can approve, schedule, pay, fail, or dispute it.
- Verify payout responses contain no Stripe Connect account ID, bank details, internal margin, markup, customer payment credentials, or other vendors.

## Operational QA

- Test PDF, JPEG, PNG, and WebP uploads, malformed signatures, the 15 MB limit, and authorized downloads.
- Test pending, approved, scheduled, paid, failed, and disputed payout presentation with Stripe Connect references.
- Test COI, ROC, and workers-compensation reminders at 45, 14, 0, and expired days.
- Test performance metrics with zero data and realistic 90-day activity; confirm no rankings, internal scores, customer financials, or margin appear.
- Run `npm run seed:vendor-billing-demo -- --vendor-email=demo@example.com` first in dry-run mode; add `--apply` only in an approved non-production environment.

## Accessibility and responsive QA

- Complete keyboard-only invoice line creation/removal, file selection, submission, downloads, and refresh controls.
- Confirm visible focus, descriptive labels, live status messages, error association, and progress accessible names.
- Check 320 px, 375 px, 768 px, 1024 px, and wide desktop layouts with browser zoom at 200%.
- Check mobile camera/file selection and ensure tables/cards do not create horizontal page overflow.

## Release verification

- Run focused vendor billing, assignment, estimate, lead, scheduling, and security tests.
- Review audit events for invoice submission, invoice review, payout transitions, completion, messaging, and schedule decisions.
- Confirm GridFS backups and retention cover original vendor invoices and completion evidence.
- Confirm support staff know how to resolve mismatch flags and failed/disputed payouts before enabling production submissions.
