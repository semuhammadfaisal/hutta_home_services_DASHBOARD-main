# Residential Client Portal Release Checklist

## Before deployment

- [ ] Back up MongoDB and confirm a tested restore point.
- [ ] Deploy application code before creating demo data; the new collections are additive.
- [ ] Confirm MongoDB created the unique property-profile and account-profile indexes.
- [ ] Run `npm run seed:residential-demo` as a dry run; use `npm run seed:residential-demo:apply` only in an approved demo environment.
- [ ] Configure `STRIPE_SECRET_KEY` and the existing HTTPS public application URL for hosted card management.
- [ ] Confirm GridFS is available for Property Passport document uploads.

## Security gates

- [ ] Run `node --test tests/residential-*.test.js` from `backend`.
- [ ] Verify a residential user cannot retrieve another account's property, order, message, utility, Passport document, estimate, invoice, or receipt by ID.
- [ ] Verify users without `manageProperty`, `requestService`, `approveEstimates`, or `manageBilling` cannot perform the corresponding mutation.
- [ ] Confirm auto-approval cannot be enabled without the current consent text, checkbox, and typed name.
- [ ] Confirm all downloadable PDFs and portal JSON omit vendor cost, markup, coordination fee, processing cost, profit, margin, internal notes, private vendor contacts, tokens, and audit-only metadata.
- [ ] Confirm message responses expose role labels only—never customer/vendor email or phone numbers.
- [ ] Confirm Passport files use authenticated property-membership download routes and `Cache-Control: private, no-store`.

## Product and accessibility QA

- [ ] Test every portal route with loading, empty, error, unauthorized, and offline states.
- [ ] Complete keyboard-only navigation, form submission, dialog, focus-visible, and screen-reader label checks.
- [ ] Check 390 px mobile, 768 px tablet, and desktop layouts for overflow and readable touch targets.
- [ ] Validate Arizona dates in `America/Phoenix` and seasonal cards for the current month.
- [ ] Verify notification preferences, Autopilot audit history, utility activity, Passport activity, and message activity are recorded.
- [ ] Confirm referral links resolve to the signup page and do not expose customer identifiers.

## Release and rollback

- [ ] Smoke-test Residential login routing while confirming internal users still reach the Admin Dashboard.
- [ ] Monitor API 4xx/5xx rates, upload failures, and Stripe hosted-session failures after release.
- [ ] Roll back application code if necessary; additive residential feature collections can remain without affecting existing CRM/order workflows.
# Add Property deployment

- Review `node migrate-residential-properties.js` in dry-run mode, then apply the migration with `--apply` to create property/customer uniqueness indexes (`autoIndex` is disabled).
- Use MongoDB replica-set/Atlas transactions; property, customer, membership, activity and audit creation must commit together.
- Verify Properties → Add property from an active residential login with no properties and from an existing homeowner account.
- Verify repeated submissions return the already-connected property; an unrelated existing address returns staff review without exposing its owner.
- Legacy customer email matches require existing authorized homeowner membership or staff linking, not automatic access by email.
- Authority confirmation is a declaration, not independent legal ownership verification. Address aliases and disputed ownership require staff review.
