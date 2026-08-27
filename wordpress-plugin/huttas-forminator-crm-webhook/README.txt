smplfix Website Form CRM Webhook 2.2.0
======================================

Installation
------------
1. In WordPress go to Plugins > Add New > Upload Plugin.
2. Upload huttas-forminator-crm-webhook.zip and activate it.
3. Go to Settings > smplfix CRM Webhook.
4. Enter the numeric Forminator Form ID if used, and confirm Contact Form 7 Form ID 518 for the live request form.
5. Enter the complete CRM endpoint:
   https://app.smplfix.com/api/integrations/website-requests
6. Paste the exact HUTTAS_WEBHOOK_SECRET used in Render.
7. Save Changes.

Required Contact Form 7 IDs
---------------------------
your-name       Customer name
your-phone      Customer phone (required by the CRM)
your-email      Customer email
service-type    Selected service type
common-request  Selected common request
request-type    Repair, recurring, or remodel
project-details Additional request details

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
- Submission storage may be enabled or disabled; both configurations are supported.
- AJAX and page-reload submission methods are both supported.
- Contact Form 7 submissions are relayed after validation and spam checks, independently of notification-email delivery.
- Failed CRM calls retry with the same external submission ID after approximately 1, 5, 15, and 60 minutes.
- WordPress cron must be operational for delayed retries.
- Do not place the webhook secret in JavaScript, form fields, or page HTML.
