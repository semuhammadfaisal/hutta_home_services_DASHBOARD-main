# Payment Migration - Visual Flow Guide

## 🔄 Migration Process Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    START MIGRATION                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 1: Connect to MongoDB                                 │
│  ✓ Establish database connection                            │
│  ✓ Verify connection is successful                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 2: Fetch All Orders                                   │
│  ✓ Load all orders from database                            │
│  ✓ Count total orders                                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 3: Fetch Existing Payments                            │
│  ✓ Load all payment records                                 │
│  ✓ Create set of order IDs with payments                    │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 4: Filter Orders Without Payments                     │
│  ✓ Compare orders vs payments                               │
│  ✓ Identify orders needing payments                         │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
              ┌───────┴───────┐
              │ Any orders    │
              │ without       │───── NO ────┐
              │ payments?     │             │
              └───────┬───────┘             │
                      │                     │
                     YES                    │
                      │                     │
                      ▼                     │
┌─────────────────────────────────────────────────────────────┐
│  Step 5: Process Each Order                                 │
│                                                              │
│  FOR EACH ORDER:                                            │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 5.1: Get/Create Customer                           │    │
│  │      ├─ Has customerId? → Use it                   │    │
│  │      ├─ Has email? → Find/Create customer          │    │
│  │      └─ No info? → Skip order                      │    │
│  └────────────────────────────────────────────────────┘    │
│                      │                                      │
│                      ▼                                      │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 5.2: Generate Payment ID                           │    │
│  │      └─ Format: PAY-0001, PAY-0002, etc.           │    │
│  └────────────────────────────────────────────────────┘    │
│                      │                                      │
│                      ▼                                      │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 5.3: Determine Payment Status                      │    │
│  │      ├─ Pipeline = "Paid" → received               │    │
│  │      ├─ Status = "completed" → received            │    │
│  │      └─ Otherwise → pending                        │    │
│  └────────────────────────────────────────────────────┘    │
│                      │                                      │
│                      ▼                                      │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 5.4: Create Payment Record                         │    │
│  │      ├─ Link to order                              │    │
│  │      ├─ Link to customer                           │    │
│  │      ├─ Set amount from order                      │    │
│  │      ├─ Set status (pending/received)              │    │
│  │      ├─ Set due date from order end date           │    │
│  │      └─ Set payment date if received               │    │
│  └────────────────────────────────────────────────────┘    │
│                      │                                      │
│                      ▼                                      │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 5.5: Save to Database                              │    │
│  │      ├─ Success → Count++, Log success             │    │
│  │      └─ Error → Count errors, Log error            │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 6: Generate Summary Report                            │
│  ✓ Total orders processed                                   │
│  ✓ Successful creations                                     │
│  ✓ Failed creations                                         │
│  ✓ List of errors (if any)                                  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 7: Close Database Connection                          │
│  ✓ Disconnect from MongoDB                                  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    MIGRATION COMPLETE                        │
└─────────────────────────────────────────────────────────────┘
```

## 📊 Data Flow Diagram

```
┌──────────────┐
│   ORDERS     │
│  Collection  │
└──────┬───────┘
       │
       │ Read all orders
       │
       ▼
┌──────────────────────┐
│  Migration Script    │
│                      │
│  • Filter orders     │
│  • Process each      │
│  • Create payments   │
└──────┬───────────────┘
       │
       │ Create payment records
       │
       ▼
┌──────────────┐         ┌──────────────┐
│  PAYMENTS    │◄────────│  CUSTOMERS   │
│  Collection  │  Link   │  Collection  │
└──────────────┘         └──────────────┘
```

## 🎯 Decision Tree: Payment Status

```
                    ┌─────────────┐
                    │    ORDER    │
                    └──────┬──────┘
                           │
                           ▼
                  ┌────────────────┐
                  │ Check Pipeline │
                  │     Stage      │
                  └────────┬───────┘
                           │
              ┌────────────┼────────────┐
              │                         │
              ▼                         ▼
    ┌──────────────────┐      ┌──────────────────┐
    │ Pipeline = "Paid"│      │ Pipeline ≠ "Paid"│
    └────────┬─────────┘      └────────┬─────────┘
             │                         │
             ▼                         ▼
    ┌──────────────────┐      ┌──────────────────┐
    │ Status: RECEIVED │      │  Check Status    │
    │ Date: Order date │      └────────┬─────────┘
    │ Method: cash     │               │
    └──────────────────┘      ┌────────┼────────┐
                              │                 │
                              ▼                 ▼
                    ┌──────────────┐  ┌──────────────┐
                    │Status =      │  │Status ≠      │
                    │"completed"   │  │"completed"   │
                    └──────┬───────┘  └──────┬───────┘
                           │                 │
                           ▼                 ▼
                  ┌──────────────┐  ┌──────────────┐
                  │Status:       │  │Status:       │
                  │RECEIVED      │  │PENDING       │
                  │Date: Set     │  │Date: null    │
                  │Method: cash  │  │Method: null  │
                  └──────────────┘  └──────────────┘
```

## 🔍 Customer Handling Flow

```
┌─────────────────┐
│  Order has      │
│  customerId?    │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
   YES       NO
    │         │
    ▼         ▼
┌────────┐  ┌──────────────┐
│ Use    │  │ Order has    │
│ ID     │  │ email?       │
└────────┘  └──────┬───────┘
                   │
              ┌────┴────┐
              │         │
             YES       NO
              │         │
              ▼         ▼
    ┌──────────────┐  ┌──────────┐
    │ Find customer│  │ Skip     │
    │ by email     │  │ order    │
    └──────┬───────┘  └──────────┘
           │
      ┌────┴────┐
      │         │
    Found    Not Found
      │         │
      ▼         ▼
┌──────────┐  ┌──────────┐
│ Use      │  │ Create   │
│ existing │  │ new      │
│ customer │  │ customer │
└──────────┘  └──────────┘
```

## 📈 Success Metrics

```
┌─────────────────────────────────────────────────────────┐
│                    IDEAL OUTCOME                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Total Orders:              100  ████████████████████  │
│  Already with Payments:      10  ██                    │
│  Needing Payments:           90  ██████████████████    │
│  Successfully Created:       90  ██████████████████    │
│  Failed:                      0                        │
│                                                         │
│  Success Rate:             100%  ✅✅✅✅✅✅✅✅✅✅    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## 🎨 Payment Record Structure

```
┌─────────────────────────────────────────────────────────┐
│                   PAYMENT RECORD                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  paymentId: "PAY-0001"          [Auto-generated]       │
│  ├─ Format: PAY-XXXX                                   │
│  └─ Unique identifier                                  │
│                                                         │
│  order: ObjectId("...")         [Required]             │
│  └─ Links to Order collection                          │
│                                                         │
│  customer: ObjectId("...")      [Required]             │
│  └─ Links to Customer collection                       │
│                                                         │
│  amount: 1500.00                [From Order]           │
│  └─ Copied from order.amount                           │
│                                                         │
│  status: "pending"              [Calculated]           │
│  ├─ "received" if order completed                      │
│  └─ "pending" otherwise                                │
│                                                         │
│  description: "Payment for..."  [Auto-generated]       │
│  └─ Includes order ID and service                      │
│                                                         │
│  dueDate: Date                  [From Order]           │
│  └─ Copied from order.endDate                          │
│                                                         │
│  paymentDate: Date | null       [Conditional]          │
│  └─ Set if status is "received"                        │
│                                                         │
│  paymentMethod: "cash" | null   [Conditional]          │
│  └─ Set to "cash" if received                          │
│                                                         │
│  createdAt: Date                [Auto]                 │
│  updatedAt: Date                [Auto]                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## 🚦 Status Indicators

```
┌──────────────────────────────────────────────────────┐
│  MIGRATION PROGRESS INDICATORS                       │
├──────────────────────────────────────────────────────┤
│                                                      │
│  🚀  Starting migration                              │
│  📡  Connecting to database                          │
│  ✅  Connection successful                           │
│  📋  Fetching data                                   │
│  💳  Loading payments                                │
│  📊  Analyzing data                                  │
│  🔄  Processing orders                               │
│  ✅  Payment created                                 │
│  ⚠️   Warning (non-critical)                         │
│  ❌  Error (skipped)                                 │
│  📊  Summary report                                  │
│  ✅  Migration complete                              │
│  📡  Connection closed                               │
│                                                      │
└──────────────────────────────────────────────────────┘
```

## 🔄 Rollback Process

```
┌─────────────────────────────────────────────────────────┐
│                  ROLLBACK OPTIONS                       │
└─────────────────────┬───────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          │                       │
          ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│  Option 1:       │    │  Option 2:       │
│  Delete Payments │    │  Restore Backup  │
└────────┬─────────┘    └────────┬─────────┘
         │                       │
         ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│ Delete by date   │    │ Full database    │
│ (surgical)       │    │ restore          │
└────────┬─────────┘    └────────┬─────────┘
         │                       │
         ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│ Keeps other      │    │ Restores         │
│ data intact      │    │ everything       │
└──────────────────┘    └──────────────────┘
```

---

## 📝 Quick Reference Commands

```bash
# Run migration
node migrate-orders-to-payments.js

# Check results
mongosh hutta_home_services --eval "db.payments.countDocuments()"

# Verify no orphans
mongosh hutta_home_services --eval "
  db.orders.aggregate([
    {\$lookup: {from: 'payments', localField: '_id', foreignField: 'order', as: 'p'}},
    {\$match: {p: {\$size: 0}}},
    {\$count: 'ordersWithoutPayments'}
  ])
"
```

---

**Visual Guide Version**: 1.0.0  
**Last Updated**: January 2024
