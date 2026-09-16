# Agent portal: release and live verification

## Implemented fixes

- Approval provisions an agent profile and sends a password-free approval email. The user record stores provider acceptance/failure and the attempt time; admin approval reports delivery failure without undoing access approval. Reassigning the role retries email.
- Every agent API checks an approved active identity and a non-suspended agent profile before touching protected resources.
- Existing-property invitations have a safe transaction-label fallback.
- Documents offers Summary PDF and Full ZIP. ZIP includes safe generated estimates/invoices, service notes in the summary, stored completion photos, and classified client-facing documents. Its manifest lists missing stored files. Unclassified/internal/vendor documents are excluded. Limits: 250 entries, 10 MB per stored file, 80 MB total.
- Planning guidance uses explicit staff-confirmed vendor availability, matching service/ZIP, current compliance, and no conflicting pending/accepted schedules. Quote dates are not calendar availability. Slots are guidance, not reservations.

## Calendar integration

Authenticated internal staff may publish verified availability through `POST /api/agent-admin/availability-slots` with `vendorId`, `serviceCategory`, `postalCodes` (five-digit ZIP array), `startsAt`, and `endsAt` (ISO timestamps). Withdraw through `POST /api/agent-admin/availability-slots/:id/withdraw`. Normal session authentication and CSRF checks apply.

This is explicit recorded availability, not an external calendar sync. Do not populate guessed slots. When no confirmed slot exists, the portal reports availability as unknown.

Create `VendorAvailabilitySlot` indexes through the deployment's approved index-management process before large-scale rollout. No live database migration was applied during implementation.

## Automated verification

Run from the repository root:

```powershell
node --test backend/tests/agent-final-gaps.test.js backend/tests/agent-portal-backend.test.js backend/tests/agent-portal-ui.test.js backend/tests/agent-client-invitations.test.js backend/tests/agent-service-requests.test.js backend/tests/agent-portal-completion.test.js backend/tests/agent-profile-provisioning.test.js
```

Tests include actual ZIP decompression and routed 403 checks for suspended profiles. Other tests cover model/serializer/permission logic and source regressions; they are not a substitute for the following live journey.

## Required live checks in a test environment

1. Start the backend, confirm the test database and public HTTPS application URL, and use separate staff, agent, and homeowner accounts. Do not seed or migrate a production database for this check.
2. Approve an agent. Confirm profile creation, email acceptance/failure feedback, and actual inbox delivery. Provider acceptance does not prove inbox delivery. Check spam/provider delivery logs if needed.
3. Invite a homeowner with a proposed property; accept with explicit consent. Repeat with an existing authorized property and blank transaction label. Check expired/revoked/replayed links and ownership conflicts.
4. Submit a request with an inspection PDF and photos. Verify homeowner ownership and Service Requests-only lifecycle placement. Confirm the agent cannot approve or pay.
5. Record real availability with the staff API. Check the matching ZIP/service, withdraw the slot, then test a busy or noncompliant vendor. Guidance must not invent availability.
6. Complete work and issue client documents. Download ZIP, open each file, compare contents to authorized records, and check its missing-file manifest. Verify raw vendor quotes, private pricing, credentials, and internal notes are absent.
7. Suspend/deactivate/revoke/expire access. Direct document, ZIP, message, and order requests must fail. Homeowner access remains intact. Check desktop/mobile, keyboard focus, and error states.

## Environment notes

- Project servers were not started for this implementation; the temporary HTTP regression-test server closes automatically.
- No real emails or production records were created by tests.
- Dependency installation reported 11 backend audit findings (3 moderate, 8 high). Review separately before production; no unrelated or breaking automatic fixes were applied.
