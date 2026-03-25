# Custom Fields Feature

## Overview
The custom fields feature allows you to add dynamic, user-defined fields to Vendors and Customers. This is useful for storing additional information specific to your business needs.

## Features

### For Vendors
- Add unlimited custom fields with custom names
- Examples: License Number, Tax ID, Insurance Policy Number, Certification Date, etc.
- Each field has a name and value
- Fields are saved with the vendor record

### For Customers
- Add unlimited custom fields with custom names
- Examples: Account Number, Preferred Contact Time, Special Instructions, Billing Code, etc.
- Each field has a name and value
- Fields are saved with the customer record

## How to Use

### Adding Custom Fields

1. **Open Add/Edit Modal**
   - Click "Add Vendor" or "Add Customer" button
   - Or click "Edit" on an existing vendor/customer

2. **Add Custom Field**
   - Scroll to the bottom of the form
   - Click the "+ Add Field" button under "Custom Fields"
   - A new field group will appear with two inputs:
     - **Field Name**: Enter the name of your custom field (e.g., "License Number")
     - **Field Value**: Enter the value for this field (e.g., "LIC-12345")

3. **Add Multiple Fields**
   - Click "+ Add Field" again to add more custom fields
   - You can add as many fields as needed

4. **Remove Fields**
   - Click the red "X" button next to any custom field to remove it

5. **Save**
   - Click "Save Vendor" or "Save Customer" to save all data including custom fields

### Viewing Custom Fields

When you edit a vendor or customer, all their custom fields will be automatically loaded and displayed in the form.

Custom fields are also displayed in:
- **Customer Profile Page**: Under "Customer Information" section
- **Vendor Detail Page**: Under "Vendor Information" section

The custom fields appear in a separate section with a divider line, showing the field name as the label and the field value.

## Technical Details

### Database Schema

**Vendor Model:**
```javascript
customFields: [{
  name: String,
  value: String
}]
```

**Customer Model:**
```javascript
customFields: [{
  name: String,
  value: String
}]
```

### Files Modified

1. **Backend Models:**
   - `backend/models/Vendor.js` - Added customFields array
   - `backend/models/Customer.js` - Added customFields array

2. **Frontend:**
   - `pages/admin-dashboard.html` - Added custom fields UI sections
   - `assets/js/custom-fields.js` - Custom fields management functions
   - `assets/js/dashboard-script.js` - Integration with save/edit functions
   - `assets/css/custom-fields.css` - Styling for custom fields

### JavaScript Functions

**Vendor Functions:**
- `addVendorCustomField(name, value)` - Add a custom field to vendor form
- `getVendorCustomFields()` - Get all vendor custom fields from form
- `loadVendorCustomFields(customFields)` - Load custom fields into vendor form
- `clearVendorCustomFields()` - Clear all vendor custom fields

**Customer Functions:**
- `addCustomerCustomField(name, value)` - Add a custom field to customer form
- `getCustomerCustomFields()` - Get all customer custom fields from form
- `loadCustomerCustomFields(customFields)` - Load custom fields into customer form
- `clearCustomerCustomFields()` - Clear all customer custom fields

**Shared Function:**
- `removeCustomField(fieldId)` - Remove a specific custom field

## Use Cases

### Vendor Examples
- **License Number**: Store contractor license numbers
- **Insurance Expiry**: Track when insurance needs renewal
- **Tax ID**: Store tax identification numbers
- **Preferred Payment Method**: Note how vendor prefers to be paid
- **Emergency Contact**: Store emergency contact information

### Customer Examples
- **Account Number**: Internal account reference numbers
- **Preferred Technician**: Note which employee customer prefers
- **Gate Code**: Access codes for gated properties
- **Pet Information**: Note if customer has pets on property
- **Billing Contact**: Separate billing contact information

## Best Practices

1. **Consistent Naming**: Use consistent field names across similar records
2. **Clear Labels**: Use descriptive field names that are easy to understand
3. **Required vs Optional**: Only add fields that provide value
4. **Data Validation**: Enter accurate information in field values
5. **Regular Updates**: Keep custom field values up to date

## Future Enhancements

Potential improvements for future versions:
- Field type validation (number, date, email, etc.)
- Required custom fields
- Default custom field templates
- Custom field search/filter
- Bulk edit custom fields
- Export custom fields to reports
