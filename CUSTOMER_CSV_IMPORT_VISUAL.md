# CSV Import Feature - Visual Comparison

## UI Layout Comparison

### Vendors Section
```
┌─────────────────────────────────────────────────────────┐
│ Vendors                                                  │
│                                                          │
│  [Import CSV]  [+ Add Vendor]                          │
└─────────────────────────────────────────────────────────┘
```

### Employees Section
```
┌─────────────────────────────────────────────────────────┐
│ Employees                                                │
│                                                          │
│  [Import CSV]  [+ Add Employee]                        │
└─────────────────────────────────────────────────────────┘
```

### Customers Section (NEW)
```
┌─────────────────────────────────────────────────────────┐
│ Customers                                                │
│                                                          │
│  [Import CSV]  [+ Add Customer]                        │
└─────────────────────────────────────────────────────────┘
```

## Function Comparison

| Aspect | Vendors | Employees | Customers |
|--------|---------|-----------|-----------|
| **Function Name** | `importVendorsFromCSV()` | `importEmployeesFromCSV()` | `importCustomersFromCSV()` |
| **Button Text** | Import CSV | Import CSV | Import CSV |
| **Button Style** | btn-secondary | btn-secondary | btn-secondary |
| **Icon** | fa-file-csv | fa-file-csv | fa-file-csv |
| **File Type** | .csv | .csv | .csv |
| **Required Fields** | name, email | name, email | name, email |

## CSV Column Mapping

### Vendors
```javascript
{
  name: 'name' or 'vendor name',
  email: 'email',
  phone: 'phone' or 'phone number',
  address: 'address',
  category: 'category' (mapped),
  rating: 'rating',
  isActive: 'status' or 'isactive'
}
```

### Employees
```javascript
{
  name: 'name' or 'employee name',
  email: 'email',
  phone: 'phone' or 'phone number',
  address: 'address',
  role: 'role' (mapped),
  department: 'department',
  salary: 'salary',
  hireDate: 'hiredate' or 'hire date',
  status: 'status' (mapped),
  skills: 'skills' (semicolon-separated)
}
```

### Customers (NEW)
```javascript
{
  name: 'name' or 'customer name',
  email: 'email',
  phone: 'phone' or 'phone number',
  address: 'address',
  city: 'city',
  state: 'state',
  zip: 'zip' or 'zipcode' or 'zip code',
  type: 'type' or 'customer type' (mapped),
  status: 'status' (mapped),
  notes: 'notes'
}
```

## Mapping Functions

### Vendor Category Mapping
```
Input → Output
'general contractor' → 'civil'
'plumbing' → 'plumbing'
'electrical' → 'electrical'
'painting' → 'painting'
'hvac' → 'hvac'
'cleaning' → 'cleaning'
(default) → 'civil'
```

### Employee Role Mapping
```
Input → Output
'electrician' → 'electrician'
'plumber' → 'plumber'
'carpenter' → 'carpenter'
'hvac technician' → 'hvac-technician'
'project manager' → 'project-manager'
'supervisor' → 'supervisor'
(default) → 'general-worker'
```

### Employee Status Mapping
```
Input → Output
'active' → 'available'
'busy' → 'busy'
'offline' → 'offline'
'on leave' → 'on-leave'
(default) → 'available'
```

### Customer Type Mapping (NEW)
```
Input → Output
'permanent' → 'permanent'
'recurring' → 'permanent'
'regular' → 'permanent'
'one-time' → 'one-time'
'onetime' → 'one-time'
'single' → 'one-time'
(default) → 'one-time'
```

### Customer Status Mapping (NEW)
```
Input → Output
'active' → 'active'
'inactive' → 'inactive'
'disabled' → 'inactive'
(default) → 'active'
```

## Import Flow

```
┌─────────────────────────────────────────────────────────┐
│ 1. User clicks "Import CSV" button                      │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 2. File picker opens (accepts .csv only)                │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Parse CSV file (handle quotes, commas)               │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Show toast: "Processing X records..."                │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 5. For each row:                                         │
│    - Validate required fields                            │
│    - Map/normalize data                                  │
│    - Call API to create record                           │
│    - Track success/error counts                          │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 6. Show result toast:                                    │
│    "Imported X successfully. Y failed."                  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ 7. Auto-refresh table (if refresh function exists)      │
└─────────────────────────────────────────────────────────┘
```

## Toast Notifications

### Progress
```
ℹ️ Processing 10 vendors...
ℹ️ Processing 15 employees...
ℹ️ Processing 20 customers...
```

### Success
```
✅ Imported 10 vendors successfully. 0 failed.
✅ Imported 15 employees successfully. 0 failed.
✅ Imported 20 customers successfully. 0 failed.
```

### Partial Success
```
✅ Imported 8 vendors successfully. 2 failed.
✅ Imported 12 employees successfully. 3 failed.
✅ Imported 18 customers successfully. 2 failed.
```

### Error
```
❌ No data found in CSV file
❌ Failed to import vendors. 10 errors. Check console for details.
❌ Failed to read CSV file: [error message]
```

## Code Location

All three import functions are in the same file:
```
assets/js/csv-import.js
```

Functions exported to window object:
```javascript
window.importVendorsFromCSV = importVendorsFromCSV;
window.importEmployeesFromCSV = importEmployeesFromCSV;
window.importCustomersFromCSV = importCustomersFromCSV;  // NEW
```

## Consistency Achieved ✅

✅ Same button placement and styling
✅ Same icon (fa-file-csv)
✅ Same file type (.csv)
✅ Same parsing logic
✅ Same validation approach
✅ Same error handling
✅ Same toast notifications
✅ Same auto-refresh behavior
✅ Same console logging
✅ Same code structure

All three sections now have identical CSV import functionality!
