const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authenticateToken = require('../middleware/auth');
const checkRole = require('../middleware/rbac');
const { sendWelcomeEmail } = require('../utils/emailService');

// Get all users (admin only)
router.get('/', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new user (admin only)
router.post('/', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const { email, password, firstName, lastName, role } = req.body;
    
    // Validate required fields
    if (!email || !password || !firstName || !lastName || !role) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    // Validate role
    if (!['admin', 'manager', 'account_rep'].includes(role)) {
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
      isActive: true
    });
    
    await user.save();
    
    // Send welcome email with credentials (non-blocking)
    sendWelcomeEmail(email, password, firstName)
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
    
    if (!['admin', 'manager', 'account_rep'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
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
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Test email configuration (admin only)
router.get('/test-email', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const { sendWelcomeEmail } = require('../utils/emailService');
    
    // Check if email credentials are configured
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      return res.status(500).json({ 
        message: 'Email not configured',
        details: {
          EMAIL_USER: process.env.EMAIL_USER ? 'Set' : 'Missing',
          EMAIL_PASSWORD: process.env.EMAIL_PASSWORD ? 'Set' : 'Missing'
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
