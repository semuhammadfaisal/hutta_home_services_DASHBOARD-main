# Payment Migration Guide

## Overview

This guide explains how to migrate existing orders to the new payment system. The migration script automatically creates payment records for all orders that don't have payments yet.

## What the Migration Does

The migration script (`migrate-orders-to-payments.js`) performs the following actions:

1. **Connects to MongoDB** - Establishes connection to your database
2. **Fetches all orders** - Retrieves all existing orders from the database
3. **Checks for existing payments** - Identifies which orders already have payment records
4. **Creates missing payments** - Generates payment records for orders without payments
5. **Handles customer data** - Creates or links customer records as needed
6. **Sets payment status** - Automatically determines if payment should be "pending" or "received" based on order status

## Features

✅ **Safe to run multiple times** - Won't create duplicate payments  
✅ **Automatic customer handling** - Creates customers if they don't exist  
✅ **Smart status detection** - Sets payment status based on order completion  
✅ **Detailed logging** - Shows progress and any errors  
✅ **Error handling** - Continues processing even if some orders fail  
✅ **Summary report** - Provides complete statistics at the end

## Prerequisites

Before running the migration:

1. **Backup your database** (recommended)
   ```bash
   mongodump --db hutta_home_services --out ./backup
   ```

2. **Ensure MongoDB is running**
   ```bash
   # Check if MongoDB is running
   mongosh --eval "db.version()"
   ```

3. **Install dependencies** (if not already installed)
   ```bash
   cd backend
   npm install
   ```

## Running the Migration

### Step 1: Navigate to Backend Directory
```bash
cd backend
```

### Step 2: Run the Migration Script
```bash
node migrate-orders-to-payments.js
```

### Step 3: Review the Output

The script will display:
- Connection status
- Number of orders found
- Number of existing payments
- Progress for each order
- Final summary with statistics

## Example Output

```
🚀 Starting migration: Create payments for existing orders...

📡 Connecting to MongoDB...
✅ Connected to MongoDB

📋 Fetching all orders...
✅ Found 25 orders

💳 Fetching existing payments...
✅ Found 5 existing payments

📊 Orders without payments: 20
📊 Orders with payments: 5

🔄 Creating payment records...

   ✅ [1/20] Created payment PAY-0006 for order ORD-001-1234 (pending)
   ✅ [2/20] Created payment PAY-0007 for order ORD-002-5678 (received)
   ✅ [3/20] Created payment PAY-0008 for order ORD-003-9012 (pending)
   ...

============================================================
📊 MIGRATION SUMMARY
============================================================
Total orders: 25
Orders already with payments: 5
Orders needing payments: 20
✅ Successfully created: 20
❌ Failed: 0
============================================================

✅ Migration completed!
📡 Database connection closed
```

## Payment Status Logic

The migration script automatically determines payment status:

| Order Condition | Payment Status | Payment Date | Payment Method |
|----------------|----------------|--------------|----------------|
| Pipeline Stage = "Paid" | `received` | Order update date | `cash` |
| Order Status = "completed" | `received` | Order update date | `cash` |
| All other cases | `pending` | `null` | `null` |

## What Gets Created

For each order without a payment, the script creates:

```javascript
{
  paymentId: "PAY-0001",           // Auto-generated unique ID
  order: ObjectId("..."),          // Reference to order
  customer: ObjectId("..."),       // Reference to customer
  amount: 1500.00,                 // Order amount
  status: "pending",               // or "received" based on order
  description: "Payment for ORD-001-1234 - Plumbing Service",
  dueDate: "2024-01-15",          // Order end date
  paymentDate: null,               // Set if status is "received"
  paymentMethod: null,             // Set if status is "received"
  createdAt: "2024-01-10T10:30:00Z",
  updatedAt: "2024-01-10T10:30:00Z"
}
```

## Handling Errors

### Common Issues and Solutions

#### 1. **No Customer Information**
```
⚠️  Skipping order ORD-001: No customer information
```
**Solution**: The script will skip orders without customer data. You'll need to manually add customer information to these orders first.

#### 2. **MongoDB Connection Failed**
```
❌ Migration failed: MongoServerError: connect ECONNREFUSED
```
**Solution**: 
- Ensure MongoDB is running
- Check your connection string in the script
- Verify network connectivity

#### 3. **Duplicate Payment ID**
```
❌ Failed to create payment: E11000 duplicate key error
```
**Solution**: This shouldn't happen, but if it does, the script will continue with the next order.

## Verifying the Migration

After running the migration, verify the results:

### 1. Check Payment Count
```bash
mongosh hutta_home_services --eval "db.payments.countDocuments()"
```

### 2. Check Orders Without Payments
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

### 3. Check in Dashboard
1. Open the application
2. Go to **Payments** tab
3. Verify all orders have corresponding payments
4. Check **Dashboard** → "Payments Collected" shows correct amount

## Rolling Back (If Needed)

If you need to undo the migration:

### Option 1: Delete All Payments Created by Migration
```bash
mongosh hutta_home_services --eval "
  db.payments.deleteMany({
    createdAt: { \$gte: new Date('2024-01-10T00:00:00Z') }
  })
"
```
*Replace the date with when you ran the migration*

### Option 2: Restore from Backup
```bash
mongorestore --db hutta_home_services ./backup/hutta_home_services
```

## Customizing the Migration

You can modify the script to customize behavior:

### Change Payment Status Logic
Edit the status determination section:
```javascript
// Around line 95
let paymentStatus = 'pending';
if (order.pipelineStage === 'Paid' || order.status === 'completed') {
  paymentStatus = 'received';
}

// Add your custom logic here
if (order.customField === 'someValue') {
  paymentStatus = 'completed';
}
```

### Change Payment Method
Edit the payment method assignment:
```javascript
// Around line 105
paymentMethod: paymentStatus === 'received' ? 'bank-transfer' : null
```

### Change Due Date Logic
Edit the due date assignment:
```javascript
// Around line 104
dueDate: order.endDate || new Date(Date.now() + 30*24*60*60*1000) // 30 days from now
```

## Environment Variables

The script uses the following environment variable:

```bash
MONGODB_URI=mongodb://localhost:27017/hutta_home_services
```

You can set it before running:
```bash
# Windows
set MONGODB_URI=mongodb://your-connection-string
node migrate-orders-to-payments.js

# Linux/Mac
MONGODB_URI=mongodb://your-connection-string node migrate-orders-to-payments.js
```

## Troubleshooting

### Script Hangs or Takes Too Long
- Check MongoDB performance
- Ensure indexes are created
- Run during off-peak hours for large datasets

### Memory Issues with Large Datasets
If you have thousands of orders, modify the script to process in batches:
```javascript
const BATCH_SIZE = 100;
for (let i = 0; i < ordersWithoutPayments.length; i += BATCH_SIZE) {
  const batch = ordersWithoutPayments.slice(i, i + BATCH_SIZE);
  // Process batch...
}
```

## Best Practices

1. **Always backup before migration**
2. **Run on a test environment first**
3. **Run during low-traffic periods**
4. **Monitor the output for errors**
5. **Verify results after completion**
6. **Keep the migration script for future reference**

## Support

If you encounter issues:

1. Check the error messages in the output
2. Review the MongoDB logs
3. Verify your database connection
4. Ensure all models are properly defined
5. Check that all required fields are present in orders

## Next Steps

After successful migration:

1. ✅ Verify all orders have payments
2. ✅ Check dashboard KPIs are accurate
3. ✅ Test payment status changes
4. ✅ Train users on new payment system
5. ✅ Monitor for any issues

## Migration Checklist

- [ ] Backup database
- [ ] Test on development environment
- [ ] Review migration script
- [ ] Run migration on production
- [ ] Verify payment count
- [ ] Check dashboard metrics
- [ ] Test payment workflows
- [ ] Document any issues
- [ ] Update team on changes

---

**Last Updated**: January 2024  
**Script Version**: 1.0.0  
**Compatibility**: MongoDB 4.4+, Node.js 14+
