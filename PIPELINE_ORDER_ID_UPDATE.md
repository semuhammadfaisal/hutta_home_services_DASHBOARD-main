# Pipeline Order ID Display Update

## What Changed

The pipeline now displays the actual Order ID (like "ORD-012-2895") instead of customer names as the card title. This makes it easier to identify specific orders when you have multiple orders from the same customer.

## Changes Made

### 1. Database Model Update
- Added `orderIdDisplay` field to `PipelineRecord` model
- This stores the human-readable order ID (e.g., "ORD-012-2895")

### 2. Backend Updates
- Updated `pipelineRecords.js` route to accept and store `orderIdDisplay`
- The field is automatically populated when creating pipeline records from orders

### 3. Frontend Updates
- Pipeline cards now show Order ID as the main title
- Customer name is displayed below with a user icon
- Fallback to customer name if no Order ID exists (for older records)

### 4. Migration Script
- Created `migrate-pipeline-order-ids.js` to update existing records

## How to Apply

### Step 1: Run Migration (for existing records)
```bash
cd backend
node migrate-pipeline-order-ids.js
```

This will:
- Find all pipeline records linked to orders
- Fetch the order's `orderId` field (like "ORD-012-2895")
- Store it in the `orderIdDisplay` field
- Show progress for each record updated

### Step 2: Restart Your Server
```bash
# Stop your current server (Ctrl+C)
# Then restart it
node server.js
```

### Step 3: Refresh Your Browser
- Clear cache (Ctrl+Shift+R or Cmd+Shift+R)
- Reload the pipeline page

## What You'll See

### Before:
```
┌─────────────────────┐
│ John Doe            │
│ 📧 john@email.com   │
│ 📞 555-1234         │
└─────────────────────┘
```

### After:
```
┌─────────────────────┐
│ ORD-012-2895        │
│ 👤 John Doe         │
│ 📧 john@email.com   │
│ 📞 555-1234         │
└─────────────────────┘
```

## Benefits

1. **Easy Identification**: Quickly identify specific orders by their ID
2. **Multiple Orders**: When a customer has multiple orders, each shows its unique ID
3. **Professional**: Displays order numbers like a real CRM system
4. **Backward Compatible**: Old records without Order IDs still show customer names

## Technical Details

### New Field in PipelineRecord
```javascript
orderIdDisplay: {
    type: String
}
```

### Display Logic
```javascript
const displayTitle = record.orderIdDisplay || record.customerName;
```

If `orderIdDisplay` exists, it shows that. Otherwise, it falls back to `customerName`.

## Troubleshooting

### Orders still showing customer names?
1. Make sure you ran the migration script
2. Check if the orders have `orderId` field populated
3. Clear browser cache and reload

### Migration script errors?
1. Ensure MongoDB is running
2. Check your `MONGODB_URI` in the script
3. Verify you have orders with `orderId` field

### New orders not showing Order ID?
1. Restart your backend server
2. Make sure the order has an `orderId` field when created
3. Check browser console for errors

## Files Modified

1. `backend/models/PipelineRecord.js` - Added orderIdDisplay field
2. `backend/routes/pipelineRecords.js` - Accept orderIdDisplay in POST
3. `assets/js/pipeline-mongodb.js` - Display orderIdDisplay, pass it when creating records
4. `backend/migrate-pipeline-order-ids.js` - New migration script

## Support

If you encounter any issues, check:
1. Browser console for JavaScript errors
2. Backend logs for API errors
3. MongoDB logs for database errors
