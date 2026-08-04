# Stage 4 Customer Approvals

## Render configuration

Add this environment variable to the CRM web service and redeploy:

```text
QUOTE_APPROVAL_NOTIFICATION_EMAILS=sales@smplfix.com
```

Use a comma-separated list when multiple staff recipients are required. If this setting is blank, Stage 4 falls back to `INTAKE_NOTIFICATION_EMAILS`.

The existing `APP_BASE_URL`, Resend settings, MongoDB connection, and email-worker settings are reused. `APP_BASE_URL` must be the deployed HTTPS CRM origin so secure quote and CRM links are generated correctly.

## Migration

After deploying the compatible application code, run the dry run from a Render Shell:

```text
npm run migrate:stage4-customer-approvals
```

Review the counts, then apply:

```text
npm run migrate:stage4-customer-approvals:apply
```

The migration marks existing sent quotes as `pending`, other historical quotes as `not_requested`, and creates the Stage 4 indexes. It does not create decisions or change Orders.

## Production smoke test

1. Send a non-customer test quote from Stage 3.
2. Open the secure link and approve using the agreement checkbox and typed name.
3. Confirm the public success state and PDF remain available.
4. Confirm the Order is `customer_approved` in Customer Approvals.
5. Confirm the immutable evidence contains both SHA-256 hashes and the correct revision.
6. Confirm the customer confirmation and staff alert are sent by the outbox worker.
7. Repeat with a new quote using Request Changes; create and send a revision and confirm the new revision returns to `pending`.

Do not use a real customer during the first production smoke test. Stage 4 does not create a Payment, invoice, or schedule.
