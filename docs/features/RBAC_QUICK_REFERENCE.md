# RBAC Quick Reference

## Quick Test (Browser Console)

### Switch to Admin
```javascript
let s = JSON.parse(localStorage.getItem('huttaSession'));
s.user.role = 'admin';
localStorage.setItem('huttaSession', JSON.stringify(s));
location.reload();
```

### Switch to Manager
```javascript
let s = JSON.parse(localStorage.getItem('huttaSession'));
s.user.role = 'manager';
localStorage.setItem('huttaSession', JSON.stringify(s));
location.reload();
```

### Switch to Account Rep
```javascript
let s = JSON.parse(localStorage.getItem('huttaSession'));
s.user.role = 'account_rep';
localStorage.setItem('huttaSession', JSON.stringify(s));
location.reload();
```

## Role Comparison

| Feature | Admin | Manager | Account Rep |
|---------|-------|---------|-------------|
| Dashboard | ✅ | ✅ | ✅ |
| Orders (View) | ✅ | ✅ | ✅ |
| Orders (Create/Edit) | ✅ | ✅ | ✅ |
| Orders (Delete) | ✅ | ✅ | ❌ |
| Customers (View) | ✅ | ✅ | ✅ |
| Customers (Create/Edit) | ✅ | ✅ | ✅ |
| Customers (Delete) | ✅ | ✅ | ❌ |
| Vendors | ✅ | ✅ | ❌ |
| Employees | ✅ | ✅ | ❌ |
| Pipeline | ✅ | ✅ | ✅ |
| Payments | ✅ | ❌ | ❌ |
| Accounting | ✅ | ❌ | ❌ |
| Reports | ✅ | ❌ | ❌ |
| Settings | ✅ | ❌ | ❌ |

## Check Current Role

```javascript
console.log(window.RBAC.getRole());
```

## Check Permission

```javascript
console.log(window.RBAC.hasPermission(window.PERMISSIONS.CREATE_ORDERS));
```

## Available Roles

- `admin` - Full access
- `manager` - Operations only
- `account_rep` - Sales/customer focus

## Common Permissions

- `view_dashboard`
- `create_orders`, `edit_orders`, `delete_orders`
- `create_customers`, `edit_customers`, `delete_customers`
- `view_payments`, `create_payments`
- `view_accounting`, `manage_accounting`
- `view_reports`, `generate_reports`
- `view_settings`, `manage_settings`
