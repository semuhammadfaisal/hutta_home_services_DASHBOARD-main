# Step 2 Quick Reference Card

## Database Schema

```javascript
{
  orderType: 'one-time' | 'recurring',  // default: 'one-time'
  recurringFrequency: 'weekly' | 'bi-weekly' | 'monthly' | 'yearly',
  recurringEndDate: Date,  // optional
  recurringNotes: String   // optional
}
```

## API Endpoints

### Create Order
```
POST /api/orders
Body: { orderType, recurringFrequency?, recurringEndDate?, recurringNotes?, ... }
```

### Update Order
```
PUT /api/orders/:id
Body: { orderType, recurringFrequency?, recurringEndDate?, recurringNotes?, ... }
```

## Validation Rules

| Condition | Rule |
|-----------|------|
| orderType = 'recurring' | recurringFrequency REQUIRED |
| orderType = 'one-time' | recurring fields ignored/cleared |
| Missing orderType | Defaults to 'one-time' |

## Frontend Functions

```javascript
// Toggle recurring fields visibility
toggleRecurringFields()

// Save order with validation
saveOrder()

// Edit order and populate fields
editOrder(orderId)

// Show modal with defaults
showAddOrderModal()
```

## Calendar Functions

```javascript
// Regular calendar
renderCalendar()  // Shows all orders

// Recurring calendar
renderRecurringCalendar()  // Shows only recurring orders
loadRecurringCalendarData()  // Loads recurring orders
showRecurringEventDetail(event)  // Shows recurring details
```

## Query Examples

```javascript
// Get all recurring orders
Order.find({ orderType: 'recurring' })

// Get weekly recurring orders
Order.find({ 
  orderType: 'recurring',
  recurringFrequency: 'weekly'
})

// Get orders ending before date
Order.find({
  orderType: 'recurring',
  recurringEndDate: { $lt: new Date('2024-12-31') }
})
```

## Form Field IDs

```javascript
document.getElementById('orderType')           // 'one-time' | 'recurring'
document.getElementById('recurringFrequency')  // 'weekly' | 'bi-weekly' | 'monthly' | 'yearly'
document.getElementById('recurringEndDate')    // Date string
document.getElementById('recurringNotes')      // String
```

## Error Messages

| Error | Message |
|-------|---------|
| Missing frequency | "Recurring frequency is required for recurring orders" |
| Invalid orderType | Validation error from enum |
| Invalid frequency | Validation error from enum |

## File Locations

```
backend/models/Order.js           - Schema definition
backend/routes/orders.js          - API endpoints
assets/js/dashboard-script.js     - Order CRUD functions
assets/js/calendar.js             - Calendar rendering
pages/admin-dashboard.html        - UI form fields
```

## Testing Commands

```javascript
// Browser console
const orders = await window.APIService.getOrders();
orders.filter(o => o.orderType === 'recurring');

// MongoDB
db.orders.find({ orderType: 'recurring' })
```

## Common Patterns

### Create Recurring Order
```javascript
const orderData = {
  customer: { name, email },
  service: 'Service Name',
  amount: 100,
  startDate: '2024-01-15',
  endDate: '2024-01-15',
  orderType: 'recurring',
  recurringFrequency: 'weekly',
  recurringEndDate: '2024-12-31',
  recurringNotes: 'Every Monday'
};
```

### Convert to Recurring
```javascript
const updateData = {
  orderType: 'recurring',
  recurringFrequency: 'monthly',
  recurringEndDate: '2024-12-31'
};
```

### Convert to One-Time
```javascript
const updateData = {
  orderType: 'one-time'
  // Backend clears recurring fields automatically
};
```

## Backward Compatibility

```javascript
// Old order without orderType
{ service: 'Plumbing' }

// Treated as
{ service: 'Plumbing', orderType: 'one-time' }
```

## Status Indicators

✅ orderType = 'one-time' → Regular Calendar
✅ orderType = 'recurring' → Recurring Calendar
✅ No orderType → Defaults to 'one-time'

## Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| Fields not showing | Call toggleRecurringFields() |
| Validation failing | Check recurringFrequency is filled |
| Not in calendar | Check orderType value |
| Old orders broken | Should auto-default to 'one-time' |

## Key Points

1. **orderType** is required, defaults to 'one-time'
2. **recurringFrequency** required only for recurring orders
3. **Backend validates** frequency for recurring orders
4. **Frontend validates** before sending to backend
5. **Calendar filters** by orderType field
6. **Old orders** work without changes
7. **No migration** needed
