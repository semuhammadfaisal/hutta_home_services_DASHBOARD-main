# Hutta Home Services

A professional home services management platform with admin dashboard.

## Project Structure

```
hutta_home_ervices/
├── index.html                 # Main entry point (redirects to login)
├── pages/                     # HTML pages
│   ├── login.html            # Login page
│   ├── admin-dashboard.html  # Admin dashboard
│   └── profile-modal.html    # Profile modal component
├── assets/                   # Static assets
│   ├── css/                  # Stylesheets
│   │   ├── login-styles.css
│   │   └── dashboard-styles.css
│   ├── js/                   # JavaScript files
│   │   ├── login-script.js
│   │   └── dashboard-script.js
│   └── images/               # Images and media files
├── components/               # Reusable components
├── config/                   # Configuration files
└── README.md                # Project documentation
```

## Getting Started

1. Open `index.html` in your browser
2. You'll be redirected to the login page
3. After login, access the admin dashboard

## Features

- User authentication
- Admin dashboard with KPI metrics
- Order management
- **Customer management** (supports multiple locations with shared email)
- Vendor management
- Employee management
- **Employee order assignment with performance tracking**
- **Employee payment tracking** (track payments to employees for completed work)
- **Vendor payment tracking** (track payments to vendors for services/materials)
- **User Management System** (admin can assign roles to new signups)
- Project tracking
- Payment processing
- Reporting system

## Recent Updates

### NO BID Stage Feature (Latest)

The pipeline now supports NO BID stages for tracking lost or declined opportunities:

1. **Hidden from Orders Tab**
   - Orders in NO BID stages don't appear in the Orders tab
   - Keeps your active orders list clean and focused
   - Orders remain visible in Pipeline view for tracking

2. **Excluded from Calculations**
   - NO BID orders don't count in dashboard KPIs
   - Revenue calculations exclude NO BID amounts
   - Accurate metrics for active opportunities only

3. **Visual Indicators**
   - Distinctive red color scheme
   - Ban icon (🚫) for easy identification
   - Create multiple NO BID stages (Lost, Declined, etc.)

4. **Reversible**
   - Drag order from NO BID to another stage
   - Order becomes visible and counted again
   - No data loss

**Documentation:**
- 🚀 **Quick Start:** [NO_BID_QUICK_START.md](NO_BID_QUICK_START.md) ← **Start here!**
- 📘 Full Guide: [NO_BID_STAGE_GUIDE.md](NO_BID_STAGE_GUIDE.md)
- 💳 Payments Behavior: [NO_BID_PAYMENTS_BEHAVIOR.md](NO_BID_PAYMENTS_BEHAVIOR.md)
- 🔧 Troubleshooting: [NO_BID_TROUBLESHOOTING.md](NO_BID_TROUBLESHOOTING.md)
- 📋 Implementation: [NO_BID_IMPLEMENTATION.md](NO_BID_IMPLEMENTATION.md)
- 🎨 Visual Guide: [NO_BID_VISUAL_GUIDE.md](NO_BID_VISUAL_GUIDE.md)

**Quick Setup:**
```bash
cd backend
node create-no-bid-stage.js
# Restart server and refresh browser
```

### Employee Order Assignment

The order management system now supports:

1. **Employee assignment to orders**
   - Dropdown to select employee when creating/editing orders
   - Track which employee is responsible for each order

2. **Employee performance statistics**
   - Total orders assigned
   - Total revenue generated
   - Total profit (Amount - Vendor Cost)
   - Active and completed order counts
   - All stats calculated dynamically from database

3. **Employee payment tracking**
   - Record payments made to employees for their work
   - Track payment status (Pending/Paid/Cancelled)
   - Record payment date, method, and amount
   - Add notes for each employee payment
   - View employee payment details in Payment Details modal

**Documentation:**
- 📘 Full Guide: [EMPLOYEE_ORDER_ASSIGNMENT.md](EMPLOYEE_ORDER_ASSIGNMENT.md)
- 🚀 Quick Reference: [EMPLOYEE_ASSIGNMENT_QUICK_REF.md](EMPLOYEE_ASSIGNMENT_QUICK_REF.md)
- 💰 Employee Payments: [EMPLOYEE_PAYMENT_FEATURE.md](EMPLOYEE_PAYMENT_FEATURE.md)
- 📋 Payment Quick Ref: [EMPLOYEE_PAYMENT_QUICK_REF.md](EMPLOYEE_PAYMENT_QUICK_REF.md)
- 🎨 Payment Visual Guide: [EMPLOYEE_PAYMENT_VISUAL_GUIDE.md](EMPLOYEE_PAYMENT_VISUAL_GUIDE.md)

### User Management System (Latest)

Admins can now control user access through a dedicated Users tab:

1. **Pending User System**
   - New signups get "pending" role by default
   - Pending users cannot access dashboard until admin assigns role
   - Clear message shown: "Account pending approval"

2. **Admin Users Tab**
   - View all signed-up users
   - See user status (Pending/Active)
   - Assign roles to pending users
   - Change roles for existing users

3. **Role Assignment**
   - Admin: Full access to everything
   - Manager: Operations only (no financial/settings)
   - Account Rep: Sales focus (limited access)
   - User must logout/login after role change

**Documentation:**
- 📘 Full Guide: [USER_MANAGEMENT_GUIDE.md](USER_MANAGEMENT_GUIDE.md)
- 🚀 Quick Setup: [USER_MANAGEMENT_SETUP.md](USER_MANAGEMENT_SETUP.md)

**Initial Setup:**
```bash
cd backend
node make-first-user-admin.js
```

### Customer Management Enhancement

The customer management system now supports:

1. **Multiple customers with the same email address**
   - Perfect for businesses with multiple office locations
   - Example: Dentistry groups, retail chains, property management companies

2. **Multiple physical addresses per customer**
   - Store headquarters, warehouses, branches, etc.
   - Each address can be labeled (Primary, Branch Office, etc.)

**Documentation:**
- 📘 Full Guide: [CUSTOMER_MANAGEMENT_UPDATE.md](CUSTOMER_MANAGEMENT_UPDATE.md)
- 🚀 Quick Reference: [CUSTOMER_QUICK_REFERENCE.md](CUSTOMER_QUICK_REFERENCE.md)
- 📊 Visual Guide: [CUSTOMER_VISUAL_GUIDE.md](CUSTOMER_VISUAL_GUIDE.md)
- ✅ Deployment Checklist: [CUSTOMER_DEPLOYMENT_CHECKLIST.md](CUSTOMER_DEPLOYMENT_CHECKLIST.md)

**Migration Required:**
```bash
cd backend
node remove-email-unique-index.js
```

### Payment System Migration

If you have existing orders, run the payment migration script to create payment records:

```bash
cd backend
node migrate-orders-to-payments.js
```

This will:
- Create payment records for all existing orders
- Automatically link payments to customers
- Set payment status based on order completion
- Safe to run multiple times (won't create duplicates)

**Documentation:**
- 📘 Full Migration Guide: [PAYMENT_MIGRATION_GUIDE.md](backend/PAYMENT_MIGRATION_GUIDE.md)