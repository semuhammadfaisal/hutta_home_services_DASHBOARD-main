const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authenticateToken = require('../middleware/auth');
const checkRole = require('../middleware/rbac');

// Get all users (admin only)
router.get('/', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
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

module.exports = router;
