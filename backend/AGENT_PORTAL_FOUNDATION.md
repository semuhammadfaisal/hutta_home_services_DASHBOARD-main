# Real Estate Agent Portal Foundation

This layer extends the existing SMPLfix CRM and Residential Portal. It does not create a second customer, property, order, document, or message system.

## Ownership and access

- The homeowner remains the owner through the existing active `PropertyMembership` with `relationship: owner`.
- An agent receives a separate, property-scoped membership linked to one `RealEstateTransaction`.
- Agent access requires both the transaction and its membership to be active and unexpired.
- Agent permissions never include estimate approval, payment management, or property ownership management.
- Access normally ends after the Arizona close date. Staff can explicitly extend or revoke it with an audited reason.

## Invitation lifecycle

1. Staff creates an agent profile for an active `real_estate_agent` user.
2. Staff creates an invitation using existing customer and property IDs.
3. The API returns the raw invitation token once. MongoDB stores only its SHA-256 hash.
4. The signed-in invited agent accepts it. The claim is atomic and changes `pending` to `processing`, preventing replay.
5. Acceptance verifies the agent identity/email, expiry, homeowner membership, property ownership, and transaction scope before creating the restricted agent membership.
6. Accepted, expired, extended, and revoked actions are retained in audit history.

## API boundaries

- Agent APIs: `/api/agent`
- Staff lifecycle APIs: `/api/agent-admin`
- Agent data includes only allowlisted client, property, transaction, order-status, document, message, and referral fields.
- Order data comes from the shared `Order` model. Agent requests use `source: agent_portal` and enter the existing workflow as unquoted requests.
- Internal prices, vendor cost, markup, coordination fees, processing costs, profit, margin, internal notes, payment data, raw contact fields, token values, and audit metadata are blocked by the agent serializer.
- Email addresses and US phone numbers embedded in order descriptions, document names, or relayed messages are replaced with `[contact hidden]`.
- PDF/image inspection uploads are limited to 10 MB, signature-checked, stored in GridFS, and downloaded only after a fresh access check.

## Portal interface

The protected interface is served at `/pages/agent-portal.html`. It reads invitation tokens from the URL fragment after authentication and sends the token in the body of `POST /api/agent/invitations/accept`; tokens are never placed in query strings or server logs. All dashboard data is loaded exclusively from `/api/agent`.
