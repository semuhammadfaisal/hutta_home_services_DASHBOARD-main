# User Management - Quick Setup Guide

## 🚀 Initial Setup (First Time)

### Step 1: Sign Up Your Admin Account
1. Go to signup page
2. Create your account with email/password
3. You'll see "Account pending approval" message
4. **Don't worry!** This is expected

### Step 2: Make Yourself Admin
```bash
cd backend
node make-first-user-admin.js
```

This script will:
- Find the first user in database (you!)
- Change role from `pending` to `admin`
- Show success message

### Step 3: Login as Admin
1. Go to login page
2. Login with your credentials
3. You now have full admin access!
4. You'll see the **Users** tab in sidebar

---

## 👥 Managing New Users

### When Someone New Signs Up:

1. **They sign up** → Account created with `pending` role
2. **They try to login** → See "Account pending approval" message
3. **You (admin) login** → Go to Users tab
4. **You see them** → In the users list with yellow "Pending" badge
5. **You assign role** → Select role from dropdown, click "Assign"
6. **They login again** → Now they can access dashboard!

---

## 🎯 Quick Actions

### View All Users:
```bash
cd backend
node list-users.js
```

### Assign Role via Script:
```bash
cd backend
# Edit assign-roles.js line 32 with user email
node assign-roles.js
```

### Make First User Admin:
```bash
cd backend
node make-first-user-admin.js
```

---

## 📋 Role Selection Guide

### Choose **Admin** for:
- Company owners
- IT administrators
- Anyone who needs full system access
- Users who will manage other users

### Choose **Manager** for:
- Operations managers
- Project managers
- Team leads
- Users who manage day-to-day operations

### Choose **Account Rep** for:
- Sales representatives
- Customer service staff
- Account managers
- Users focused on customer relationships

---

## ⚠️ Important Reminders

1. **Users must logout and login** after role assignment
2. **Keep at least one admin** - don't demote all admins!
3. **Pending users can't access dashboard** - assign roles promptly
4. **Role changes require re-login** - JWT token needs refresh

---

## 🎨 What You'll See

### In Users Tab:
- **Pending Badge** (Yellow, pulsing): User waiting for role
- **Active Badge** (Green): User with assigned role
- **Role Badges**: Color-coded by role type
- **Header Stats**: Count of pending and active users

### For Pending Users:
- Dropdown to select role
- "Assign" button to confirm

### For Active Users:
- Dropdown showing current role
- Can change role (with confirmation)

---

## 🆘 Troubleshooting

### "I can't see the Users tab"
→ Only admins can see it. Run `make-first-user-admin.js`

### "User still can't access dashboard"
→ They need to logout and login again

### "I accidentally demoted myself"
→ Use `assign-roles.js` script to fix it

### "New user says account pending"
→ This is correct! Go to Users tab and assign them a role

---

## 📞 Support

For detailed information, see:
- [USER_MANAGEMENT_GUIDE.md](USER_MANAGEMENT_GUIDE.md) - Complete guide
- [HOW_TO_ASSIGN_ROLES.md](HOW_TO_ASSIGN_ROLES.md) - Role assignment methods

---

## ✅ Checklist

- [ ] Created your admin account
- [ ] Ran `make-first-user-admin.js`
- [ ] Logged in and see Users tab
- [ ] Tested assigning role to new user
- [ ] Confirmed user can access dashboard after role assignment
- [ ] Read the full documentation

---

**You're all set! 🎉**

Your user management system is ready to control access to your dashboard!
