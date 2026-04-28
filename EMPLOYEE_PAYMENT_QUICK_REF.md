# Employee Payment - Quick Reference

## Quick Access
1. Go to **Payments** tab
2. Click any payment row
3. Scroll to **Employee Assignment** section (if employee is assigned)

## Employee Payment Form Fields

| Field | Type | Options | Required |
|-------|------|---------|----------|
| Amount | Number | Any positive number | No |
| Status | Dropdown | Pending / Paid / Cancelled | No |
| Payment Date | Date | Any date | No |
| Payment Method | Dropdown | Cash / Bank Transfer / Check / Online | No |
| Notes | Text | Free text | No |

## Status Badge Colors

- 🟡 **Pending** - Yellow badge (default)
- 🟢 **Paid** - Green badge
- 🔴 **Cancelled** - Red badge

## Common Workflows

### Record Employee Payment
1. Open payment detail
2. Enter amount in "Amount" field
3. Select "Paid" status
4. Set payment date
5. Choose payment method
6. Click "Save Employee Payment"

### Mark Payment as Cancelled
1. Open payment detail
2. Change status to "Cancelled"
3. Add reason in Notes
4. Click "Save Employee Payment"

### Track Pending Payments
1. Open payment detail
2. Enter expected amount
3. Leave status as "Pending"
4. Set due date in Notes
5. Click "Save Employee Payment"

## Tips

✅ Employee section only shows if order has assigned employee
✅ All fields are optional - save what you need
✅ Changes save immediately on button click
✅ Employee payment is separate from customer payment
✅ Use Notes field for payment references or details

## Keyboard Shortcuts

- **ESC** - Close payment detail modal
- **Tab** - Navigate between form fields

## Troubleshooting

**Q: Employee section not showing?**
A: Order must have an assigned employee. Edit the order to assign one.

**Q: Save button not working?**
A: Check browser console for errors. Ensure you're logged in.

**Q: Changes not persisting?**
A: Refresh the page and check again. Contact admin if issue persists.
