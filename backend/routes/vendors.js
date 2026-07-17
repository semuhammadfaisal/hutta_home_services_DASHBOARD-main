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
const { encryptTaxId } = require('../utils/taxIdCrypto');
const { saveWithPersistentAttachmentMetadata } = require('../utils/attachmentMetadata');
const { prefixRegex, cursorFilter, parseLimit, pagePayload } = require('../utils/cursorPagination');
const router = express.Router();

router.get('/list', authenticateToken, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit);
    const approved = { $or: [{ onboardingSource: { $exists: false } }, { onboardingSource: 'manual' }, { onboardingStatus: 'approved' }] };
    const filters = [];
    if (req.query.status) filters.push({ isActive: req.query.status === 'active' });
    if (req.query.category) filters.push({ category: String(req.query.category) });
    const search = prefixRegex(req.query.search);
    if (search) filters.push({ $or: [{ normalizedName: search }, { normalizedEmail: search }, { category: search }] });
    const base = filters.length ? { $and: [approved, ...filters] } : approved;
    const after = cursorFilter(req.query.cursor, 'normalizedName', 1, 'string');
    const query = after ? { $and: [base, after] } : base;
    const [total, rows] = await Promise.all([
      Vendor.countDocuments(base),
      Vendor.find(query).select('name email phone category rating isActive onboardingStatus contractorLicenseNumber rocLicenseNumber certificateOfInsuranceOnFile insuranceExpirationDate createdAt normalizedName')
        .sort({ normalizedName: 1, _id: 1 }).limit(limit + 1).lean()
    ]);
    res.json(pagePayload(rows, total, limit, 'normalizedName'));
  } catch (error) { res.status(500).json({ message: 'Server error', error: error.message }); }
});

// Get all vendors
router.get('/', authenticateToken, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    const vendors = await Vendor.find({
      $or: [
        { onboardingSource: { $exists: false } },
        { onboardingSource: 'manual' },
        { onboardingStatus: 'approved' }
      ]
    }).sort({ name: 1 }).limit(100).lean();
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
    const vendorData = { ...req.body };
    delete vendorData.documents;
    delete vendorData.documentsMode;
    if (vendorData.einTaxId && !String(vendorData.einTaxId).includes('*')) {
      const encryptedTaxId = encryptTaxId(vendorData.einTaxId);
      vendorData.einTaxIdEncrypted = encryptedTaxId.encrypted;
      vendorData.einTaxIdIv = encryptedTaxId.iv;
      vendorData.einTaxIdTag = encryptedTaxId.tag;
      vendorData.einTaxIdLast4 = encryptedTaxId.last4;
    }
    delete vendorData.einTaxId;
    seedInitialNote(vendorData, req.body.notes, req);
    const vendor = new Vendor(vendorData);
    await vendor.save();
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
    const existingVendor = await Vendor.findById(req.params.id).select('documents onboardingSource onboardingStatus');
    if (!existingVendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    if (existingVendor.onboardingSource === 'invitation' && existingVendor.onboardingStatus !== 'approved') {
      return res.status(409).json({ message: 'Vendor applications are read-only until approved; use the Vendor Reviews workflow' });
    }
    const updateData = prepareDocumentUpdate(existingVendor.documents, stripNotesFromUpdate(req.body));
    ['onboardingSource', 'onboardingStatus', 'invitationId', 'submittedAt', 'reviewedAt', 'reviewedBy', 'reviewMessage', 'onboardingHistory', 'onboardingEmailStatus', 'onboardingEmailError']
      .forEach(field => delete updateData[field]);
    if (updateData.einTaxId && !String(updateData.einTaxId).includes('*')) {
      const encryptedTaxId = encryptTaxId(updateData.einTaxId);
      updateData.einTaxIdEncrypted = encryptedTaxId.encrypted;
      updateData.einTaxIdIv = encryptedTaxId.iv;
      updateData.einTaxIdTag = encryptedTaxId.tag;
      updateData.einTaxIdLast4 = encryptedTaxId.last4;
    }
    delete updateData.einTaxId;
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
    if (vendor.onboardingSource === 'invitation' && vendor.onboardingStatus !== 'approved') {
      return res.status(409).json({ message: 'Pending, changes-requested, and rejected applications are permanently retained in Vendor Reviews' });
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
