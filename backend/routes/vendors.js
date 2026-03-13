const express = require('express');
const Vendor = require('../models/Vendor');
const authenticateToken = require('../middleware/auth');
const checkRole = require('../middleware/rbac');
const router = express.Router();

// Get all vendors
router.get('/', authenticateToken, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    const vendors = await Vendor.find().sort({ name: 1 });
    res.json(vendors);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single vendor
router.get('/:id', authenticateToken, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    res.json(vendor);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new vendor
router.post('/', authenticateToken, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    console.log('=== VENDOR CREATION DEBUG ===');
    console.log('req.body:', req.body);
    console.log('req.body.documents type:', typeof req.body.documents);
    console.log('req.body.documents is array:', Array.isArray(req.body.documents));
    console.log('req.body.documents:', JSON.stringify(req.body.documents));
    
    const vendor = new Vendor(req.body);
    await vendor.save();
    res.status(201).json(vendor);
  } catch (error) {
    console.error('Vendor creation error:', error);
    console.error('Error details:', error.errors);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// Update vendor
router.put('/:id', authenticateToken, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    console.log('Updating vendor with data:', req.body);
    const vendor = await Vendor.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true, runValidators: true }
    );
    
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    
    res.json(vendor);
  } catch (error) {
    console.error('Vendor update error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// Delete vendor
router.delete('/:id', authenticateToken, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    const vendor = await Vendor.findByIdAndDelete(req.params.id);
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    res.json({ message: 'Vendor deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;