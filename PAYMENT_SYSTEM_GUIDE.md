# Complete Payment System Guide

## Overview
The payment system is now fully integrated with orders and the pipeline, providing automatic payment tracking and status synchronization.

## Key Features

### 1. **Automatic Payment Creation**
- When you create an order, a payment record is **automatically created** with:
  - Status: `Pending`
  - Amount: Same as order amount
  - Due Date: Same as order end date
  - Linked to the order and customer

### 2. **Payment Statuses**
The system supports the following payment statuses:
- **Pending**: Payment not yet received (default for new orders)
- **Received**: Payment has been received from customer
- **Completed**: Payment fully processed
- **Failed**: Payment attempt failed
- **Refunded**: Payment was refunded
- **Cancelled**: Payment was cancelled

### 3. **Pipeline Integration**
When a payment status is changed to **Received** or **Completed**:
- The system automatically moves the order to the **"Paid"** stage in the pipeline
- The order's `pipelineStage` field is updated to "Paid"
- This triggers a dashboard refresh to update KPIs

### 4. **KPI Integration**
The **"Payments Collected"** KPI on the dashboard now shows:
- Total amount from all payments with status **"Received"** or **"Completed"**
- Updates automatically when payment statuses change
- Accurately reflects actual collected payments

## How to Use

### Creating an Order
1. Go to **Orders** section
2. Click **"New Order"**
3. Fill in order details (customer, service, amount, dates, etc.)
4. Click **"Save Order"**
5. ✅ A payment record is **automatically created** in pending status

### Managing Payments
1. Go to **Payments** section
2. You'll see all payments including:
   - Payment ID (e.g., PAY-0001)
   - Associated Order ID
   - Customer name
   - Amount
   - Payment Method (optional)
   - Status
   - Payment Date

### Updating Payment Status
1. In the **Payments** section, click **Edit** on a payment
2. Update the status:
   - Change from **Pending** to **Received** when payment is received
   - Optionally set **Payment Method** (Cash, Credit Card, etc.)
   - Set **Payment Date** to when payment was received
   - Add **Transaction ID** or **Receipt Number** if applicable
3. Click **Save Payment**
4. ✅ If status is **Received** or **Completed**:
   - Order automatically moves to **"Paid"** stage in pipeline
   - Dashboard KPIs update immediately
   - "Payments Collected" increases by the payment amount

### Viewing Payment Details
- Each payment shows the linked **Order ID**
- Click **View** to see full payment details
- Payment method can be left as "Not Set" until payment is received

## Payment Workflow Example

```
1. Create Order
   ↓
2. Payment Auto-Created (Status: Pending)
   ↓
3. Customer Pays
   ↓
4. Update Payment Status to "Received"
   ↓
5. Order Moves to "Paid" Stage in Pipeline
   ↓
6. Dashboard KPI "Payments Collected" Updates
   ↓
7. Move Order to "Closed" Stage when work is complete
```

## Payment Table Columns

| Column | Description |
|--------|-------------|
| Payment ID | Unique payment identifier (PAY-XXXX) |
| Customer | Customer name |
| Amount | Payment amount |
| Method | Payment method (Cash, Card, etc.) or "Not Set" |
| Status | Current payment status |
| Date | Date payment was received (or "Not Paid") |
| Reference | Associated order ID |
| Actions | View, Edit, Delete buttons |

## Dashboard KPIs

### Payments Collected
- Shows total of all payments with status **"Received"** or **"Completed"**
- Updates in real-time when payment statuses change
- Reflects actual money collected from customers

### Total Revenue
- Shows total amount from all orders
- Represents potential revenue (not yet collected)

### Difference
- **Total Revenue** - **Payments Collected** = Outstanding payments

## Pipeline Stages & Payments

### Automatic Stage Updates
When payment status changes to **Received** or **Completed**:
- Order moves from current stage → **"Paid"** stage
- Pipeline visually updates
- Order card shows in "Paid" column

### Manual Stage Updates
You can still manually move orders between pipeline stages:
- Moving to "Paid" stage does NOT automatically update payment status
- Payment status must be updated separately in Payments section

## Best Practices

1. **Create Orders First**: Always create the order first, payment is auto-created
2. **Update Payment Status**: When customer pays, immediately update payment status to "Received"
3. **Set Payment Method**: Add payment method when updating to "Received" status
4. **Add Transaction Details**: Include transaction ID or receipt number for record-keeping
5. **Monitor Pending Payments**: Regularly check Payments section for pending payments
6. **Use Pipeline**: Use pipeline to track order progress, payments track money flow

## Filtering & Searching

### In Payments Section
- **Search**: By payment ID, customer name, or order ID
- **Filter by Status**: Show only Pending, Received, Completed, etc.
- **Filter by Method**: Show only Cash, Credit Card, etc.

### Stats Display
- **Total**: All payments (including pending)
- **Completed**: Payments with "Received" or "Completed" status

## Technical Details

### Database Structure
```javascript
Payment {
  paymentId: String (unique, e.g., "PAY-0001")
  order: ObjectId (required, links to Order)
  customer: ObjectId (required, links to Customer)
  amount: Number (required)
  paymentMethod: String (optional: cash, credit-card, etc.)
  status: String (pending, received, completed, failed, refunded, cancelled)
  paymentDate: Date (when payment was received)
  dueDate: Date (when payment is due)
  transactionId: String (optional)
  receiptNumber: String (optional)
  description: String
  notes: String
  processedBy: ObjectId (user who processed payment)
}
```

### API Endpoints
- `GET /api/payments` - Get all payments
- `GET /api/payments/:id` - Get single payment
- `POST /api/payments` - Create payment (usually auto-created with order)
- `PUT /api/payments/:id` - Update payment (triggers pipeline sync)
- `DELETE /api/payments/:id` - Delete payment

### Automatic Triggers
1. **Order Creation** → Creates pending payment
2. **Payment Status → Received/Completed** → Moves order to "Paid" stage
3. **Payment Update** → Refreshes dashboard KPIs

## Troubleshooting

### Payment Not Showing
- Check if order was created successfully
- Refresh the Payments section
- Check browser console for errors

### KPI Not Updating
- Ensure payment status is "Received" or "Completed"
- Refresh the dashboard
- Check that payment amount is correct

### Pipeline Not Updating
- Ensure "Paid" stage exists in pipeline
- Check that order has a pipeline record
- Verify payment is linked to correct order

## Summary

The payment system provides:
✅ Automatic payment creation with orders
✅ Multiple payment statuses for tracking
✅ Pipeline integration for workflow automation
✅ Accurate KPI calculations
✅ Complete payment history and tracking
✅ Flexible payment method options
✅ Transaction and receipt tracking

This creates a complete financial tracking system that integrates seamlessly with your order management and pipeline workflow!
