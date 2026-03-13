# Quick Reference: Customer Management Updates

## ✅ What's New

### 1. Shared Email Addresses
Multiple customer records can now use the same email address.

**Use Case**: Businesses with multiple locations sharing one contact email
- Dentistry groups with multiple offices
- Retail chains with different store locations
- Property management companies with multiple buildings

### 2. Multiple Physical Addresses
Single customer can have multiple physical addresses stored.

**Use Case**: Organizations with multiple service locations
- Corporate headquarters + warehouse + retail stores
- Main office + satellite branches
- Multiple property locations under one account

## 🚀 How to Use

### Creating Customers with Shared Email (via UI)

1. Go to **Customers** section
2. Click **Add New Customer**
3. Fill in details for first location:
   - Name: "Dental Group - Downtown"
   - Email: "contact@dentalgroup.com"
   - Address: "123 Main St"
4. Save customer

5. Click **Add New Customer** again
6. Fill in details for second location:
   - Name: "Dental Group - North Branch"
   - Email: "contact@dentalgroup.com" (same email!)
   - Address: "456 Oak Ave"
7. Save customer

✅ Both customers are created successfully with the same email!

### Creating Customer with Multiple Addresses (via API)

```javascript
POST /api/customers
{
  "name": "ABC Corporation",
  "email": "facilities@abc.com",
  "phone": "555-0200",
  "addresses": [
    {
      "label": "Headquarters",
      "address": "100 Corporate Dr",
      "city": "Chicago",
      "state": "IL",
      "zipCode": "60601",
      "isPrimary": true
    },
    {
      "label": "Warehouse",
      "address": "200 Industrial Pkwy",
      "city": "Chicago",
      "state": "IL",
      "zipCode": "60602",
      "isPrimary": false
    }
  ]
}
```

## 📊 Database Structure

### Customer Schema
```javascript
{
  name: String,
  email: String,              // No longer unique
  phone: String,
  
  // Legacy single address (still supported)
  address: String,
  city: String,
  state: String,
  zipCode: String,
  
  // New multiple addresses array
  addresses: [
    {
      label: String,          // "Primary", "Branch Office", etc.
      address: String,
      city: String,
      state: String,
      zipCode: String,
      isPrimary: Boolean
    }
  ],
  
  customerType: String,
  status: String,
  notes: String,
  totalOrders: Number,
  totalSpent: Number,
  documents: Array
}
```

## 🔍 Searching Customers

### By Email (may return multiple results)
```javascript
GET /api/customers?email=contact@dentalgroup.com

// Returns array of all customers with this email
[
  { name: "Dental Group - Downtown", ... },
  { name: "Dental Group - North Branch", ... }
]
```

### By ID (unique)
```javascript
GET /api/customers/:id

// Returns single customer
{ name: "Dental Group - Downtown", ... }
```

## ⚠️ Important Notes

1. **Email is no longer unique** - Always use customer ID for unique identification
2. **Backward compatible** - Existing customers continue to work without changes
3. **Orders are tracked separately** - Each customer location has its own order history
4. **Primary address** - First address in array is automatically marked as primary

## 🧪 Testing

Run the test suite to verify functionality:
```bash
cd backend
node test-customer-updates.js
```

Expected output:
```
✅ All tests passed successfully!

Summary:
- Multiple customers can share the same email address
- Single customer can have multiple physical addresses
- Database queries work correctly with duplicate emails
```

## 📝 Migration Checklist

- [x] Remove unique index on email field
- [x] Update Customer model schema
- [x] Update API routes
- [x] Update frontend save logic
- [x] Test duplicate email creation
- [x] Test multiple addresses
- [x] Verify backward compatibility

## 🆘 Troubleshooting

### Error: "E11000 duplicate key error"
**Solution**: Run the migration script to remove the unique index:
```bash
cd backend
node remove-email-unique-index.js
```

### Customers not saving with same email
**Solution**: 
1. Verify migration ran successfully
2. Restart backend server
3. Clear browser cache

### Old customers missing addresses array
**Solution**: This is normal! The `addresses` array is optional. Old customers use the legacy single address fields.

## 📞 Support

For issues or questions, refer to:
- Full documentation: `CUSTOMER_MANAGEMENT_UPDATE.md`
- Test script: `backend/test-customer-updates.js`
- Migration script: `backend/remove-email-unique-index.js`
