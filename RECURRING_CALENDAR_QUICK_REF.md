# Recurring Calendar - Quick Reference

## New Sidebar Menu Item

```
Dashboard
Calendar
Recurring Calendar  ← NEW
Orders
Pipeline
...
```

## Order Form - New Fields

### After "End Date" field:

```
Order Type * (Required)
├── One Time Order (default)
└── Recurring Order

[If Recurring Order selected:]

Recurring Frequency * (Required)
├── Weekly
├── Bi-Weekly
├── Monthly
└── Yearly

Recurring End Date (Optional)
[Date Picker]

Recurring Notes (Optional)
[Text Area]
```

## Key Functions

### JavaScript Functions Added

```javascript
// Toggle recurring fields visibility
toggleRecurringFields()

// Recurring calendar navigation
previousRecurringMonth()
nextRecurringMonth()
renderRecurringCalendar()
closeRecurringDetailPanel()
loadRecurringCalendarSection()
```

## Usage Flow

### Creating Recurring Order
1. Open "Add New Order" modal
2. Fill customer details
3. Select "Recurring Order" from Order Type
4. Recurring fields appear automatically
5. Choose frequency
6. Set optional end date
7. Add optional notes
8. Save

### Viewing Recurring Calendar
1. Click "Recurring Calendar" in sidebar
2. View recurring orders by month
3. Navigate with arrow buttons
4. Click order to see details

## Field Behavior

| Field | Required | Visible When | Default |
|-------|----------|--------------|---------|
| Order Type | Yes | Always | One Time Order |
| Recurring Frequency | Yes* | Order Type = Recurring | Weekly |
| Recurring End Date | No | Order Type = Recurring | Empty |
| Recurring Notes | No | Order Type = Recurring | Empty |

*Required only when Order Type is "Recurring"

## Design Notes

- Matches existing CRM design
- Smooth show/hide transitions
- Consistent form styling
- Responsive layout
- Same color scheme

## Next Steps (Backend)

To fully implement recurring orders:

1. Update Order model with new fields
2. Create recurring order generation logic
3. Add API endpoints
4. Implement calendar data loading
5. Add recurring order management features
