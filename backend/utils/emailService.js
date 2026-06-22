const nodemailer = require('nodemailer');
const { buildPublicUrl, getPublicAppUrl } = require('./publicAppUrl');

const Resend = require('resend').Resend;
const FREE_OR_TEST_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
  'live.com', 'icloud.com', 'aol.com', 'resend.dev'
]);

function extractEmailAddress(value) {
  const match = String(value || '').match(/<([^>]+)>/);
  return String(match ? match[1] : value || '').trim().toLowerCase();
}

function hasBusinessSender() {
  const address = extractEmailAddress(process.env.EMAIL_FROM);
  const domain = address.split('@')[1];
  return Boolean(address && domain && !FREE_OR_TEST_DOMAINS.has(domain));
}

function getEmailDeliveryStatus() {
  const resendConfigured = Boolean(process.env.RESEND_API_KEY);
  const verifiedSenderConfigured = hasBusinessSender();
  const gmailConfigured = Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASSWORD);
  const provider = resendConfigured && verifiedSenderConfigured ? 'resend' : gmailConfigured ? 'gmail' : 'unconfigured';
  const warning = provider === 'gmail'
    ? 'Temporary Gmail delivery is active. Vendor messages may be placed in Spam until a business domain is verified with Resend.'
    : provider === 'unconfigured'
      ? 'Email delivery is not configured. Invitations are retained and their secure links can still be copied.'
      : null;
  return {
    provider,
    warning,
    publicAppUrl: getPublicAppUrl(),
    resendConfigured,
    verifiedSenderConfigured,
    gmailConfigured
  };
}

const emailStatus = getEmailDeliveryStatus();
const resend = emailStatus.provider === 'resend' ? new Resend(process.env.RESEND_API_KEY) : null;
console.log(`Using ${emailStatus.provider === 'gmail' ? 'Gmail SMTP' : emailStatus.provider} for email delivery`);
if (emailStatus.warning) console.warn(`Email delivery warning: ${emailStatus.warning}`);

const transporter = emailStatus.provider === 'gmail' ? nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000
}) : null;

const emailFrom = emailStatus.provider === 'resend'
  ? process.env.EMAIL_FROM
  : `Hutta Home Services <${process.env.EMAIL_USER || 'unconfigured@localhost'}>`;
const replyTo = process.env.EMAIL_REPLY_TO || process.env.EMAIL_USER || extractEmailAddress(process.env.EMAIL_FROM) || undefined;

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
    const result = await resend.emails.send({ from: emailFrom, to, subject, html, text: plainText, replyTo });
    if (result?.error) throw new Error(result.error.message || 'Email delivery failed');
    return { provider: 'resend', messageId: result?.data?.id || result?.id || null };
  }
  if (!transporter) {
    throw new Error('Email credentials are not configured');
  }
  const result = await transporter.sendMail({ from: emailFrom, replyTo, to, subject, html, text: plainText, attachments });
  return { provider: 'gmail', messageId: result?.messageId || null };
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const emailShell = (title, content) => `
  <!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body{margin:0;padding:24px;background:#f4f7fb;color:#1f2937;font-family:Arial,sans-serif}.wrap{max-width:620px;margin:auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #dbe4f0}.head{padding:28px;background:#0056b8;color:#fff}.head h1{margin:0;font-size:24px}.body{padding:30px;line-height:1.65}.btn{display:inline-block;margin:18px 0;padding:13px 22px;border-radius:8px;background:#0056b8;color:#fff!important;text-decoration:none;font-weight:700}.muted{color:#64748b;font-size:13px}.foot{padding:18px 30px;background:#f8fafc;color:#64748b;font-size:12px}
  </style></head><body><div class="wrap"><div class="head"><h1>${escapeHtml(title)}</h1></div><div class="body">${content}</div><div class="foot">Hutta Home Services &middot; Secure Vendor Onboarding</div></div></body></html>`;

const sendPasswordResetEmail = async (email, resetToken) => {
  const resetUrl = buildPublicUrl(`/pages/reset-password.html?token=${encodeURIComponent(resetToken)}`);
  
  const mailOptions = {
    from: `"Hutta Home Services" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Password Reset Request',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: "Inter", "Plus Jakarta Sans", "Manrope", sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #3b82f6, #10b981); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #3b82f6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>You requested to reset your password for your Hutta Home Services account.</p>
            <p>Click the button below to reset your password:</p>
            <a href="${resetUrl}" class="button">Reset Password</a>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #3b82f6;">${resetUrl}</p>
            <p><strong>This link will expire in 1 hour.</strong></p>
            <p>If you didn't request this, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Hutta Home Services. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  await deliverEmail(mailOptions);
};

const sendWelcomeEmail = async (email, password, firstName) => {
  try {
    console.log('Attempting to send welcome email to:', email);
    console.log('EMAIL_USER configured:', process.env.EMAIL_USER ? 'Yes' : 'No');
    console.log('EMAIL_PASSWORD configured:', process.env.EMAIL_PASSWORD ? 'Yes' : 'No');
    
    if (!resend && (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD)) {
      throw new Error('Email credentials not configured');
    }
    
    const loginUrl = getPublicAppUrl();
    const path = require('path');
    const fs = require('fs');
    
    // Check if logo exists
    const logoPath = path.join(__dirname, '../../assets/images/logo.png');
    const logoExists = fs.existsSync(logoPath);
    console.log('Logo exists:', logoExists);
  
  const mailOptions = {
    from: `"Hutta Home Services" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Welcome to Hutta Home Services - Your Account Details',
    text: `Hello ${firstName},\n\nWelcome to Hutta Home Services.\n\nEmail: ${email}\nPassword: ${password}\n\nLogin: ${loginUrl}\n\nPlease change your password after your first login.`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: "Inter", "Plus Jakarta Sans", "Manrope", sans-serif; 
            line-height: 1.6; 
            color: #333333; 
            background-color: #f5f7fa;
            padding: 20px;
          }
          .email-wrapper { 
            max-width: 600px; 
            margin: 0 auto; 
            background: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0, 86, 184, 0.15);
          }
          .header { 
            background: linear-gradient(135deg, #0056B8 0%, #003d82 100%);
            color: white; 
            padding: 40px 30px;
            text-align: center;
            position: relative;
          }
          .header::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, #0056B8, #00a8e8);
          }
          .logo-container {
            margin-bottom: 20px;
          }
          .logo-text {
            font-size: 32px;
            font-weight: 700;
            letter-spacing: -0.5px;
            margin: 0;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          }
          .header-subtitle {
            font-size: 16px;
            opacity: 0.95;
            margin-top: 8px;
            font-weight: 400;
          }
          .content { 
            background: #ffffff;
            padding: 40px 30px;
          }
          .greeting {
            font-size: 20px;
            font-weight: 600;
            color: #0056B8;
            margin-bottom: 20px;
          }
          .intro-text {
            font-size: 15px;
            color: #4A4A4A;
            margin-bottom: 30px;
            line-height: 1.7;
          }
          .credentials-box { 
            background: linear-gradient(135deg, #f8fbff 0%, #f0f7ff 100%);
            padding: 25px;
            border-radius: 12px;
            margin: 30px 0;
            border: 2px solid #e6f0ff;
            box-shadow: 0 2px 8px rgba(0, 86, 184, 0.08);
          }
          .credentials-title {
            font-size: 16px;
            font-weight: 700;
            color: #0056B8;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .credential-item { 
            margin: 16px 0;
          }
          .credential-label { 
            font-weight: 600;
            color: #4A4A4A;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
          }
          .credential-value { 
            color: #000000;
            font-family: 'Courier New', monospace;
            background: #ffffff;
            padding: 12px 16px;
            border-radius: 8px;
            display: block;
            font-size: 15px;
            font-weight: 600;
            border: 1px solid #d1e3f8;
            word-break: break-all;
          }
          .button-container {
            text-align: center;
            margin: 35px 0;
          }
          .button { 
            display: inline-block;
            background: linear-gradient(135deg, #0056B8 0%, #003d82 100%);
            color: white !important;
            padding: 16px 40px;
            text-decoration: none;
            border-radius: 10px;
            font-weight: 600;
            font-size: 16px;
            box-shadow: 0 4px 15px rgba(0, 86, 184, 0.3);
            transition: all 0.3s ease;
          }
          .button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0, 86, 184, 0.4);
          }
          .warning-box { 
            background: linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%);
            border-left: 4px solid #ffa726;
            padding: 20px;
            border-radius: 8px;
            margin: 30px 0;
          }
          .warning-box strong {
            color: #e65100;
            font-size: 15px;
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
          }
          .warning-box p {
            color: #5d4037;
            margin: 8px 0 0 0;
            font-size: 14px;
            line-height: 1.6;
          }
          .divider {
            height: 1px;
            background: linear-gradient(90deg, transparent, #e6f0ff, transparent);
            margin: 30px 0;
          }
          .support-text {
            font-size: 14px;
            color: #6b7280;
            text-align: center;
            margin-top: 25px;
            line-height: 1.6;
          }
          .footer { 
            background: #f8f9fa;
            text-align: center;
            padding: 30px;
            border-top: 1px solid #e5e7eb;
          }
          .footer-text {
            color: #6b7280;
            font-size: 13px;
            margin: 8px 0;
          }
          .footer-brand {
            color: #0056B8;
            font-weight: 700;
            font-size: 14px;
            margin-bottom: 8px;
          }
          @media only screen and (max-width: 600px) {
            body { padding: 10px; }
            .header { padding: 30px 20px; }
            .content { padding: 30px 20px; }
            .logo-text { font-size: 26px; }
            .button { padding: 14px 30px; font-size: 15px; }
            .credentials-box { padding: 20px; }
          }
        </style>
      </head>
      <body>
        <div class="email-wrapper">
          <div class="header">
            <div class="logo-container">
              ${logoExists ? '<img src="cid:company-logo" alt="Hutta\'s Home Services" style="max-width: 200px; height: auto; margin-bottom: 15px;" />' : ''}
              <h1 class="logo-text">Hutta's Home Services</h1>
            </div>
            <p class="header-subtitle">Professional Home Services Management</p>
          </div>
          
          <div class="content">
            <div class="greeting">Hello ${firstName}! </div>
            
            <p class="intro-text">
              Welcome to Hutta Home Services! Your account has been successfully created by our administrator. 
              You now have access to our comprehensive dashboard to manage home services efficiently.
            </p>
            
            <div class="credentials-box">
              <div class="credentials-title">
                 Your Login Credentials
              </div>
              <div class="credential-item">
                <div class="credential-label"> Email Address</div>
                <div class="credential-value">${email}</div>
              </div>
              <div class="credential-item">
                <div class="credential-label"> Password</div>
                <div class="credential-value">${password}</div>
              </div>
            </div>
            
            <div class="button-container">
              <a href="${loginUrl}" class="button"> Login to Dashboard</a>
            </div>
            
            <div class="divider"></div>
            
            <p class="support-text">
              If you have any questions or need assistance getting started, our support team is here to help. 
              We're excited to have you on board!
            </p>
          </div>
          
          <div class="footer">
            <div class="footer-brand">Hutta Home Services</div>
            <p class="footer-text">&copy; ${new Date().getFullYear()} Hutta Home Services. All rights reserved.</p>
            <p class="footer-text">Professional Home Services Management Platform</p>
          </div>
        </div>
      </body>
      </html>
    `
  };
  
  // Add logo attachment only if it exists
  if (logoExists) {
    mailOptions.attachments = [{
      filename: 'logo.png',
      path: logoPath,
      cid: 'company-logo'
    }];
  }

  console.log('Sending email to:', email);
  
  const result = await deliverEmail(mailOptions);
  console.log('Welcome email delivered');
  return result;
  } catch (error) {
    console.error('Email sending error:', error.message);
    console.error('Error details:', error);
    throw error;
  }
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
      <p><strong>Assigned service category:</strong> ${escapeHtml(categoryLabel)}</p>
      ${personalMessage ? `<p><strong>Message from our team:</strong><br>${escapeHtml(personalMessage)}</p>` : ''}
      <p><a class="btn" href="${formUrl}">${purpose === 'changes_requested' ? 'Update Application' : 'Open Secure Vendor Form'}</a></p>
      <p class="muted">This one-time link expires ${escapeHtml(new Date(expiresAt).toLocaleString('en-US', { timeZone: 'America/Phoenix' }))} Arizona time. Do not forward it.</p>
    `)
  });
};

const sendVendorSubmissionReceivedEmail = ({ email, companyName }) => deliverEmail({
  to: email,
  subject: 'Vendor application received',
  html: emailShell('Application Received', `
    <p>Hello ${escapeHtml(companyName || 'Vendor')},</p>
    <p>We received your vendor application and documents. Our team will review the submission and contact you if anything else is needed.</p>
    <p>No action is required right now.</p>
  `)
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
    `)
  });
};

const sendStaffVendorSubmissionEmail = ({ emails, companyName, vendorId }) => {
  if (!emails?.length) return Promise.resolve();
  const reviewUrl = buildPublicUrl('/pages/admin-dashboard.html', 'vendors');
  return deliverEmail({
    to: emails,
    subject: `Vendor application submitted: ${companyName}`,
    text: `${companyName} submitted a vendor application.\n\nReview vendor: ${reviewUrl}\nVendor reference: ${vendorId}`,
    html: emailShell('Vendor Submission Ready for Review', `
      <p><strong>${escapeHtml(companyName)}</strong> submitted a vendor application.</p>
      <p><a class="btn" href="${reviewUrl}">Review Vendor</a></p>
      <p class="muted">Vendor reference: ${escapeHtml(vendorId)}</p>
    `)
  });
};

module.exports = {
  deliverEmail,
  getEmailDeliveryStatus,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendVendorInvitationEmail,
  sendVendorSubmissionReceivedEmail,
  sendVendorDecisionEmail,
  sendStaffVendorSubmissionEmail
};
