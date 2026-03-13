# 🎯 Quick Guide: Assign Roles to Users

## ⚡ Super Simple Method (3 Steps)

### Step 1: List Your Users
```bash
cd backend
node list-users.js
```

**Output:**
```
📋 All Users in Database:

Email                              Name                     Role
════════════════════════════════════════════════════════════════════════════════
john@company.com                   John Doe                 ⚠️  NO ROLE
sarah@company.com                  Sarah Smith              ⚠️  NO ROLE
mike@company.com                   Mike Johnson             ⚠️  NO ROLE
```

---

### Step 2: Edit assign-roles.js

Open `backend/assign-roles.js` and find line 32:

**BEFORE:**
```javascript
await assignRoleByEmail('your-email@example.com', 'admin');
```

**AFTER:**
```javascript
await assignRoleByEmail('john@company.com', 'admin');
await assignRoleByEmail('sarah@company.com', 'manager');
await assignRoleByEmail('mike@company.com', 'account_rep');
```

---

### Step 3: Run the Script
```bash
node assign-roles.js
```

**Output:**
```
✅ Assigned admin to john@company.com
✅ Assigned manager to sarah@company.com
✅ Assigned account_rep to mike@company.com
✅ Role assignment complete!
```

---

## ✅ Done! Users Must Logout/Login

**Important:** Tell users to:
1. Logout from dashboard
2. Login again
3. Their new role will be active

---

## 🎨 Visual Example

```
┌─────────────────────────────────────────────────────────────┐
│  BEFORE (No Roles)                                           │
├─────────────────────────────────────────────────────────────┤
│  john@company.com    → ⚠️  NO ROLE                           │
│  sarah@company.com   → ⚠️  NO ROLE                           │
│  mike@company.com    → ⚠️  NO ROLE                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
                   [Run assign-roles.js]
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  AFTER (Roles Assigned)                                      │
├─────────────────────────────────────────────────────────────┤
│  john@company.com    → ✅ admin                              │
│  sarah@company.com   → ✅ manager                            │
│  mike@company.com    → ✅ account_rep                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 📝 Role Cheat Sheet

| Role | Who Gets It | What They Can Do |
|------|-------------|------------------|
| **admin** | Owner, IT Admin | Everything - full access |
| **manager** | Operations Manager | Orders, Customers, Vendors, Employees (no financial) |
| **account_rep** | Sales Team | Orders, Customers, Pipeline (limited) |

---

## 🔧 Alternative: MongoDB Compass (GUI)

If you prefer a visual interface:

1. Open **MongoDB Compass**
2. Connect to your database
3. Go to **users** collection
4. Click on a user
5. Click **Edit** (pencil icon)
6. Change `role` field to: `admin`, `manager`, or `account_rep`
7. Click **Update**
8. User must logout/login

---

## 🚨 Common Mistakes

❌ **Wrong:** `Role: "Admin"` (capital A)
✅ **Right:** `role: "admin"` (lowercase)

❌ **Wrong:** `Role: "administrator"`
✅ **Right:** `role: "admin"`

❌ **Wrong:** Expecting immediate change
✅ **Right:** User must logout and login again

---

## 🎯 Quick Commands Reference

```bash
# See all users and their roles
node list-users.js

# Assign roles to users
node assign-roles.js

# Create test users (for testing)
node test-rbac.js
```

---

## 💡 Pro Tip

Create a file `backend/my-roles.js` with your team:

```javascript
const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');

async function assignMyTeam() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  // Your team roles here
  await User.updateOne({ email: 'boss@company.com' }, { $set: { role: 'admin' } });
  await User.updateOne({ email: 'manager@company.com' }, { $set: { role: 'manager' } });
  await User.updateOne({ email: 'sales1@company.com' }, { $set: { role: 'account_rep' } });
  await User.updateOne({ email: 'sales2@company.com' }, { $set: { role: 'account_rep' } });
  
  console.log('✅ Team roles assigned!');
  await mongoose.disconnect();
}

assignMyTeam();
```

Then just run: `node my-roles.js`
