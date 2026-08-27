# Application Domain Migration

The canonical production application origin is `https://app.smplfix.com`.

## Deployment

1. Confirm Render has both `PUBLIC_APP_URL` and `FRONTEND_URL` set to `https://app.smplfix.com`.
2. Deploy the application and confirm the startup log reports `Public application URL configured: https://app.smplfix.com`.
3. Update Forminator to use `https://app.smplfix.com/api/integrations/website-requests/forminator?key=<FORMINATOR_WEBHOOK_KEY>`, or configure the signed WordPress plugin with `https://app.smplfix.com/api/integrations/website-requests`.
4. Send a Forminator test submission and verify the request appears once in Workflow Center.
5. Send representative onboarding, quote, schedule, completion, satisfaction, and password-reset emails and confirm their links and logo images use `app.smplfix.com`.

## Temporary fallback

Keep `https://hutta-home-services-dashboard-main.onrender.com` serving the same application through August 28, 2026 so previously issued secure links remain usable. Do not configure it as `PUBLIC_APP_URL` or `FRONTEND_URL`, and do not generate new links with it.

During the fallback window, monitor Render request logs, webhook delivery, and email delivery for traffic using the old hostname. After the window closes and no required traffic remains, retire the fallback in a separate deployment. If browser traffic is redirected, preserve its path and query string and verify fragment-based secure links before enabling the redirect.

## Smoke checks

- Login, logout, password reset, CSRF-protected changes, and authenticated API requests.
- Static assets, email logos, favicon, manifest, and service worker.
- Vendor onboarding, vendor quote, customer quote, scheduling, completion, and satisfaction token pages.
- Quote, invoice, receipt, and work-order PDFs.
- Uploads, downloads, both website-intake webhook variants, and staff email links.
