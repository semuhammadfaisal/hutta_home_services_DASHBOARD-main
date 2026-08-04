# Admin-Only Delete Restriction

## Overview
All delete operations across the platform are now restricted to **Admin accounts only**. This ensures data integrity and prevents accidental or unauthorized deletions.

## What Changed

### Backend Routes Updated
The following routes now require **admin role** for delete operations:

1. **Orders** (`/api/orders/:id`)
   - Changed from: `admin`, `manager`
   - Changed to: `admin` only

2. **Customers** (`/api/customers/:id`)
   - Changed from: `admin`, `manager`
   - Changed to: `admin` only

3. **Vendors** (`/api/vendors/:id`)
   - Changed from: `admin`, `manager`
   - Changed to: `admin` only

4. **Employees** (`/api/employees/:id`)
   - Changed from: `admin`, `manager`
   - Changed to: `admin` only

5. **Projects** (`/api/projects/:id`)
   - Changed from: No restriction
   - Changed to: `admin` only

6. **Pipeline Stages** (`/api/stages/:id`)
   - Changed from: No restriction
   - Changed to: `admin` only

7. **Pipeline Records** (`/api/pipelineRecords/:id`)
   - Changed from: No restriction
   - Changed to: `admin` only

### Already Admin-Only
These routes were already restricted to admin:

- **Payments** (`/api/payments/:id`)
- **Users** (`/api/users/:id`)

## How It Works

### Role-Based Access Control (RBAC)
The system uses the `checkRole` middleware to enforce permissions:

```javascript
router.delete('/:id', authenticateToken, checkRole(['admin']), async (req, res) => {
  // Delete logic
});
```

### User Roles
- **Admin**: Full access including all delete operations
- **Manager**: Can view and edit, but cannot delete
- **Account Rep**: Limited access, cannot delete

### Error Response
When a non-admin user attempts to delete, they receive:

```json
{
  "message": "Access denied: Insufficient permissions"
}
```

Status Code: `403 Forbidden`

## Deployment

### Steps to Apply Changes

1. **Stop the server**:
   ```bash
   # Press Ctrl+C in the terminal where server is running
   ```

2. **Restart the server**:
   ```bash
   cd backend
   npm start
   ```

3. **Test the changes**:
   - Login as a Manager or Account Rep
   - Try to delete any item (order, customer, vendor, etc.)
   - Should see "Access denied" error
   - Login as Admin
   - Delete operations should work normally

### No Database Changes Required
This is a backend-only change. No database migration or schema updates are needed.

## Testing Checklist

- [ ] Manager cannot delete orders
- [ ] Manager cannot delete customers
- [ ] Manager cannot delete vendors
- [ ] Manager cannot delete employees
- [ ] Manager cannot delete projects
- [ ] Account Rep cannot delete anything
- [ ] Admin can delete all entities
- [ ] Delete buttons hidden/disabled for non-admins in UI (if implemented)

## Frontend Considerations

### Optional UI Updates
You may want to hide or disable delete buttons for non-admin users:

```javascript
// Example: Check user role before showing delete button
if (userRole === 'admin') {
  // Show delete button
} else {
  // Hide or disable delete button
}
```

### User Role Check
The user's role is available in the session:

```javascript
const session = await window.APIService.getSession();
const userRole = session.user.role; // 'admin', 'manager', or 'account_rep'
```

## Security Notes

- All delete operations require an authenticated server session
- Role checks happen on the backend, not just frontend
- Even if someone bypasses frontend restrictions, backend will reject unauthorized deletes
- Admin users should be carefully managed and limited in number

## Support

If you need to:
- Make a user an admin: Use `backend/make-first-user-admin.js`
- Assign roles: Use the Users tab in the admin dashboard
- Change role permissions: Edit `backend/middleware/rbac.js`

## Files Modified

1. `backend/routes/orders.js`
2. `backend/routes/customers.js`
3. `backend/routes/vendors.js`
4. `backend/routes/employees.js`
5. `backend/routes/projects.js`
6. `backend/routes/stages.js`
7. `backend/routes/pipelineRecords.js`

---

**Last Updated**: January 2025
**Version**: 1.0
