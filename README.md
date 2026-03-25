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
- **User Management System** (admin can assign roles to new signups)
- Project tracking
- Payment processing
- Reporting system

## Recent Updates

### Employee Order Assignment (Latest)

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

**Documentation:**
- 📘 Full Guide: [EMPLOYEE_ORDER_ASSIGNMENT.md](EMPLOYEE_ORDER_ASSIGNMENT.md)
- 🚀 Quick Reference: [EMPLOYEE_ASSIGNMENT_QUICK_REF.md](EMPLOYEE_ASSIGNMENT_QUICK_REF.md)

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