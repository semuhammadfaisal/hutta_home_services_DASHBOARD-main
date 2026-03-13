const express = require('express');
const Employee = require('../models/Employee');
const authenticateToken = require('../middleware/auth');
const checkRole = require('../middleware/rbac');
const router = express.Router();

// Get all employees
router.get('/', authenticateToken, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    const employees = await Employee.find().sort({ name: 1 });
    res.json(employees);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get employee performance stats - MUST BE BEFORE /:id
router.get('/:id/stats', authenticateToken, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    const Order = require('../models/Order');
    const employeeId = req.params.id;
    
    const orders = await Order.find({ employee: employeeId });
    
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, order) => sum + (order.amount || 0), 0);
    const totalProfit = orders.reduce((sum, order) => sum + ((order.amount || 0) - (order.vendorCost || 0)), 0);
    const activeOrders = orders.filter(o => ['new', 'in-progress'].includes(o.status)).length;
    const completedOrders = orders.filter(o => o.status === 'completed').length;
    
    res.json({
      totalOrders,
      totalRevenue,
      totalProfit,
      activeOrders,
      completedOrders
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single employee
router.get('/:id', authenticateToken, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    res.json(employee);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new employee
router.post('/', authenticateToken, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    const employee = new Employee(req.body);
    await employee.save();
    res.status(201).json(employee);
  } catch (error) {
    console.error('Employee creation error:', error);
    if (error.code === 11000) {
      res.status(400).json({ message: 'Employee with this email already exists' });
    } else if (error.name === 'ValidationError') {
      res.status(400).json({ message: error.message });
    } else {
      res.status(500).json({ message: error.message || 'Server error' });
    }
  }
});

// Update employee
router.put('/:id', authenticateToken, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    const employee = await Employee.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true }
    );
    
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    
    res.json(employee);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete employee
router.delete('/:id', authenticateToken, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;