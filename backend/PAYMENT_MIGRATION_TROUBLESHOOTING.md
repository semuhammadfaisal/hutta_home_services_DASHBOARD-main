# Payment Migration - Troubleshooting Guide

## 🔧 Common Issues and Solutions

### Issue 1: MongoDB Connection Failed

**Error Message:**
```
❌ Migration failed: MongoServerError: connect ECONNREFUSED 127.0.0.1:27017
```

**Possible Causes:**
- MongoDB service is not running
- Wrong connection string
- Network/firewall issues
- MongoDB not installed

**Solutions:**

1. **Check if MongoDB is running:**
   ```bash
   # Windows
   net start MongoDB
   
   # Linux/Mac
   sudo systemctl status mongod
   ```

2. **Start MongoDB if stopped:**
   ```bash
   # Windows
   net start MongoDB
   
   # Linux/Mac
   sudo systemctl start mongod
   ```

3. **Verify connection string:**
   ```bash
   # Test connection
   mongosh mongodb://localhost:27017/hutta_home_services
   ```

4. **Check MongoDB logs:**
   ```bash
   # Linux/Mac
   tail -f /var/log/mongodb/mongod.log
   
   # Windows
   # Check: C:\Program Files\MongoDB\Server\X.X\log\mongod.log
   ```

---

### Issue 2: No Customer Information

**Error Message:**
```
⚠️  Skipping order ORD-001-1234: No customer information
```

**Cause:**
Order exists without customer data (no customerId and no customer.email)

**Solutions:**

1. **Find affected orders:**
   ```bash
   mongosh hutta_home_services --eval "
     db.orders.find({
       customerId: null,
       'customer.email': { \$exists: false }
     }).pretty()
   "
   ```

2. **Option A: Add customer data manually:**
   ```bash
   mongosh hutta_home_services
   
   # Update order with customer info
   db.orders.updateOne(
     { orderId: 'ORD-001-1234' },
     {
       \$set: {
         'customer.name': 'John Doe',
         'customer.email': 'john@example.com',
         'customer.phone': '555-0123',
         'customer.address': '123 Main St'
       }
     }
   )
   ```

3. **Option B: Create customer and link:**
   ```bash
   # Create customer
   customerId = db.customers.insertOne({
     name: 'John Doe',
     email: 'john@example.com',
     phone: '555-0123',
     address: '123 Main St',
     customerType: 'one-time',
     status: 'active'
   }).insertedId
   
   # Link to order
   db.orders.updateOne(
     { orderId: 'ORD-001-1234' },
     { \$set: { customerId: customerId } }
   )
   ```

4. **Option C: Skip these orders:**
   - Document which orders were skipped
   - Handle them manually after migration

---

### Issue 3: Duplicate Payment ID Error

**Error Message:**
```
❌ Failed to create payment: E11000 duplicate key error collection: hutta_home_services.payments index: paymentId_1
```

**Cause:**
Payment ID already exists (rare, but possible if migration was interrupted)

**Solutions:**

1. **Check existing payment IDs:**
   ```bash
   mongosh hutta_home_services --eval "
     db.payments.find().sort({paymentId: -1}).limit(5).pretty()
   "
   ```

2. **Find the highest payment number:**
   ```bash
   mongosh hutta_home_services --eval "
     db.payments.aggregate([
       {
         \$project: {
           paymentId: 1,
           number: {
             \$toInt: {
               \$substr: ['\$paymentId', 4, -1]
             }
           }
         }
       },
       { \$sort: { number: -1 } },
       { \$limit: 1 }
     ])
   "
   ```

3. **Fix: The script should handle this automatically**
   - The script uses `countDocuments()` which should prevent duplicates
   - If this happens, the script will skip that order and continue

4. **Manual fix if needed:**
   ```bash
   # Delete duplicate payment
   mongosh hutta_home_services --eval "
     db.payments.deleteOne({ paymentId: 'PAY-0001' })
   "
   
   # Re-run migration
   node migrate-orders-to-payments.js
   ```

---

### Issue 4: Script Hangs or Takes Too Long

**Symptoms:**
- Script runs for more than 5 minutes
- No progress updates
- CPU usage is high

**Possible Causes:**
- Large dataset (thousands of orders)
- Slow database queries
- Missing indexes
- Network latency

**Solutions:**

1. **Check progress:**
   ```bash
   # In another terminal, check payment count
   mongosh hutta_home_services --eval "db.payments.countDocuments()"
   
   # Run again after 30 seconds to see if it's increasing
   ```

2. **Add indexes (if missing):**
   ```bash
   mongosh hutta_home_services --eval "
     db.payments.createIndex({ order: 1 })
     db.payments.createIndex({ paymentId: 1 }, { unique: true })
     db.orders.createIndex({ customerId: 1 })
   "
   ```

3. **Check database performance:**
   ```bash
   mongosh hutta_home_services --eval "db.serverStatus().connections"
   ```

4. **Modify script for batch processing:**
   Edit `migrate-orders-to-payments.js`:
   ```javascript
   // Add after line 60
   const BATCH_SIZE = 50;
   for (let i = 0; i < ordersWithoutPayments.length; i += BATCH_SIZE) {
     const batch = ordersWithoutPayments.slice(i, i + BATCH_SIZE);
     console.log(`\nProcessing batch ${Math.floor(i/BATCH_SIZE) + 1}...`);
     // Process batch...
   }
   ```

5. **Kill and restart:**
   ```bash
   # Press Ctrl+C to stop
   # Wait 10 seconds
   # Run again - it will skip already created payments
   node migrate-orders-to-payments.js
   ```

---

### Issue 5: Memory Error

**Error Message:**
```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

**Cause:**
Too many orders loaded into memory at once

**Solutions:**

1. **Increase Node.js memory:**
   ```bash
   node --max-old-space-size=4096 migrate-orders-to-payments.js
   ```

2. **Process in smaller batches:**
   Modify the script to use `.cursor()` instead of `.lean()`:
   ```javascript
   // Replace line ~40
   const ordersCursor = Order.find().cursor();
   
   for (let order = await ordersCursor.next(); order != null; order = await ordersCursor.next()) {
     // Process order...
   }
   ```

3. **Run on a machine with more RAM**

---

### Issue 6: Permission Denied

**Error Message:**
```
MongoServerError: not authorized on hutta_home_services to execute command
```

**Cause:**
Database user doesn't have write permissions

**Solutions:**

1. **Check user permissions:**
   ```bash
   mongosh hutta_home_services --eval "db.runCommand({connectionStatus: 1})"
   ```

2. **Grant permissions:**
   ```bash
   mongosh admin
   
   db.grantRolesToUser(
     "your_username",
     [
       { role: "readWrite", db: "hutta_home_services" }
     ]
   )
   ```

3. **Use admin credentials:**
   ```bash
   MONGODB_URI="mongodb://admin:password@localhost:27017/hutta_home_services?authSource=admin" node migrate-orders-to-payments.js
   ```

---

### Issue 7: Wrong Payment Status

**Symptom:**
Completed orders showing as "pending" or vice versa

**Cause:**
Status logic doesn't match your business rules

**Solutions:**

1. **Review status logic in script:**
   ```javascript
   // Line ~95 in migrate-orders-to-payments.js
   let paymentStatus = 'pending';
   if (order.pipelineStage === 'Paid' || order.status === 'completed') {
     paymentStatus = 'received';
   }
   ```

2. **Customize for your needs:**
   ```javascript
   // Example: Also mark as received if order is in "delivered" status
   let paymentStatus = 'pending';
   if (order.pipelineStage === 'Paid' || 
       order.status === 'completed' ||
       order.status === 'delivered') {
     paymentStatus = 'received';
   }
   ```

3. **Fix after migration:**
   ```bash
   # Update specific payments
   mongosh hutta_home_services --eval "
     db.payments.updateMany(
       { status: 'pending' },
       {
         \$set: {
           status: 'received',
           paymentDate: new Date(),
           paymentMethod: 'cash'
         }
       }
     )
   "
   ```

---

### Issue 8: Dashboard Shows Wrong Amount

**Symptom:**
"Payments Collected" shows $0 or incorrect amount

**Possible Causes:**
- Payments created with wrong status
- Dashboard not refreshing
- Browser cache

**Solutions:**

1. **Verify payment statuses:**
   ```bash
   mongosh hutta_home_services --eval "
     db.payments.aggregate([
       { \$group: { _id: '\$status', count: { \$sum: 1 }, total: { \$sum: '\$amount' } } }
     ])
   "
   ```

2. **Check received payments:**
   ```bash
   mongosh hutta_home_services --eval "
     db.payments.aggregate([
       { \$match: { status: { \$in: ['received', 'completed'] } } },
       { \$group: { _id: null, total: { \$sum: '\$amount' } } }
     ])
   "
   ```

3. **Clear browser cache:**
   - Press Ctrl+Shift+Delete
   - Clear cache and reload

4. **Force dashboard refresh:**
   - Open browser console (F12)
   - Run: `window.forceRefreshDashboard()`

5. **Update payment statuses:**
   ```bash
   # Mark completed orders as received
   mongosh hutta_home_services
   
   # Get completed order IDs
   const completedOrders = db.orders.find(
     { status: 'completed' },
     { _id: 1 }
   ).toArray().map(o => o._id);
   
   # Update their payments
   db.payments.updateMany(
     { order: { \$in: completedOrders } },
     {
       \$set: {
         status: 'received',
         paymentDate: new Date(),
         paymentMethod: 'cash'
       }
     }
   )
   ```

---

### Issue 9: Script Runs But Creates No Payments

**Symptom:**
Script completes successfully but no payments are created

**Possible Causes:**
- All orders already have payments
- Orders filtered out due to missing data
- Database write issues

**Solutions:**

1. **Check if payments already exist:**
   ```bash
   mongosh hutta_home_services --eval "
     db.payments.countDocuments()
   "
   ```

2. **Check orders without payments:**
   ```bash
   mongosh hutta_home_services --eval "
     db.orders.aggregate([
       {
         \$lookup: {
           from: 'payments',
           localField: '_id',
           foreignField: 'order',
           as: 'payments'
         }
       },
       {
         \$match: { payments: { \$size: 0 } }
       },
       {
         \$count: 'ordersWithoutPayments'
       }
     ])
   "
   ```

3. **Check for data issues:**
   ```bash
   # Find orders without customer info
   mongosh hutta_home_services --eval "
     db.orders.find({
       \$or: [
         { customerId: null, 'customer.email': { \$exists: false } },
         { customerId: null, 'customer.email': '' }
       ]
     }).count()
   "
   ```

4. **Run with verbose logging:**
   Add more console.log statements to the script to see what's happening

---

### Issue 10: Rollback Needed

**Scenario:**
Migration created incorrect data and needs to be undone

**Solutions:**

1. **Delete payments by date (surgical):**
   ```bash
   # Delete payments created today
   mongosh hutta_home_services --eval "
     const today = new Date();
     today.setHours(0,0,0,0);
     
     const result = db.payments.deleteMany({
       createdAt: { \$gte: today }
     });
     
     print('Deleted ' + result.deletedCount + ' payments');
   "
   ```

2. **Delete all payments (nuclear option):**
   ```bash
   mongosh hutta_home_services --eval "
     db.payments.deleteMany({});
   "
   ```

3. **Restore from backup:**
   ```bash
   # Full restore
   mongorestore --db hutta_home_services ./backup/hutta_home_services
   
   # Restore only payments collection
   mongorestore --db hutta_home_services --collection payments ./backup/hutta_home_services/payments.bson
   ```

4. **Selective rollback:**
   ```bash
   # Delete payments for specific orders
   mongosh hutta_home_services --eval "
     db.payments.deleteMany({
       order: { \$in: [
         ObjectId('order_id_1'),
         ObjectId('order_id_2')
       ]}
     })
   "
   ```

---

## 🆘 Emergency Commands

### Quick Health Check
```bash
# Check database connection
mongosh hutta_home_services --eval "db.runCommand({ping: 1})"

# Count documents
mongosh hutta_home_services --eval "
  print('Orders: ' + db.orders.countDocuments());
  print('Payments: ' + db.payments.countDocuments());
  print('Customers: ' + db.customers.countDocuments());
"

# Check for orphaned payments
mongosh hutta_home_services --eval "
  db.payments.aggregate([
    {
      \$lookup: {
        from: 'orders',
        localField: 'order',
        foreignField: '_id',
        as: 'orderData'
      }
    },
    {
      \$match: { orderData: { \$size: 0 } }
    },
    {
      \$count: 'orphanedPayments'
    }
  ])
"
```

### Force Stop Migration
```bash
# Press Ctrl+C
# If that doesn't work:
# Find process ID
ps aux | grep migrate-orders-to-payments

# Kill process
kill -9 <PID>
```

### Reset Everything
```bash
# Delete all payments
mongosh hutta_home_services --eval "db.payments.deleteMany({})"

# Restore from backup
mongorestore --drop --db hutta_home_services ./backup/hutta_home_services

# Re-run migration
node migrate-orders-to-payments.js
```

---

## 📞 Getting Help

If you're still stuck:

1. **Check the logs:**
   - Script output
   - MongoDB logs
   - Application logs

2. **Gather information:**
   - Error messages
   - Number of orders/payments
   - Database version
   - Node.js version

3. **Try the visual guide:**
   - [PAYMENT_MIGRATION_VISUAL_GUIDE.md](PAYMENT_MIGRATION_VISUAL_GUIDE.md)

4. **Review the full guide:**
   - [PAYMENT_MIGRATION_GUIDE.md](PAYMENT_MIGRATION_GUIDE.md)

---

**Troubleshooting Guide Version**: 1.0.0  
**Last Updated**: January 2024
