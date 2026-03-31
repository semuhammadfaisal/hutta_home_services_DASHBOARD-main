# Recurring Calendar & Order Type Upgrade

## Overview
This upgrade adds recurring order functionality to the CRM system with a dedicated recurring calendar view and enhanced order form.

## Changes Made

### 1. Sidebar Navigation
**File:** `pages/admin-dashboard.html`

Added new menu item directly under "Calendar":
- **Recurring Calendar** - Opens a separate calendar view for recurring orders
- Icon: `fa-calendar-check`
- Section ID: `recurring-calendar`

### 2. Order Form Enhancement
**File:** `pages/admin-dashboard.html`

Added new fields after "End Date" field:

#### Order Type (Required)
- Dropdown field with two options:
  - One Time Order (default)
  - Recurring Order
- Triggers show/hide of recurring fields

#### Recurring Fields (Conditional)
These fields only appear when "Recurring Order" is selected:

1. **Recurring Frequency** (Required when recurring)
   - Weekly
   - Bi-Weekly
   - Monthly
   - Yearly

2. **Recurring End Date** (Optional)
   - Date picker for when recurring schedule ends

3. **Recurring Notes** (Optional)
   - Text area for notes about recurring schedule

### 3. New Recurring Calendar Section
**File:** `pages/admin-dashboard.html`

Created dedicated section for recurring orders:
- Full calendar view
- Month navigation (previous/next)
- Detail panel for viewing recurring order details
- "New Recurring Order" button in header

### 4. JavaScript Functions
**File:** `assets/js/dashboard-script.js`

Added the following functions:

#### toggleRecurringFields()
- Shows/hides recurring fields based on Order Type selection
- Sets required attribute on Recurring Frequency when needed
- Clears recurring fields when switching back to one-time

#### Recurring Calendar Navigation
- `previousRecurringMonth()` - Navigate to previous month
- `nextRecurringMonth()` - Navigate to next month
- `renderRecurringCalendar()` - Renders the recurring calendar view
- `closeRecurringDetailPanel()` - Closes detail panel
- `loadRecurringCalendarSection()` - Initializes recurring calendar section

## UI/UX Features

### Design Consistency
- All new elements match existing CRM design style
- Uses same color scheme and typography
- Consistent button and form styling
- Responsive layout

### User Experience
- Smooth show/hide transitions for recurring fields
- Clear visual separation between one-time and recurring orders
- Intuitive calendar navigation
- Easy access to recurring calendar from sidebar

## Usage

### Creating a Recurring Order
1. Click "New Order" or "New Recurring Order"
2. Fill in customer and order details
3. Select "Recurring Order" from Order Type dropdown
4. Recurring fields will appear automatically
5. Select frequency (Weekly, Bi-Weekly, Monthly, or Yearly)
6. Optionally set recurring end date
7. Add any recurring-specific notes
8. Save order

### Viewing Recurring Orders
1. Click "Recurring Calendar" in sidebar
2. Navigate through months using arrow buttons
3. Click on any recurring order to view details
4. Detail panel shows recurring schedule information

## Technical Notes

### Form Validation
- Order Type is required
- Recurring Frequency is required only when Order Type is "Recurring"
- Recurring End Date and Notes are optional
- All existing order validations remain intact

### Data Structure
When saving a recurring order, the following fields are included:
```javascript
{
  orderType: 'recurring',
  recurringFrequency: 'weekly|bi-weekly|monthly|yearly',
  recurringEndDate: 'YYYY-MM-DD' (optional),
  recurringNotes: 'string' (optional)
}
```

### Backward Compatibility
- Existing orders without orderType will default to 'one-time'
- All existing order functionality remains unchanged
- No database migration required for existing orders

## Future Enhancements

### Phase 2 (Recommended)
1. **Backend Integration**
   - Add recurring order fields to Order model
   - Create API endpoints for recurring orders
   - Implement recurring order generation logic

2. **Calendar Rendering**
   - Display recurring orders on calendar
   - Show recurring pattern indicators
   - Color-code by frequency

3. **Recurring Order Management**
   - Edit recurring series
   - Skip specific occurrences
   - End recurring series early
   - View all instances of recurring order

4. **Notifications**
   - Alert before recurring order generation
   - Notify when recurring order is created
   - Warning when recurring end date approaches

## Testing Checklist

- [ ] Sidebar "Recurring Calendar" menu item appears
- [ ] Clicking "Recurring Calendar" opens new section
- [ ] Order Type dropdown appears in order form
- [ ] Selecting "Recurring Order" shows recurring fields
- [ ] Selecting "One Time Order" hides recurring fields
- [ ] Recurring Frequency dropdown has all options
- [ ] Recurring End Date picker works
- [ ] Recurring Notes text area accepts input
- [ ] Form validation works correctly
- [ ] Recurring calendar navigation works
- [ ] Design matches existing CRM style
- [ ] No existing functionality is broken

## Files Modified

1. `pages/admin-dashboard.html`
   - Added sidebar menu item
   - Added Order Type field
   - Added recurring fields
   - Added Recurring Calendar section

2. `assets/js/dashboard-script.js`
   - Added toggleRecurringFields() function
   - Added recurring calendar navigation functions
   - Updated menu navigation handler

## Support

For questions or issues with this upgrade, refer to:
- Main README.md for project structure
- Existing order management documentation
- Calendar system documentation
