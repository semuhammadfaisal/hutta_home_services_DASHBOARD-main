/**
 * Migration Script: Create Payment Records for Existing Orders
 * 
 * This script creates pending payment records for all orders that don't have payments yet.
 * It's safe to run multiple times - it will skip orders that already have payments.
 * 
 * Usage:
 *   node migrate-orders-to-payments.js
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Order = require('./models/Order');
const Payment = require('./models/Payment');
const Customer = require('./models/Customer');

// MongoDB connection string from .env file
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hutta_home_services';

async function migrateOrdersToPayments() {
  try {
    console.log('🚀 Starting migration: Create payments for existing orders...\n');
    
    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Get all orders
    console.log('📋 Fetching all orders...');
    const orders = await Order.find().lean();
    console.log(`✅ Found ${orders.length} orders\n`);
    
    if (orders.length === 0) {
      console.log('ℹ️  No orders found. Nothing to migrate.');
      await mongoose.connection.close();
      return;
    }
    
    // Get all existing payments
    console.log('💳 Fetching existing payments...');
    const existingPayments = await Payment.find().lean();
    const orderIdsWithPayments = new Set(
      existingPayments.map(p => p.order?.toString()).filter(Boolean)
    );
    console.log(`✅ Found ${existingPayments.length} existing payments\n`);
    
    // Filter orders that don't have payments
    const ordersWithoutPayments = orders.filter(order => 
      !orderIdsWithPayments.has(order._id.toString())
    );
    
    console.log(`📊 Orders without payments: ${ordersWithoutPayments.length}`);
    console.log(`📊 Orders with payments: ${orders.length - ordersWithoutPayments.length}\n`);
    
    if (ordersWithoutPayments.length === 0) {
      console.log('✅ All orders already have payments. Nothing to migrate.');
      await mongoose.connection.close();
      return;
    }
    
    // Create payments for orders without payments
    console.log('🔄 Creating payment records...\n');
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    for (let i = 0; i < ordersWithoutPayments.length; i++) {
      const order = ordersWithoutPayments[i];
      
      try {
        // Get customer ID
        let customerId = order.customerId;
        
        // If no customerId, try to find customer by email
        if (!customerId && order.customer?.email) {
          const customer = await Customer.findOne({ 
            email: order.customer.email,
            name: order.customer.name 
          });
          
          if (customer) {
            customerId = customer._id;
            // Update order with customer ID
            await Order.findByIdAndUpdate(order._id, { customerId: customer._id });
          } else {
            // Create customer if doesn't exist
            const newCustomer = new Customer({
              name: order.customer.name,
              email: order.customer.email,
              phone: order.customer.phone || '',
              address: order.customer.address || '',
              customerType: 'one-time',
              status: 'active'
            });
            await newCustomer.save();
            customerId = newCustomer._id;
            
            // Update order with customer ID
            await Order.findByIdAndUpdate(order._id, { customerId: newCustomer._id });
            
            console.log(`   ℹ️  Created customer for order ${order.orderId}`);
          }
        }
        
        if (!customerId) {
          console.log(`   ⚠️  Skipping order ${order.orderId || order._id}: No customer information`);
          errorCount++;
          errors.push({
            orderId: order.orderId || order._id,
            reason: 'No customer information'
          });
          continue;
        }
        
        // Generate payment ID
        const paymentCount = await Payment.countDocuments();
        const paymentId = `PAY-${String(paymentCount + 1).padStart(4, '0')}`;
        
        // Determine payment status based on order status or pipeline stage
        let paymentStatus = 'pending';
        if (order.pipelineStage === 'Paid' || order.status === 'completed') {
          paymentStatus = 'received';
        }
        
        // Create payment record
        const payment = new Payment({
          paymentId,
          order: order._id,
          customer: customerId,
          amount: order.amount || 0,
          status: paymentStatus,
          description: `Payment for ${order.orderId || 'Order'} - ${order.service || 'Service'}`,
          dueDate: order.endDate || new Date(),
          paymentDate: paymentStatus === 'received' ? (order.updatedAt || order.createdAt) : null,
          paymentMethod: paymentStatus === 'received' ? 'cash' : null
        });
        
        await payment.save();
        
        successCount++;
        console.log(`   ✅ [${i + 1}/${ordersWithoutPayments.length}] Created payment ${paymentId} for order ${order.orderId || order._id} (${paymentStatus})`);
        
      } catch (error) {
        errorCount++;
        errors.push({
          orderId: order.orderId || order._id,
          reason: error.message
        });
        console.log(`   ❌ [${i + 1}/${ordersWithoutPayments.length}] Failed to create payment for order ${order.orderId || order._id}: ${error.message}`);
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total orders: ${orders.length}`);
    console.log(`Orders already with payments: ${orders.length - ordersWithoutPayments.length}`);
    console.log(`Orders needing payments: ${ordersWithoutPayments.length}`);
    console.log(`✅ Successfully created: ${successCount}`);
    console.log(`❌ Failed: ${errorCount}`);
    console.log('='.repeat(60));
    
    if (errors.length > 0) {
      console.log('\n⚠️  ERRORS:');
      errors.forEach(err => {
        console.log(`   - Order ${err.orderId}: ${err.reason}`);
      });
    }
    
    console.log('\n✅ Migration completed!');
    
    // Close connection
    await mongoose.connection.close();
    console.log('📡 Database connection closed');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run migration
migrateOrdersToPayments();
