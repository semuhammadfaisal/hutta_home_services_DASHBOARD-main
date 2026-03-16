# Multiple Phone Numbers & Email Addresses Feature

## Overview
Added the ability to add multiple phone numbers and email addresses for customers in the "Add New Customer" modal, similar to the existing "Add Physical Address" functionality.

## Changes Made

### 1. Database Model Updates
**File:** `backend/models/Customer.js`
- Added `phoneSchema` for multiple phone numbers with label, number, and isPrimary fields
- Added `emailSchema` for multiple email addresses with label, address, and isPrimary fields
- Added `phones` and `emails` arrays to the customer schema

### 2. Frontend UI Updates
**File:** `pages/admin-dashboard.html`
- Updated customer modal to include three buttons: "Add Email", "Add Phone", "Add Address"
- Added containers for emails (`emailsContainer`) and phones (`phonesContainer`)
- Reorganized button layout to accommodate all three functions

### 3. JavaScript Functionality
**File:** `assets/js/dashboard-script.js`

#### New Functions Added:
- `addEmailAddress()` - Adds a new email input field with remove button
- `removeEmailAddress(index)` - Removes a specific email field
- `addPhoneNumber()` - Adds a new phone input field with remove button  
- `removePhoneNumber(index)` - Removes a specific phone field

#### Updated Functions:
- `showAddCustomerModal()` - Resets email and phone counters, clears containers
- `editCustomer()` - Populates existing emails and phones when editing
- `saveCustomer()` - Collects all emails and phones and includes them in customerData
- `showCustomerProfile()` - Displays multiple emails and phones in customer profile

#### New Global Variables:
- `emailCounter` - Tracks email field indices
- `phoneCounter` - Tracks phone field indices

## Usage

### Adding Multiple Contacts
1. Open "Add New Customer" modal
2. Fill in primary email and phone in the main fields
3. Click "Add Email" to add additional email addresses
4. Click "Add Phone" to add additional phone numbers
5. Each additional field has a "Remove" button to delete it
6. Save the customer - all contacts will be stored

### Data Structure
```javascript
// Customer object structure
{
  name: "Customer Name",
  email: "primary@email.com",     // Primary email (backward compatibility)
  phone: "555-0123",              // Primary phone (backward compatibility)
  emails: [                       // Array of all emails
    { label: "Primary", address: "primary@email.com", isPrimary: true },
    { label: "Email 2", address: "secondary@email.com", isPrimary: false }
  ],
  phones: [                       // Array of all phones
    { label: "Primary", number: "555-0123", isPrimary: true },
    { label: "Phone 2", number: "555-0456", isPrimary: false }
  ],
  addresses: [...],               // Existing address functionality
  // ... other customer fields
}
```

## Backward Compatibility
- Primary email and phone fields are maintained for backward compatibility
- Existing customers without the new arrays will still work normally
- The system gracefully handles both old and new data structures

## Testing
A test script is provided at `test-multiple-contacts.js` to verify functionality:
1. Open the customer modal
2. Run `testMultipleContacts()` in browser console
3. Verify all functions work correctly

## Benefits
- Supports business customers with multiple contact methods
- Maintains consistency with existing address functionality
- Provides flexible contact management
- Preserves backward compatibility with existing data