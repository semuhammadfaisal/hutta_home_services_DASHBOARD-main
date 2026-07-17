Huttas Forminator CRM Webhook 2.0.0
===================================

Installation
------------
1. In WordPress go to Plugins > Add New > Upload Plugin.
2. Upload huttas-forminator-crm-webhook.zip and activate it.
3. Go to Settings > Huttas CRM Webhook.
4. Enter the numeric Forminator Form ID.
5. Enter the complete CRM endpoint:
   https://YOUR-RENDER-DOMAIN/api/integrations/website-requests
6. Paste the exact HUTTAS_WEBHOOK_SECRET used in Render.
7. Save Changes.

Required Forminator IDs
-----------------------
name-1     Customer name
phone-1    Customer phone
email-1    Customer email
textarea-1 Service details
consent-1  Marketing SMS consent

Notes
-----
- Braces such as {name-1} are Forminator merge tags. The actual field IDs are used without braces.
- Leave Forminator submission storage enabled.
- AJAX and page-reload submission methods are both supported.
- Failed CRM calls retry with the same external submission ID after approximately 1, 5, 15, and 60 minutes.
- WordPress cron must be operational for delayed retries.
- Do not place the webhook secret in JavaScript, form fields, or page HTML.
