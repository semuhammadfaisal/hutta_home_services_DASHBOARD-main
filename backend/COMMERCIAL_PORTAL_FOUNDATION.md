# Commercial Portal Foundation

## Architecture

Commercial accounts use the existing `Property`, `Order`, `OutgoingQuote`, `CustomerInvoice`, scheduling, and closeout records. The commercial models add tenancy, portfolio organization, property-specific access, and service-agreement rules; they do not create a second order system.

## Records

- `CommercialOrganization`: the customer organization plus owner and billing contacts.
- `CommercialPortfolio`: a named grouping inside one organization.
- `CommercialLocation`: joins an organization and portfolio to a shared `Property` and its owner `Customer`.
- `CommercialMembership`: a user's organization-level role, permissions, and all-versus-selected property access.
- `CommercialPropertyMembership`: an optional property-specific role and permission override.
- `CommercialServiceAgreement`: the property-level tier, billing behavior, PO requirement, authorized approval/payment roles, and effective dates.
- `Order.commercialContext`: links a shared order to its organization, portfolio, location, agreement, PO number, and submitting user.
- `CustomerInvoice.commercialBilling`: classifies client invoices for safe Tier 1 versus Tier 2/3 visibility.

## Tier rules

- Tier 1: coordination-fee invoices only; vendors bill the client directly; no consolidated invoice, monthly report, or managed warranty entitlement.
- Tier 2: consolidated periodic billing and monthly reports; no managed warranty entitlement.
- Tier 3: Tier 2 behavior plus managed warranty claims.

Tier behavior is derived from the property service agreement, never from the signed-in user's role or a frontend value.

## Authorization

Every property, order, invoice, and PDF lookup checks both organization membership and property access. Selected-property users require an active `CommercialPropertyMembership`. Organization-wide users receive access from their active `CommercialMembership`. Approval and payment actions require both a permission and an agreement-authorized role.

Commercial serializers use explicit allowlists. They reject internal cost, processing cost, markup, profit, margin, coordination-fee configuration, internal notes, tokens, payment credentials, and vendor-private fields recursively.

## API foundation

- `GET /api/commercial/me`
- `GET /api/commercial/organizations`
- `GET /api/commercial/organizations/:organizationId`
- `GET /api/commercial/organizations/:organizationId/users`
- `GET /api/commercial/organizations/:organizationId/portfolios`
- `GET /api/commercial/organizations/:organizationId/properties`
- `GET /api/commercial/organizations/:organizationId/properties/:propertyId`
- `GET /api/commercial/organizations/:organizationId/properties/:propertyId/agreement`
- `GET /api/commercial/organizations/:organizationId/properties/:propertyId/orders`
- `GET /api/commercial/orders`
- `GET /api/commercial/orders/:orderId`
- `GET /api/commercial/organizations/:organizationId/properties/:propertyId/invoices`
- `GET /api/commercial/invoices/:invoiceId/pdf`

## Migration sequence

1. Back up the database and deploy the new models/routes.
2. Run `npm run migrate:commercial-accounts` for a dry-run report.
3. Resolve every `needsTierReview` item by adding an explicit `Commercial Tier` custom field (`Tier 1`, `Tier 2`, or `Tier 3`) to the legacy commercial customer.
4. Run the dry run again and review organization, property, agreement, order, and invoice counts.
5. Run `npm run migrate:commercial-accounts:apply` during a controlled release window.
6. Review legacy invoices and explicitly assign an `invoiceKind`. The migration intentionally does not guess whether an old invoice is a coordination-fee or consolidated invoice.
7. Run the focused commercial tests and verify representative mixed-access users before enabling a commercial frontend.

The migration is idempotent, reuses existing shared properties and orders, and creates indexes only in apply mode.
