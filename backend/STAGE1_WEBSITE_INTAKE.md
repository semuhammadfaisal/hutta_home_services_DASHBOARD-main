# Stage 1 website intake

The CRM accepts server-to-server submissions at `POST /api/integrations/website-requests`. Do not call this endpoint directly from browser JavaScript because the signing secret must remain on the huttas.com server.

## Forminator native webhook compatibility

When the WordPress site uses Forminator's built-in webhook instead of the HMAC helper plugin, configure these Render environment values:

```text
FORMINATOR_WEBHOOK_KEY=<a separate random secret of at least 32 characters>
FORMINATOR_FORM_ID=1029
```

Configure Forminator to POST to:

```text
https://hutta-home-services-dashboard-main.onrender.com/api/integrations/website-requests/forminator?key=<FORMINATOR_WEBHOOK_KEY>
```

This compatibility endpoint maps both the configured dashed IDs and Forminator's native underscore output (`name_1`, `phone_1`, `email_1`, `textarea_1`, and `consent_1`) to the Stage 1 intake contract. It accepts Forminator's flat or nested JSON/form payload, uses its entry ID for idempotency when supplied, and otherwise uses a request-body fingerprint. Setup probes are identified by Forminator's `X-Hook-Test: true` header. Use a dedicated key here; do not put `HUTTAS_WEBHOOK_SECRET` in the URL.

## Configuration

Set these Render environment variables before deploying:

```text
HUTTAS_WEBHOOK_SECRET=<at least 32 random bytes>
INTAKE_NOTIFICATION_EMAILS=sales@huttas.com
INTAKE_EMAIL_WORKER_ENABLED=true
```

Run the compatibility migration in dry-run mode first, then apply it:

```text
npm --prefix backend run migrate:stage1-intake
npm --prefix backend run migrate:stage1-intake:apply
```

MongoDB must be a replica set (MongoDB Atlas satisfies this) because customer, order, notification, and outbox creation use a transaction.

## Webhook contract

Send JSON with `Content-Type: application/json`:

```json
{
  "externalSubmissionId": "f82f949d-90f1-46f5-8178-731f5b19661e",
  "submittedAt": "2026-07-15T11:06:00.000Z",
  "name": "Customer Name",
  "phone": "4801234567",
  "email": "customer@example.com",
  "serviceDetails": "I want my landscaping done.",
  "marketingSmsConsent": false
}
```

Generate a current Unix timestamp in seconds. Sign the exact UTF-8 request bytes using:

```text
hex(HMAC-SHA256(HUTTAS_WEBHOOK_SECRET, timestamp + "." + rawJsonBody))
```

Send the timestamp as `X-Huttas-Timestamp` and the lowercase hexadecimal digest as `X-Huttas-Signature`. Reuse the same `externalSubmissionId` for retries. A duplicate returns HTTP 200 and the original request reference; a new request returns HTTP 201.

Example Node.js signer:

```js
const crypto = require('crypto');

const timestamp = Math.floor(Date.now() / 1000).toString();
const rawBody = JSON.stringify(submission);
const signature = crypto
  .createHmac('sha256', process.env.HUTTAS_WEBHOOK_SECRET)
  .update(`${timestamp}.${rawBody}`)
  .digest('hex');
```

The huttas.com handler should relay `requestReference` to its success screen. A timeout should be retried with the same external ID. It must not report success for non-2xx responses.

## Operational behavior

- Website orders start as `request_received` and `unquoted` and do not create a Payment.
- The email outbox retries after 1, 5, 15, and 60 minutes, then marks the fifth failure permanent.
- Staff can review requests and retry permanently failed messages in Workflow Center.
- Customer matching is case-insensitive by email. Canonical customer fields are never overwritten by an intake.
- The confirmation is operational and is sent regardless of marketing SMS consent.
