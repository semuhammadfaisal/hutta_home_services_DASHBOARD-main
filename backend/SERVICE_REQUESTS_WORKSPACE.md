# Service Requests

Internal CRM users now use the Service Requests sidebar entry for the entire portal-request lifecycle: review, vendor bidding, customer quotes, approval, scheduling, completion, invoices and payment closeout. The route prefix is `#service-requests/`, including stage and order routes.

Residential, Agent and Commercial portal sources are included. Workflow Center excludes these sources from its overview and stage lists. Existing records are categorized by their stored `source`; no order copies or data migration are required.

The same canonical orders, quote endpoints, scheduling, approval and closeout components remain in use. The workspace query controls organization of internal staff views, not authorization. Portal permissions and client-safe serializers are unchanged.

Residential review still requires an active coordinator and explicit staff confirmation before vendor distribution. Quotes must still be approved by the homeowner. Sending a vendor invitation never awards the job.

Release checks:

- Restart backend and refresh CRM assets.
- Confirm an existing portal request appears only in Service Requests; website/legacy CRM work remains in Workflow Center.
- Check both overview counts, stage lists and activity feeds while alternating between sidebar entries.
- Confirm request review, multiple-vendor lead distribution, customer estimate, approval, scheduling and closeout keep the Service Requests route and active sidebar entry.
- Confirm invoice and payment history remain linked to the original order and visible through the correct customer portal.
- Test refresh/back/forward on `#service-requests/stage-2/order/<orderId>` and mobile navigation.
