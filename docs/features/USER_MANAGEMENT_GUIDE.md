# User Management System - Quick Guide

## 🎯 Overview

The User Management system allows admins to control user access by assigning roles to new signups.

## 🔑 Key Features

### 1. **Pending User System**
- New signups automatically get `pending` role
- Pending users **cannot access the dashboard**
- They see a message: "Your account is pending approval"

### 2. **Admin Users Tab**
- Only visible to users with `admin` role
- Located in sidebar: **Users** (with users-cog icon)
- Shows all users in the system

### 3. **Role Assignment**
- Admin can assign one of three roles:
  - **Admin**: Full access to everything
  - **Manager**: Operations only (no financial/settings)
  - **Account Rep**: Sales focus (limited access)

## 📋 How It Works

### For New Users:
1. User signs up with email/password
2. Account created with `pending` role
3. User sees: "Account pending approval" message
4. User **cannot** access dashboard until role assigned

### For Admins:
1. Login to dashboard
2. Click **Users** in sidebar
3. See list of all users with:
   - Name and email
   - Current role
   - Signup date
   - Status (Pending/Active)
4. For pending users:
   - Select role from dropdown
   - Click **Assign** button
5. For active users:
   - Change role using dropdown
   - Confirms before changing

## 🎨 User Interface

### Users Table Columns:
- **User**: Avatar, name, and user ID
- **Email**: User's email address
- **Current Role**: Badge showing current role
- **Signed Up**: Registration date
- **Status**: Pending (yellow) or Active (green)
- **Actions**: Role assignment controls

### Header Stats:
- **Pending**: Count of users waiting for role
- **Active**: Count of users with assigned roles

## 🔄 Role Change Process

### Assigning Role to Pending User:
```
1. Select role from dropdown
2. Click "Assign" button
3. Success message appears
4. User must logout and login to see new permissions
```

### Changing Existing User Role:
```
1. Select new role from dropdown
2. Confirmation dialog appears
3. Confirm the change
4. Success message appears
5. User must logout and login to see new permissions
```

## ⚠️ Important Notes

### User Must Logout/Login
After role assignment or change, the user **must logout and login again** for changes to take effect. This is because:
- Role is stored in JWT token
- Token is created at login time
- Changing role in database doesn't update existing tokens

### Default Role
- New signups: `pending` (no dashboard access)
- First user in system: Should be manually set to `admin`

## 🚀 Quick Actions

### Make First User Admin:
```bash
cd backend
node assign-roles.js
# Edit line 32 to your email
# Run: node assign-roles.js
```

### View All Users:
```bash
cd backend
node list-users.js
```

## 🎯 Role Permissions Summary

| Feature | Admin | Manager | Account Rep | Pending |
|---------|-------|---------|-------------|---------|
| Dashboard | ✅ | ✅ | ✅ | ❌ |
| Orders | ✅ | ✅ | ✅ (no delete) | ❌ |
| Customers | ✅ | ✅ | ✅ (no delete) | ❌ |
| Vendors | ✅ | ✅ | ❌ | ❌ |
| Employees | ✅ | ✅ | ❌ | ❌ |
| Payments | ✅ | ❌ | ❌ | ❌ |
| Reports | ✅ | ❌ | ❌ | ❌ |
| Settings | ✅ | ❌ | ❌ | ❌ |
| **Users** | ✅ | ❌ | ❌ | ❌ |

## 🎨 Visual Indicators

### Role Badges:
- **Admin**: Red badge
- **Manager**: Blue badge
- **Account Rep**: Green badge
- **Pending**: Yellow badge (pulsing animation)

### Status Badges:
- **Active**: Green with checkmark icon
- **Pending**: Yellow with clock icon (pulsing)

## 📱 Responsive Design

The Users table is fully responsive:
- Desktop: Full table view
- Tablet: Optimized columns
- Mobile: Stacked card view

## 🔒 Security

- Only admins can access Users tab
- RBAC middleware protects API routes
- Frontend hides UI elements
- Backend validates all role changes
- Invalid roles are rejected

## 💡 Tips

1. **Assign roles promptly** - Users can't work until assigned
2. **Use appropriate roles** - Don't give everyone admin access
3. **Monitor pending users** - Check Users tab regularly
4. **Communicate with users** - Tell them to logout/login after role change
5. **Keep at least one admin** - Don't demote all admins!

## 🆘 Troubleshooting

### User can't see new permissions:
**Solution**: User must logout and login again

### Users tab not visible:
**Solution**: Only admins can see it - check your role

### Can't assign role:
**Solution**: Check if you're logged in as admin

### Pending user trying to access dashboard:
**Solution**: This is expected - assign them a role first

## 📞 Common Scenarios

### Scenario 1: New Employee Joins
```
1. Employee signs up
2. Admin sees them in Users tab (pending)
3. Admin assigns "account_rep" role
4. Employee logs out and back in
5. Employee can now access dashboard
```

### Scenario 2: Promote User
```
1. Admin goes to Users tab
2. Finds user with "account_rep" role
3. Changes dropdown to "manager"
4. Confirms the change
5. User logs out and back in
6. User now has manager permissions
```

### Scenario 3: Demote User
```
1. Admin goes to Users tab
2. Finds user with "manager" role
3. Changes dropdown to "account_rep"
4. Confirms the change
5. User logs out and back in
6. User now has limited permissions
```

---

## 🎉 Summary

The User Management system gives you complete control over who can access your dashboard and what they can do. New users start with no access, and you decide when and what role to give them. Simple, secure, and effective!
