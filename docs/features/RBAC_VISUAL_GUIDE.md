# RBAC Visual Guide

## 🎨 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     USER LOGIN                               │
│                                                              │
│  Email: admin@test.com                                       │
│  Password: ********                                          │
│                                                              │
│                    [Login Button]                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              BACKEND AUTHENTICATION                          │
│                                                              │
│  1. Verify credentials                                       │
│  2. Generate JWT token with role                            │
│  3. Return token + user data                                │
│                                                              │
│  JWT Payload: {                                             │
│    userId: "...",                                           │
│    email: "admin@test.com",                                 │
│    role: "admin"  ← ROLE INCLUDED                           │
│  }                                                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              FRONTEND RBAC SYSTEM                            │
│                                                              │
│  1. Store session with role                                  │
│  2. Initialize RBAC manager                                  │
│  3. Apply UI restrictions                                    │
│     - Hide unauthorized menu items                           │
│     - Hide unauthorized buttons                              │
│     - Wrap functions with permission checks                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  DASHBOARD VIEW                              │
│                                                              │
│  Sidebar Menu (based on role):                              │
│  ✅ Dashboard                                                │
│  ✅ Orders                                                   │
│  ✅ Customers                                                │
│  ✅/❌ Vendors (role dependent)                              │
│  ✅/❌ Employees (role dependent)                            │
│  ✅/❌ Payments (role dependent)                             │
│  ✅/❌ Accounting (role dependent)                           │
│  ✅/❌ Reports (role dependent)                              │
│  ✅/❌ Settings (role dependent)                             │
└─────────────────────────────────────────────────────────────┘
```

## 👥 Role Comparison

### Admin (Full Access)
```
┌─────────────────────────────────────────────────────────────┐
│  ADMIN DASHBOARD                                             │
├─────────────────────────────────────────────────────────────┤
│  📊 Dashboard          ✅ Full Access                        │
│  📋 Orders             ✅ View, Create, Edit, Delete         │
│  👥 Customers          ✅ View, Create, Edit, Delete         │
│  🤝 Vendors            ✅ View, Create, Edit, Delete         │
│  👔 Employees          ✅ View, Create, Edit, Delete         │
│  🔄 Pipeline           ✅ View, Manage                        │
│  💳 Payments           ✅ View, Create, Edit, Delete         │
│  💰 Accounting         ✅ View, Manage                        │
│  📈 Reports            ✅ View, Generate                      │
│  ⚙️  Settings           ✅ View, Manage                        │
└─────────────────────────────────────────────────────────────┘
```

### Manager (Operations Only)
```
┌─────────────────────────────────────────────────────────────┐
│  MANAGER DASHBOARD                                           │
├─────────────────────────────────────────────────────────────┤
│  📊 Dashboard          ✅ Full Access                        │
│  📋 Orders             ✅ View, Create, Edit, Delete         │
│  👥 Customers          ✅ View, Create, Edit, Delete         │
│  🤝 Vendors            ✅ View, Create, Edit, Delete         │
│  👔 Employees          ✅ View, Create, Edit, Delete         │
│  🔄 Pipeline           ✅ View, Manage                        │
│  💳 Payments           ❌ HIDDEN                             │
│  💰 Accounting         ❌ HIDDEN                             │
│  📈 Reports            ❌ HIDDEN                             │
│  ⚙️  Settings           ❌ HIDDEN                             │
└─────────────────────────────────────────────────────────────┘
```

### Account Representative (Sales Focus)
```
┌─────────────────────────────────────────────────────────────┐
│  ACCOUNT REP DASHBOARD                                       │
├─────────────────────────────────────────────────────────────┤
│  📊 Dashboard          ✅ Full Access                        │
│  📋 Orders             ✅ View, Create, Edit (No Delete)     │
│  👥 Customers          ✅ View, Create, Edit (No Delete)     │
│  🤝 Vendors            ❌ HIDDEN                             │
│  👔 Employees          ❌ HIDDEN                             │
│  🔄 Pipeline           ✅ View, Manage                        │
│  💳 Payments           ❌ HIDDEN                             │
│  💰 Accounting         ❌ HIDDEN                             │
│  📈 Reports            ❌ HIDDEN                             │
│  ⚙️  Settings           ❌ HIDDEN                             │
└─────────────────────────────────────────────────────────────┘
```

## 🔐 API Request Flow

### Authorized Request (Admin accessing Payments)
```
┌──────────────┐
│   Browser    │
└──────┬───────┘
       │ GET /api/payments
       │ Authorization: Bearer <JWT_TOKEN>
       ▼
┌──────────────────────────────────────┐
│  Backend Middleware                  │
│                                      │
│  1. authenticateToken()              │
│     ✅ Token valid                   │
│     ✅ Extract user: { role: "admin" }│
│                                      │
│  2. checkRole(['admin'])             │
│     ✅ User role matches             │
│     ✅ Allow request                 │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│  Route Handler                       │
│  ✅ Return payments data             │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────┐
│   Browser    │
│  ✅ Display   │
│   payments   │
└──────────────┘
```

### Unauthorized Request (Manager accessing Payments)
```
┌──────────────┐
│   Browser    │
└──────┬───────┘
       │ GET /api/payments
       │ Authorization: Bearer <JWT_TOKEN>
       ▼
┌──────────────────────────────────────┐
│  Backend Middleware                  │
│                                      │
│  1. authenticateToken()              │
│     ✅ Token valid                   │
│     ✅ Extract user: { role: "manager" }│
│                                      │
│  2. checkRole(['admin'])             │
│     ❌ User role does NOT match      │
│     ❌ Return 403 Forbidden          │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────┐
│   Browser    │
│  ❌ Error:    │
│  403 Access  │
│  Denied      │
└──────────────┘
```

## 🎯 Permission Check Flow

### Frontend Permission Check
```
User clicks "Delete Order" button
         │
         ▼
┌─────────────────────────────────────┐
│  RBAC Wrapper Function              │
│                                     │
│  window.deleteOrder = function() {  │
│    if (RBAC.checkPermission(       │
│      PERMISSIONS.DELETE_ORDERS)) {  │
│      // Execute delete              │
│    } else {                         │
│      // Show error                  │
│    }                                │
│  }                                  │
└─────────┬───────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│  Check User Role                    │
│                                     │
│  Admin:        ✅ Has permission    │
│  Manager:      ✅ Has permission    │
│  Account Rep:  ❌ No permission     │
└─────────┬───────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│  Result                             │
│                                     │
│  ✅ Execute delete API call         │
│  OR                                 │
│  ❌ Show "Access Denied" toast      │
└─────────────────────────────────────┘
```

## 📱 UI Adaptation

### Admin View
```
┌─────────────────────────────────────────────────────────────┐
│  Orders Management                                           │
├─────────────────────────────────────────────────────────────┤
│  [+ New Order]  [🔍 Search]  [Filter ▼]                     │
├─────────────────────────────────────────────────────────────┤
│  Order ID  │  Customer  │  Amount  │  Actions               │
├────────────┼────────────┼──────────┼────────────────────────┤
│  ORD-001   │  John Doe  │  $1,000  │  [👁️] [✏️] [🗑️]        │
│  ORD-002   │  Jane Doe  │  $2,000  │  [👁️] [✏️] [🗑️]        │
└─────────────────────────────────────────────────────────────┘
                                         ↑    ↑    ↑
                                       View Edit Delete
                                       ALL VISIBLE
```

### Account Rep View
```
┌─────────────────────────────────────────────────────────────┐
│  Orders Management                                           │
├─────────────────────────────────────────────────────────────┤
│  [+ New Order]  [🔍 Search]  [Filter ▼]                     │
├─────────────────────────────────────────────────────────────┤
│  Order ID  │  Customer  │  Amount  │  Actions               │
├────────────┼────────────┼──────────┼────────────────────────┤
│  ORD-001   │  John Doe  │  $1,000  │  [👁️] [✏️]             │
│  ORD-002   │  Jane Doe  │  $2,000  │  [👁️] [✏️]             │
└─────────────────────────────────────────────────────────────┘
                                         ↑    ↑
                                       View Edit
                                       DELETE HIDDEN
```

## 🔄 Role Assignment Process

```
┌─────────────────────────────────────────────────────────────┐
│  Step 1: Create User                                         │
│                                                              │
│  POST /api/auth/register                                     │
│  {                                                           │
│    "email": "newuser@example.com",                          │
│    "password": "password123",                               │
│    "firstName": "New",                                      │
│    "lastName": "User",                                      │
│    "role": "account_rep"  ← Default role                    │
│  }                                                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 2: User Logs In                                        │
│                                                              │
│  POST /api/auth/login                                        │
│  Returns JWT with role: "account_rep"                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 3: Admin Changes Role (if needed)                     │
│                                                              │
│  db.users.updateOne(                                        │
│    { email: "newuser@example.com" },                        │
│    { $set: { role: "manager" } }                            │
│  )                                                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 4: User Logs In Again                                  │
│                                                              │
│  New JWT with updated role: "manager"                        │
│  UI adapts to new permissions                                │
└─────────────────────────────────────────────────────────────┘
```

## ✅ Quick Reference

### Test Credentials
```
┌──────────────┬─────────────────────┬──────────────┐
│ Role         │ Email               │ Password     │
├──────────────┼─────────────────────┼──────────────┤
│ Admin        │ admin@test.com      │ admin123     │
│ Manager      │ manager@test.com    │ manager123   │
│ Account Rep  │ rep@test.com        │ rep123       │
└──────────────┴─────────────────────┴──────────────┘
```

### Menu Visibility
```
┌──────────────┬───────┬─────────┬─────────────┐
│ Menu Item    │ Admin │ Manager │ Account Rep │
├──────────────┼───────┼─────────┼─────────────┤
│ Dashboard    │   ✅   │    ✅    │      ✅      │
│ Orders       │   ✅   │    ✅    │      ✅      │
│ Customers    │   ✅   │    ✅    │      ✅      │
│ Vendors      │   ✅   │    ✅    │      ❌      │
│ Employees    │   ✅   │    ✅    │      ❌      │
│ Pipeline     │   ✅   │    ✅    │      ✅      │
│ Payments     │   ✅   │    ❌    │      ❌      │
│ Accounting   │   ✅   │    ❌    │      ❌      │
│ Reports      │   ✅   │    ❌    │      ❌      │
│ Settings     │   ✅   │    ❌    │      ❌      │
└──────────────┴───────┴─────────┴─────────────┘
```
