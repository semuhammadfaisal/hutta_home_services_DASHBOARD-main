const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authenticateToken = require('../middleware/auth');
const checkRole = require('../middleware/rbac');
const { getEmailDeliveryStatus, sendWelcomeEmail, sendAgentApprovalEmail, sendCommercialApprovalEmail } = require('../utils/emailService');
const { revokeUserSessions } = require('../utils/authSessions');
const { ensureAgentProfile } = require('../utils/agentProfileProvisioning');
const { approveCommercialUser, parseOrganizationChoice } = require('../utils/commercialUserApproval');
const CommercialOrganization = require('../models/CommercialOrganization');
router.get('/commercial-organizations', authenticateToken, checkRole(['admin']), async (_req, res, next) => {
  try { res.json({ data: await CommercialOrganization.find({ status: 'active' }).select('_id name').sort({ name: 1 }).lean() }); }
  catch (error) { next(error); }
});

// Get all users (admin only, paginated)
router.get('/', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(2000, Math.max(1, parseInt(req.query.limit, 10) || 500));
    const skip = (page - 1) * limit;

    const [total, users] = await Promise.all([
      User.countDocuments(),
      User.find()
        .select('-password -resetPasswordToken -resetPasswordExpiry')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    res.json({
      data: users,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new user (admin only)
router.post('/', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const { email, password, firstName, lastName, role } = req.body;
    if (role === 'commercial') {
      const choice = parseOrganizationChoice(req.body);
      if (!choice.organizationId && !choice.newOrganizationName) return res.status(400).json({ message: 'Choose a commercial organization before creating this account' });
    }
    
    // Validate required fields
    if (!email || !password || !firstName || !lastName || !role) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    // Validate role
    if (!['admin', 'manager', 'account_rep', 'residential', 'real_estate_agent', 'commercial'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    
    // Create new user
    const user = new User({
      email,
      password,
      firstName,
      lastName,
      role,
      isActive: role !== 'commercial'
    });
    
    await user.save();
    if (role === 'commercial') await approveCommercialUser(user._id, req.body, req.user.userId);
    if (user.role === 'real_estate_agent') await ensureAgentProfile(user._id);
    
    // Send welcome email with credentials (non-blocking)
    (role === 'real_estate_agent' ? sendAgentApprovalEmail(email, firstName) : sendWelcomeEmail(email, password, firstName))
      .then(() => {
        console.log('Welcome email sent successfully to:', email);
      })
      .catch(emailError => {
        console.error('Failed to send welcome email:', emailError);
      });
    
    // Return immediately without waiting for email
    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Assign role to user (admin only)
router.patch('/:id/role', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const { role } = req.body;
    if (role === 'commercial') {
      try {
        const user = await approveCommercialUser(req.params.id, req.body, req.user.userId);
        await revokeUserSessions(user._id);
        try {
          const delivery = await sendCommercialApprovalEmail(user.email, user.firstName);
          user.commercialApprovalEmail = { status: 'accepted', attemptedAt: new Date(), messageId: delivery.messageId };
        } catch (error) {
          user.commercialApprovalEmail = { status: 'failed', attemptedAt: new Date() };
          console.error('Commercial approval email failed:', error.message);
        }
        await user.save();
        return res.json(user);
      } catch (error) { return res.status(error.status || 500).json({ message: error.status ? error.message : 'Commercial approval failed' }); }
    }
    
    if (!['admin', 'manager', 'account_rep', 'residential', 'real_estate_agent', 'commercial'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role, isActive: true },
      { new: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    await revokeUserSessions(user._id);
    if (user.role === 'real_estate_agent') {
      const profile = await ensureAgentProfile(user._id);
      if (profile?.status === 'active') {
        try {
          const delivery = await sendAgentApprovalEmail(user.email, user.firstName);
          user.agentApprovalEmail = { status: 'accepted', attemptedAt: new Date(), messageId: delivery.messageId };
          await user.save();
          res.set('X-Approval-Email-Status', 'sent');
        } catch (error) {
          console.error('Agent approval email delivery failed:', error.message);
          user.agentApprovalEmail = { status: 'failed', attemptedAt: new Date() };
          await user.save();
          res.set('X-Approval-Email-Status', 'failed');
        }
      }
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/:id/status', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    if (String(req.params.id) === String(req.user.userId) && req.body.isActive === false) {
      return res.status(400).json({ message: 'You cannot deactivate your own account' });
    }
    if (typeof req.body.isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive must be a boolean' });
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: req.body.isActive },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.isActive) await revokeUserSessions(user._id);
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete user (admin only)
router.delete('/:id', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Prevent admin from deleting themselves
    if (user._id.toString() === req.user.userId) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }
    
    await User.findByIdAndDelete(req.params.id);
    await revokeUserSessions(user._id);
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Test email configuration (admin only)
router.get('/test-email', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const emailStatus = getEmailDeliveryStatus();
    if (emailStatus.provider !== 'resend') {
      return res.status(500).json({ 
        message: 'Email not configured',
        details: {
          provider: emailStatus.provider,
          sender: emailStatus.sender,
          replyTo: emailStatus.replyTo,
          resendConfigured: emailStatus.resendConfigured,
          senderConfigured: emailStatus.senderConfigured,
          replyToConfigured: emailStatus.replyToConfigured
        }
      });
    }
    
    // Send test email
    await sendWelcomeEmail(
      req.user.email || 'test@example.com',
      'TestPassword123',
      'Test'
    );
    
    res.json({ 
      message: 'Test email sent successfully',
      sentTo: req.user.email || 'test@example.com'
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Failed to send test email',
      error: error.message 
    });
  }
});

module.exports = router;
