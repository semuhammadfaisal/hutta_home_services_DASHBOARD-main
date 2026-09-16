# Residential Portal Backend Foundation

This foundation adds residential authentication and read-only, membership-scoped portal APIs without changing the existing Internal/Admin CRM workflow.

## Data relationships

- `User.role = residential` identifies a residential portal identity.
- `Property` is the canonical property record and belongs to an existing `Customer`.
- `PropertyMembership` grants one user access to one property and contains explicit permissions.
- `Order.propertyId` connects the shared Order record to the canonical property.
- `PortalActivity` stores customer-safe activity events. Existing user notifications are also included in the activity endpoint through a safe serializer.

Customer records and embedded customer/address snapshots remain in place for backward compatibility and historical documents.

## Security boundary

Residential users can access only `/api/residential/*` and their own `/api/notifications` records. Legacy CRM endpoints are protected by an explicit staff-only boundary.

Every residential response is built by an allowlist serializer. A recursive fail-closed guard rejects output containing private keys such as vendor cost, processing fee, markup, coordination fee, profit, margin, internal notes, storage identifiers, metadata, history, or token fields.

Changing a property, order, invoice, or document ID in a URL does not expand access. Every lookup is joined back to an active, unexpired `PropertyMembership` belonging to the authenticated user. Unauthorized records return `404` to avoid disclosing their existence.

## Read-only endpoints

- `GET /api/residential/me`
- `GET /api/residential/properties`
- `GET /api/residential/properties/:propertyId`
- `GET /api/residential/orders`
- `GET /api/residential/orders/:orderId`
- `GET /api/residential/estimates`
- `GET /api/residential/schedules`
- `GET /api/residential/invoices`
- `GET /api/residential/activity`
- `GET /api/residential/documents`
- `GET /api/residential/properties/:propertyId/documents/:documentId`
- `GET /api/residential/orders/:orderId/documents/:documentId`
- `GET /api/residential/orders/:orderId/completion-photos/:phase/:documentId`
- `GET /api/residential/invoices/:invoiceId/pdf`

List endpoints accept `page` and `limit` where applicable. The maximum page size is 100.

Service requests, estimate decisions, payment-method management, cancellation, and rescheduling are intentionally deferred to later Residential Portal prompts.

## Provisioning a residential user

An administrator may create or assign the `residential` role through the existing Users API. The user must also have at least one active `PropertyMembership`; a role alone grants no customer or property access.

The existing public staff-signup flow remains an approval-request flow and does not automatically create residential customers or properties.

## Legacy property migration

The migration is dry-run by default and only scans customers whose `customerType` is `residential`:

```powershell
npm run migrate:residential-properties
```

After reviewing the counts, apply it:

```powershell
npm run migrate:residential-properties:apply
```

The migration:

1. De-duplicates legacy customer addresses using normalized address keys.
2. Upserts first-class Property records idempotently.
3. Links unlinked Orders by normalized street address, or by the only property when unambiguous.
4. Skips ambiguous orders instead of guessing.
5. Creates owner memberships only when an active residential user's email matches exactly one migrated customer.

To intentionally backfill every customer type, run the backend script with both flags after reviewing the broader impact:

```powershell
node backend/migrate-residential-properties.js --all-customers --apply
```

Do not use `--all-customers` as part of the initial residential rollout unless commercial and other account records have been reviewed.

## Verification

Run the focused tests:

```powershell
node --test backend/tests/residential-portal-backend.test.js
```

The tests cover model validation, legacy-address normalization, active membership scoping, serializer leakage protection, record ownership patterns, and the staff-only legacy API boundary.
