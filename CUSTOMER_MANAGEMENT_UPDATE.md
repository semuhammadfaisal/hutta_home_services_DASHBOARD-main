# Customer Management System Update

## Overview
Updated the customer management system to support multiple physical addresses under one customer and allow the same email address across multiple customers. This enables businesses with multiple office locations (e.g., dentistry groups) to share a common contact email while maintaining separate location records.

## Changes Made

### 1. Database Schema Updates (`backend/models/Customer.js`)

#### Removed Email Unique Constraint
- **Before**: `email: { type: String, required: true, unique: true }`
- **After**: `email: { type: String, required: true }`

This allows multiple customer records to share the same email address.

#### Added Multiple Addresses Support
New `addressSchema` subdocument added:
```javascript
{
  label: String,        // e.g., "Primary", "Downtown Office", "North Branch"
  address: String,
  city: String,
  state: String,
  zipCode: String,
  isPrimary: Boolean    // Marks the primary location
}
```

#### Backward Compatibility
- Existing single address fields (`address`, `city`, `state`, `zipCode`) are retained
- New `addresses` array field added for multiple locations
- Both approaches work simultaneously

### 2. API Route Updates (`backend/routes/customers.js`)

#### Removed Duplicate Email Validation
- Removed error handling for duplicate email (error code 11000)
- Customers with same email can now be created without conflicts

### 3. Frontend Updates (`assets/js/dashboard-script.js`)

#### Enhanced saveCustomer Function
- Automatically builds `addresses` array from primary address fields
- Marks first address as primary location
- Maintains backward compatibility with existing forms

### 4. Database Migration (`backend/remove-email-unique-index.js`)

Created migration script to remove the unique index on email field from existing database.

## Usage Examples

### Example 1: Dentistry Group with Multiple Offices

**Shared Email**: `contact@dentalgroup.com`

**Location 1 - Downtown Office**
```json
{
  "name": "Dental Group - Downtown",
  "email": "contact@dentalgroup.com",
  "phone": "555-0101",
  "address": "123 Main St",
  "city": "Springfield",
  "state": "IL",
  "zipCode": "62701"
}
```

**Location 2 - North Branch**
```json
{
  "name": "Dental Group - North Branch",
  "email": "contact@dentalgroup.com",
  "phone": "555-0102",
  "address": "456 Oak Ave",
  "city": "Springfield",
  "state": "IL",
  "zipCode": "62702"
}
```

### Example 2: Single Customer with Multiple Addresses

```json
{
  "name": "ABC Corporation",
  "email": "facilities@abc.com",
  "addresses": [
    {
      "label": "Primary",
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

## Migration Instructions

### Step 1: Run Database Migration
```bash
cd backend
node remove-email-unique-index.js
```

This will:
- Connect to MongoDB
- Remove the unique index on the `email` field
- Exit with success message

### Step 2: Restart Backend Server
```bash
cd backend
npm start
```

### Step 3: Verify Changes
1. Open admin dashboard
2. Navigate to Customers section
3. Try creating two customers with the same email
4. Verify both are created successfully

## API Behavior

### POST /api/customers
- **Before**: Rejected if email already exists
- **After**: Accepts duplicate emails, creates new customer record

### GET /api/customers/:id/profile
- Returns customer with all associated orders
- Orders are matched by both customer ID and email
- Supports multiple customers with same email having separate order histories

## Database Indexing

New composite index added for performance:
```javascript
customerSchema.index({ email: 1, 'addresses.address': 1 });
```

This optimizes queries that search by email and address combination.

## Backward Compatibility

✅ **Fully backward compatible**
- Existing customers with single address continue to work
- Old API calls remain functional
- No data migration required for existing records
- Forms automatically populate `addresses` array from legacy fields

## Testing Checklist

- [x] Create customer with new email
- [x] Create second customer with same email
- [x] Update customer information
- [x] View customer profile with orders
- [x] Delete customer
- [x] Search customers by email (returns multiple results)
- [x] Verify orders are correctly associated with each location

## Notes

- The system now supports both single-address and multi-address customers
- Email is no longer a unique identifier; use customer ID for unique references
- When querying by email, expect multiple results
- Primary address is automatically set for the first address in the array
- Frontend forms currently support single address input (can be extended for multiple addresses in future)

## Future Enhancements

Potential improvements for future releases:
1. UI for adding/managing multiple addresses per customer
2. Address selection dropdown when creating orders
3. Bulk import for multi-location businesses
4. Address-specific order history views
5. Location-based reporting and analytics
