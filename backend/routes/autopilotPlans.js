const express = require('express');
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Property = require('../models/Property');
const ResidentialPropertyProfile = require('../models/ResidentialPropertyProfile');
const Order = require('../models/Order');
const authenticateToken = require('../middleware/auth');
const checkRole = require('../middleware/rbac');

const router = express.Router();
const staffRoles = checkRole(['admin', 'manager', 'account_rep']);
const clean = (value, max = 200) => String(value || '').trim().slice(0, max);
const DEFAULT_SERVICES = [
  { key: 'hvac', label: 'HVAC tune-up', enabled: false, frequencyMonths: 6 },
  { key: 'roof', label: 'Roof and drainage check', enabled: false, frequencyMonths: 12 },
  { key: 'irrigation', label: 'Irrigation inspection', enabled: false, frequencyMonths: 6 },
  { key: 'water_heater', label: 'Water heater service', enabled: false, frequencyMonths: 12 },
  { key: 'pest', label: 'Pest prevention', enabled: false, frequencyMonths: 3 }
];

function serialize(property, customer, profile, openOrders = []) {
  const autopilot = profile?.autopilot || {};
  const services = (autopilot.services?.length ? autopilot.services : DEFAULT_SERVICES).map(service => {
    const order = openOrders.find(item => item.requestReference?.startsWith(`AUTOPILOT:${property._id}:${service.key}:`));
    return {
      key: service.key,
      label: service.label,
      enabled: service.enabled === true,
      frequencyMonths: service.frequencyMonths,
      nextDueAt: service.nextDueAt,
      order: order ? { id: String(order._id), orderId: order.orderId, status: order.status, amount: order.amount, pricingStatus: order.pricingStatus, scheduleDate: order.scheduleDate, createdAt: order.createdAt } : null
    };
  });
  const enabled = services.filter(service => service.enabled);
  const nextDueAt = enabled.map(service => service.nextDueAt).filter(Boolean).sort((a, b) => new Date(a) - new Date(b))[0] || null;
  return {
    id: profile ? String(profile._id) : null,
    property: { id: String(property._id), label: property.label, address: [property.addressLine1, property.addressLine2, property.city, property.state, property.postalCode].filter(Boolean).join(', ') },
    customer: { id: String(customer._id), name: customer.name, email: customer.email },
    enabled: autopilot.enabled === true,
    requestNote: clean(autopilot.requestNote, 2000),
    autoApprovalEnabled: autopilot.autoApprovalEnabled === true,
    autoApprovalThreshold: Number(autopilot.autoApprovalThreshold || 0),
    consentedAt: autopilot.consentedAt,
    services,
    enabledServiceCount: enabled.length,
    nextDueAt,
    updatedAt: profile?.updatedAt || property.updatedAt,
    auditHistory: (profile?.history || []).filter(event => /autopilot/.test(event.action)).slice(-10).reverse().map(event => ({ action: event.action, summary: event.summary, occurredAt: event.occurredAt }))
  };
}

router.get('/', authenticateToken, staffRoles, async (req, res, next) => {
  try {
    const customers = await Customer.find({ customerType: 'residential' }).select('_id name email phone status').lean();
    const customerById = new Map(customers.map(customer => [String(customer._id), customer]));
    const properties = await Property.find({ ownerCustomerId: { $in: customers.map(customer => customer._id) }, status: 'active' }).sort({ updatedAt: -1 }).lean();
    const profiles = await ResidentialPropertyProfile.find({ propertyId: { $in: properties.map(property => property._id) } }).lean();
    const openOrders = await Order.find({ propertyId: { $in: properties.map(property => property._id) }, requestReference: /^AUTOPILOT:/, status: { $nin: ['completed', 'cancelled'] } }).select('_id propertyId orderId status amount pricingStatus scheduleDate requestReference createdAt').sort({ createdAt: -1 }).lean();
    const profileByProperty = new Map(profiles.map(profile => [String(profile.propertyId), profile]));
    const plans = properties
      .map(property => serialize(property, customerById.get(String(property.ownerCustomerId)), profileByProperty.get(String(property._id)), openOrders.filter(order => String(order.propertyId) === String(property._id))))
      .filter(plan => plan.customer.id)
      .filter(plan => plan.id && plan.enabled && plan.enabledServiceCount > 0);
    res.json({
      data: plans,
      totals: {
        properties: plans.length,
        enrolled: plans.filter(plan => plan.enabled).length,
        autoApproval: plans.filter(plan => plan.autoApprovalEnabled).length,
        services: plans.reduce((sum, plan) => sum + plan.enabledServiceCount, 0)
      }
    });
  } catch (error) { next(error); }
});

router.post('/properties/:propertyId/services/:serviceKey/orders', authenticateToken, staffRoles, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.propertyId)) return res.status(400).json({ message: 'Invalid property id' });
    const property = await Property.findOne({ _id: req.params.propertyId, status: 'active' }).lean();
    if (!property) return res.status(404).json({ message: 'Property not found' });
    const customer = await Customer.findOne({ _id: property.ownerCustomerId, customerType: 'residential' }).select('_id name email phone').lean();
    if (!customer) return res.status(404).json({ message: 'Residential customer not found' });
    const profile = await ResidentialPropertyProfile.findOne({ propertyId: property._id });
    const service = profile?.autopilot?.services?.find(item => item.key === clean(req.params.serviceKey, 60));
    if (!profile?.autopilot?.enabled || !service?.enabled) return res.status(409).json({ message: 'This service is not currently requested by the customer' });

    const amount = Number(req.body?.price);
    const scheduledAt = req.body?.scheduledDate ? new Date(`${req.body.scheduledDate}T12:00:00.000Z`) : null;
    if (!Number.isFinite(amount) || amount < 0 || amount > 10000000) return res.status(400).json({ message: 'Enter a valid customer price' });
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) return res.status(400).json({ message: 'Choose the confirmed service date' });
    const existing = await Order.findOne({ propertyId: property._id, requestReference: new RegExp(`^AUTOPILOT:${property._id}:${service.key}:`), status: { $nin: ['completed', 'cancelled'] } });
    const now = new Date();
    let order = existing;
    if (order) {
      order.amount = amount;
      order.pricingStatus = 'quoted';
      order.scheduleDate = scheduledAt;
      order.workflowStatus = 'scheduled';
      order.status = 'scheduled';
      order.requiresIntakeReview = false;
      await order.save();
    } else {
      const orderCount = await Order.countDocuments();
      const customerOrderCount = await Order.countDocuments({ customerId: customer._id, workOrderNumber: { $exists: true } });
      const customerNote = clean(profile.autopilot.requestNote, 2000);
      order = await Order.create({
        orderId: `ORD-${String(orderCount + 1).padStart(3, '0')}-${Date.now().toString().slice(-4)}`,
        workOrderNumber: `WO-${String(customerOrderCount + 1).padStart(2, '0')}`,
        customerId: customer._id,
        propertyId: property._id,
        customer: {
          name: customer.name,
          email: customer.email || '',
          phone: customer.phone || '',
          address: [property.addressLine1, property.addressLine2, property.city, property.state, property.postalCode].filter(Boolean).join(', ')
        },
        service: service.label,
        amount,
        pricingStatus: 'quoted',
        source: 'residential_portal',
        requestReference: `AUTOPILOT:${property._id}:${service.key}:${Date.now()}`,
        workflowStatus: 'scheduled',
        requiresIntakeReview: false,
        status: 'scheduled',
        priority: 'medium',
        startDate: now,
        scheduleDate: scheduledAt,
        description: [`Recurring ${service.label} requested through Residential Autopilot.`, customerNote ? `Customer note: ${customerNote}` : ''].filter(Boolean).join('\n\n'),
        notes: `Confirmed by ${clean(req.user.email, 160) || 'SMPLfix staff'} from the customer's active Autopilot service request.`,
        orderType: 'one-time'
      });
    }

    service.nextDueAt = scheduledAt;
    profile.history.push({ action: 'autopilot_order_confirmed', actorId: req.user.userId, summary: `${service.label} confirmed for ${req.body.scheduledDate} at $${amount.toFixed(2)} (${order.orderId})` });
    await profile.save();
    res.status(existing ? 200 : 201).json({ order: { id: String(order._id), orderId: order.orderId, status: order.status, amount: order.amount, scheduleDate: order.scheduleDate }, message: `${service.label} confirmed` });
  } catch (error) { next(error); }
});

module.exports = router;
