# Vendor Payment Feature - Quick Reference

## Overview
Track and manage payments made to vendors for their services on orders. Similar to employee payments but with orange/amber theme.

## How to Use

### Viewing Vendor Details
1. Go to **Payments** tab
2. Click any payment row
3. Scroll to **Vendor Assignment** section (if vendor is assigned to order)
4. View vendor name, email, and phone

### Managing Vendor Payments
1. In the Vendor Payment section:
   - **Amount**: Enter payment amount to vendor
   - **Status**: Select Pending/Paid/Cancelled
   - **Payment Date**: Record when vendor was paid
   - **Payment Method**: Cash/Bank Transfer/Check/Online
   - **Notes**: Additional payment details

2. Click **Save Vendor Payment**

## Status Badge Colors

- 🟡 **Pending** - Yellow/amber badge (default)
- 🟠 **Paid** - Orange badge
- ⚫ **Cancelled** - Gray badge

## Visual Design

- **Background**: Orange gradient (#fff7ed to #fed7aa)
- **Border**: Orange (#f59e0b)
- **Focus**: Orange with shadow
- Distinguishable from customer (blue) and employee (light blue) sections

## Data Stored

```javascript
{
  vendorPaymentAmount: 1500.00,
  vendorPaymentStatus: 'paid',
  vendorPaymentDate: '2024-01-15',
  vendorPaymentMethod: 'bank-transfer',
  vendorPaymentNotes: 'Payment for materials and labor'
}
```

## Common Workflows

### Record Vendor Payment
1. Open payment detail
2. Enter amount in vendor section
3. Select "Paid" status
4. Set payment date
5. Choose payment method
6. Click "Save Vendor Payment"

### Track Pending Vendor Payments
1. Open payment detail
2. Enter expected amount
3. Leave status as "Pending"
4. Add notes with due date
5. Click "Save Vendor Payment"

## Tips

✅ Vendor section only shows if order has assigned vendor
✅ All fields are optional - save what you need
✅ Changes save immediately on button click
✅ Vendor payment is separate from customer payment
✅ Use Notes field for invoice references or PO numbers

## Integration

- Vendor must be assigned to order first
- Vendor payment data stored in payment record
- Independent of customer and employee payments
- All three payment types can exist on same order

## Troubleshooting

**Q: Vendor section not showing?**
A: Order must have an assigned vendor. Edit the order to assign one.

**Q: Can't save vendor payment?**
A: Check that you have admin or manager role. Refresh browser if needed.

**Q: How to track multiple vendor payments?**
A: Use the Notes field to track partial payments, or create separate orders.
