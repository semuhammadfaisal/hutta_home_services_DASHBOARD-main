# Real Estate Agent Portal Release Checklist

## Data and deployment

- Back up production MongoDB before model/index deployment.
- Deploy the shared `Order`, referral-program, and attachment schema changes.
- Confirm active agent transactions have matching active `PropertyMembership` records.
- Run `npm run seed:agent-demo` first; use `npm run seed:agent-demo:apply` only in an approved demo environment.
- Confirm GridFS is reachable and existing completion/passport documents have persisted `fileId` values.

## Security

- Verify expired and revoked agents receive `404` for package, PDF, photo, document, and message endpoints.
- Confirm archived history contains summary metadata only and no protected URLs.
- Inspect package JSON and PDFs for vendor cost, markup, coordination fees, profit, margin, internal notes, raw vendor estimates, private vendor contacts, tokens, and payment credentials.
- Confirm estimate and invoice PDFs are generated from client-safe projections.
- Confirm message bodies redact email addresses and US phone numbers in both portals.
- Verify agent capabilities never include estimate approval, estimate changes, billing, or payment actions.

## Functional QA

- Complete a vendor closeout with before/after photos and service notes.
- Prepare the transaction package and open every authorized file.
- Confirm invoice and estimate PDFs correspond to the selected transaction/property.
- Send messages agent-to-homeowner and homeowner-to-agent; verify notification delivery and order audit history.
- Confirm referral totals for leads, converted clients/jobs, completed jobs, and configured reward units.
- Advance a test transaction past `accessEndsAt`; confirm it moves to archived history and all protected access stops.

## Accessibility and responsive QA

- Complete keyboard-only navigation through Transactions, Documents, Referrals, Messages, and Notifications.
- Confirm visible focus, labelled selects/textareas, live message updates, empty/error/loading states, and readable status text.
- Test at 390px, 768px, 1024px, and 1440px without clipping or horizontal scrolling.
- Run the focused agent tests and the full regression suite before release.

## Operations

- Monitor package generation latency, PDF failures, GridFS download failures, and message rate-limit events.
- Confirm support owns the process for approved access extensions.
- Confirm retention and privacy policies cover transaction packages, messages, and uploaded inspection/completion records.
