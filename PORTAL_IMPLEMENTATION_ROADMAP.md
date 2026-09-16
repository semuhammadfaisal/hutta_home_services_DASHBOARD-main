# SMPLfix Portal Implementation Roadmap

## Purpose

This document converts the client requirements into a safe, sequential implementation plan for the existing SMPLfix application.

SMPLfix should remain **one connected system** with shared customers, properties, orders, vendors, quotes, schedules, invoices, payments, documents, and activity records. The five portals are role- and relationship-based views over that shared data. They must not become five separate applications or databases.

## Portal Count

SMPLfix requires five primary portal/dashboard experiences:

1. Residential Client Portal
2. Real Estate Agent Portal
3. Commercial Client Portal (Tier 1, Tier 2, and Tier 3)
4. Vendor Portal
5. Internal/Admin Dashboard

The Government Contracts functionality is **not a sixth portal**. It is an optional compliance layer inside the Internal/Admin Dashboard that activates for government contracts.

## Non-Negotiable Architecture Rules

- Keep the existing Express, MongoDB/Mongoose, and frontend application.
- All portals must read from the same canonical order and workflow records.
- Never expose vendor cost, markup, coordination-fee calculations, processing cost, profit, or margin through a customer-, agent-, commercial-, or vendor-facing API.
- Enforce private-field removal in server-side serializers or explicit projections. Hiding fields with HTML or CSS is not security.
- A user role controls general capability; memberships and assignments control which records the user may access.
- Every protected query must be scoped on the server. The frontend must never download all records and filter them in the browser.
- Homeowners own their accounts and properties. An agent receives limited, revocable, property-specific access.
- Agent access expires when a transaction closes. The homeowner keeps the account and its history.
- Commercial tier belongs to a property/account service agreement, not necessarily to the login user.
- Contractor name and ROC license number on customer documents must come from the selected Vendor record.
- Preserve the existing Internal/Admin CRM and its routes while portal-safe APIs are introduced.
- Add automated authorization and data-leakage tests before exposing any portal in production.

## Recommended Overall Build Sequence

| Sequence | Deliverable | Why it comes here |
|---:|---|---|
| 0 | Shared portal foundation and security | Every external portal depends on safe authentication, first-class properties, memberships, invitations, and serializers. |
| 1 | Residential Client Portal | This is the client's first priority and establishes the customer-owned account and property experience. |
| 2 | Real Estate Agent Portal | It reuses residential accounts and properties, adding portfolios, transactions, invitations, and expiring permissions. |
| 3 | Commercial Client Portal | It reuses the multi-property foundation and adds tiers, account users, PO numbers, consolidated billing, and reports. |
| 4 | Vendor Portal | It connects assignments, bidding, estimates, schedules, completion evidence, invoices, payments, and compliance. |
| 5 | Internal/Admin Dashboard expansion | Complete operational controls and visibility for all new portal activity. |
| 6 | Government Contracts compliance layer | Add government-only records and workflows after the shared order, assignment, scheduling, document, and accounting foundations are stable. |

Do not begin visual portal pages before Sequence 0 is complete. Static mockups may be designed earlier, but they must not be connected to unsafe internal APIs.

---

# Sequence 0: Shared Portal Foundation

This is common infrastructure, not an additional portal.

## Required shared data model

- Extend user identity to support internal staff, residential clients, commercial users, real estate agents, and vendors without weakening current internal RBAC.
- Add a first-class `Property` model instead of treating addresses as the only property record.
- Add account/property memberships with permission flags and lifecycle status.
- Add agent-client invitations and secure, expiring, single-use invitation tokens.
- Add real-estate `Transaction` records with property, client, agent, close date, status, and access expiry.
- Add commercial account/service-agreement records with tier and billing configuration per property or portfolio.
- Link orders to a canonical property while retaining existing customer snapshots for historical documents.
- Add a shared activity/audit-event model suitable for portal timelines.
- Add notification preferences and delivery/audit records.
- Create explicit serializers for internal, residential, agent, commercial, and vendor audiences.

## Shared-foundation completion gate

- Existing internal users can still sign in and use the CRM.
- Portal users are routed by the authenticated server-side identity, not a trusted dropdown value.
- A portal user cannot read another customer's, agent's, commercial account's, or vendor's data by changing a URL ID.
- No external serializer returns private pricing fields.
- Invitations expire, are single-use, and are stored as hashes rather than raw tokens.
- Authorization and isolation tests pass.

---

# Portal 1: Residential Client Portal

## Scope

The residential experience is the core polished customer portal. It supports one or more properties and provides a fast, simple path from service request to completed and paid job history.

## Main features

- Welcome/onboarding and secure login
- Multiple-property switcher
- Property overview and property details
- Active jobs with status and scheduled date
- Estimates awaiting approval, displayed prominently
- Customer-only estimate approval and change-request flow
- Saved payment methods and expired-card update flow
- Invoice history, receipts, and downloadable PDFs
- Job history with before/after photos and service notes
- New service request and emergency request flows
- Book Again for completed work
- Activity feed and notifications center
- Cancel/reschedule requests
- Vendor message relay without direct contact exposure
- Autopilot score, maintenance plan, approval threshold, and seasonal recommendations
- Property Passport/document vault
- Referral program
- Account profile, property information, preferences, and subscription details

## Five implementation prompts

### Residential Prompt 1 of 5 — Secure account, property, and portal APIs

> Inspect the existing SMPLfix Express/Mongoose authentication, User, Customer, Order, quote, scheduling, closeout, invoice, payment, attachment, and notification code before editing. Implement the backend foundation for the Residential Client Portal without replacing the existing CRM. Add or extend models so an authenticated residential user owns or belongs to one or more first-class properties, and migrate/link existing customer addresses safely. Create residential-scoped API routes that only return the authenticated customer's properties, orders, estimates, schedules, invoices, completion photos, documents, and activity. Use explicit residential serializers/projections that can never return vendorCost, markup, coordination fees, processing costs, profit, margin, internal notes, vendor private contact details, tokens, or audit-only fields. Do not reuse raw internal order responses. Preserve existing internal behavior, validate all IDs, prevent cross-account IDOR access, add indexes, and add automated model, authentication, serializer, and authorization tests. Do not build the portal UI in this step.

### Residential Prompt 2 of 5 — Dashboard shell and property experience

> Using the residential APIs completed in the previous step, build a responsive, accessible SMPLfix Residential Client Portal shell that is visually consistent with the existing brand but separate from the Internal/Admin Dashboard. Add server-controlled post-login routing for residential users. Build the Home dashboard with a property switcher, autopilot/property-health summary placeholder, estimates needing action, active jobs, next scheduled visit, Book Again, recent activity, and a prominent Request Service action. Build Properties pages for property details and service history. Include loading, empty, error, offline, and unauthorized states; keyboard navigation; visible focus states; mobile layouts; and reusable components. Never derive permissions from a portal dropdown or URL parameter. Add frontend and route tests and verify that internal users still reach the existing admin dashboard.

### Residential Prompt 3 of 5 — Service request, emergency request, and scheduling actions

> Implement the Residential Client Portal request workflows on top of the shared Order model. Add a standard New Request flow with property selection, service category, issue chips, description, urgency, preferred timing, access instructions, and image/document uploads. Add a separate prominent Emergency Request path that creates a priority-flagged request and clearly communicates that submission does not guarantee emergency dispatch. Add Book Again from eligible completed orders without copying stale schedule, price, or vendor assignment data. Add customer cancel/reschedule-request actions governed by server-side status rules and audit every change. Connect new requests to the existing intake/workflow pipeline rather than creating a parallel order system. Add validation, upload limits, duplicate-submit protection, rate limiting where appropriate, activity events, notifications, and end-to-end tests.

### Residential Prompt 4 of 5 — Estimates, jobs, completion records, invoices, and payments

> Complete the transactional Residential Client Portal experience using the existing outgoing quote, scheduling, closeout, invoice, and payment foundations. Build an estimates list and estimate detail/approval experience, ensuring only an authorized client—not an agent—can approve or request changes. Build active job details with scheduled date/window, safe vendor identity, and the workflow tracker: request received, estimate, approved, scheduled, en route when supported, in progress, completed, invoiced, and paid. Add before/after photo and service-note review. Add invoice and receipt history with authorized PDF downloads. Integrate saved-card management through the selected payment provider's hosted/tokenized flow so raw card data never touches SMPLfix servers. Ensure contractor name and ROC number are populated from the Vendor record. Add authorization, state-transition, PDF-access, and private-pricing leakage tests.

### Residential Prompt 5 of 5 — Autopilot, documents, communication, referrals, and release QA

> Finish the Residential Client Portal with Autopilot Management, maintenance calendar, per-service toggles, configurable auto-approval thresholds with explicit consent and audit history, Arizona seasonal maintenance recommendation cards, Property Passport/document vault, notification center and preferences, order-scoped vendor message relay that hides direct contact information, utility-tracker data-entry foundation, referral link/history/rewards view, and account settings. Treat sensitive documents and messages as server-authorized resources. Add accessibility checks, responsive visual QA, security regression tests, activity/audit coverage, realistic seed/demo data, and a release checklist. Confirm every residential endpoint is scoped to the signed-in user's memberships and verify through automated tests that internal financial fields never appear in JSON or downloadable customer documents.

## Residential portal completion definition

- A homeowner can independently manage properties, requests, estimates, schedules, job history, invoices, payment methods, documents, and preferences.
- The experience works on desktop and mobile.
- No internal financial or vendor-private data is exposed.
- Existing internal CRM workflows remain connected and functional.

---

# Portal 2: Real Estate Agent Portal

## Scope

The agent portal is a dedicated, marketable experience built over the same residential properties and orders. Agents think in clients, properties, transactions, and closing deadlines—not internal work-order administration.

## Permission rules

Agents may:

- Invite clients into their portfolio
- View only linked clients, properties, and transactions
- Request work for an authorized property
- Upload inspection reports and relevant transaction documents
- View job and open-item status
- See estimate turnaround indicators and scheduling availability when provided
- Download completion documentation prepared for the transaction file
- Give operational direction through logged messages
- View referral attribution and history

Agents may not:

- Approve or reject customer estimates
- Add, update, or use client payment methods
- Pay invoices or view full card/payment details
- See vendor costs, markup, fees, margin, raw vendor quotes, or internal notes
- Access a property after their permission expires unless renewed by an authorized party
- Own the homeowner's permanent account or property record

## Five implementation prompts

### Agent Prompt 1 of 5 — Portfolio, transaction, membership, and invitation backend

> Inspect and build on the completed shared foundation and Residential Portal models. Implement Real Estate Agent identities, portfolios, transactions, property-scoped memberships, referral attribution, and invitations without creating duplicate customer or property records. An agent invitation must use a cryptographically secure, hashed, single-use token with an expiration and auditable accepted/revoked states. A homeowner must own and retain the account; accepting an invitation grants the agent only the configured property and transaction permissions. Store close date and calculate access expiry from transaction rules, while supporting explicit staff-approved extension/revocation. Create agent-scoped serializers and APIs for permitted clients, properties, transactions, orders, safe status information, documents, messages, and referrals. Prevent approval/payment capabilities and cross-portfolio access at the server level. Add comprehensive IDOR, expiry, invitation-replay, serializer, and role tests.

### Agent Prompt 2 of 5 — Agent dashboard, portfolio, and transaction UI

> Build the responsive Real Estate Agent Portal using only the agent-scoped APIs. Add server-controlled routing after login and a dedicated navigation structure for Overview, Portfolio, Transactions, Requests, Documents, Referrals, Notifications, and Account. The Overview must emphasize transactions, days until close, at-risk deadlines, open items, next appointments, and recent activity. Portfolio must group customers and their authorized properties without exposing unrelated homeowner data. Transaction detail must show close date, countdown, property, client, open work items, statuses, deadlines, and completion readiness. Add search/filtering, accessible loading/empty/error/expired-access states, desktop/mobile QA, and route tests. Do not copy the Internal Dashboard or expose internal order-management controls.

### Agent Prompt 3 of 5 — Invitations and client onboarding

> Implement the complete agent-to-client invitation experience. Allow an authorized agent to create an invitation for a new or existing homeowner, choose or propose a property, attach it to a transaction, enter the close date, and copy/send an invite link. On acceptance, require the homeowner to sign in or create their own residential account, confirm property information, and explicitly approve the agent relationship and permission scope. Handle existing emails, duplicate invitations, already-linked properties, expired links, revoked links, and ownership conflicts safely. Show pending, accepted, expired, and revoked invitations in the agent portal. Allow homeowners and authorized internal staff to revoke access. Add notification/activity events and end-to-end tests proving that the agent never receives the homeowner password or payment authority.

### Agent Prompt 4 of 5 — Requests, inspection reports, deadlines, and status tracking

> Add agent-authorized service requests to the shared Order/intake pipeline. An agent must select an authorized transaction/property, service category, scope, urgency, target completion deadline, preferred timing, and may upload an inspection report or supporting photos. Store who submitted the request and preserve homeowner ownership. Parse/store the inspection report as a protected document; if AI extraction is implemented, require a human review screen and retain the original file. Show estimate-turnaround guidance and next scheduling availability only from real backend data, never invented frontend estimates. Give agents read-only client-facing estimate status but no approval action. Build deadline-risk indicators based on close date, order state, and confirmed schedule. Add validation, audit events, notifications, file authorization, and tests for expired or revoked agent access.

### Agent Prompt 5 of 5 — Transaction package, referrals, communication, and release QA

> Finish the Real Estate Agent Portal with completion-document packaging for a transaction file, referral attribution/history, and order-scoped communication. Generate an authorized transaction package containing client-safe estimates/invoices where permitted, completion summaries, before/after photos, service notes, and relevant warranties or documents; exclude payment credentials, private vendor data, raw vendor estimates, internal notes, and internal financial fields. Add a referral dashboard showing leads, converted clients/jobs, and configured rewards without exposing customer financial details. Add logged message relay and notifications. Automatically expire access when the transaction closes and clearly show archived referral/transaction history without allowing protected record access. Complete accessibility, responsive visual QA, security regression tests, realistic demo data, and a production release checklist.

## Agent portal completion definition

- Agents can manage portfolios and transactions and can guide work without owning the homeowner account.
- Invitations and expiring access work securely.
- Approval and payment actions remain exclusively with authorized clients.
- Referrals are attributable without weakening privacy.

---

# Portal 3: Commercial Client Portal

## Scope

The commercial experience is organized around portfolios and properties. It supports property managers and multi-owner arrangements without treating property management as a separate account type.

## Tier behavior

- **Tier 1 — Coordination:** Client pays vendors directly and sees SMPLfix coordination-fee invoices only.
- **Tier 2 — Managed Services:** Client receives one consolidated invoice per billing period and monthly summary reporting.
- **Tier 3 — Full Service:** Includes Tier 2 plus warranty-claim management and additional SMPLfix cost/schedule ownership according to the contract.
- Different properties under the same portfolio may use different tiers, owners, billing contacts, PO rules, and invoice destinations.

## Five implementation prompts

### Commercial Prompt 1 of 5 — Commercial accounts, portfolios, properties, tiers, and permissions

> Extend the shared account/property foundation for Commercial Client accounts without creating a separate order database. Model commercial organizations, portfolios, properties/locations, owners, billing contacts, account users, per-property roles, service agreements, and Tier 1/2/3 configuration. Support one user across multiple organizations and properties with different permissions. Store tier and billing rules at the appropriate service-agreement/property level rather than only on the user. Add PO requirements and authorized approval/payment roles. Create commercial-scoped API routes and serializers that exclude all internal pricing, vendor-cost, markup, margin, internal-note, and unrelated-property data. Add indexes, migration/backfill strategy, IDOR tests, tier-entitlement tests, and tests for users with mixed access across properties.

### Commercial Prompt 2 of 5 — Portfolio-first dashboard and property operations

> Build a responsive Commercial Client Portal using only commercial-scoped APIs. Organize the experience around portfolios and properties rather than individual jobs. Add Overview, Properties, Open Orders, Invoices, Reports, Users, Warranty Claims when entitled, Notifications, and Account sections. Overview must show property count, open orders across authorized properties, current-period client spend, urgent items, estimates requiring authorized action, and recent activity. Properties must show each location, its service tier, open-order count, upcoming visits, spend, and status, with a property detail view for orders and history. Add search, filters, property/portfolio switching, accessibility, loading/empty/error states, responsive QA, and entitlement-driven navigation enforced by the server.

### Commercial Prompt 3 of 5 — Orders, PO numbers, account users, and approval permissions

> Implement commercial service requests and order management on the shared Order workflow. Require/select a property and service agreement, capture a PO number when the property's configuration requires it, and preserve owner/billing attribution. Add account-user administration so authorized commercial administrators can invite users and assign least-privilege permissions per organization, portfolio, or property for viewing, requesting, approving, billing, reporting, and user management. Prevent self-escalation and require server-side checks for every action. Ensure tier rules control available actions and information. Add secure invitations, audit logs, notifications, validation, duplicate protection, and end-to-end authorization tests for mixed-property and mixed-role users.

### Commercial Prompt 4 of 5 — Tier-aware invoicing and reports

> Implement tier-aware commercial billing views using canonical invoices and payments. Tier 1 must show only SMPLfix coordination-fee invoices because vendors bill the client directly. Tier 2 and Tier 3 must support one consolidated client invoice per configured period, with property-level breakdown and consolidated totals. Never expose the underlying vendor cost, raw vendor invoice, markup, profit, or margin. Build invoice lists, authorized PDF downloads, current-period spend, invoice status, and monthly summary reports filterable by portfolio/property/date. Ensure immutable billing snapshots and correct historical behavior if a property's tier later changes. Add reconciliation, rounding, period-boundary, PDF authorization, tier-transition, and leakage tests.

### Commercial Prompt 5 of 5 — Tier 3 warranties, operational polish, and release QA

> Complete the Commercial Client Portal with Tier 3 warranty claims and final operational polish. Add warranty records linked to property, order, vendor, completion date, coverage period, documents, claim status, appointments, and resolution, while showing the section only to entitled Tier 3 memberships. Add consolidated activity, notifications, monthly report scheduling/preferences, document access, and account settings. Verify that property managers can manage multiple owners and billing configurations without accessing unauthorized payment or owner data. Add accessibility and responsive visual QA, realistic Tier 1/2/3 seed data, performance testing for large portfolios, complete permission and data-leakage regression coverage, and a production release checklist.

## Commercial portal completion definition

- Commercial users can manage many properties through one login.
- Per-property tiers and billing rules are correctly enforced.
- Consolidated and property-level views reconcile.
- Tier 3 alone receives warranty-claim functionality.

---

# Portal 4: Vendor Portal

## Scope

The Vendor Portal covers onboarding, compliance, lead/bid response, assignments, schedules, job execution, estimate submission, invoice submission, and payment status.

## Vendor visibility rules

- Vendors see only leads and assignments explicitly sent to their vendor account.
- Vendors do not see other invited vendors or competing bids.
- Vendors do not see the customer's direct contact information.
- Vendors do not see the customer price, SMPLfix markup, fee, profit, or margin.
- Direct-lane vendors may see their payment status.
- Licensed contractors on owner-billed work see `Billed to owner`, not a SMPLfix payment queue.
- Vendors with expired or incomplete required compliance must not receive or accept restricted assignments.

## Five implementation prompts

### Vendor Prompt 1 of 5 — Vendor identity, onboarding, and compliance

> Build the authenticated Vendor Portal foundation on the existing Vendor and vendor-onboarding code. Connect a vendor login identity to exactly the authorized Vendor record and support controlled team users if the data model permits it. Implement signup fields for company/contact details, trade classifications, service area, entity type, and ROC license where applicable. Implement the compliance checklist for contract agreement/e-signature audit, W-9 data with encrypted restricted TIN handling, COI metadata and document, additional-insured confirmation, workers' compensation, and Stripe Connect hosted onboarding storing only the connected account ID. Keep automated Arizona ROC verification optional behind a provider interface and flag mismatches for staff review. Enforce Pending, Compliance Incomplete, Under Review, Approved/Active, Rejected, and Suspended states. Add vendor-scoped serializers, IDOR tests, encryption/access tests, compliance-state tests, and private-data leakage tests.

### Vendor Prompt 2 of 5 — Lead distribution and accept-to-bid workflow

> Implement vendor lead distribution using the existing shared Order and quote workflow. Internal staff may send one lead to multiple qualified vendors simultaneously based on trade, service area, active compliance, and performance rules. Each vendor sees only its own invitation with property address, safe job scope, requested date/window, and relevant notes—never customer contact details or competing vendor identities. Provide Accept to Bid and Decline actions; acceptance commits the vendor to submit an estimate but does not award the job. Capture decline reason, response time, bid due date, late/non-response performance events, token or authenticated access rules, idempotency, and audit history. Add notifications and tests proving isolation between competing vendors and blocking expired/noncompliant vendors.

### Vendor Prompt 3 of 5 — Estimate upload, AI parsing adapter, review, and submission

> Build vendor estimate submission for desktop and mobile web. Desktop needs an accessible drag-and-drop/file-picker zone; mobile needs camera/photo and file/PDF selection. Support PDF and approved image formats with size/type limits and secure storage. Create one backend parsing-provider interface so both surfaces call the same endpoint; integrate the configured AI document parser only when credentials/provider are available, otherwise preserve a fully functional manual-entry fallback. Return structured draft line items, never automatically submit parsed data, and require the vendor to review/edit/confirm scope, quantities, units, unit prices, totals, notes, and attachments. Preserve the original file and parser audit metadata. Submit the raw vendor estimate only to internal review; do not expose it to customers or agents. Add malformed-file, parser-failure, duplicate, authorization, and total-calculation tests.

### Vendor Prompt 4 of 5 — Assignments, schedule, completion evidence, and communication

> Build the Vendor Portal Assignments and Schedule experience on the existing vendor-assignment, JobSchedule, VendorWorkOrder, and JobCompletion foundations. Show service, property address, scope, scheduled window, site/access instructions, assignment status, and safe message thread. Support schedule acceptance/change requests, status updates, and completion submission with required service notes and before/after photos according to job rules. Support multiple vendor assignments on one order without exposing one vendor's private assignment or pricing to another. Keep customer/vendor direct contact information hidden and route messages through SMPLfix with an audit trail. Enforce compliance at dispatch time and warn vendors before ROC license, COI, or workers' compensation expiration. Add transition, schedule-conflict, upload, assignment-isolation, and expiration tests.

### Vendor Prompt 5 of 5 — Vendor invoices, payment status, performance, and release QA

> Complete the Vendor Portal with invoice submission, lane-aware payment status, compliance reminders, and a vendor-facing performance summary. Allow vendors to submit an invoice only for authorized eligible assignments, with invoice number, amount, service period, line items, notes, and supporting PDF/image. Prevent duplicates and flag mismatches for internal review. For SMPLfix-paid direct-lane work, show clear pending, approved, scheduled, paid, failed, and disputed statuses using Stripe Connect payout references without exposing bank details. For licensed owner-billed work, show `Billed to owner` and no SMPLfix payment queue. Show only fair vendor-facing metrics such as response timeliness, estimate submission, schedule reliability, completion documentation, and compliance status. Add reminders, accessibility/mobile QA, financial authorization tests, realistic demo data, and a release checklist.

## Vendor portal completion definition

- Vendors can complete onboarding and maintain compliance.
- Lead competition remains private.
- Estimates and invoices enter internal review safely.
- Assignments can be completed with auditable documentation.
- Lane-aware payment language and status are correct.

---

# Portal 5: Internal/Admin Dashboard

## Scope

The Internal/Admin Dashboard remains the only interface where authorized roles may access vendor cost, markup, coordination fees, profit, and margin. It controls and monitors activity across all portals.

## Main features

- Orders across every account and property, filterable by workflow state
- Full internal order view with vendor cost, markup, fee, and margin
- Estimates pending customer approval with age
- Draft invoices awaiting release
- Completed jobs not yet invoiced
- Unassigned orders
- Overdue invoices
- Vendor assignments as full rows with service, linked vendor, scheduled date, and time
- Multiple vendor assignments per order
- Vendor compliance and expiration alerts
- Portal user, membership, invitation, and access administration
- Commercial tier/service-agreement controls
- Agent/property/transaction relationship controls
- Referral attribution
- Audit and notification delivery visibility
- Government contract compliance layer

## Five implementation prompts

### Internal Prompt 1 of 5 — RBAC hardening and portal administration

> Audit the existing Internal/Admin Dashboard, authentication, RBAC middleware, and every API route now used by portal features. Preserve current staff workflows while introducing a clear permission matrix for admin, manager, account representative, and any additional internal roles. Add internal administration for portal users, customer/property memberships, commercial organization access, agent relationships, vendor identities, invitations, revocations, and access-expiry overrides. Ensure external roles cannot call legacy internal endpoints merely because they are authenticated. Apply explicit staff-role authorization to internal order, dashboard, reporting, customer, attachment, quote, schedule, closeout, invoice, payment, and file routes as needed. Add audit events for sensitive administration and automated route-matrix tests covering every role and external-user denial.

### Internal Prompt 2 of 5 — Unified operations dashboard and exception queues

> Expand the Internal/Admin Dashboard using the canonical shared records. Build unified filters for account type, commercial tier, property, order status, workflow status, priority, assigned employee/vendor, date, and overdue state. Add actionable queues for unassigned orders, estimates awaiting client approval with age, draft invoices awaiting release, completed jobs not invoiced, overdue invoices, schedule conflicts, failed notifications, and approaching vendor compliance expirations. Each card or row must link to the correct internal detail view. Use real backend aggregates with consistent status definitions and indexes, not frontend-only calculations. Preserve existing reporting behavior and add aggregation, date-boundary, empty-state, and performance tests.

### Internal Prompt 3 of 5 — Full order economics and multi-vendor assignment management

> Improve the Internal Order detail view as the single operational record. Show customer/account/property, source, service, workflow, client price, vendor cost, markup/coordination-fee calculation, processing cost, profit, and margin only to explicitly authorized internal roles. Add full-row vendor assignments containing service performed, vendor name linked to the internal vendor profile, scheduled date, scheduled time/window, timezone, assignment status, lane/billing responsibility, and actions. Support multiple vendor assignments for one-time and recurring work without replacing the legacy primary vendor unexpectedly. Validate vendor eligibility/compliance and schedule conflicts. Ensure estimate/invoice contractor name and ROC number are sourced from the Vendor record. Add calculations, permissions, multi-assignment, recurring-order, and document-generation tests.

### Internal Prompt 4 of 5 — Billing, notifications, compliance, and referral oversight

> Add internal controls for tier-aware commercial billing, residential invoices/payments, vendor invoices/payouts, and exception handling. Support review/release of invoice drafts, consolidated-period invoices, Tier 1 fee-only invoices, reconciliation, overdue follow-up, payout review, owner-billed indicators, and immutable billing snapshots. Add a notification control center showing audience, event, channel, delivery state, retries, and deduplication so customers and vendors receive only meaningful alerts. Add compliance queues for ROC, COI, workers' compensation, W-9, agreements, and payment onboarding. Add referral attribution review for agents/customers with auditable corrections. Test financial permissions, reconciliation, notification deduplication, compliance gating, and external serializer isolation.

### Internal Prompt 5 of 5 — Government compliance layer and final system QA

> Implement Government Contracts as an optional internal compliance layer activated by a government contract tag; do not create a separate customer portal or duplicate the core Order, vendor-assignment, ScheduledVisit/JobSchedule, invoice, or payment systems. Add contract master records and lifecycle, bid preparation/scope/takeoff, required-document checklists by jurisdiction, Davis-Bacon wage determinations, bid deadlines, bonds and insurance gating, award documents and modifications with version history, site access requirements, crew/labor classifications, daily logs, certified-payroll data and WH-347 generation, contract/vendor KPIs, Schedule of Values progress billing, retainage, change orders, closeout, and contract-specific subcontractor agreements/price lock. Use configurable rules because legal thresholds and forms can change, and require qualified human review of compliance outputs. Finish with migration plans, authorization/security tests, accounting reconciliation, document visual QA, performance tests, backup/rollback instructions, and a staged production release checklist.

## Internal/Admin completion definition

- Staff can manage all portal-generated activity from one operational system.
- Only authorized internal roles can access private economics.
- Exception queues identify work requiring attention.
- Multi-vendor assignments, portal access, compliance, billing, and referrals are auditable.
- Government functionality layers over shared records rather than duplicating them.

---

# Cross-Portal Notification Principles

Notifications should be event-driven and important enough to require awareness or action. Avoid sending a message for every internal state change.

## Customer notifications

- Account/invitation security events
- Request received
- Estimate ready or revised
- Estimate approval confirmation
- Visit scheduled or materially changed
- Upcoming-visit reminder
- Vendor en route, when supported by real status data
- Job completed and documentation ready
- Invoice ready, payment succeeded, payment failed, or payment overdue
- Important autopilot or seasonal recommendation
- Agent access granted, changed, expiring, or revoked

## Agent notifications

- Client invitation accepted, expired, or revoked
- Request received
- Estimate/status requires client action (without giving the agent approval controls)
- Schedule confirmed or materially changed
- Deadline risk against close date
- Work completed and transaction documents ready
- Transaction access approaching expiry

## Vendor notifications

- Compliance item approaching expiration or rejected
- New lead invitation
- Bid deadline approaching
- Bid selected or not selected
- New/changed assignment or schedule
- Completion documentation needs correction
- Invoice accepted, rejected, or needs correction
- Payout scheduled, paid, or failed for eligible direct-lane work

## Internal notifications

- New request requiring review
- Unassigned or aging order
- Estimate awaiting review or client approval beyond threshold
- Schedule conflict or vendor response required
- Completed job missing invoice/documentation
- Draft invoice waiting release
- Payment/payout failure or overdue invoice
- Vendor compliance approaching expiry or blocking assignment
- Failed external notification
- Government deadline or missing compliance document

Every notification should have an event key, audience, deduplication key, delivery status, related record, timestamp, and read state.

---

# Definition of Done for Every Prompt

A prompt is complete only when all applicable items below are satisfied:

1. Existing code and tests were inspected before implementation.
2. The change uses shared canonical records and does not create a parallel workflow.
3. Server-side authentication, authorization, ownership scoping, validation, and serializers are implemented.
4. Sensitive fields are explicitly excluded for every external audience.
5. Database indexes and migration/backfill requirements are addressed.
6. Loading, empty, error, forbidden, expired, and success states are handled.
7. Desktop and mobile behavior is verified.
8. Accessibility basics are verified, including keyboard use, focus visibility, labels, and contrast.
9. Automated happy-path, failure-path, IDOR, and regression tests pass.
10. Existing Internal/Admin CRM behavior remains functional.
11. Relevant environment variables and deployment steps are documented without committing secrets.
12. The implementation includes a short completion report listing files changed, tests run, known limitations, and the next prompt to execute.

## Final release order

Release incrementally instead of waiting for all five portals:

1. Shared security foundation behind feature flags
2. Residential internal pilot
3. Residential controlled customer pilot
4. Agent internal pilot
5. Agent and invitation controlled pilot
6. Commercial tier pilot
7. Vendor pilot with selected vendors
8. Internal operational queues and billing expansion
9. Government compliance pilot after requirements review with the government-contract team

Each release should include monitoring, error logging, audit verification, a tested rollback procedure, and confirmation that no external API response contains internal financial fields.
