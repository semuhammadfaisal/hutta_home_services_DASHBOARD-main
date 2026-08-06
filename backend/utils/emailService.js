const { buildPublicUrl, getPublicAppUrl } = require('./publicAppUrl');

const nodemailer = require('nodemailer');
const Resend = require('resend').Resend;
const REQUIRED_SENDER_ADDRESS = 'sales@huttas.com';
const EMAIL_USER = String(process.env.EMAIL_USER || '').trim();
const EMAIL_PASSWORD = String(process.env.EMAIL_PASSWORD || '').trim();
const EMAIL_FROM = String(process.env.EMAIL_FROM || `Hutta Home Services <${REQUIRED_SENDER_ADDRESS}>`).trim();
const EMAIL_REPLY_TO = String(process.env.EMAIL_REPLY_TO || REQUIRED_SENDER_ADDRESS).trim();
const GMAIL_FROM = `Hutta Home Services <${EMAIL_USER}>`;

function extractEmailAddress(value) {
  const match = String(value || '').match(/<([^>]+)>/);
  return String(match ? match[1] : value || '').trim().toLowerCase();
}

function getEmailDeliveryStatus() {
  const resendConfigured = Boolean(String(process.env.RESEND_API_KEY || '').trim());
  const senderConfigured = extractEmailAddress(process.env.EMAIL_FROM) === REQUIRED_SENDER_ADDRESS;
  const replyToConfigured = extractEmailAddress(process.env.EMAIL_REPLY_TO) === REQUIRED_SENDER_ADDRESS;
  const userConfigured = Boolean(String(process.env.EMAIL_USER || '').trim());
  const passwordConfigured = Boolean(String(process.env.EMAIL_PASSWORD || '').trim());
  const provider = resendConfigured && senderConfigured && replyToConfigured
    ? 'resend'
    : (userConfigured && passwordConfigured ? 'gmail' : 'unconfigured');
  const warning = provider === 'unconfigured'
    ? 'Email delivery requires a verified Hutta Resend sender or EMAIL_USER and EMAIL_PASSWORD for Gmail fallback.'
    : null;
  return {
    provider,
    warning,
    publicAppUrl: getPublicAppUrl(),
    sender: provider === 'resend' ? REQUIRED_SENDER_ADDRESS : String(process.env.EMAIL_USER || '').trim(),
    replyTo: provider === 'resend' ? REQUIRED_SENDER_ADDRESS : String(process.env.EMAIL_USER || '').trim(),
    resendConfigured,
    senderConfigured,
    replyToConfigured,
    userConfigured,
    passwordConfigured
  };
}

const emailStatus = getEmailDeliveryStatus();
if (process.env.NODE_ENV === 'production' && emailStatus.provider === 'unconfigured') {
  throw new Error(emailStatus.warning);
}
const resend = emailStatus.provider === 'resend' ? new Resend(process.env.RESEND_API_KEY) : null;
const transporter = emailStatus.provider === 'gmail' ? nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user: EMAIL_USER, pass: EMAIL_PASSWORD },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000
}) : null;
console.log(`Using ${emailStatus.provider} for email delivery from ${emailStatus.sender || 'unconfigured'}`);
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
  if (resend) {
    const payload = { from: EMAIL_FROM, to, subject, html, text: plainText, replyTo: EMAIL_REPLY_TO };
    if (attachments?.length) payload.attachments = attachments;
    const result = await resend.emails.send(payload);
    if (result?.error) throw new Error(result.error.message || 'Email delivery failed');
    return { provider: 'resend', messageId: result?.data?.id || result?.id || null };
  }
  if (transporter) {
    const payload = { from: GMAIL_FROM, to, subject, html, text: plainText, replyTo: EMAIL_USER };
    if (attachments?.length) payload.attachments = attachments;
    const result = await transporter.sendMail(payload);
    return { provider: 'gmail', messageId: result?.messageId || null };
  }
  throw new Error('Email delivery is not configured');
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const emailShell = (title, content, options = {}) => {
  const preheader = escapeHtml(options.preheader || title);
  const subtitle = escapeHtml(options.subtitle || 'Hutta Home Services');
  const replyAddress = escapeHtml(EMAIL_REPLY_TO);
  return `
  <!doctype html><html lang="en">
  <head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
    <style>
      body{margin:0!important;padding:0!important;background:#f2f5f8;color:#17263a;font-family:Arial,"Helvetica Neue",Helvetica,sans-serif;-webkit-font-smoothing:antialiased}
      table{border-collapse:collapse;border-spacing:0}a{color:#075eb8}
      .preheader{display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all}
      .page{width:100%;background:#f2f5f8}.page-pad{padding:28px 12px}
      .wrap{width:100%;max-width:600px;background:#fff;border:1px solid #dce4ec;border-radius:12px;overflow:hidden}
      .brand{height:4px;background:#075eb8;font-size:0;line-height:0}
      .head{padding:28px 34px 23px;background:#ffffff;border-bottom:1px solid #e5ebf1;text-align:left}
      .wordmark{margin:0 0 24px;color:#075eb8;font-size:18px;line-height:1;font-weight:800;letter-spacing:-.02em}
      h1{margin:0;color:#0056b8;font-size:25px;line-height:1.25;font-weight:800;letter-spacing:-.02em}
      .subtitle{margin:7px 0 0;color:#6b7a8e;font-size:12px;line-height:1.5}
      .body{padding:28px 34px 30px;background:#fff;color:#3d4d61;font-size:15px;line-height:1.65}
      .body p{margin:0 0 15px}.body strong{color:#17263a}
      .btn{display:inline-block;margin:12px 0 20px;padding:12px 20px;border-radius:7px;background:#075eb8;color:#fff!important;text-decoration:none;font-weight:700;font-size:14px}
      .panel,.notice,.warning{margin:18px 0;padding:15px 17px;border-radius:8px}
      .panel{border:1px solid #dce5ee;background:#f7f9fb}
      .notice{border-left:3px solid #075eb8;background:#eff6fd;color:#334a65}
      .warning{border-left:3px solid #bd6b17;background:#fff7ed;color:#7a4217}
      .panel p:last-child,.notice p:last-child,.warning p:last-child{margin-bottom:0}
      .muted{color:#718096;font-size:12px;line-height:1.55}
      .link-box{margin:10px 0;padding:11px 12px;border:1px solid #dce5ee;border-radius:6px;background:#fff;color:#075eb8;font-size:12px;line-height:1.45;word-break:break-all}
      .credential-grid{margin:18px 0;border:1px solid #dce5ee;border-radius:8px;overflow:hidden;background:#fff}
      .credential-row{padding:14px 16px;border-bottom:1px solid #e6ecf2}.credential-row:last-child{border-bottom:0}
      .credential-label{margin:0 0 5px;color:#6b7a8e;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
      .credential-value{margin:0;color:#17263a!important;font-family:"Courier New",monospace;font-size:14px;font-weight:700;word-break:break-all;text-decoration:none!important}
      .foot{padding:20px 30px;background:#f7f9fb;border-top:1px solid #e1e8ef;color:#718096;font-size:11px;line-height:1.55;text-align:left}
      .foot strong{display:block;margin-bottom:4px;color:#17263a;font-size:12px}.foot a{color:#075eb8;text-decoration:none}
      .legal{padding-top:10px;color:#8a97a8;font-size:9px;line-height:1.45}
      @media only screen and (max-width:600px){.page-pad{padding:10px 6px}.head{padding:24px 21px 20px}.body{padding:24px 21px}.foot{padding:18px 21px}h1{font-size:22px}.btn{display:block;text-align:center}.wrap{border-radius:9px}}
    </style>
  </head>
  <body>
    <div class="preheader">${preheader}</div>
    <table role="presentation" class="page" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td class="page-pad" align="center">
          <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0">
            <tr><td class="brand">&nbsp;</td></tr>
            <tr>
              <td class="head">
                <p class="wordmark">Huttas</p>
                <h1>${escapeHtml(title)}</h1>
                <p class="subtitle">${subtitle}</p>
              </td>
            </tr>
            <tr><td class="body">${content}</td></tr>
            <tr>
              <td class="foot">
                <strong>Hutta Home Services</strong>
                Professional Home Services Management Platform<br>
                Questions? Reply to this email or contact <a href="mailto:${replyAddress}">${replyAddress}</a>.
                <div class="legal">This message was sent by Hutta Home Services. Do not forward private links or account credentials.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>`;
};

const vendorInvitationEmailShell = ({ companyName, categoryLabel, formUrl, expiresAt, personalMessage, purpose = 'initial' }) => {
  const changesRequested = purpose === 'changes_requested';
  const recipientName = escapeHtml(companyName || 'Vendor');
  const category = escapeHtml(categoryLabel || 'General Services');
  const categoryInitial = escapeHtml(String(categoryLabel || 'Service').trim().charAt(0).toUpperCase() || 'S');
  const secureUrl = escapeHtml(formUrl);
  const expiry = escapeHtml(new Date(expiresAt).toLocaleString('en-US', { timeZone: 'America/Phoenix' }));
  const replyAddress = escapeHtml(EMAIL_REPLY_TO);
  const reversedLogoUrl = escapeHtml(buildPublicUrl('/assets/images/smplfix-logo-reversed.png'));
  const inkLogoUrl = escapeHtml(buildPublicUrl('/assets/images/smplfix-logo-ink.png'));
  const eyebrow = changesRequested ? 'APPLICATION UPDATE' : 'INVITATION';
  const heading = changesRequested ? 'Vendor Application' : 'Vendor Onboarding';
  const headingAccent = changesRequested ? 'Updates' : 'Invitation';
  const intro = changesRequested
    ? 'We reviewed your submission and need a few updates. Use the private link below to revise your vendor information.'
    : 'We\'ve invited you to complete our secure vendor onboarding form and join the smplfix network.';
  const cta = changesRequested ? 'Update Vendor Application' : 'Open Secure Vendor Form';
  const preheader = changesRequested
    ? 'Updates are requested for your secure smplfix vendor application.'
    : 'Complete your secure smplfix vendor onboarding invitation.';
  const message = personalMessage
    ? `<tr><td style="padding:0 48px 26px"><p style="margin:0 0 8px;color:#0b0b0c;font-size:15px;line-height:1.45;font-weight:800">Message from our team:</p><p style="margin:0;color:#3f3f42;font-size:15px;line-height:1.65">${escapeHtml(personalMessage).replace(/\r?\n/g, '<br>')}</p></td></tr>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${heading} ${headingAccent}</title>
  <style>
    body{margin:0!important;padding:0!important;background:#f3f2ee;color:#0b0b0c;font-family:Arial,"Helvetica Neue",Helvetica,sans-serif;-webkit-font-smoothing:antialiased}
    table{border-collapse:collapse;border-spacing:0}img{border:0;display:block;outline:none;text-decoration:none}a{text-decoration:none}
    .vendor-preheader{display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all}
    .vendor-page{width:100%;background:#f3f2ee}.vendor-page-pad{padding:32px 12px}.vendor-wrap{width:100%;max-width:680px;overflow:hidden;border:1px solid #dfddd6;border-radius:14px;background:#fff;box-shadow:0 12px 38px rgba(11,11,12,.10)}
    .vendor-mobile-stack{display:table-cell}.vendor-cta{display:inline-block;padding:14px 21px;border:1px solid #0b0b0c;border-radius:8px;background:#0b0b0c;color:#fff!important;font-size:14px;line-height:1.2;font-weight:800}
    @media only screen and (max-width:620px){.vendor-page-pad{padding:8px 4px}.vendor-wrap{border-radius:10px}.vendor-header{padding:22px 22px!important}.vendor-header-tagline{display:none!important}.vendor-hero{padding:34px 24px 24px!important}.vendor-hero-icon{display:none!important}.vendor-content{padding-left:24px!important;padding-right:24px!important}.vendor-cta{display:block!important;text-align:center!important}.vendor-footer-brand,.vendor-footer-copy{display:block!important;width:100%!important;padding:0!important}.vendor-footer-copy{padding-top:18px!important;border-left:0!important}.vendor-footer-logo{margin:0!important}}
  </style>
</head>
<body>
  <div class="vendor-preheader">${escapeHtml(preheader)}</div>
  <table role="presentation" class="vendor-page" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td class="vendor-page-pad" align="center">
      <table role="presentation" class="vendor-wrap" width="680" cellpadding="0" cellspacing="0" border="0">
        <tr><td class="vendor-header" style="padding:24px 34px;background:#0b0b0c">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle"><img src="${reversedLogoUrl}" width="142" alt="smplfix" style="width:142px;max-width:100%;height:auto"></td>
            <td class="vendor-header-tagline" valign="middle" align="right" style="color:#f4f4f2;font-family:'Courier New',monospace;font-size:10px;line-height:1.4;letter-spacing:.20em;text-transform:uppercase">YOUR PROPERTY, HANDLED.</td>
          </tr></table>
        </td></tr>
        <tr><td class="vendor-hero" style="padding:42px 48px 30px;background:#fff">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle">
              <p style="margin:0 0 14px;color:#63715f;font-family:'Courier New',monospace;font-size:11px;line-height:1.3;font-weight:800;letter-spacing:.18em">${eyebrow}</p>
              <h1 style="margin:0;color:#0b0b0c;font-size:38px;line-height:1.05;font-weight:800;letter-spacing:-.035em">${heading}<br><span style="color:#667864">${headingAccent}</span></h1>
            </td>
            <td class="vendor-hero-icon" width="92" valign="middle" align="right"><div style="display:inline-block;width:68px;height:68px;border:1px solid #dddcd5;border-radius:12px;background:#f7f7f3;color:#667864;font-family:'Courier New',monospace;font-size:22px;line-height:68px;font-weight:800;text-align:center">VO</div></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:0 48px"><div style="height:1px;background:#e3e1db;font-size:0;line-height:0">&nbsp;</div></td></tr>
        <tr><td class="vendor-content" style="padding:34px 48px 24px;background:#fff">
          <p style="margin:0 0 20px;color:#0b0b0c;font-size:18px;line-height:1.35;font-weight:800">Hello ${recipientName},</p>
          <p style="margin:0;color:#28282b;font-size:16px;line-height:1.65">${intro}</p>
        </td></tr>
        <tr><td class="vendor-content" style="padding:0 48px 28px;background:#fff">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #dfddd6;border-radius:10px;background:#faf9f6"><tr>
            <td width="74" style="padding:20px 0 20px 22px" valign="middle"><div style="width:48px;height:48px;border-radius:50%;background:#edf0e9;color:#364235;font-family:'Courier New',monospace;font-size:20px;line-height:48px;font-weight:800;text-align:center">${categoryInitial}</div></td>
            <td style="padding:20px 22px 20px 10px" valign="middle"><p style="margin:0 0 7px;color:#5d615b;font-family:'Courier New',monospace;font-size:10px;line-height:1.3;font-weight:800;letter-spacing:.15em">ASSIGNED SERVICE CATEGORY</p><p style="margin:0;color:#0b0b0c;font-size:20px;line-height:1.25;font-weight:800">${category}</p></td>
          </tr></table>
        </td></tr>
        ${message}
        <tr><td class="vendor-content" style="padding:0 48px 26px;background:#fff"><a class="vendor-cta" href="${secureUrl}" target="_blank">${cta}&nbsp;&nbsp;&rsaquo;</a></td></tr>
        <tr><td class="vendor-content" style="padding:0 48px 34px;background:#fff">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #d9dcd4;border-left:4px solid #667864;border-radius:9px;background:#fafaf7"><tr>
            <td width="58" valign="top" style="padding:18px 0 18px 18px"><div style="width:38px;height:38px;border-radius:50%;background:#e9eee5;color:#4d614c;font-family:'Courier New',monospace;font-size:15px;line-height:38px;font-weight:800;text-align:center">1x</div></td>
            <td style="padding:18px 20px 18px 8px"><p style="margin:0 0 4px;color:#0b0b0c;font-size:14px;line-height:1.35;font-weight:800">Private one-time link</p><p style="margin:0;color:#3f3f42;font-size:13px;line-height:1.6">This link expires ${expiry} Arizona time.<br>Please do not forward it.</p></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:0 40px;background:#fff"><div style="height:1px;background:#e3e1db;font-size:0;line-height:0">&nbsp;</div></td></tr>
        <tr><td style="padding:24px 48px 14px;background:#fff">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td class="vendor-footer-brand" width="150" valign="middle"><img class="vendor-footer-logo" src="${inkLogoUrl}" width="112" alt="smplfix" style="width:112px;max-width:100%;height:auto"></td>
            <td class="vendor-footer-copy" valign="middle" style="padding-left:22px;border-left:1px solid #dfddd6;color:#3f3f42;font-size:11px;line-height:1.7">Professional Home Services Management Platform<br>Questions? Reply to this email or contact <a href="mailto:${replyAddress}" style="color:#4d614c;font-weight:700">${replyAddress}</a>.</td>
          </tr></table>
        </td></tr>
        <tr><td class="vendor-content" style="padding:8px 48px 28px;background:#fff;color:#858589;font-size:10px;line-height:1.55">This message was sent by smplfix. Do not forward private links or sensitive information.</td></tr>
      </table>
    </td></tr>
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
  const subject = purpose === 'changes_requested' ? 'Updates requested for your vendor application' : 'Your smplfix vendor onboarding invitation';
  return deliverEmail({
    to: email,
    subject,
    text: `${companyName ? `Hello ${companyName},` : 'Hello Vendor,'}\n\n${purpose === 'changes_requested' ? 'We reviewed your submission and need a few updates.' : 'You have been invited to complete the secure smplfix vendor onboarding form.'}\n\nAssigned service category: ${categoryLabel || 'General Services'}\n${personalMessage ? `\nMessage from our team: ${personalMessage}\n` : ''}\nOpen the secure form: ${formUrl}\n\nThis private one-time link expires ${new Date(expiresAt).toLocaleString('en-US', { timeZone: 'America/Phoenix' })} Arizona time. Do not forward it.`,
    html: vendorInvitationEmailShell({ companyName, categoryLabel, formUrl, expiresAt, personalMessage, purpose })
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
    subject: `Your Hutta service quote - ${quoteReference}`,
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
const paymentInstructionsHtml = snapshot => {
  const methods = (snapshot?.paymentMethods || []).filter(method => method.enabled !== false);
  if (!methods.length) return `<p class="muted">Contact ${escapeHtml(EMAIL_REPLY_TO)} for payment instructions.</p>`;
  return methods.map(method => `<p><strong>${escapeHtml(method.label)}:</strong><br>${escapeHtml(method.instructions).replace(/\n/g,'<br>')}</p>`).join('');
};
const sendCustomerCompletionSatisfactionEmail = ({
  recipients, satisfactionToken, customerName, completionReference, invoiceNumber, requestReference,
  orderReference, service, address, scopeOfWork, vendorName, scheduledStart, scheduledEnd, completedAt,
  completionNotes, amount, paymentInstructions, followup=false, resolutionNote, attachments
}) => {
  const url=buildPublicUrl('/pages/customer-satisfaction.html',`token=${encodeURIComponent(satisfactionToken)}`);
  const hasBefore = attachments?.some(item => item.inlineContentId === 'before-evidence');
  const hasAfter = attachments?.some(item => item.inlineContentId === 'after-evidence');
  const evidence = !followup && hasBefore && hasAfter
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-collapse:separate">
        <tr>
          <td width="50%" style="padding:0 6px 0 0">
            <div style="padding:9px 12px;background:#eef5fc;border:1px solid #d9e6f2;border-bottom:0;border-radius:9px 9px 0 0;color:#075eb8;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em">Before service</div>
            <img src="cid:before-evidence" alt="Before service" width="286" style="display:block;width:100%;height:190px;object-fit:cover;border:1px solid #d9e6f2;border-radius:0 0 9px 9px">
          </td>
          <td width="50%" style="padding:0 0 0 6px">
            <div style="padding:9px 12px;background:#eaf8f1;border:1px solid #cce9db;border-bottom:0;border-radius:9px 9px 0 0;color:#087c50;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em">After service</div>
            <img src="cid:after-evidence" alt="After service" width="286" style="display:block;width:100%;height:190px;object-fit:cover;border:1px solid #cce9db;border-radius:0 0 9px 9px">
          </td>
        </tr>
      </table>`
    : '';
  const title = resolutionNote ? 'Your Service Issue Was Addressed' : followup ? 'Please Review Your Completed Service' : 'Your Service Is Ready for Review';
  const intro = resolutionNote
    ? `Our team recorded the following resolution: ${resolutionNote}`
    : followup
      ? 'Your completed service is still awaiting your review.'
      : 'The vendor has submitted completion details and photo evidence. Please review the work and confirm whether it is complete.';
  return deliverEmail({
    to:recipients,
    subject:resolutionNote?`Please review the resolved service — ${requestReference}`:followup?`Closeout reminder — ${requestReference}`:`Review completed work and invoice — ${invoiceNumber}`,
    text:`Hello ${customerName},\n\n${intro}\n\nService: ${service}\nAddress: ${address||''}\nCompletion: ${completionReference}\nInvoice: ${invoiceNumber}\nAmount due: $${Number(amount||0).toFixed(2)}\n\nReview work, evidence, invoice, and payment instructions: ${url}`,
    html:emailShell(title,`
      <p>Hello ${escapeHtml(customerName)},</p><p>${escapeHtml(intro)}</p>
      <div class="panel">
        <p><strong>Request:</strong> ${escapeHtml(requestReference)}${orderReference?` · ${escapeHtml(orderReference)}`:''}</p>
        <p><strong>Completion:</strong> ${escapeHtml(completionReference)}</p>
        <p><strong>Service:</strong> ${escapeHtml(service)}</p>
        ${address?`<p><strong>Address:</strong> ${escapeHtml(address)}</p>`:''}
        ${vendorName?`<p><strong>Contractor:</strong> ${escapeHtml(vendorName)}</p>`:''}
        ${scopeOfWork?`<p><strong>Approved scope:</strong> ${escapeHtml(scopeOfWork)}</p>`:''}
        ${scheduledStart?`<p><strong>Scheduled:</strong> ${escapeHtml(scheduleTime(scheduledStart))} through ${escapeHtml(scheduleTime(scheduledEnd))} Arizona time</p>`:''}
        <p><strong>Completed:</strong> ${escapeHtml(scheduleTime(completedAt))} Arizona time</p>
        ${completionNotes?`<p><strong>Completion notes:</strong> ${escapeHtml(completionNotes)}</p>`:''}
      </div>
      ${evidence}
      <div class="panel"><p><strong>Invoice:</strong> ${escapeHtml(invoiceNumber)}</p><p><strong>Amount due:</strong> $${escapeHtml(Number(amount||0).toFixed(2))}</p>${paymentInstructionsHtml(paymentInstructions)}</div>
      <p><a class="btn" href="${url}">Review Work &amp; Complete Closeout</a></p>
      <p class="muted">The secure page contains the complete before-and-after gallery. Payment proof is reviewed separately by the Hutta Home Services team.</p>
    `,{preheader:`Review completed work for ${requestReference}.`}),
    attachments
  });
};
const sendCustomerSatisfactionResultEmail = ({ recipients, customerName, completionReference, decision, issueMessage }) => deliverEmail({to:recipients,subject:decision==='issue_reported'?`We received your concern — ${completionReference}`:`Thank you for your feedback — ${completionReference}`,text:decision==='issue_reported'?`Hello ${customerName},\n\nWe recorded your concern: ${issueMessage}`:`Hello ${customerName},\n\nThank you for confirming that you are satisfied.`,html:emailShell(decision==='issue_reported'?'Your Concern Was Received':'Thank You',decision==='issue_reported'?`<p>Hello ${escapeHtml(customerName)},</p><p>We recorded your concern and our team will review it.</p><div class="panel"><p>${escapeHtml(issueMessage)}</p></div>`:`<p>Hello ${escapeHtml(customerName)},</p><p>Thank you for confirming that you are satisfied with the completed service.</p>`)});
const sendStaffCloseoutEmail = ({ recipients, completionReference, invoiceNumber, requestReference, customerName, vendorName, service, decision, issueMessage, resolutionNote }) => {const url=buildPublicUrl('/pages/admin-dashboard.html','workflow-center/stage-6');return deliverEmail({to:recipients,subject:decision==='issue_reported'?`Closeout issue reported — ${completionReference}`:resolutionNote?`Closeout issue resolved — ${completionReference}`:`Stage 6 update — ${completionReference}`,text:`${completionReference||'Closeout'} / ${requestReference||''}. ${issueMessage||resolutionNote||`${service||'Service'} completion recorded. Invoice ${invoiceNumber||''}.`}\n\n${url}`,html:emailShell(decision==='issue_reported'?'Customer Reported an Issue':resolutionNote?'Closeout Issue Resolved':'Stage 6 Update',`<div class="panel"><p><strong>Completion:</strong> ${escapeHtml(completionReference||'Closeout')}</p><p><strong>Request:</strong> ${escapeHtml(requestReference||'')}</p>${customerName?`<p><strong>Customer:</strong> ${escapeHtml(customerName)}</p>`:''}${vendorName?`<p><strong>Vendor:</strong> ${escapeHtml(vendorName)}</p>`:''}${issueMessage?`<p><strong>Issue:</strong> ${escapeHtml(issueMessage)}</p>`:''}${resolutionNote?`<p><strong>Resolution:</strong> ${escapeHtml(resolutionNote)}</p>`:''}</div><p><a class="btn" href="${url}">Open Completion &amp; Closeout</a></p>`)})};
const sendCustomerPaymentProofEmail = ({ recipients, customerName, proofReference, invoiceNumber, amount, rejectionReason, status }) => {
  const rejected=status==='rejected';const verified=status==='verified';
  const title=rejected?'Payment Proof Needs Attention':verified?'Payment Proof Verified':'Payment Proof Received';
  return deliverEmail({to:recipients,subject:`${title} — ${invoiceNumber}`,text:`Hello ${customerName},\n\n${title}. Proof ${proofReference} for $${Number(amount||0).toFixed(2)}.${rejectionReason?`\nReason: ${rejectionReason}`:''}`,html:emailShell(title,`<p>Hello ${escapeHtml(customerName)},</p><p>${verified?'Your payment proof was verified and the Payment was marked received.':rejected?'The submitted proof could not be verified. You may upload a replacement from your secure closeout page.':'We received your payment proof. It remains pending until a staff member verifies it.'}</p><div class="panel"><p><strong>Proof:</strong> ${escapeHtml(proofReference)}</p><p><strong>Invoice:</strong> ${escapeHtml(invoiceNumber)}</p><p><strong>Amount:</strong> $${escapeHtml(Number(amount||0).toFixed(2))}</p>${rejectionReason?`<p><strong>Reason:</strong> ${escapeHtml(rejectionReason)}</p>`:''}</div>`)});
};
const sendStaffPaymentProofEmail = ({ recipients, customerName, proofReference, invoiceNumber, requestReference, amount }) => {
  const url=buildPublicUrl('/pages/admin-dashboard.html','workflow-center/stage-6');
  return deliverEmail({to:recipients,subject:`Payment proof awaiting review — ${proofReference}`,text:`${customerName} submitted ${proofReference} for ${invoiceNumber}, $${Number(amount||0).toFixed(2)}.\n\n${url}`,html:emailShell('Payment Proof Awaiting Review',`<div class="panel"><p><strong>Proof:</strong> ${escapeHtml(proofReference)}</p><p><strong>Request:</strong> ${escapeHtml(requestReference)}</p><p><strong>Customer:</strong> ${escapeHtml(customerName)}</p><p><strong>Invoice:</strong> ${escapeHtml(invoiceNumber)}</p><p><strong>Amount:</strong> $${escapeHtml(Number(amount||0).toFixed(2))}</p></div><p><a class="btn" href="${url}">Review Payment Proof</a></p>`)});
};

module.exports = {
  deliverEmail,
  getEmailDeliveryStatus,
  vendorInvitationEmailShell,
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
  ,sendCustomerPaymentProofEmail
  ,sendStaffPaymentProofEmail
};
