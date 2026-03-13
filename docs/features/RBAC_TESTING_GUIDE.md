# RBAC Testing Guide

## 🚀 Quick Start

### 1. Create Test Users
```bash
cd backend
node test-rbac.js
```

### 2. Start Backend
```bash
npm start
```

### 3. Open Dashboard
Navigate to: `http://localhost:10000/pages/login.html`

## 🧪 Test Scenarios

### Test 1: Admin Role (Full Access)

**Login:** admin@test.com / admin123

**Expected Behavior:**
- ✅ All menu items visible (Dashboard, Orders, Customers, Vendors, Employees, Pipeline, Payments, Accounting, Reports, Settings)
- ✅ All action buttons visible (Create, Edit, Delete)
- ✅ Can access all sections
- ✅ Can perform all operations

**Test Steps:**
1. Login with admin credentials
2. Verify all 11 menu items are visible
3. Navigate to Orders → Click "New Order" → Create order → Success
4. Navigate to Customers → Click "Add Customer" → Create customer → Success
5. Navigate to Vendors → Click "Add Vendor" → Create vendor → Success
6. Navigate to Employees → Click "Add Employee" → Create employee → Success
7. Navigate to Payments → Verify page loads → Success
8. Navigate to Accounting → Verify page loads → Success
9. Navigate to Reports → Verify page loads → Success
10. Navigate to Settings → Verify page loads → Success
11. Try deleting an order → Success
12. Try deleting a customer → Success

**Pass Criteria:** All operations succeed, no 403 errors

---

### Test 2: Manager Role (Operations Only)

**Login:** manager@test.com / manager123

**Expected Behavior:**
- ✅ Dashboard, Orders, Customers, Vendors, Employees, Pipeline visible
- ❌ Payments, Accounting, Reports, Settings hidden
- ✅ Can create, edit, delete orders, customers, vendors, employees
- ❌ Cannot access financial features

**Test Steps:**
1. Login with manager credentials
2. Count menu items → Should be 7 (not 11)
3. Verify hidden: Payments, Accounting, Reports, Settings
4. Navigate to Orders → Click "New Order" → Create order → Success
5. Navigate to Customers → Click "Add Customer" → Create customer → Success
6. Navigate to Vendors → Click "Add Vendor" → Create vendor → Success
7. Navigate to Employees → Click "Add Employee" → Create employee → Success
8. Try deleting an order → Success
9. Try deleting a customer → Success
10. Try accessing `/api/payments` directly → 403 Forbidden
11. Try accessing `/api/accounting` directly → 403 Forbidden

**Pass Criteria:** 
- Only 7 menu items visible
- Can manage operations
- Cannot access financial features
- Direct API calls to restricted routes return 403

---

### Test 3: Account Representative (Sales Focus)

**Login:** rep@test.com / rep123

**Expected Behavior:**
- ✅ Dashboard, Orders, Customers, Pipeline visible
- ❌ Vendors, Employees, Payments, Accounting, Reports, Settings hidden
- ✅ Can create and edit orders and customers
- ❌ Cannot delete orders or customers
- ❌ Cannot access vendor or employee management

**Test Steps:**
1. Login with account rep credentials
2. Count menu items → Should be 4 (Dashboard, Orders, Customers, Pipeline)
3. Verify hidden: Vendors, Employees, Payments, Accounting, Reports, Settings
4. Navigate to Orders → Click "New Order" → Create order → Success
5. Navigate to Orders → Click edit on an order → Edit order → Success
6. Navigate to Orders → Verify delete button is hidden
7. Navigate to Customers → Click "Add Customer" → Create customer → Success
8. Navigate to Customers → Click edit on a customer → Edit customer → Success
9. Navigate to Customers → Verify delete button is hidden
10. Navigate to Pipeline → Verify can manage pipeline → Success
11. Try accessing `/api/vendors` directly → 403 Forbidden
12. Try accessing `/api/employees` directly → 403 Forbidden
13. Try accessing `/api/payments` directly → 403 Forbidden
14. Try DELETE `/api/orders/:id` directly → 403 Forbidden

**Pass Criteria:**
- Only 4 menu items visible
- Can create/edit but not delete
- Cannot access restricted features
- Direct API calls to restricted routes return 403

---

## 🔍 API Testing with Postman/cURL

### Get JWT Token
```bash
curl -X POST http://localhost:10000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"admin123"}'
```

### Test Protected Route (Admin)
```bash
curl -X GET http://localhost:10000/api/payments \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Test Protected Route (Manager - Should Fail)
```bash
# Login as manager first
curl -X POST http://localhost:10000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"manager@test.com","password":"manager123"}'

# Try to access payments (should return 403)
curl -X GET http://localhost:10000/api/payments \
  -H "Authorization: Bearer MANAGER_TOKEN_HERE"
```

### Test Protected Route (Account Rep - Should Fail)
```bash
# Login as account rep
curl -X POST http://localhost:10000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"rep@test.com","password":"rep123"}'

# Try to delete order (should return 403)
curl -X DELETE http://localhost:10000/api/orders/ORDER_ID_HERE \
  -H "Authorization: Bearer REP_TOKEN_HERE"
```

---

## 📊 Test Results Checklist

### Admin Tests
- [ ] Can see all 11 menu items
- [ ] Can create orders
- [ ] Can edit orders
- [ ] Can delete orders
- [ ] Can create customers
- [ ] Can edit customers
- [ ] Can delete customers
- [ ] Can access vendors
- [ ] Can access employees
- [ ] Can access payments
- [ ] Can access accounting
- [ ] Can access reports
- [ ] Can access settings

### Manager Tests
- [ ] Can see 7 menu items (no Payments, Accounting, Reports, Settings)
- [ ] Can create/edit/delete orders
- [ ] Can create/edit/delete customers
- [ ] Can access vendors
- [ ] Can access employees
- [ ] Cannot access payments (403)
- [ ] Cannot access accounting (403)
- [ ] Cannot access reports (403)
- [ ] Cannot access settings (403)

### Account Rep Tests
- [ ] Can see 4 menu items (Dashboard, Orders, Customers, Pipeline)
- [ ] Can create orders
- [ ] Can edit orders
- [ ] Cannot delete orders (button hidden + 403)
- [ ] Can create customers
- [ ] Can edit customers
- [ ] Cannot delete customers (button hidden + 403)
- [ ] Cannot access vendors (403)
- [ ] Cannot access employees (403)
- [ ] Cannot access payments (403)
- [ ] Cannot access accounting (403)
- [ ] Cannot access reports (403)
- [ ] Cannot access settings (403)

---

## 🐛 Common Issues

### Issue: All users have admin access
**Cause:** User role not set in database
**Fix:** Run `node test-rbac.js` to update roles

### Issue: 403 errors for admin
**Cause:** JWT token has old role
**Fix:** Logout and login again

### Issue: Menu items not hiding
**Cause:** Browser cache
**Fix:** Hard refresh (Ctrl+Shift+R) or clear cache

### Issue: Delete buttons still visible for account rep
**Cause:** RBAC scripts not loaded
**Fix:** Check browser console for errors, verify scripts are included in HTML

---

## ✅ Success Criteria

All tests pass when:
1. ✅ Admin can access everything
2. ✅ Manager cannot access Payments, Accounting, Reports, Settings
3. ✅ Account Rep can only access Dashboard, Orders, Customers, Pipeline
4. ✅ Account Rep cannot delete anything
5. ✅ All unauthorized API calls return 403
6. ✅ UI correctly hides unauthorized features
7. ✅ No console errors in browser

---

## 📝 Test Report Template

```
RBAC Testing Report
Date: ___________
Tester: ___________

Admin Role:
- All features accessible: [ ] Pass [ ] Fail
- Notes: ___________

Manager Role:
- Operations accessible: [ ] Pass [ ] Fail
- Financial features blocked: [ ] Pass [ ] Fail
- Notes: ___________

Account Rep Role:
- Sales features accessible: [ ] Pass [ ] Fail
- Delete operations blocked: [ ] Pass [ ] Fail
- Management features blocked: [ ] Pass [ ] Fail
- Notes: ___________

Overall Result: [ ] Pass [ ] Fail
```
