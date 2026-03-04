// Test Script: Assign Employee to Order
// Run this in MongoDB or via Node.js to assign an employee to an existing order

const mongoose = require('mongoose');
require('dotenv').config();

const Order = require('./models/Order');
const Employee = require('./models/Employee');

async function assignEmployeeToOrder() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get first employee
    const employee = await Employee.findOne();
    if (!employee) {
      console.log('No employees found. Please create an employee first.');
      process.exit(1);
    }
    console.log('Found employee:', employee.name, employee._id);

    // Get first order without an employee
    const order = await Order.findOne({ employee: { $exists: false } });
    if (!order) {
      console.log('No orders without employees found.');
      process.exit(0);
    }
    console.log('Found order:', order.orderId);

    // Assign employee to order
    order.employee = employee._id;
    await order.save();
    console.log('✅ Successfully assigned', employee.name, 'to order', order.orderId);

    // Show stats
    const allOrders = await Order.find({ employee: employee._id });
    const totalRevenue = allOrders.reduce((sum, o) => sum + o.amount, 0);
    console.log('\nEmployee Stats:');
    console.log('- Total Orders:', allOrders.length);
    console.log('- Total Revenue: $' + totalRevenue.toLocaleString());

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

assignEmployeeToOrder();
