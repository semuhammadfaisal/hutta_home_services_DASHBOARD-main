# User Management System - Visual Flow

## 🔄 Complete User Journey

```
┌─────────────────────────────────────────────────────────────────┐
│                        NEW USER SIGNUP                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  User Signs Up   │
                    │  with Email/Pass │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Account Created  │
                    │ Role: "pending"  │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ User Tries Login │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  ❌ BLOCKED!     │
                    │ "Account pending │
                    │   approval"      │
                    └──────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      ADMIN ASSIGNS ROLE                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Admin Logs In   │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Clicks "Users"   │
                    │   in Sidebar     │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Sees User List   │
                    │ 🟡 Pending User  │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Selects Role:    │
                    │ • Admin          │
                    │ • Manager        │
                    │ • Account Rep    │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Clicks "Assign"  │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ ✅ Role Assigned │
                    │ Status: Active   │
                    └──────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    USER GAINS ACCESS                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ User Logs Out    │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ User Logs In     │
                    │   Again          │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ ✅ SUCCESS!      │
                    │ Dashboard Access │
                    │ with Permissions │
                    └──────────────────┘
```

---

## 🎨 Users Tab Interface

```
┌────────────────────────────────────────────────────────────────────┐
│  User Management                    🟡 2 Pending    🟢 5 Active    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ User          │ Email           │ Role    │ Status  │ Actions││ │
│  ├──────────────────────────────────────────────────────────────┤ │
│  │ 👤 John Doe   │ john@email.com  │ 🔴 Admin│ 🟢 Active│ [▼]   ││ │
│  │ #A1B2C3D4     │                 │         │         │       ││ │
│  ├──────────────────────────────────────────────────────────────┤ │
│  │ 👤 Jane Smith │ jane@email.com  │ 🔵 Mgr  │ 🟢 Active│ [▼]   ││ │
│  │ #E5F6G7H8     │                 │         │         │       ││ │
│  ├──────────────────────────────────────────────────────────────┤ │
│  │ 👤 Bob Wilson │ bob@email.com   │ 🟡 Pend │ 🟡 Pend  │[▼][✓]││ │
│  │ #I9J0K1L2     │                 │         │         │       ││ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘

Legend:
🔴 Admin Badge (Red)
🔵 Manager Badge (Blue)
🟢 Account Rep Badge (Green)
🟡 Pending Badge (Yellow, Pulsing)
[▼] Role Dropdown
[✓] Assign Button
```

---

## 🔐 Role Permissions Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│                    FEATURE ACCESS MATRIX                        │
├─────────────────┬──────────┬──────────┬──────────┬──────────────┤
│ Feature         │  Admin   │ Manager  │ Acc Rep  │   Pending    │
├─────────────────┼──────────┼──────────┼──────────┼──────────────┤
│ Dashboard       │    ✅    │    ✅    │    ✅    │      ❌      │
│ Orders          │    ✅    │    ✅    │    ✅*   │      ❌      │
│ Customers       │    ✅    │    ✅    │    ✅*   │      ❌      │
│ Vendors         │    ✅    │    ✅    │    ❌    │      ❌      │
│ Employees       │    ✅    │    ✅    │    ❌    │      ❌      │
│ Pipeline        │    ✅    │    ✅    │    ✅    │      ❌      │
│ Payments        │    ✅    │    ❌    │    ❌    │      ❌      │
│ Accounting      │    ✅    │    ❌    │    ❌    │      ❌      │
│ Reports         │    ✅    │    ❌    │    ❌    │      ❌      │
│ Settings        │    ✅    │    ❌    │    ❌    │      ❌      │
│ 👥 USERS        │    ✅    │    ❌    │    ❌    │      ❌      │
└─────────────────┴──────────┴──────────┴──────────┴──────────────┘

* = Limited (no delete)
```

---

## 🎯 Admin Workflow Diagram

```
                    ┌─────────────────┐
                    │  Admin Logs In  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Sees Dashboard  │
                    │ + Users Tab     │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Clicks Users    │
                    └────────┬────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
                ▼                         ▼
    ┌──────────────────┐      ┌──────────────────┐
    │  Pending Users   │      │  Active Users    │
    │  (Yellow Badge)  │      │  (Green Badge)   │
    └────────┬─────────┘      └────────┬─────────┘
             │                         │
             ▼                         ▼
    ┌──────────────────┐      ┌──────────────────┐
    │ Select Role      │      │ Change Role      │
    │ Click Assign     │      │ (with confirm)   │
    └────────┬─────────┘      └────────┬─────────┘
             │                         │
             └────────────┬────────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │ ✅ Role Updated │
                 │ User notified   │
                 └─────────────────┘
```

---

## 🔄 Role Change Process

```
┌─────────────────────────────────────────────────────────────────┐
│                    ROLE CHANGE SEQUENCE                         │
└─────────────────────────────────────────────────────────────────┘

1. Admin Action:
   ┌──────────────┐
   │ Select Role  │ → Dropdown shows: Admin, Manager, Account Rep
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │ Confirmation │ → "Change role to Manager?"
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │ API Request  │ → PATCH /api/users/:id/role
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │ Database     │ → User.role = "manager"
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │ Success Msg  │ → "Role updated! User must logout/login"
   └──────────────┘

2. User Action:
   ┌──────────────┐
   │ Logout       │ → Clears old JWT token
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │ Login Again  │ → Gets new JWT with updated role
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │ New Perms    │ → Dashboard shows manager features
   └──────────────┘
```

---

## 📱 Responsive Design

```
Desktop View:
┌────────────────────────────────────────────────────────────┐
│ [Sidebar]  │  [Users Table - Full Width]                   │
│            │  All columns visible                          │
│ • Dashboard│  Avatar | Email | Role | Status | Actions     │
│ • Orders   │                                                │
│ • Users    │                                                │
└────────────────────────────────────────────────────────────┘

Tablet View:
┌────────────────────────────────────────────────────────────┐
│ [☰]  [Users Table - Optimized]                             │
│      Avatar | Email | Role | Actions                       │
│      (Status shown in role badge)                          │
└────────────────────────────────────────────────────────────┘

Mobile View:
┌──────────────────────────┐
│ [☰]  User Management     │
├──────────────────────────┤
│ ┌──────────────────────┐ │
│ │ 👤 John Doe          │ │
│ │ john@email.com       │ │
│ │ 🔴 Admin  🟢 Active  │ │
│ │ [Change Role ▼]      │ │
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │
│ │ 👤 Bob Wilson        │ │
│ │ bob@email.com        │ │
│ │ 🟡 Pending           │ │
│ │ [Assign Role ▼] [✓]  │ │
│ └──────────────────────┘ │
└──────────────────────────┘
```

---

## 🎨 Color Coding

```
Role Badges:
🔴 Admin       → Red (#fee2e2 bg, #991b1b text)
🔵 Manager     → Blue (#dbeafe bg, #1e40af text)
🟢 Account Rep → Green (#d1fae5 bg, #065f46 text)
🟡 Pending     → Yellow (#fef3c7 bg, #92400e text) + Pulse

Status Badges:
🟢 Active      → Green (#d1fae5 bg, #065f46 text)
🟡 Pending     → Yellow (#fef3c7 bg, #92400e text) + Pulse
```

---

This visual guide helps understand the complete user management flow! 🎉
