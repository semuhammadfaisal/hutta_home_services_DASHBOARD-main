# Invoice Number Feature - Troubleshooting Guide

## Issue: Invoice Number Not Saving

If you're experiencing issues where the invoice number is not being saved when editing payments, follow these steps:

### Step 1: Restart the Backend Server

The most common cause is that the backend server needs to be restarted after the model changes.

```bash
cd backend
# Stop the current server (Ctrl+C if running)
# Then restart it
node server.js
```

### Step 2: Verify the Feature is Working

1. Open the admin dashboard
2. Go to the Payments tab
3. Click "Edit" on any payment
4. Enter an invoice number (e.g., "INV-001234")
5. Click "Save Payment"
6. The invoice number should now appear in the "Invoice #" column

### Step 3: Check Browser Console

If it's still not working:

1. Open browser Developer Tools (F12)
2. Go to the Console tab
3. Edit a payment and save
4. Look for any error messages

### Step 4: Verify Database Connection

Make sure your MongoDB connection is working:

```bash
cd backend
node -e "require('./server.js')"
```

Look for the message: "Connected to MongoDB"

### Technical Details

**Files Modified:**
- `backend/models/Payment.js` - Added `invoiceNumber: { type: String }` field
- `pages/admin-dashboard.html` - Added invoice number input field in payment modal
- `assets/js/dashboard-script.js` - Added invoice number to save/edit/display logic

**Data Flow:**
1. User enters invoice number in modal → `paymentInvoiceNumber` input field
2. JavaScript reads value → `document.getElementById('paymentInvoiceNumber').value`
3. Sent to backend → `paymentData.invoiceNumber`
4. Saved to database → Payment model `invoiceNumber` field
5. Retrieved and displayed → `payment.invoiceNumber || '-'`

### Verification Query

You can verify the data is being saved by checking MongoDB directly:

```javascript
// In MongoDB shell or Compass
db.payments.findOne({}, { invoiceNumber: 1, paymentId: 1 })
```

If you see the `invoiceNumber` field, it's working correctly.

### Still Not Working?

If the issue persists after restarting the server:

1. **Clear browser cache** - The JavaScript file might be cached
2. **Check for JavaScript errors** - Open browser console (F12)
3. **Verify MongoDB is running** - Make sure your database is accessible
4. **Check server logs** - Look for any error messages in the terminal

### Quick Test

Run this in your browser console while on the payments page:

```javascript
// Test if the field exists
console.log('Invoice field exists:', !!document.getElementById('paymentInvoiceNumber'));

// Test if the save function includes it
console.log('Save function:', savePayment.toString().includes('invoiceNumber'));
```

Both should return `true`.
