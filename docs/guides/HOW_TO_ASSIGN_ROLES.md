# How to Assign Roles to Users

## 🎯 3 Easy Methods

### Method 1: Using the Script (Recommended)

**Step 1:** Edit `backend/assign-roles.js`

Find these lines and change the email:
```javascript
// Line 32 - Change this email to your user's email
await assignRoleByEmail('your-email@example.com', 'admin');
```

**Step 2:** Run the script
```bash
cd backend
node assign-roles.js
```

**Example:**
```javascript
// Make john@company.com an admin
await assignRoleByEmail('john@company.com', 'admin');

// Make sarah@company.com a manager
await assignRoleByEmail('sarah@company.com', 'manager');

// Make mike@company.com an account rep
await assignRoleByEmail('mike@company.com', 'account_rep');
```

---

### Method 2: Using MongoDB Compass (GUI)

**Step 1:** Open MongoDB Compass and connect to your database

**Step 2:** Navigate to your database → `users` collection

**Step 3:** Find the user you want to update

**Step 4:** Click the pencil icon to edit

**Step 5:** Change the `role` field to one of:
- `admin`
- `manager`
- `account_rep`

**Step 6:** Click "Update"

**Step 7:** User must logout and login again

---

### Method 3: Using MongoDB Shell

**Step 1:** Open MongoDB shell
```bash
mongosh "your-connection-string"
```

**Step 2:** Switch to your database
```javascript
use your_database_name
```

**Step 3:** Assign role to user
```javascript
// Make user an admin
db.users.updateOne(
  { email: "user@example.com" },
  { $set: { role: "admin" } }
)

// Make user a manager
db.users.updateOne(
  { email: "user@example.com" },
  { $set: { role: "manager" } }
)

// Make user an account rep
db.users.updateOne(
  { email: "user@example.com" },
  { $set: { role: "account_rep" } }
)
```

**Step 4:** Verify the change
```javascript
db.users.find({ email: "user@example.com" }, { email: 1, role: 1 })
```

---

## 🚀 Quick Commands

### Assign Roles to Multiple Users at Once

Create a file `backend/bulk-assign-roles.js`:

```javascript
const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');

const roleAssignments = [
  { email: 'john@company.com', role: 'admin' },
  { email: 'sarah@company.com', role: 'manager' },
  { email: 'mike@company.com', role: 'account_rep' },
  { email: 'lisa@company.com', role: 'account_rep' }
];

async function bulkAssign() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  for (const assignment of roleAssignments) {
    await User.updateOne(
      { email: assignment.email },
      { $set: { role: assignment.role } }
    );
    console.log(`✅ ${assignment.email} → ${assignment.role}`);
  }
  
  await mongoose.disconnect();
  console.log('\n✅ All roles assigned!');
}

bulkAssign();
```

Then run:
```bash
node bulk-assign-roles.js
```

---

## 📋 Role Assignment Checklist

When assigning roles, consider:

### Admin Role
- ✅ Company owner
- ✅ IT administrator
- ✅ Financial controller
- ✅ Anyone who needs full access

### Manager Role
- ✅ Operations manager
- ✅ Project manager
- ✅ Team lead
- ✅ Anyone managing day-to-day operations

### Account Rep Role
- ✅ Sales representatives
- ✅ Customer service
- ✅ Account managers
- ✅ Anyone focused on customer relationships

---

## 🔄 After Assigning Roles

**Important:** Users must logout and login again for role changes to take effect!

### Why?
The role is stored in the JWT token. When a user logs in, the token is created with their current role. Changing the role in the database doesn't update existing tokens.

### Force Role Update
Users should:
1. Click logout
2. Login again
3. New token will have updated role

---

## 🧪 Verify Role Assignment

### Check in Browser Console
```javascript
// After user logs in, check their role
console.log(window.RBAC.getRole());
```

### Check in Database
```javascript
// MongoDB Shell
db.users.find({}, { email: 1, role: 1 })
```

### Check via API
```bash
# Get user info from JWT token
curl -X GET http://localhost:10000/api/auth/profile \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📊 View All Users and Roles

Create `backend/list-users.js`:

```javascript
const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');

async function listUsers() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const users = await User.find({}, 'email role firstName lastName');
  
  console.log('\n📋 All Users:\n');
  console.log('─'.repeat(70));
  console.log('Email'.padEnd(30), 'Name'.padEnd(20), 'Role');
  console.log('─'.repeat(70));
  
  users.forEach(user => {
    const name = `${user.firstName} ${user.lastName}`;
    const role = user.role || 'NO ROLE';
    console.log(
      user.email.padEnd(30),
      name.padEnd(20),
      role
    );
  });
  
  console.log('─'.repeat(70));
  console.log(`\nTotal Users: ${users.length}\n`);
  
  await mongoose.disconnect();
}

listUsers();
```

Run:
```bash
node list-users.js
```

---

## 🎯 Common Scenarios

### Scenario 1: New Company Setup
```javascript
// Make owner admin
await assignRoleByEmail('owner@company.com', 'admin');

// Make operations manager
await assignRoleByEmail('ops@company.com', 'manager');

// Make all sales team account reps
await assignRoleByEmail('sales1@company.com', 'account_rep');
await assignRoleByEmail('sales2@company.com', 'account_rep');
```

### Scenario 2: Promote User
```javascript
// Promote account rep to manager
await assignRoleByEmail('promoted@company.com', 'manager');
```

### Scenario 3: Demote User
```javascript
// Demote manager to account rep
await assignRoleByEmail('demoted@company.com', 'account_rep');
```

---

## ⚠️ Important Notes

1. **Default Role:** New users get `account_rep` role by default (most restrictive)
2. **Logout Required:** Users must logout/login after role change
3. **Case Sensitive:** Roles are case-sensitive: use `admin`, not `Admin`
4. **Valid Roles Only:** Only `admin`, `manager`, `account_rep` are valid
5. **Backend Validation:** Invalid roles will be rejected by the database

---

## 🆘 Troubleshooting

### User still has old permissions
**Solution:** User needs to logout and login again

### Role not changing
**Solution:** Check spelling - must be exactly `admin`, `manager`, or `account_rep`

### Script not working
**Solution:** Make sure MongoDB is running and connection string is correct

### Can't find user
**Solution:** Check email spelling - it's case-sensitive

---

## 📞 Quick Reference

```bash
# List all users
node list-users.js

# Assign roles
node assign-roles.js

# Create test users
node test-rbac.js
```

**Valid Roles:**
- `admin` - Full access
- `manager` - Operations only
- `account_rep` - Sales focus
