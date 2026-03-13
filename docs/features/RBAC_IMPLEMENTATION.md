# Role-Based Access Control (RBAC) Implementation Guide

## Overview

The Hutta Home Services dashboard now includes a comprehensive Role-Based Access Control (RBAC) system that restricts access to features based on user roles.

## Roles

### 1. Admin (Full Access)
**Role ID:** `admin`

Admins have complete control over the entire system.

**Access:**
- ✅ Dashboard
- ✅ Orders / Projects (View, Create, Edit, Delete)
- ✅ Customers (View, Create, Edit, Delete)
- ✅ Vendors (View, Create, Edit, Delete)
- ✅ Employees (View, Create, Edit, Delete)
- ✅ Pipeline (View, Manage)
- ✅ Payments (View, Create, Edit, Delete)
- ✅ Accounting (View, Manage)
- ✅ Reports (View, Generate)
- ✅ Settings (View, Manage)

### 2. Manager
**Role ID:** `manager`

Managers handle operations but cannot access financial data or system configuration.

**Access:**
- ✅ Dashboard
- ✅ Orders / Projects (View, Create, Edit, Delete)
- ✅ Customers (View, Create, Edit, Delete)
- ✅ Vendors (View, Create, Edit, Delete)
- ✅ Employees (View, Create, Edit, Delete)
- ✅ Pipeline (View, Manage)

**Excluded:**
- ❌ Accounting
- ❌ Payments
- ❌ Reports
- ❌ Settings

### 3. Account Representative
**Role ID:** `account_rep`

Account Representatives manage customers and sales leads.

**Access:**
- ✅ Dashboard
- ✅ Orders / Projects (View, Create, Edit only - no delete)
- ✅ Customers (View, Create, Edit only - no delete)
- ✅ Pipeline (View, Manage)

**Excluded:**
- ❌ Delete operations (Orders, Customers)
- ❌ Vendors
- ❌ Employees
- ❌ Payments
- ❌ Accounting
- ❌ Reports
- ❌ Settings

## Implementation

### Files Created

1. **`assets/js/rbac.js`** - Core RBAC system
   - Role definitions
   - Permission mappings
   - Access control logic
   - UI restriction methods

2. **`assets/js/rbac-wrappers.js`** - Function wrappers
   - Wraps existing functions with permission checks
   - Prevents unauthorized actions

3. **`RBAC_IMPLEMENTATION.md`** - This documentation

### How It Works

1. **Session-Based Role Detection**
   - User role is stored in session data during login
   - RBAC system reads role from `localStorage` or `sessionStorage`

2. **Automatic UI Restrictions**
   - Menu items are hidden based on permissions
   - Action buttons (Create, Edit, Delete) are hidden
   - Unauthorized sections are inaccessible

3. **Function-Level Protection**
   - All critical functions are wrapped with permission checks
   - Unauthorized actions show error messages
   - Prevents bypassing UI restrictions

## Setting User Roles

### Option 1: During Login (Recommended)

Update your login API to return user role:

```javascript
// In login-script.js or API response
const sessionData = {
    email: email,
    loginTime: new Date().toISOString(),
    isAuthenticated: true,
    token: response.token,
    user: {
        email: response.user.email,
        firstName: response.user.firstName,
        lastName: response.user.lastName,
        role: response.user.role // 'admin', 'manager', or 'account_rep'
    }
};
```

### Option 2: Manual Assignment (Testing)

For testing, you can manually set the role in browser console:

```javascript
// Get current session
let session = JSON.parse(localStorage.getItem('huttaSession'));

// Update role
session.user.role = 'manager'; // or 'admin' or 'account_rep'

// Save back
localStorage.setItem('huttaSession', JSON.stringify(session));

// Reload page
location.reload();
```

### Option 3: Backend Database

Add a `role` field to your user schema:

```javascript
// MongoDB User Schema
{
    email: String,
    password: String,
    firstName: String,
    lastName: String,
    role: {
        type: String,
        enum: ['admin', 'manager', 'account_rep'],
        default: 'account_rep'
    }
}
```

## Testing RBAC

### Test as Admin
```javascript
let session = JSON.parse(localStorage.getItem('huttaSession'));
session.user.role = 'admin';
localStorage.setItem('huttaSession', JSON.stringify(session));
location.reload();
```

**Expected Result:**
- All menu items visible
- All action buttons visible
- Can access all sections

### Test as Manager
```javascript
let session = JSON.parse(localStorage.getItem('huttaSession'));
session.user.role = 'manager';
localStorage.setItem('huttaSession', JSON.stringify(session));
location.reload();
```

**Expected Result:**
- Payments menu hidden
- Accounting menu hidden
- Reports menu hidden
- Settings menu hidden
- All other features accessible

### Test as Account Representative
```javascript
let session = JSON.parse(localStorage.getItem('huttaSession'));
session.user.role = 'account_rep';
localStorage.setItem('huttaSession', JSON.stringify(session));
location.reload();
```

**Expected Result:**
- Only Dashboard, Orders, Customers, Pipeline visible
- Delete buttons hidden
- Vendors, Employees, Payments, Accounting, Reports, Settings hidden
- Can create and edit orders/customers but not delete

## Customization

### Adding New Permissions

1. Add permission to `PERMISSIONS` object in `rbac.js`:
```javascript
const PERMISSIONS = {
    // ... existing permissions
    VIEW_ANALYTICS: 'view_analytics',
    EXPORT_DATA: 'export_data'
};
```

2. Add to role mappings:
```javascript
const ROLE_PERMISSIONS = {
    [ROLES.ADMIN]: [
        // ... existing permissions
        PERMISSIONS.VIEW_ANALYTICS,
        PERMISSIONS.EXPORT_DATA
    ],
    [ROLES.MANAGER]: [
        // ... existing permissions
        PERMISSIONS.VIEW_ANALYTICS
        // No EXPORT_DATA
    ]
};
```

3. Use in code:
```javascript
if (window.RBAC.hasPermission(window.PERMISSIONS.EXPORT_DATA)) {
    // Show export button
}
```

### Adding New Roles

1. Add role to `ROLES` object:
```javascript
const ROLES = {
    ADMIN: 'admin',
    MANAGER: 'manager',
    ACCOUNT_REP: 'account_rep',
    VIEWER: 'viewer' // New role
};
```

2. Define permissions:
```javascript
const ROLE_PERMISSIONS = {
    // ... existing roles
    [ROLES.VIEWER]: [
        PERMISSIONS.VIEW_DASHBOARD,
        PERMISSIONS.VIEW_ORDERS,
        PERMISSIONS.VIEW_CUSTOMERS
        // Read-only access
    ]
};
```

## API Integration

### Backend Route Protection

Protect your API routes with role checks:

```javascript
// Example Express.js middleware
const checkRole = (allowedRoles) => {
    return (req, res, next) => {
        const userRole = req.user.role;
        if (allowedRoles.includes(userRole)) {
            next();
        } else {
            res.status(403).json({ error: 'Access denied' });
        }
    };
};

// Usage
app.delete('/api/orders/:id', 
    authenticateToken, 
    checkRole(['admin', 'manager']), 
    deleteOrder
);

app.get('/api/accounting', 
    authenticateToken, 
    checkRole(['admin']), 
    getAccounting
);
```

## Troubleshooting

### Role Not Applied
- Check browser console for errors
- Verify session data contains `user.role`
- Ensure RBAC scripts are loaded before dashboard-script.js

### Buttons Still Visible
- Clear browser cache
- Check if button selector matches in `hideUnauthorizedButtons()`
- Verify permission is correctly mapped to role

### Permission Denied Errors
- Check user role: `console.log(window.RBAC.getRole())`
- Check permissions: `console.log(window.RBAC.hasPermission(window.PERMISSIONS.CREATE_ORDERS))`

## Security Notes

1. **Frontend restrictions are not security** - Always validate on backend
2. **Never trust client-side role checks** - Backend must verify permissions
3. **Use HTTPS** - Protect session data in transit
4. **Implement token expiration** - Force re-authentication periodically
5. **Log access attempts** - Monitor unauthorized access attempts

## Migration Checklist

- [ ] Add RBAC scripts to HTML
- [ ] Update user schema with role field
- [ ] Modify login API to return role
- [ ] Test each role thoroughly
- [ ] Add backend route protection
- [ ] Update user management to assign roles
- [ ] Train users on role capabilities
- [ ] Document role assignment process

## Support

For issues or questions:
1. Check browser console for errors
2. Verify session data structure
3. Test with different roles
4. Review permission mappings in rbac.js
