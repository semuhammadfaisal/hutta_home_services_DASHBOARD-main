# RBAC Backend Deployment Checklist

## ✅ Completed Steps

### 1. User Model Updated
- ✅ Changed role enum from `['administrator', 'manager', 'supervisor']` to `['admin', 'manager', 'account_rep']`
- ✅ Default role set to `account_rep`
- ✅ File: `backend/models/User.js`

### 2. RBAC Middleware Created
- ✅ Created `backend/middleware/rbac.js`
- ✅ Implements `checkRole(allowedRoles)` function
- ✅ Returns 403 for unauthorized access

### 3. Routes Protected

#### Orders (`backend/routes/orders.js`)
- ✅ GET / - All authenticated users
- ✅ GET /stats - All authenticated users
- ✅ GET /:id - All authenticated users
- ✅ POST / - admin, manager, account_rep
- ✅ PUT /:id - admin, manager, account_rep
- ✅ DELETE /:id - admin, manager only

#### Customers (`backend/routes/customers.js`)
- ✅ GET / - All authenticated users
- ✅ GET /:id - All authenticated users
- ✅ GET /:id/profile - All authenticated users
- ✅ POST / - admin, manager, account_rep
- ✅ PUT /:id - admin, manager, account_rep
- ✅ DELETE /:id - admin, manager only

#### Vendors (`backend/routes/vendors.js`)
- ✅ GET / - admin, manager only
- ✅ GET /:id - admin, manager only
- ✅ POST / - admin, manager only
- ✅ PUT /:id - admin, manager only
- ✅ DELETE /:id - admin, manager only

#### Employees (`backend/routes/employees.js`)
- ✅ GET / - admin, manager only
- ✅ GET /:id - admin, manager only
- ✅ GET /:id/stats - admin, manager only
- ✅ POST / - admin, manager only
- ✅ PUT /:id - admin, manager only
- ✅ DELETE /:id - admin, manager only

#### Payments (`backend/routes/payments.js`)
- ✅ GET / - admin only
- ✅ GET /:id - admin only
- ✅ POST / - admin only
- ✅ PUT /:id - admin only
- ✅ DELETE /:id - admin only

#### Reports (`backend/routes/reports.js`)
- ✅ GET /financial - admin only
- ✅ GET /orders - admin only
- ✅ GET /customers - admin only
- ✅ GET /projects - admin only

#### Settings (`backend/routes/settings.js`)
- ✅ GET / - admin only
- ✅ PUT / - admin only
- ✅ POST /reset - admin only

### 4. Frontend RBAC
- ✅ Created `assets/js/rbac.js`
- ✅ Created `assets/js/rbac-wrappers.js`
- ✅ Updated `pages/admin-dashboard.html` to include RBAC scripts

### 5. Test Script Created
- ✅ Created `backend/test-rbac.js`
- ✅ Creates test users for all roles

## 🚀 Deployment Steps

### Step 1: Update Existing Users (if any)
```bash
cd backend
node test-rbac.js
```

This will create test users:
- admin@test.com / admin123
- manager@test.com / manager123
- rep@test.com / rep123

### Step 2: Restart Backend Server
```bash
cd backend
npm start
```

### Step 3: Test Each Role

#### Test as Admin
1. Login with: admin@test.com / admin123
2. Verify all menu items visible
3. Test creating/editing/deleting orders, customers, vendors, employees
4. Test accessing payments, accounting, reports, settings

#### Test as Manager
1. Login with: manager@test.com / manager123
2. Verify Payments, Accounting, Reports, Settings menus are hidden
3. Test creating/editing/deleting orders, customers, vendors, employees
4. Verify access to pipeline

#### Test as Account Rep
1. Login with: rep@test.com / rep123
2. Verify only Dashboard, Orders, Customers, Pipeline visible
3. Test creating/editing orders and customers
4. Verify delete buttons are hidden
5. Verify cannot access vendors, employees, payments, accounting, reports, settings

### Step 4: Update Production Users
For each existing user in your database, assign appropriate role:

```javascript
// In MongoDB shell or script
db.users.updateOne(
  { email: "user@example.com" },
  { $set: { role: "admin" } } // or "manager" or "account_rep"
);
```

## 📊 Role Permissions Summary

| Feature | Admin | Manager | Account Rep |
|---------|-------|---------|-------------|
| Dashboard | ✅ | ✅ | ✅ |
| Orders (View/Create/Edit) | ✅ | ✅ | ✅ |
| Orders (Delete) | ✅ | ✅ | ❌ |
| Customers (View/Create/Edit) | ✅ | ✅ | ✅ |
| Customers (Delete) | ✅ | ✅ | ❌ |
| Vendors | ✅ | ✅ | ❌ |
| Employees | ✅ | ✅ | ❌ |
| Pipeline | ✅ | ✅ | ✅ |
| Payments | ✅ | ❌ | ❌ |
| Accounting | ✅ | ❌ | ❌ |
| Reports | ✅ | ❌ | ❌ |
| Settings | ✅ | ❌ | ❌ |

## 🔒 Security Notes

1. **Backend validation is critical** - Frontend restrictions can be bypassed
2. **All routes are protected** - Unauthorized requests return 403
3. **JWT tokens include role** - Role is verified on every request
4. **Default role is account_rep** - Most restrictive by default

## 🐛 Troubleshooting

### Issue: User has no role
**Solution:** Run migration script to assign roles to existing users

### Issue: 403 Forbidden errors
**Solution:** Check user role in JWT token matches allowed roles for route

### Issue: Frontend shows restricted features
**Solution:** Clear browser cache and reload page

### Issue: Role not updating
**Solution:** Logout and login again to refresh JWT token

## 📝 Next Steps

1. ✅ Test all three roles thoroughly
2. ✅ Assign roles to production users
3. ✅ Monitor logs for unauthorized access attempts
4. ✅ Update user management UI to allow role assignment
5. ✅ Document role assignment process for admins
