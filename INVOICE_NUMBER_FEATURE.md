# Invoice Number Feature

## Overview
The Payments page now includes an **Invoice Number** field that allows admins to manually enter and track invoice IDs for accounting and tracking purposes.

## What's New

### 1. Invoice Number Field
- **Location**: Payment modal (Add/Edit Payment)
- **Format**: Free text field (e.g., INV-000000, INV-2024-001, etc.)
- **Purpose**: Link payments to external invoice systems for accounting

### 2. Invoice Number Column
- **Location**: Payments table (between Payment ID and Customer columns)
- **Display**: Shows the invoice number or "-" if not set
- **Styling**: Blue text with medium font weight for easy visibility

## How to Use

### Adding Invoice Number to New Payment
1. Click "Record Payment" button
2. Fill in payment details
3. Enter invoice number in the "Invoice Number" field (e.g., INV-000001)
4. Save the payment

### Adding Invoice Number to Existing Payment
1. Click the edit icon on any payment row
2. Enter or update the invoice number
3. Save changes

### Viewing Invoice Numbers
- Invoice numbers are displayed in the payments table
- Sort and search functionality works with invoice numbers
- Export reports will include invoice numbers

## Technical Details

### Database Changes
- Added `invoiceNumber` field to Payment model (String type, optional)
- No migration required - existing payments will show "-" for invoice number

### Files Modified
1. `backend/models/Payment.js` - Added invoiceNumber field to schema
2. `pages/admin-dashboard.html` - Added input field and table column
3. `assets/js/dashboard-script.js` - Updated rendering and save functions

## Benefits

✅ **Better Accounting Integration** - Link payments to external invoice systems  
✅ **Improved Tracking** - Easily reference invoices in accounting software  
✅ **Audit Trail** - Maintain clear records of invoice-payment relationships  
✅ **Flexible Format** - Use any invoice numbering system your business requires  

## Notes

- Invoice number is optional - not required for payment creation
- Supports any text format (alphanumeric, dashes, etc.)
- No automatic generation - admins control the numbering system
- Can be added or updated at any time
