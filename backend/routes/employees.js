const express = require('express');
const mongoose = require('mongoose');
const Employee = require('../models/Employee');
const authenticateToken = require('../middleware/auth');
const checkRole = require('../middleware/rbac');
const router = express.Router();

// Get all employees
router.get('/', authenticateToken, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    const employees = await Employee.find().sort({ name: 1 }).lean();
    res.json(employees);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get employee performance stats - MUST BE BEFORE /:id
router.get('/:id/stats', authenticateToken, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    const Order = require('../models/Order');
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid employee id' });
    }
    const employeeObjectId = new mongoose.Types.ObjectId(req.params.id);

    const agg = await Order.aggregate([
      { $match: { employee: employeeObjectId } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: { $ifNull: ['$amount', 0] } },
          totalProfit: {
            $sum: {
              $subtract: [{ $ifNull: ['$amount', 0] }, { $ifNull: ['$vendorCost', 0] }]
            }
          },
          activeOrders: {
            $sum: { $cond: [{ $in: ['$status', ['new', 'in-progress']] }, 1, 0] }
          },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          }
        }
      }
    ]);

    const r = agg[0] || {
      totalOrders: 0,
      totalRevenue: 0,
      totalProfit: 0,
      activeOrders: 0,
      completedOrders: 0
    };

    res.json({
      totalOrders: r.totalOrders,
      totalRevenue: r.totalRevenue,
      totalProfit: r.totalProfit,
      activeOrders: r.activeOrders,
      completedOrders: r.completedOrders
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