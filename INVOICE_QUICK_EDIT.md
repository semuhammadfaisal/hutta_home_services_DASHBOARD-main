# Invoice Number Quick Edit Feature

## What Changed

### 1. Column Header
- Changed from "Invoice #" to just "Invoice"

### 2. Inline Editing
- Click directly on any invoice number (or the "-" if empty) in the payments table
- A popup will appear asking for the invoice number
- Just type the number (e.g., "001234")
- "INV-" is automatically added for you
- Saves immediately without opening the full edit modal

### 3. Auto-Prefix
- When editing in the modal, the input field now only shows the number part
- "INV-" is automatically added when saving
- Example: You type "001234", it saves as "INV-001234"

## How to Use

### Quick Edit (New Way)
1. Go to Payments page
2. Click on the invoice number in the table (or click "-" if empty)
3. Type just the number: `001234`
4. Press OK
5. Done! It saves as "INV-001234"

### Modal Edit (Old Way Still Works)
1. Click "Edit" button on a payment
2. In the "Invoice Number" field, type just the number: `001234`
3. Click "Save Payment"
4. Done! It saves as "INV-001234"

## Examples

| You Type | What Gets Saved | What Shows in Table |
|----------|----------------|---------------------|
| 001234   | INV-001234     | INV-001234         |
| 5678     | INV-5678       | INV-5678           |
| (empty)  | (empty)        | -                  |

## Benefits

✅ **Faster**: Click and type directly in the table
✅ **Easier**: No need to open the full edit form
✅ **Consistent**: "INV-" prefix is always added automatically
✅ **Flexible**: Both quick edit and modal edit work the same way

## Notes

- The "-" in the table is clickable - click it to add an invoice number
- Invoice numbers are shown in blue to indicate they're clickable
- Hover over an invoice number to see "Click to edit invoice number" tooltip
- If you cancel the popup (press Cancel or ESC), nothing changes
