const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  },
  connectionTimeout: 5000, // 5 seconds
  greetingTimeout: 5000,
  socketTimeout: 5000
});

const sendPasswordResetEmail = async (email, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL || 'https://hutta-home-services-dashboard.onrender.com'}/pages/reset-password.html?token=${resetToken}`;
  
  const mailOptions = {
    from: `"Hutta Home Services" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Password Reset Request',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
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

  await transporter.sendMail(mailOptions);
};

const sendWelcomeEmail = async (email, password, firstName) => {
  const loginUrl = 'https://hutta-home-services-dashboard-main.onrender.com';
  const path = require('path');
  const fs = require('fs');
  
  // Check if logo exists
  const logoPath = path.join(__dirname, '../../assets/images/logo.png');
  const logoExists = fs.existsSync(logoPath);
  
  const mailOptions = {
    from: `"Hutta Home Services" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Welcome to Hutta Home Services - Your Account Details',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
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
            <div class="greeting">Hello ${firstName}! 👋</div>
            
            <p class="intro-text">
              Welcome to Hutta Home Services! Your account has been successfully created by our administrator. 
              You now have access to our comprehensive dashboard to manage home services efficiently.
            </p>
            
            <div class="credentials-box">
              <div class="credentials-title">
                🔐 Your Login Credentials
              </div>
              <div class="credential-item">
                <div class="credential-label">📧 Email Address</div>
                <div class="credential-value">${email}</div>
              </div>
              <div class="credential-item">
                <div class="credential-label">🔑 Password</div>
                <div class="credential-value">${password}</div>
              </div>
            </div>
            
            <div class="button-container">
              <a href="${loginUrl}" class="button">🚀 Login to Dashboard</a>
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

  await transporter.sendMail(mailOptions);
};

module.exports = { sendPasswordResetEmail, sendWelcomeEmail };
