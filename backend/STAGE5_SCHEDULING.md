# Stage 5 Scheduling

Stage 5 reuses the existing Resend sender `sales@smplfix.com`, token-encryption secret, application URL, MongoDB, and email worker. No new secret is required.

After deployment, run in Render Shell:

```text
npm run migrate:stage5-scheduling
npm run migrate:stage5-scheduling:apply
```

Use a controlled vendor and customer email for the first test. Approve a test quote, send an Arizona-time schedule proposal, accept it through the vendor link, and confirm the Order, Calendar, customer email, vendor PDF, staff alert, and Scheduling audit all show the same timestamps and references.

Stage 5 does not create a Payment, invoice, or completion record.
