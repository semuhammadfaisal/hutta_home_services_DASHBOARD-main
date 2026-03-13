# Employee Order Assignment - Quick Reference

## For Users

### Assigning Employees to Orders

**When Creating a New Order:**
1. Click "Add Order" button
2. Fill in customer and order details
3. Select employee from "Assign Employee" dropdown
4. Save the order

**When Editing an Order:**
1. Click edit icon on any order
2. Change the employee selection if needed
3. Save changes

### Viewing Employee Performance

**To see employee stats:**
1. Go to Employees section
2. Click the eye icon on any employee
3. View the "Performance Stats" card showing:
   - Total Orders
   - Active Orders  
   - Completed Orders
   - Total Revenue
   - Total Profit

## For Developers

### API Endpoints

**Get Employee Stats:**
```
GET /api/employees/:id/stats
```

Response:
```json
{
  "totalOrders": 15,
  "totalRevenue": 45000,
  "totalProfit": 12000,
  "activeOrders": 5,
  "completedOrders": 10
}
```

**Create Order with Employee:**
```
POST /api/orders
```

Body:
```json
{
  "customer": { ... },
  "service": "Electrical Repair",
  "amount": 1500,
  "vendorCost": 800,
  "vendor": "vendor_id",
  "employee": "employee_id",  // NEW FIELD
  ...
}
```

### Frontend Functions

**Load employees for dropdown:**
```javascript
await loadEmployees();
```

**Get employee stats:**
```javascript
const stats = await window.APIService.getEmployeeStats(employeeId);
```

### Database Schema

**Order Model - New Field:**
```javascript
employee: { 
  type: mongoose.Schema.Types.ObjectId, 
  ref: 'Employee' 
}
```

## Key Features

✅ Employee dropdown in order form  
✅ Real-time stats calculation from database  
✅ Performance metrics on employee profile  
✅ Revenue and profit tracking per employee  
✅ Active vs completed order counts  
✅ Automatic updates when orders change  

## Notes

- Employee assignment is optional (can be left blank)
- Stats update automatically when orders are created/updated
- All calculations are done from live database data
- No caching - always shows current values
