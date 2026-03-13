# CSV Import Guide for Customers

## Overview
The customer CSV import feature allows you to bulk import customer data from a CSV file, matching the functionality available for vendors and employees.

## How to Use

1. Navigate to the **Customers** section in the dashboard
2. Click the **Import CSV** button (next to "Add Customer")
3. Select your CSV file
4. The system will process and import the customers
5. You'll see a success message with the count of imported customers

## CSV File Format

### Required Columns
- `name` or `customer name` - Customer's full name (REQUIRED)
- `email` - Customer's email address (REQUIRED)

### Optional Columns
- `phone` or `phone number` - Contact phone number
- `address` - Street address
- `city` - City name
- `state` - State/Province
- `zip`, `zipcode`, or `zip code` - Postal code
- `type` or `customer type` - Customer type (see below)
- `status` - Customer status (see below)
- `notes` - Additional notes about the customer

### Customer Type Values
The system accepts these values (case-insensitive):
- `permanent`, `recurring`, `regular` → Mapped to "permanent"
- `one-time`, `onetime`, `single` → Mapped to "one-time"
- Default: `one-time`

### Status Values
The system accepts these values (case-insensitive):
- `active` → Active customer
- `inactive`, `disabled` → Inactive customer
- Default: `active`

## Sample CSV Template

```csv
name,email,phone,address,city,state,zip,type,status,notes
John Smith,john.smith@example.com,555-0101,123 Main St,Springfield,IL,62701,permanent,active,Regular customer
Jane Doe,jane.doe@example.com,555-0102,456 Oak Ave,Chicago,IL,60601,one-time,active,Single project
ABC Corp,contact@abccorp.com,555-0103,789 Business Blvd,Naperville,IL,60540,permanent,active,Corporate client
```

A template file is available at: `CUSTOMER_CSV_TEMPLATE.csv`

## Features

✅ **Automatic Field Mapping** - Handles variations in column names (e.g., "phone" or "phone number")
✅ **Data Validation** - Skips rows with missing required fields (name or email)
✅ **Error Reporting** - Shows count of successful and failed imports
✅ **Auto Refresh** - Automatically refreshes the customer list after import
✅ **Progress Feedback** - Toast notifications show import progress

## Error Handling

- Rows missing name or email are skipped
- Invalid data types are handled gracefully
- Detailed error messages in browser console
- Summary shows success/failure counts

## Tips

1. **Test with small files first** - Import 2-3 customers to verify format
2. **Check console for errors** - Open browser DevTools (F12) to see detailed error messages
3. **Use the template** - Start with CUSTOMER_CSV_TEMPLATE.csv and modify it
4. **Avoid special characters** - Use plain text for best compatibility
5. **One customer per row** - Each row represents one customer record

## Comparison with Vendors & Employees

| Feature | Vendors | Employees | Customers |
|---------|---------|-----------|-----------|
| CSV Import Button | ✅ | ✅ | ✅ |
| Required Fields | name, email | name, email | name, email |
| Category Mapping | ✅ | ✅ (roles) | ✅ (types) |
| Status Mapping | ✅ | ✅ | ✅ |
| Auto Refresh | ✅ | ✅ | ✅ |

## Technical Details

- **File Type**: CSV (.csv)
- **Encoding**: UTF-8 recommended
- **Parser**: Custom CSV parser with quote handling
- **API Endpoint**: Uses `APIService.createCustomer()`
- **Location**: `assets/js/csv-import.js`

## Troubleshooting

**Problem**: "No data found in CSV file"
- **Solution**: Ensure file has headers and at least one data row

**Problem**: "Failed to import customers"
- **Solution**: Check that name and email columns exist and have values

**Problem**: Import succeeds but customers don't appear
- **Solution**: Refresh the page or check browser console for API errors

**Problem**: Some customers imported, others failed
- **Solution**: Check console logs for specific error messages per customer
