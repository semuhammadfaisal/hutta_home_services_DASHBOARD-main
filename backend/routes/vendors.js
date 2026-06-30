const express = require('express');
const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const Order = require('../models/Order');
const authenticateToken = require('../middleware/auth');
const checkRole = require('../middleware/rbac');
const { invalidateDashboardStatsCache } = require('../utils/dashboardStatsCache');
const { seedInitialNote, stripNotesFromUpdate } = require('../utils/notes');
const { prepareDocumentUpdate } = require('../utils/documents');
const { retainEntityAttachments } = require('../utils/attachmentRetention');
const { saveWithPersistentAttachmentMetadata } = require('../utils/attachmentMetadata');
const router = express.Router();

// Get all vendors
router.get('/', authenticateToken, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    const vendors = await Vendor.find().sort({ name: 1 }).lean();
    res.json(vendors);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single vendor
router.get('/:id', authenticateToken, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    console.log('Fetched vendor from DB:', vendor);
    console.log('Vendor notes from DB:', vendor?.notes);
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    await saveWithPersistentAttachmentMetadata(vendor);
    res.json(vendor);
  } catch (error) {
    console.error('Error fetching vendor:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new vendor
router.post('/', authenticateToken, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    console.log('=== VENDOR CREATION DEBUG ===');
    console.log('req.body:', req.body);
    console.log('req.body.notes:', req.body.notes);
    console.log('req.body.documents type:', typeof req.body.documents);
    console.log('req.body.documents is array:', Array.isArray(req.body.documents));
    console.log('req.body.documents:', JSON.stringify(req.body.documents));
    
    const vendorData = { ...req.body };
    delete vendorData.documents;
    delete vendorData.documentsMode;
    seedInitialNote(vendorData, req.body.notes, req);
    const vendor = new Vendor(vendorData);
    console.log('Vendor before save:', vendor);
    console.log('Vendor notes before save:', vendor.notes);
    await vendor.save();
    console.log('Vendor after save:', vendor);
    console.log('Vendor notes after save:', vendor.notes);
    invalidateDashboardStatsCache();
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
    const existingVendor = await Vendor.findById(req.params.id).select('documents');
    if (!existingVendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    const updateData = prepareDocumentUpdate(existingVendor.documents, stripNotesFromUpdate(req.body));
    const vendor = await Vendor.findByIdAndUpdate(
      req.params.id, 
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    
    invalidateDashboardStatsCache();
    res.json(vendor);
  } catch (error) {
    console.error('Vendor update error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// Delete vendor
router.delete('/:id', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid vendor id' });
    }

    const vendor = await Vendor.findById(id);
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }

    await retainEntityAttachments('vendor', vendor, req);
    await vendor.deleteOne();

    try {
      await Order.updateMany({ vendor: id }, { $unset: { vendor: '' } });
    } catch (cleanupError) {
      console.error('Vendor order cleanup error:', cleanupError);
    }

    invalidateDashboardStatsCache();
    res.json({ message: 'Vendor deleted successfully' });
  } catch (error) {
    console.error('Vendor delete error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

module.exports = router;
