const { buildPublicUrl, getPublicAppUrl } = require('./publicAppUrl');

const Resend = require('resend').Resend;
const REQUIRED_SENDER_ADDRESS = 'sales@huttas.com';
const EMAIL_FROM = `Hutta Home Services <${REQUIRED_SENDER_ADDRESS}>`;
const EMAIL_REPLY_TO = REQUIRED_SENDER_ADDRESS;

function extractEmailAddress(value) {
  const match = String(value || '').match(/<([^>]+)>/);
  return String(match ? match[1] : value || '').trim().toLowerCase();
}

function getEmailDeliveryStatus() {
  const resendConfigured = Boolean(process.env.RESEND_API_KEY);
  const senderConfigured = extractEmailAddress(process.env.EMAIL_FROM) === REQUIRED_SENDER_ADDRESS;
  const replyToConfigured = extractEmailAddress(process.env.EMAIL_REPLY_TO) === REQUIRED_SENDER_ADDRESS;
  const provider = resendConfigured && senderConfigured && replyToConfigured ? 'resend' : 'unconfigured';
  const warning = provider === 'unconfigured'
    ? 'Resend email delivery requires RESEND_API_KEY and sales@huttas.com as both EMAIL_FROM and EMAIL_REPLY_TO.'
    : null;
  return {
    provider,
    warning,
    publicAppUrl: getPublicAppUrl(),
    sender: REQUIRED_SENDER_ADDRESS,
    replyTo: EMAIL_REPLY_TO,
    resendConfigured,
    senderConfigured,
    replyToConfigured
  };
}

const emailStatus = getEmailDeliveryStatus();
if (process.env.NODE_ENV === 'production' && emailStatus.provider !== 'resend') {
  throw new Error(emailStatus.warning);
}
const resend = emailStatus.provider === 'resend' ? new Resend(process.env.RESEND_API_KEY) : null;
console.log(`Using ${emailStatus.provider} for email delivery from ${REQUIRED_SENDER_ADDRESS}`);
if (emailStatus.warning) console.warn(`Email delivery warning: ${emailStatus.warning}`);

const htmlToText = (html) => String(html || '')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/p>|<\/div>|<\/h\d>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#039;/g, "'").replace(/&quot;/g, '"')
  .replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim();

const deliverEmail = async ({ to, subject, html, text, attachments }) => {
  const plainText = text || htmlToText(html);
  if (!resend) throw new Error('Resend email delivery is not configured');
  const payload = { from: EMAIL_FROM, to, subject, html, text: plainText, replyTo: EMAIL_REPLY_TO };
  if (attachments?.length) payload.attachments = attachments;
  const result = await resend.emails.send(payload);
  if (result?.error) throw new Error(result.error.message || 'Email delivery failed');
  return { provider: 'resend', messageId: result?.data?.id || result?.id || null };
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const emailShell = (title, content, options = {}) => {
  const preheader = escapeHtml(options.preheader || title);
  const subtitle = escapeHtml(options.subtitle || 'Professional Home Services Management');
  return `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <style>
      body{margin:0!important;padding:0!important;background:#eef4fb;color:#172033;font-family:Arial,"Helvetica Neue",Helvetica,sans-serif;-webkit-font-smoothing:antialiased}
      table{border-collapse:collapse;border-spacing:0}
      img{border:0;outline:0;text-decoration:none}
      a{color:#0056b8}
      .preheader{display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all}
      .page{width:100%;background:#eef4fb}
      .page-pad{padding:34px 12px}
      .wrap{width:100%;max-width:620px;background:#ffffff;border:1px solid #d7e3f1;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px rgba(28,68,120,.12)}
      .head{padding:42px 42px 34px;background:#ffffff;border-bottom:1px solid #e2eaf4;text-align:center}
      h1{margin:0;color:#0056b8;font-size:31px;line-height:1.2;font-weight:800;letter-spacing:-.02em}
      .subtitle{margin:11px 0 0;color:#64748b;font-size:15px;line-height:1.55}
      .body{padding:38px 42px 34px;background:#ffffff;color:#3b465a;font-size:15px;line-height:1.72}
      .body p{margin:0 0 16px}
      .body strong{color:#172033}
      .btn{display:inline-block;margin:20px 0;padding:14px 26px;border-radius:999px;background:#0056b8;color:#ffffff!important;text-decoration:none;font-weight:800;font-size:15px;box-shadow:0 9px 22px rgba(0,86,184,.28)}
      .panel{margin:22px 0;padding:18px 20px;border:1px solid #d7e5f5;border-radius:15px;background:#f7fbff}
      .notice{margin:22px 0;padding:17px 19px;border:1px solid #bedcff;border-radius:14px;background:#edf7ff;color:#314866}
      .warning{margin:22px 0;padding:17px 19px;border:1px solid #fed7aa;border-radius:14px;background:#fff8ed;color:#8a4518}
      .muted{color:#718096;font-size:13px;line-height:1.58}
      .link-box{margin:14px 0;padding:13px 15px;border:1px solid #d7e5f5;border-radius:11px;background:#f7fbff;color:#0056b8;font-size:13px;line-height:1.5;word-break:break-all}
      .credential-grid{margin:23px 0;border:1px solid #d5e2f2;border-radius:15px;overflow:hidden;background:#ffffff;box-shadow:0 8px 22px rgba(32,74,124,.06)}
      .credential-row{padding:18px 20px;border-bottom:1px solid #e7eef7}
      .credential-row:last-child{border-bottom:0}
      .credential-label{margin:0 0 7px;color:#64748b;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
      .credential-value{margin:0;color:#172033!important;font-family:"Courier New",monospace;font-size:15px;font-weight:700;word-break:break-all;text-decoration:none!important}
      .foot{padding:25px 34px;background:#f7faff;border-top:1px solid #dfe9f4;color:#718096;font-size:12px;line-height:1.6;text-align:center}
      .foot strong{display:block;margin-bottom:5px;color:#163252;font-size:13px}
      .foot a{color:#0056b8;text-decoration:none}
      .legal{padding:15px 18px 0;color:#91a0b2;font-size:10px;line-height:1.5;text-align:center}
      @media only screen and (max-width:600px){.page-pad{padding:14px 8px}.head{padding:32px 22px 27px}.body{padding:28px 22px 25px}.foot{padding-left:22px;padding-right:22px}h1{font-size:25px}.body{font-size:15px}.btn{display:block;text-align:center}.wrap{border-radius:16px}}
    </style>
  </head>
  <body>
    <div class="preheader">${preheader}</div>
    <table role="presentation" class="page" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td class="page-pad" align="center">
          <table role="presentation" class="wrap" width="620" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td class="head" align="center">
                <h1>${escapeHtml(title)}</h1>
                <p class="subtitle">${subtitle}</p>
              </td>
            </tr>
            <tr><td class="body">${content}</td></tr>
            <tr>
              <td class="foot">
                <strong>Hutta Home Services</strong>
                Professional Home Services Management Platform<br>
                Questions? Reply to this email or contact <a href="mailto:sales@huttas.com">sales@huttas.com</a>.
                <div class="legal">This automated message was sent by Hutta Home Services. Keep private links and account credentials secure.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>`;
};

const sendPasswordResetEmail = async (email, resetToken) => {
  const resetUrl = buildPublicUrl(`/pages/reset-password.html?token=${encodeURIComponent(resetToken)}`);
  return deliverEmail({
    to: email,
    subject: 'Password Reset Request',
    text: `Hello,\n\nYou requested to reset your password for your Hutta Home Services account.\n\nReset password: ${resetUrl}\n\nThis link will expire in 1 hour. If you did not request this, please ignore this email.`,
    html: emailShell('Password Reset Request', `
      <p>Hello,</p>
      <p>You requested to reset your password for your Hutta Home Services dashboard account.</p>
      <p><a class="btn" href="${resetUrl}">Reset Password</a></p>
      <div class="panel">
        <p><strong>Copy link if the button does not open:</strong></p>
        <div class="link-box">${escapeHtml(resetUrl)}</div>
      </div>
      <div class="warning">
        <p><strong>This secure link expires in 1 hour.</strong></p>
        <p>If you did not request this password reset, you can safely ignore this email.</p>
      </div>
    `, { preheader: 'Reset your Hutta Home Services dashboard password.' })
  });
};

const sendWelcomeEmail = async (email, password, firstName) => {
  const loginUrl = getPublicAppUrl();
  return deliverEmail({
    to: email,
    subject: 'Welcome to Hutta Home Services - Your Account Details',
    text: `Hello ${firstName || 'there'},\n\nWelcome to Hutta Home Services.\n\nEmail: ${email}\nPassword: ${password}\n\nLogin: ${loginUrl}\n\nPlease change your password after your first login.`,
    html: emailShell('Welcome to Hutta Home Services', `
      <p>Hello ${escapeHtml(firstName || 'there')},</p>
      <p>Your Hutta Home Services dashboard account has been created. Use the credentials below to sign in.</p>
      <div class="credential-grid">
        <div class="credential-row">
          <p class="credential-label">Email Address</p>
          <p class="credential-value">${escapeHtml(email)}</p>
        </div>
        <div class="credential-row">
          <p class="credential-label">Temporary Password</p>
          <p class="credential-value">${escapeHtml(password)}</p>
        </div>
      </div>
      <p><a class="btn" href="${loginUrl}">Login to Dashboard</a></p>
      <div class="warning">
        <p><strong>Security recommendation</strong></p>
        <p>Please change this temporary password after your first login.</p>
      </div>
      <p class="muted">If you have questions or need access help, contact your Hutta Home Services administrator.</p>
    `, { preheader: 'Your Hutta Home Services dashboard login credentials are ready.' })
  });
};

const sendVendorInvitationEmail = async ({ email, companyName, categoryLabel, token, expiresAt, personalMessage, purpose = 'initial' }) => {
  const formUrl = buildPublicUrl('/pages/vendor-onboarding.html', `token=${encodeURIComponent(token)}`);
  const greeting = companyName ? `Hello ${escapeHtml(companyName)},` : 'Hello,';
  const changeCopy = purpose === 'changes_requested'
    ? '<p>We reviewed your submission and need a few updates. Use the secure link below to revise your information.</p>'
    : '<p>Hutta Home Services has invited you to complete our secure vendor onboarding form.</p>';
  const subject = purpose === 'changes_requested' ? 'Updates requested for your vendor application' : 'Complete your Hutta vendor onboarding';
  return deliverEmail({
    to: email,
    subject,
    text: `${companyName ? `Hello ${companyName},` : 'Hello,'}\n\n${purpose === 'changes_requested' ? 'We reviewed your submission and need a few updates.' : 'Hutta Home Services has invited you to complete our secure vendor onboarding form.'}\n\nAssigned service category: ${categoryLabel}\n${personalMessage ? `\nMessage from our team: ${personalMessage}\n` : ''}\nOpen the secure form: ${formUrl}\n\nThis one-time link expires ${new Date(expiresAt).toLocaleString('en-US', { timeZone: 'America/Phoenix' })} Arizona time. Do not forward it.`,
    html: emailShell(purpose === 'changes_requested' ? 'Vendor Application Updates' : 'Vendor Onboarding Invitation', `
      <p>${greeting}</p>${changeCopy}
      <div class="panel">
        <p class="credential-label">Assigned Service Category</p>
        <p><strong>${escapeHtml(categoryLabel)}</strong></p>
      </div>
      ${personalMessage ? `<p><strong>Message from our team:</strong><br>${escapeHtml(personalMessage)}</p>` : ''}
      <p><a class="btn" href="${formUrl}">${purpose === 'changes_requested' ? 'Update Application' : 'Open Secure Vendor Form'}</a></p>
      <div class="notice">
        <p><strong>Private one-time link</strong></p>
        <p>This link expires ${escapeHtml(new Date(expiresAt).toLocaleString('en-US', { timeZone: 'America/Phoenix' }))} Arizona time. Please do not forward it.</p>
      </div>
    `, {
      preheader: purpose === 'changes_requested' ? 'Updates are requested for your Hutta vendor application.' : 'Complete your secure Hutta vendor onboarding form.'
    })
  });
};

const sendVendorSubmissionReceivedEmail = ({ email, companyName }) => deliverEmail({
  to: email,
  subject: 'Vendor application received',
  html: emailShell('Application Received', `
    <p>Hello ${escapeHtml(companyName || 'Vendor')},</p>
    <p>We received your vendor application and documents. Our team will review the submission and contact you if anything else is needed.</p>
    <div class="notice">
      <p><strong>No action is required right now.</strong></p>
      <p>Your documents are retained securely for review and audit history.</p>
    </div>
  `, { preheader: 'Your Hutta vendor application was received.' })
});

const sendVendorDecisionEmail = ({ email, companyName, action, message, token, expiresAt, categoryLabel }) => {
  if (action === 'changes_requested') {
    return sendVendorInvitationEmail({ email, companyName, categoryLabel, token, expiresAt, personalMessage: message, purpose: 'changes_requested' });
  }
  const approved = action === 'approved';
  return deliverEmail({
    to: email,
    subject: approved ? 'Your vendor application is approved' : 'Update on your vendor application',
    html: emailShell(approved ? 'Vendor Application Approved' : 'Vendor Application Update', `
      <p>Hello ${escapeHtml(companyName || 'Vendor')},</p>
      <p>${approved ? 'Your vendor application has been approved. Welcome to the Hutta Home Services vendor network.' : 'Our team has completed its review of your vendor application.'}</p>
      ${message ? `<p><strong>Message from our team:</strong><br>${escapeHtml(message)}</p>` : ''}
      <div class="${approved ? 'notice' : 'panel'}">
        <p><strong>${approved ? 'Approved vendor status' : 'Application retained for review history'}</strong></p>
        <p>${approved ? 'Your vendor profile is now active in our system.' : 'Your submitted information and documents remain securely retained.'}</p>
      </div>
    `, {
      preheader: approved ? 'Your Hutta vendor application has been approved.' : 'There is an update on your Hutta vendor application.'
    })
  });
};

const sendStaffVendorSubmissionEmail = ({ emails, companyName, vendorId }) => {
  if (!emails?.length) return Promise.resolve();
  const reviewUrl = buildPublicUrl('/pages/admin-dashboard.html', 'vendor-reviews');
  return deliverEmail({
    to: emails,
    subject: `Vendor application submitted: ${companyName}`,
    text: `${companyName} submitted a vendor application.\n\nReview vendor: ${reviewUrl}\nVendor reference: ${vendorId}`,
    html: emailShell('Vendor Submission Ready for Review', `
      <p><strong>${escapeHtml(companyName)}</strong> submitted a vendor application.</p>
      <div class="panel">
        <p class="credential-label">Vendor Reference</p>
        <p><strong>${escapeHtml(vendorId)}</strong></p>
      </div>
      <p><a class="btn" href="${reviewUrl}">Review Vendor</a></p>
      <p class="muted">Vendor reference: ${escapeHtml(vendorId)}</p>
    `, { preheader: `${companyName} submitted a vendor application for review.` })
  });
};

const sendStaffVendorReviewUpdateEmail = ({ emails, companyName, vendorId, vendorEmail, action, message, deliveryError }) => {
  const recipients = [...new Set((emails || []).filter(Boolean))];
  if (!recipients.length) return Promise.resolve();
  const reviewUrl = buildPublicUrl('/pages/admin-dashboard.html', 'vendor-reviews');
  const labels = {
    approved: 'Vendor application approved',
    rejected: 'Vendor application rejected',
    changes_requested: 'Vendor changes requested',
    invitation_delivery_failed: 'Vendor invitation delivery failed',
    confirmation_delivery_failed: 'Vendor confirmation email delivery failed',
    decision_delivery_failed: 'Vendor decision email delivery failed',
    update_recipient_retry: 'Vendor onboarding update notice'
  };
  const title = labels[action] || 'Vendor onboarding update';
  const detail = deliveryError
    ? `Delivery issue: ${deliveryError}`
    : message || 'No additional message was provided.';
  return deliverEmail({
    to: recipients,
    subject: `${title}: ${companyName || vendorEmail || 'Vendor'}`,
    text: `${title}\n\nVendor: ${companyName || 'Vendor'}\n${vendorEmail ? `Vendor email: ${vendorEmail}\n` : ''}${detail}\n\nReview dashboard: ${reviewUrl}${vendorId ? `\nVendor reference: ${vendorId}` : ''}`,
    html: emailShell(title, `
      <p><strong>${escapeHtml(companyName || 'Vendor')}</strong> has a vendor onboarding update.</p>
      <div class="panel">
        ${vendorEmail ? `<p><strong>Vendor email:</strong> ${escapeHtml(vendorEmail)}</p>` : ''}
        <p>${escapeHtml(detail)}</p>
      </div>
      <p><a class="btn" href="${reviewUrl}">Open Vendor Reviews</a></p>
      ${vendorId ? `<p class="muted">Vendor reference: ${escapeHtml(vendorId)}</p>` : ''}
    `, { preheader: `${title} for ${companyName || vendorEmail || 'a vendor'}.` })
  });
};

const sendWebsiteRequestConfirmationEmail = ({ recipients, requestReference, customerName, email, phone, serviceDetails, token, completionTokenExpiresAt }) => {
  const completionUrl = token ? buildPublicUrl('/pages/complete-request.html', `token=${encodeURIComponent(token)}`) : '';
  const expiryText = completionTokenExpiresAt ? new Date(completionTokenExpiresAt).toLocaleString('en-US', { timeZone: 'America/Phoenix' }) : '';
  return deliverEmail({
  to: recipients,
  subject: `We received your request — ${requestReference}`,
  text: `Hello ${customerName},\n\nWe received your service request. Reference: ${requestReference}\nEmail: ${email}\nPhone: ${phone}\nService details: ${serviceDetails || 'Not provided'}\n\n${completionUrl ? `Complete your service request so we can begin collecting vendor quotes: ${completionUrl}\n${expiryText ? `This private link expires ${expiryText} Arizona time.\n` : ''}` : ''}\nThis message confirms receipt and is not a quote or scheduling confirmation.`,
  html: emailShell('Request Received', `
    <p>Hello ${escapeHtml(customerName)},</p>
    <p>Thank you for contacting Hutta Home Services. We received your request and our team will contact you.</p>
    <div class="panel">
      <p class="credential-label">Request Reference</p>
      <p><strong>${escapeHtml(requestReference)}</strong></p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
      <p><strong>Service details:</strong><br>${escapeHtml(serviceDetails || 'Not provided')}</p>
    </div>
    ${completionUrl ? `<p>Please complete the remaining job information so our team can begin collecting vendor quotes.</p><p><a class="btn" href="${completionUrl}">Complete Service Request</a></p><div class="notice"><p>This private link${expiryText ? ` expires ${escapeHtml(expiryText)} Arizona time and` : ''} should not be forwarded.</p></div>` : ''}
    <div class="notice">
      <p>This email confirms receipt only. It is not a quote or scheduling confirmation.</p>
    </div>
  `, { preheader: `Your service request ${requestReference} was received.` })
  });
};

const sendWebsiteOperationsAlertEmail = ({ recipients, requestReference, customerName, email, phone, serviceDetails }) => {
  const workflowUrl = buildPublicUrl('/pages/admin-dashboard.html', 'workflow-center');
  return deliverEmail({
    to: recipients,
    subject: `New website request: ${requestReference}`,
    text: `New website request ${requestReference}\nCustomer: ${customerName}\nEmail: ${email}\nPhone: ${phone}\nService details: ${serviceDetails || 'Not provided'}\nMissing: service category and service address\n\nOpen Workflow Center: ${workflowUrl}`,
    html: emailShell('New Website Request', `
      <p><strong>${escapeHtml(customerName)}</strong> submitted a website service request.</p>
      <div class="panel">
        <p class="credential-label">Request Reference</p>
        <p><strong>${escapeHtml(requestReference)}</strong></p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
        <p><strong>Service details:</strong><br>${escapeHtml(serviceDetails || 'Not provided')}</p>
      </div>
      <div class="warning">
        <p><strong>Missing intake information</strong></p>
        <p>Service category and service address require staff follow-up.</p>
      </div>
      <p><a class="btn" href="${workflowUrl}">Open Workflow Center</a></p>
    `, { preheader: `${requestReference} is ready in Workflow Center.` })
  });
};

const sendVendorQuoteInvitationEmail = ({ recipients, token, quoteReference, requestReference, vendorName, service, expiresAt, personalMessage, revision = false }) => {
  const formUrl = buildPublicUrl('/pages/vendor-quote.html', `token=${encodeURIComponent(token)}`);
  const title = revision ? 'Vendor Quote Revision Requested' : 'Vendor Quote Requested';
  return deliverEmail({
    to: recipients,
    subject: `${revision ? 'Revision requested' : 'Quote requested'}: ${requestReference}`,
    text: `Hello ${vendorName || 'Vendor'},\n\nHutta Home Services ${revision ? 'requested a revision to' : 'invited you to submit'} quote ${quoteReference} for ${service}.\n${personalMessage ? `\nMessage: ${personalMessage}\n` : ''}\nOpen secure quote form: ${formUrl}\n\nThe one-time link expires ${new Date(expiresAt).toLocaleString('en-US', { timeZone: 'America/Phoenix' })} Arizona time.`,
    html: emailShell(title, `
      <p>Hello ${escapeHtml(vendorName || 'Vendor')},</p>
      <p>Hutta Home Services ${revision ? 'requested an updated version of' : 'invited you to submit'} a quote for <strong>${escapeHtml(service)}</strong>.</p>
      <div class="panel"><p><strong>Request:</strong> ${escapeHtml(requestReference)}</p><p><strong>Quote:</strong> ${escapeHtml(quoteReference)}</p></div>
      ${personalMessage ? `<p><strong>Message from our team:</strong><br>${escapeHtml(personalMessage)}</p>` : ''}
      <p><a class="btn" href="${formUrl}">Open Secure Quote Form</a></p>
      <div class="notice"><p>This private one-time link expires ${escapeHtml(new Date(expiresAt).toLocaleString('en-US', { timeZone: 'America/Phoenix' }))} Arizona time. Do not forward it.</p></div>
    `, { preheader: `${title} for ${requestReference}.` })
  });
};

const sendVendorQuoteSubmissionConfirmationEmail = ({ recipients, quoteReference, requestReference, vendorName, total }) => deliverEmail({
  to: recipients,
  subject: `Quote received: ${quoteReference}`,
  text: `Hello ${vendorName || 'Vendor'},\n\nWe received quote ${quoteReference} for ${requestReference}. Total: $${Number(total || 0).toFixed(2)}. Our team will review it.`,
  html: emailShell('Quote Received', `
    <p>Hello ${escapeHtml(vendorName || 'Vendor')},</p><p>We received your quote and our team will review it.</p>
    <div class="panel"><p><strong>Quote:</strong> ${escapeHtml(quoteReference)}</p><p><strong>Request:</strong> ${escapeHtml(requestReference)}</p><p><strong>Total:</strong> $${escapeHtml(Number(total || 0).toFixed(2))}</p></div>
    <p class="muted">No further action is required unless our team requests a revision.</p>
  `, { preheader: `Your quote ${quoteReference} was received.` })
});

const sendVendorQuoteStaffAlertEmail = ({ recipients, quoteReference, requestReference, vendorName, total }) => {
  const workflowUrl = buildPublicUrl('/pages/admin-dashboard.html', 'incoming-quotes');
  return deliverEmail({
    to: recipients,
    subject: `Vendor quote submitted: ${quoteReference}`,
    text: `${vendorName} submitted ${quoteReference} for ${requestReference}. Total: $${Number(total || 0).toFixed(2)}.\n\nCompare quotes: ${workflowUrl}`,
    html: emailShell('Vendor Quote Submitted', `
      <p><strong>${escapeHtml(vendorName)}</strong> submitted a quote.</p>
      <div class="panel"><p><strong>Quote:</strong> ${escapeHtml(quoteReference)}</p><p><strong>Request:</strong> ${escapeHtml(requestReference)}</p><p><strong>Total:</strong> $${escapeHtml(Number(total || 0).toFixed(2))}</p></div>
      <p><a class="btn" href="${workflowUrl}">Compare Incoming Quotes</a></p>
    `, { preheader: `${quoteReference} is ready for comparison.` })
  });
};

const sendCustomerOutgoingQuoteEmail = ({ recipients, token, customerName, quoteReference, requestReference, customerTotal, validUntil }) => {
  const quoteUrl = buildPublicUrl(`/pages/customer-quote.html?token=${encodeURIComponent(token)}`);
  return deliverEmail({
    to: recipients,
    subject: `Your Hutta service quote — ${quoteReference}`,
    text: `Hello ${customerName || 'Customer'},\n\nYour service quote ${quoteReference} for request ${requestReference} is ready. Total: $${Number(customerTotal || 0).toFixed(2)}. Valid through ${new Date(validUntil).toLocaleDateString('en-US', { timeZone: 'America/Phoenix' })}.\n\nReview, approve, request changes, or download your quote: ${quoteUrl}\n\nApproval does not confirm scheduling.`,
    html: emailShell('Your Service Quote Is Ready', `
      <p>Hello ${escapeHtml(customerName || 'Customer')},</p>
      <p>Your Hutta Home Services quote is ready to review and download.</p>
      <div class="panel"><p><strong>Quote:</strong> ${escapeHtml(quoteReference)}</p><p><strong>Request:</strong> ${escapeHtml(requestReference)}</p><p><strong>Total:</strong> $${escapeHtml(Number(customerTotal || 0).toFixed(2))}</p><p><strong>Valid through:</strong> ${escapeHtml(new Date(validUntil).toLocaleDateString('en-US', { timeZone: 'America/Phoenix' }))}</p></div>
      <p><a class="btn" href="${quoteUrl}">View Secure Quote</a></p>
      <div class="notice"><p>Use the secure quote page to approve or request changes. Approval does not confirm scheduling.</p></div>
      <p class="muted">This private link provides access to your quote. Please do not forward it.</p>
    `, { preheader: `${quoteReference} is ready to review.` })
  });
};

const sendCustomerQuoteDecisionEmail = ({ recipients, token, decision, customerName, typedName, quoteReference, requestReference, revisionNumber, customerTotal, decisionAt, changeRequestMessage }) => {
  const approved = decision === 'approved';
  const quoteUrl = buildPublicUrl(`/pages/customer-quote.html?token=${encodeURIComponent(token)}`);
  const timestamp = new Date(decisionAt).toLocaleString('en-US', { timeZone: 'America/Phoenix', dateStyle: 'long', timeStyle: 'short' });
  const title = approved ? 'Quote Approval Confirmed' : 'Quote Change Request Received';
  return deliverEmail({
    to: recipients,
    subject: approved ? `Approval confirmed — ${quoteReference}` : `Change request received — ${quoteReference}`,
    text: approved
      ? `Hello ${customerName || 'Customer'},\n\nWe recorded ${typedName}'s approval of ${quoteReference}, revision ${revisionNumber}, at ${timestamp} Arizona time. Approved total: $${Number(customerTotal || 0).toFixed(2)}.\n\nView and download the quote: ${quoteUrl}\n\nApproval does not confirm scheduling.`
      : `Hello ${customerName || 'Customer'},\n\nWe recorded ${typedName}'s request for changes to ${quoteReference}, revision ${revisionNumber}, at ${timestamp} Arizona time.\n\nRequested changes: ${changeRequestMessage}\n\nOur team will prepare and send a new revision before approval can continue.`,
    html: emailShell(title, `
      <p>Hello ${escapeHtml(customerName || 'Customer')},</p>
      <p>${approved ? 'Your quote approval has been recorded.' : 'Your request for quote changes has been recorded.'}</p>
      <div class="panel">
        <p><strong>Quote:</strong> ${escapeHtml(quoteReference)} · Revision ${escapeHtml(revisionNumber)}</p>
        <p><strong>Request:</strong> ${escapeHtml(requestReference)}</p>
        <p><strong>Name:</strong> ${escapeHtml(typedName)}</p>
        <p><strong>Recorded:</strong> ${escapeHtml(timestamp)} Arizona time</p>
        ${approved ? `<p><strong>Approved total:</strong> $${escapeHtml(Number(customerTotal || 0).toFixed(2))}</p>` : `<p><strong>Requested changes:</strong> ${escapeHtml(changeRequestMessage)}</p>`}
      </div>
      ${approved ? `<p><a class="btn" href="${quoteUrl}">View Approved Quote</a></p><div class="notice"><p>Approval does not confirm scheduling. Our team will contact you with scheduling details.</p></div>` : '<div class="notice"><p>Approval is closed for this revision. Our team will send a new revision for review.</p></div>'}
    `, { preheader: approved ? `${quoteReference} approval is confirmed.` : `${quoteReference} change request was received.` })
  });
};

const sendStaffQuoteDecisionAlertEmail = ({ recipients, decision, customerName, typedName, quoteReference, requestReference, revisionNumber, customerTotal, decisionAt, changeRequestMessage }) => {
  const approved = decision === 'approved';
  const workflowUrl = buildPublicUrl('/pages/admin-dashboard.html', 'customer-approvals');
  const timestamp = new Date(decisionAt).toLocaleString('en-US', { timeZone: 'America/Phoenix', dateStyle: 'long', timeStyle: 'short' });
  return deliverEmail({
    to: recipients,
    subject: approved ? `Customer approved ${quoteReference}` : `Customer requested changes to ${quoteReference}`,
    text: `${customerName || 'Customer'} (${typedName}) ${approved ? 'approved' : 'requested changes to'} ${quoteReference}, revision ${revisionNumber}, at ${timestamp} Arizona time.${approved ? ` Total: $${Number(customerTotal || 0).toFixed(2)}.` : ` Requested changes: ${changeRequestMessage}`}\n\nOpen Customer Approvals: ${workflowUrl}`,
    html: emailShell(approved ? 'Customer Approved Quote' : 'Customer Requested Quote Changes', `
      <p><strong>${escapeHtml(customerName || 'Customer')}</strong> ${approved ? 'approved the customer quote.' : 'requested changes to the customer quote.'}</p>
      <div class="panel">
        <p><strong>Quote:</strong> ${escapeHtml(quoteReference)} · Revision ${escapeHtml(revisionNumber)}</p>
        <p><strong>Request:</strong> ${escapeHtml(requestReference)}</p>
        <p><strong>Entered name:</strong> ${escapeHtml(typedName)}</p>
        <p><strong>Recorded:</strong> ${escapeHtml(timestamp)} Arizona time</p>
        ${approved ? `<p><strong>Total:</strong> $${escapeHtml(Number(customerTotal || 0).toFixed(2))}</p>` : `<p><strong>Requested changes:</strong> ${escapeHtml(changeRequestMessage)}</p>`}
      </div>
      <p><a class="btn" href="${workflowUrl}">Open Customer Approvals</a></p>
    `, { preheader: approved ? `${quoteReference} is approved.` : `${quoteReference} needs a revision.` })
  });
};

const scheduleTime = value => new Date(value).toLocaleString('en-US', { timeZone: 'America/Phoenix', dateStyle: 'full', timeStyle: 'short' });
const sendVendorScheduleProposalEmail = ({ recipients, token, vendorName, customerName, scheduleReference, requestReference, service, proposedStart, proposedEnd }) => {
  const url = buildPublicUrl(`/pages/vendor-schedule.html?token=${encodeURIComponent(token)}`);
  return deliverEmail({ to: recipients, subject: `Schedule confirmation requested — ${scheduleReference}`, text: `Hello ${vendorName},\n\nPlease confirm the proposed Arizona schedule for ${service}: ${scheduleTime(proposedStart)} through ${scheduleTime(proposedEnd)}.\n\nReview: ${url}`, html: emailShell('Confirm Job Schedule', `<p>Hello ${escapeHtml(vendorName)},</p><p>Please review the proposed schedule for <strong>${escapeHtml(service)}</strong>.</p><div class="panel"><p><strong>Schedule:</strong> ${escapeHtml(scheduleReference)}</p><p><strong>Request:</strong> ${escapeHtml(requestReference)}</p><p><strong>Customer:</strong> ${escapeHtml(customerName)}</p><p><strong>Start:</strong> ${escapeHtml(scheduleTime(proposedStart))} Arizona time</p><p><strong>End:</strong> ${escapeHtml(scheduleTime(proposedEnd))} Arizona time</p></div><p><a class="btn" href="${url}">Review Schedule</a></p><p class="muted">This private link may not be forwarded.</p>`) });
};
const sendCustomerScheduleEmail = ({ recipients, customerName, scheduleReference, requestReference, service, address, proposedStart, proposedEnd, accessInstructions }) => deliverEmail({ to: recipients, subject: `Your service is scheduled — ${requestReference}`, text: `Hello ${customerName},\n\nYour ${service} service is confirmed from ${scheduleTime(proposedStart)} through ${scheduleTime(proposedEnd)} Arizona time at ${address}.\n\nAccess instructions: ${accessInstructions || 'None'}`, html: emailShell('Your Service Is Scheduled', `<p>Hello ${escapeHtml(customerName)},</p><p>Your service schedule is confirmed.</p><div class="panel"><p><strong>Request:</strong> ${escapeHtml(requestReference)}</p><p><strong>Schedule:</strong> ${escapeHtml(scheduleReference)}</p><p><strong>Service:</strong> ${escapeHtml(service)}</p><p><strong>Start:</strong> ${escapeHtml(scheduleTime(proposedStart))} Arizona time</p><p><strong>End:</strong> ${escapeHtml(scheduleTime(proposedEnd))} Arizona time</p><p><strong>Address:</strong> ${escapeHtml(address)}</p><p><strong>Access:</strong> ${escapeHtml(accessInstructions || 'No special instructions')}</p></div>`) });
const sendVendorScheduleDecisionEmail = ({ recipients, decision, vendorName, scheduleReference, service, proposedStart, proposedEnd, changeRequestMessage, completionToken, attachments }) => { const completionUrl=completionToken?buildPublicUrl('/pages/vendor-completion.html',`token=${encodeURIComponent(completionToken)}`):''; return deliverEmail({ to: recipients, subject: decision === 'accepted' ? `Work order confirmed — ${scheduleReference}` : `Schedule change request received — ${scheduleReference}`, text: decision === 'accepted' ? `Hello ${vendorName},\n\nThe schedule is confirmed for ${service}, ${scheduleTime(proposedStart)} through ${scheduleTime(proposedEnd)} Arizona time. Your work order is attached.${completionUrl?`\n\nSubmit completion photos after the job: ${completionUrl}`:''}` : `Hello ${vendorName},\n\nWe recorded your requested schedule changes: ${changeRequestMessage}`, html: emailShell(decision === 'accepted' ? 'Schedule Confirmed' : 'Change Request Received', decision === 'accepted' ? `<p>Hello ${escapeHtml(vendorName)},</p><p>The schedule is confirmed. Your immutable work-order PDF is attached.</p><div class="panel"><p><strong>Schedule:</strong> ${escapeHtml(scheduleReference)}</p><p><strong>Service:</strong> ${escapeHtml(service)}</p><p><strong>Start:</strong> ${escapeHtml(scheduleTime(proposedStart))} Arizona time</p><p><strong>End:</strong> ${escapeHtml(scheduleTime(proposedEnd))} Arizona time</p></div>${completionUrl?`<p><a class="btn" href="${completionUrl}">Submit Job Completion</a></p><p class="muted">Use this private link after the work is finished.</p>`:''}` : `<p>Hello ${escapeHtml(vendorName)},</p><p>Your requested schedule changes were recorded.</p><div class="panel"><p>${escapeHtml(changeRequestMessage)}</p></div>`), attachments }); };
const sendStaffScheduleAlertEmail = ({ recipients, decision, vendorName, customerName, scheduleReference, requestReference, service, proposedStart, proposedEnd, changeRequestMessage }) => { const url = buildPublicUrl('/pages/admin-dashboard.html', 'scheduling'); return deliverEmail({ to: recipients, subject: decision === 'accepted' ? `Vendor accepted ${scheduleReference}` : `Vendor requested schedule changes — ${scheduleReference}`, text: `${vendorName} ${decision === 'accepted' ? 'accepted' : 'requested changes to'} ${scheduleReference}. ${changeRequestMessage || ''}\n\n${url}`, html: emailShell(decision === 'accepted' ? 'Vendor Accepted Schedule' : 'Vendor Requested Schedule Changes', `<p><strong>${escapeHtml(vendorName)}</strong> ${decision === 'accepted' ? 'accepted the proposed schedule.' : 'requested schedule changes.'}</p><div class="panel"><p><strong>Schedule:</strong> ${escapeHtml(scheduleReference)}</p><p><strong>Request:</strong> ${escapeHtml(requestReference)}</p><p><strong>Customer:</strong> ${escapeHtml(customerName)}</p><p><strong>Service:</strong> ${escapeHtml(service)}</p><p><strong>Start:</strong> ${escapeHtml(scheduleTime(proposedStart))}</p><p><strong>End:</strong> ${escapeHtml(scheduleTime(proposedEnd))}</p>${changeRequestMessage ? `<p><strong>Changes:</strong> ${escapeHtml(changeRequestMessage)}</p>` : ''}</div><p><a class="btn" href="${url}">Open Scheduling</a></p>`) }); };

const sendVendorCompletionLinkEmail = ({ recipients, completionToken, vendorName, completionReference, requestReference, service }) => { const url=buildPublicUrl('/pages/vendor-completion.html',`token=${encodeURIComponent(completionToken)}`);return deliverEmail({to:recipients,subject:`Job completion link — ${completionReference}`,text:`Hello ${vendorName},\n\nAfter completing ${service}, upload the required before and after photos here:\n${url}`,html:emailShell('Submit Job Completion',`<p>Hello ${escapeHtml(vendorName)},</p><p>Use the secure link below after completing <strong>${escapeHtml(service)}</strong>.</p><div class="panel"><p><strong>Completion:</strong> ${escapeHtml(completionReference)}</p><p><strong>Request:</strong> ${escapeHtml(requestReference)}</p></div><p><a class="btn" href="${url}">Submit Completion Photos</a></p>`)})};
const sendVendorCompletionConfirmationEmail = ({ recipients, vendorName, completionReference, service, completedAt }) => deliverEmail({to:recipients,subject:`Completion received — ${completionReference}`,text:`Hello ${vendorName},\n\nCompletion for ${service} was recorded on ${scheduleTime(completedAt)} Arizona time.`,html:emailShell('Completion Received',`<p>Hello ${escapeHtml(vendorName)},</p><p>The completion and photo evidence were recorded.</p><div class="panel"><p><strong>Completion:</strong> ${escapeHtml(completionReference)}</p><p><strong>Service:</strong> ${escapeHtml(service)}</p><p><strong>Completed:</strong> ${escapeHtml(scheduleTime(completedAt))} Arizona time</p></div>`)});
const sendCustomerCompletionSatisfactionEmail = ({ recipients, satisfactionToken, customerName, completionReference, invoiceNumber, requestReference, service, completedAt, amount, followup=false, attachments }) => {const url=buildPublicUrl('/pages/customer-satisfaction.html',`token=${encodeURIComponent(satisfactionToken)}`);return deliverEmail({to:recipients,subject:followup?`How did we do? — ${requestReference}`:`Service completed and invoice attached — ${invoiceNumber}`,text:`Hello ${customerName},\n\nYour ${service} service was completed on ${scheduleTime(completedAt)} Arizona time.${followup?' We would still appreciate your feedback.':` Invoice ${invoiceNumber} for $${Number(amount||0).toFixed(2)} is attached.`}\n\nShare feedback: ${url}`,html:emailShell(followup?'A Quick Follow-up':'Your Service Is Complete',`<p>Hello ${escapeHtml(customerName)},</p><p>${followup?'We would still appreciate your feedback about the completed service.':'Your service is complete. Your due-on-receipt invoice is attached.'}</p><div class="panel"><p><strong>Completion:</strong> ${escapeHtml(completionReference)}</p><p><strong>Request:</strong> ${escapeHtml(requestReference)}</p>${!followup?`<p><strong>Invoice:</strong> ${escapeHtml(invoiceNumber)}</p><p><strong>Total:</strong> $${escapeHtml(Number(amount||0).toFixed(2))}</p>`:''}</div><p><a class="btn" href="${url}">Share Your Feedback</a></p>`),attachments})};
const sendCustomerSatisfactionResultEmail = ({ recipients, customerName, completionReference, decision, issueMessage }) => deliverEmail({to:recipients,subject:decision==='issue_reported'?`We received your concern — ${completionReference}`:`Thank you for your feedback — ${completionReference}`,text:decision==='issue_reported'?`Hello ${customerName},\n\nWe recorded your concern: ${issueMessage}`:`Hello ${customerName},\n\nThank you for confirming that you are satisfied.`,html:emailShell(decision==='issue_reported'?'Your Concern Was Received':'Thank You',decision==='issue_reported'?`<p>Hello ${escapeHtml(customerName)},</p><p>We recorded your concern and our team will review it.</p><div class="panel"><p>${escapeHtml(issueMessage)}</p></div>`:`<p>Hello ${escapeHtml(customerName)},</p><p>Thank you for confirming that you are satisfied with the completed service.</p>`)});
const sendStaffCloseoutEmail = ({ recipients, completionReference, invoiceNumber, requestReference, customerName, vendorName, service, decision, issueMessage, resolutionNote }) => {const url=buildPublicUrl('/pages/admin-dashboard.html','workflow-center/stage-6');return deliverEmail({to:recipients,subject:decision==='issue_reported'?`Closeout issue reported — ${completionReference}`:resolutionNote?`Closeout issue resolved — ${completionReference}`:`Stage 6 update — ${completionReference}`,text:`${completionReference||'Closeout'} / ${requestReference||''}. ${issueMessage||resolutionNote||`${service||'Service'} completion recorded. Invoice ${invoiceNumber||''}.`}\n\n${url}`,html:emailShell(decision==='issue_reported'?'Customer Reported an Issue':resolutionNote?'Closeout Issue Resolved':'Stage 6 Update',`<div class="panel"><p><strong>Completion:</strong> ${escapeHtml(completionReference||'Closeout')}</p><p><strong>Request:</strong> ${escapeHtml(requestReference||'')}</p>${customerName?`<p><strong>Customer:</strong> ${escapeHtml(customerName)}</p>`:''}${vendorName?`<p><strong>Vendor:</strong> ${escapeHtml(vendorName)}</p>`:''}${issueMessage?`<p><strong>Issue:</strong> ${escapeHtml(issueMessage)}</p>`:''}${resolutionNote?`<p><strong>Resolution:</strong> ${escapeHtml(resolutionNote)}</p>`:''}</div><p><a class="btn" href="${url}">Open Completion &amp; Closeout</a></p>`)})};

module.exports = {
  deliverEmail,
  getEmailDeliveryStatus,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendVendorInvitationEmail,
  sendVendorSubmissionReceivedEmail,
  sendVendorDecisionEmail,
  sendStaffVendorSubmissionEmail,
  sendStaffVendorReviewUpdateEmail,
  sendWebsiteRequestConfirmationEmail,
  sendWebsiteOperationsAlertEmail,
  sendVendorQuoteInvitationEmail,
  sendVendorQuoteSubmissionConfirmationEmail,
  sendVendorQuoteStaffAlertEmail,
  sendCustomerOutgoingQuoteEmail,
  sendCustomerQuoteDecisionEmail,
  sendStaffQuoteDecisionAlertEmail
  ,sendVendorScheduleProposalEmail
  ,sendCustomerScheduleEmail
  ,sendVendorScheduleDecisionEmail
  ,sendStaffScheduleAlertEmail
  ,sendVendorCompletionLinkEmail
  ,sendVendorCompletionConfirmationEmail
  ,sendCustomerCompletionSatisfactionEmail
  ,sendCustomerSatisfactionResultEmail
  ,sendStaffCloseoutEmail
};
