# Step 2 Testing Guide

## Quick Test Scenarios

### Test 1: Create One-Time Order
1. Click "New Order"
2. Fill customer details
3. Fill service and amount
4. Select dates
5. **Order Type: "One Time Order"** (default)
6. Verify recurring fields are HIDDEN
7. Click Save
8. ✅ Order should save successfully
9. ✅ Order should appear in regular Calendar
10. ✅ Order should NOT appear in Recurring Calendar

### Test 2: Create Recurring Order
1. Click "New Order"
2. Fill customer details
3. Fill service and amount
4. Select dates
5. **Order Type: "Recurring Order"**
6. ✅ Recurring fields should APPEAR
7. **Recurring Frequency: "Weekly"**
8. Recurring End Date: (optional) 2024-12-31
9. Recurring Notes: "Every Monday"
10. Click Save
11. ✅ Order should save successfully
12. ✅ Order should appear in Recurring Calendar
13. ✅ Order should appear in regular Calendar with recurring badge

### Test 3: Validation - Missing Frequency
1. Click "New Order"
2. Fill required fields
3. **Order Type: "Recurring Order"**
4. Leave **Recurring Frequency** empty
5. Click Save
6. ✅ Should show error: "Recurring frequency is required"
7. ✅ Should NOT save order

### Test 4: Edit One-Time Order
1. Find existing one-time order
2. Click Edit
3. ✅ Order Type should show "One Time Order"
4. ✅ Recurring fields should be HIDDEN
5. Change service name
6. Click Save
7. ✅ Should save successfully
8. ✅ Should remain one-time order

### Test 5: Edit Recurring Order
1. Find existing recurring order
2. Click Edit
3. ✅ Order Type should show "Recurring Order"
4. ✅ Recurring fields should be VISIBLE
5. ✅ Recurring Frequency should be populated
6. ✅ Recurring End Date should be populated (if set)
7. ✅ Recurring Notes should be populated (if set)
8. Change frequency to "Monthly"
9. Click Save
10. ✅ Should save successfully
11. ✅ Should remain recurring order

### Test 6: Convert One-Time to Recurring
1. Edit existing one-time order
2. Change **Order Type** to "Recurring Order"
3. ✅ Recurring fields should APPEAR
4. Fill **Recurring Frequency: "Bi-Weekly"**
5. Click Save
6. ✅ Should save successfully
7. ✅ Order should now appear in Recurring Calendar

### Test 7: Convert Recurring to One-Time
1. Edit existing recurring order
2. Change **Order Type** to "One Time Order"
3. ✅ Recurring fields should HIDE
4. Click Save
5. ✅ Should save successfully
6. ✅ Order should disappear from Recurring Calendar
7. ✅ Order should remain in regular Calendar

### Test 8: Calendar Filter - Regular Calendar
1. Go to Calendar tab
2. ✅ Should show all orders by default
3. Toggle "Show Recurring Orders Only" ON
4. ✅ Should show only recurring orders
5. Toggle "Show Recurring Orders Only" OFF
6. ✅ Should show all orders again

### Test 9: Recurring Calendar View
1. Click "Recurring Calendar" in sidebar
2. ✅ Should open recurring calendar section
3. ✅ Should show only recurring orders
4. ✅ Should show frequency on event badges
5. Click on recurring order
6. ✅ Should show detail panel
7. ✅ Should show recurring frequency
8. ✅ Should show recurring end date (if set)
9. ✅ Should show recurring notes (if set)

### Test 10: Backward Compatibility
1. Check existing orders (created before this update)
2. ✅ Should appear in regular Calendar
3. ✅ Should NOT appear in Recurring Calendar
4. Edit old order
5. ✅ Order Type should default to "One Time Order"
6. ✅ Should work normally

## API Testing (Optional)

### Test API Endpoint - Create One-Time
```bash
POST http://localhost:5000/api/orders
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN

{
  "customer": {
    "name": "Test Customer",
    "email": "test@example.com"
  },
  "service": "Test Service",
  "amount": 100,
  "startDate": "2024-01-15",
  "endDate": "2024-01-15",
  "orderType": "one-time"
}
```

Expected: 201 Created

### Test API Endpoint - Create Recurring
```bash
POST http://localhost:5000/api/orders
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN

{
  "customer": {
    "name": "Test Customer",
    "email": "test@example.com"
  },
  "service": "Test Service",
  "amount": 100,
  "startDate": "2024-01-15",
  "endDate": "2024-01-15",
  "orderType": "recurring",
  "recurringFrequency": "weekly",
  "recurringEndDate": "2024-12-31",
  "recurringNotes": "Test notes"
}
```

Expected: 201 Created

### Test API Endpoint - Validation Error
```bash
POST http://localhost:5000/api/orders
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN

{
  "customer": {
    "name": "Test Customer",
    "email": "test@example.com"
  },
  "service": "Test Service",
  "amount": 100,
  "startDate": "2024-01-15",
  "endDate": "2024-01-15",
  "orderType": "recurring"
  // Missing recurringFrequency
}
```

Expected: 400 Bad Request
Message: "Recurring frequency is required for recurring orders"

## Database Verification

### Check Order in MongoDB
```javascript
// Connect to MongoDB
use hutta_home_services

// Find recurring orders
db.orders.find({ orderType: "recurring" })

// Find one-time orders
db.orders.find({ orderType: "one-time" })

// Find orders without orderType (old orders)
db.orders.find({ orderType: { $exists: false } })
```

### Verify Field Values
```javascript
// Check a recurring order
db.orders.findOne({ orderType: "recurring" })

// Should have:
{
  orderType: "recurring",
  recurringFrequency: "weekly" | "bi-weekly" | "monthly" | "yearly",
  recurringEndDate: ISODate("...") or null,
  recurringNotes: "..." or ""
}
```

## Browser Console Tests

### Check Order Data
```javascript
// Open browser console
// Go to Orders section

// Check if orders have orderType
const orders = await window.APIService.getOrders();
console.log('Orders:', orders);
console.log('Recurring orders:', orders.filter(o => o.orderType === 'recurring'));
console.log('One-time orders:', orders.filter(o => o.orderType === 'one-time'));
console.log('Old orders:', orders.filter(o => !o.orderType));
```

### Test Toggle Function
```javascript
// Open order modal
showAddOrderModal();

// Test toggle
document.getElementById('orderType').value = 'recurring';
toggleRecurringFields();
// Recurring fields should be visible

document.getElementById('orderType').value = 'one-time';
toggleRecurringFields();
// Recurring fields should be hidden
```

## Expected Results Summary

| Test | Expected Result |
|------|----------------|
| Create one-time order | Saves with orderType: 'one-time', no recurring fields |
| Create recurring order | Saves with all recurring fields |
| Missing frequency | Shows error, doesn't save |
| Edit one-time | Shows correct type, hides recurring fields |
| Edit recurring | Shows correct type, populates recurring fields |
| Convert to recurring | Saves recurring fields, appears in recurring calendar |
| Convert to one-time | Clears recurring fields, disappears from recurring calendar |
| Regular calendar filter | Shows/hides recurring orders based on toggle |
| Recurring calendar | Shows only recurring orders |
| Old orders | Default to one-time, work normally |

## Troubleshooting

### Issue: Recurring fields not showing
**Solution:** Check that toggleRecurringFields() is called after setting orderType value

### Issue: Validation not working
**Solution:** Check that recurringFrequency field has required attribute when orderType is recurring

### Issue: Old orders not appearing
**Solution:** Verify backend defaults orderType to 'one-time' in model

### Issue: Calendar not filtering
**Solution:** Check that calendar.js uses order.orderType instead of order.customerData

### Issue: Save fails with 400 error
**Solution:** Ensure recurringFrequency is filled when orderType is 'recurring'

## Success Criteria

✅ All 10 test scenarios pass
✅ No console errors
✅ Data saves correctly to database
✅ Calendar filtering works
✅ Validation prevents invalid data
✅ Old orders work without issues
✅ UI is responsive and intuitive
✅ No breaking changes to existing features

## Next Steps After Testing

1. Test with real data
2. Test with multiple users
3. Monitor for any edge cases
4. Gather user feedback
5. Consider Phase 3: Automatic recurring order generation
