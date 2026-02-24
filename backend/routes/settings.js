const express = require('express');
const Settings = require('../models/Settings');
const authenticateToken = require('../middleware/auth');
const router = express.Router();

// Get user settings
router.get('/', authenticateToken, async (req, res) => {
  try {
    let settings = await Settings.findOne({ userId: req.user.userId });
    
    if (!settings) {
      // Create default settings if none exist
      settings = new Settings({ userId: req.user.userId });
      await settings.save();
    }
    
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user settings
router.put('/', authenticateToken, async (req, res) => {
  try {
    let settings = await Settings.findOne({ userId: req.user.userId });
    
    if (!settings) {
      settings = new Settings({ userId: req.user.userId, ...req.body });
    } else {
      Object.assign(settings, req.body);
    }
    
    await settings.save();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Reset settings to default
router.post('/reset', authenticateToken, async (req, res) => {
  try {
    await Settings.findOneAndDelete({ userId: req.user.userId });
    
    const defaultSettings = new Settings({ userId: req.user.userId });
    await defaultSettings.save();
    
    res.json(defaultSettings);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;