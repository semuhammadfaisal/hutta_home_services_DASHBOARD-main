# Complete Price Synchronization System

## Overview
This system ensures that price/amount/budget changes are synchronized across Orders, Pipeline Records, and Payments in all directions.

## Three-Way Sync Architecture

```
┌─────────────┐
│   ORDERS    │
│  (amount)   │
└──────┬──────┘
       │
       ├──────────────┐
       │              │
       ▼              ▼
┌─────────────┐  ┌─────────────┐
│  PIPELINE   │  │  PAYMENTS   │
│  (budget)   │  │  (amount)   │
└─────────────┘  └─────────────┘
```

## Sync Flows

### 1. Order Amount Update → Pipeline & Payment
**File:** `backend/routes/orders.js`
**Route:** `PUT /api/orders/:id`

When order amount is updated:
1. ✅ Update order amount
2. ✅ Recalculate profit
3. ✅ Update linked payment amount
4. ✅ Update linked pipeline record budget

```javascript
// Order update triggers:
Order.amount = newAmount
  ↓
Payment.amount = newAmount
  ↓
PipelineRecord.budget = newAmount
```

### 2. Pipeline Budget Update → Order & Payment
**File:** `backend/routes/pipelineRecords.js`
**Route:** `PUT /api/pipelineRecords/:id`

When pipeline budget is updated:
1. ✅ Update pipeline record budget
2. ✅ Update linked order amount
3. ✅ Recalculate order profit
4. ✅ Update linked payment amount

```javascript
// Pipeline update triggers:
PipelineRecord.budget = newBudget
  ↓
Order.amount = newBudget
Order.profit = amount - vendorCost - processingFee
  ↓
Payment.amount = newBudget
```

### 3. Payment Edit Disabled
**File:** `assets/js/dashboard-script.js`

Payments cannot be manually edited to prevent sync conflicts:
- ❌ Edit button removed from payments table
- ✅ View button (read-only)
- ✅ Delete button
- ✅ Status dropdown (quick update)

## Implementation Details

### Order Update (orders.js)
```javascript
// After order update
if (updateData.amount !== undefined) {
  // Update payment
  const payment = await Payment.findOne({ order: order._id });
  if (payment) {
    payment.amount = updateData.amount;
    await payment.save();
  }
  
  // Update pipeline record
  if (order.pipelineRecordId) {
    const pipelineRecord = await PipelineRecord.findById(order.pipelineRecordId);
    if (pipelineRecord) {
      pipelineRecord.budget = updateData.amount;
      await pipelineRecord.save();
    }
  }
}
```

### Pipeline Update (pipelineRecords.js)
```javascript
// After pipeline record update
if (req.body.budget !== undefined && record.orderId) {
  // Update order
  const order = await Order.findById(record.orderId);
  if (order) {
    order.amount = req.body.budget;
    order.profit = order.amount - (order.vendorCost || 0) - (order.processingFee || 0);
    await order.save();
    
    // Update payment
    const payment = await Payment.findOne({ order: record.orderId });
    if (payment) {
      payment.amount = req.body.budget;
      await payment.save();
    }
  }
}
```

## Testing Scenarios

### Test 1: Update Order Amount
1. Go to Orders tab
2. Edit an order
3. Change amount from $1000 to $1500
4. Save
5. ✅ Check Orders tab - shows $1500
6. ✅ Check Pipeline - shows $1500 budget
7. ✅ Check Payments - shows $1500 amount

### Test 2: Update Pipeline Budget
1. Go to Pipeline tab
2. Edit a project card
3. Change budget from $1500 to $2000
4. Save
5. ✅ Check Pipeline - shows $2000
6. ✅ Check Orders tab - shows $2000 amount
7. ✅ Check Payments - shows $2000 amount

### Test 3: Payment Edit Disabled
1. Go to Payments tab
2. ✅ Verify no Edit button
3. ✅ View button works (read-only)
4. ✅ Delete button works
5. ✅ Status dropdown works

## Error Handling

All sync operations include error handling:
- If payment update fails, order update still succeeds
- If pipeline update fails, order update still succeeds
- Errors are logged to console for debugging
- User sees success message for primary operation

## Console Logs

When syncing, you'll see:
```
✅ Updated payment amount: PAY-0001 to 2000
✅ Updated pipeline record budget: 507f1f77bcf86cd799439011 to 2000
✅ Updated order amount: ORD-001-1234 to 2000
```

## Database Schema

### Order
```javascript
{
  amount: Number,           // Revenue/Price
  vendorCost: Number,       // Cost
  processingFee: Number,    // Fee
  profit: Number,           // Calculated: amount - vendorCost - processingFee
  pipelineRecordId: ObjectId // Link to pipeline
}
```

### PipelineRecord
```javascript
{
  budget: Number,           // Project budget (synced with order.amount)
  orderId: ObjectId         // Link to order
}
```

### Payment
```javascript
{
  amount: Number,           // Payment amount (synced with order.amount)
  order: ObjectId           // Link to order
}
```

## Benefits

1. **Data Consistency** - All three systems always show the same amount
2. **Single Source of Truth** - Update anywhere, reflects everywhere
3. **Automatic Profit Calculation** - Profit recalculates on every amount change
4. **Prevent Manual Errors** - No manual payment editing
5. **Audit Trail** - Console logs track all sync operations

## Maintenance

### Adding New Sync Points
If you need to add more fields to sync:

1. Update order route to sync new field
2. Update pipeline route to sync new field
3. Test bidirectional sync
4. Update documentation

### Troubleshooting
If sync fails:
1. Check console logs for error messages
2. Verify database connections
3. Check that linked records exist (orderId, pipelineRecordId)
4. Verify ObjectId references are valid

## Related Files

- `backend/routes/orders.js` - Order CRUD with sync
- `backend/routes/pipelineRecords.js` - Pipeline CRUD with sync
- `backend/routes/payments.js` - Payment CRUD (read-only amount)
- `backend/models/Order.js` - Order schema
- `backend/models/PipelineRecord.js` - Pipeline schema
- `backend/models/Payment.js` - Payment schema
- `assets/js/dashboard-script.js` - Frontend payment UI
- `PRICE_SYNC_FIX.md` - Previous documentation

## Version History

- **v1.0** - Initial payment sync from order updates
- **v2.0** - Added pipeline sync from order updates
- **v3.0** - Added bidirectional sync (pipeline → order)
- **v3.1** - Removed payment edit functionality
