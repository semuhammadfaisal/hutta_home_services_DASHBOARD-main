const express = require('express');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const Employee = require('../models/Employee');
const Order = require('../models/Order');
const { prefixRegex, parseLimit } = require('../utils/cursorPagination');

const router = express.Router();
const lookup = handler => async (req, res) => {
  try { res.set('Cache-Control', 'private, max-age=120, stale-while-revalidate=240'); res.json(await handler(req)); }
  catch (error) { res.status(500).json({ message: 'Unable to load options', error: error.message }); }
};

router.get('/customers', lookup(async req => {
  const search = prefixRegex(req.query.q); const query = search ? { $or: [{ normalizedName: search }, { normalizedEmail: search }, { normalizedPhone: search }] } : {};
  return Customer.find(query).select('name email phone address city state zipCode').sort({ normalizedName: 1 }).limit(parseLimit(req.query.limit, 20, 50)).lean();
}));
router.get('/vendors', lookup(async req => {
  const search = prefixRegex(req.query.q);
  const query = { isActive: true, $and: [{ $or: [{ onboardingSource: { $exists: false } }, { onboardingSource: 'manual' }, { onboardingStatus: 'approved' }] }] };
  if (search) query.$and.push({ $or: [{ normalizedName: search }, { normalizedEmail: search }, { category: search }] });
  return Vendor.find(query).select('name email phone category contractorLicenseNumber rocLicenseNumber certificateOfInsuranceOnFile insuranceExpirationDate').sort({ normalizedName: 1 }).limit(parseLimit(req.query.limit, 20, 50)).lean();
}));
router.get('/employees', lookup(async req => {
  const search = prefixRegex(req.query.q); const query = { isActive: { $ne: false } };
  if (search) query.$or = [{ normalizedName: search }, { normalizedEmail: search }];
  return Employee.find(query).select('name email phone role status').sort({ normalizedName: 1 }).limit(parseLimit(req.query.limit, 20, 50)).lean();
}));
router.get('/orders', lookup(async req => {
  const search = prefixRegex(req.query.q); const query = {};
  if (search) query.$or = [{ normalizedOrderId: search }, { normalizedRequestReference: search }, { normalizedCustomerName: search }];
  return Order.find(query).select('orderId requestReference customer.name service status workflowStatus').sort({ createdAt: -1 }).limit(parseLimit(req.query.limit, 20, 50)).lean();
}));

module.exports = router;
