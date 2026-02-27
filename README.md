# Hutta Home Services

A professional home services management platform with admin dashboard.

## Project Structure

```
hutta_home_ervices/
├── index.html                 # Main entry point (redirects to login)
├── pages/                     # HTML pages
│   ├── login.html            # Login page
│   ├── admin-dashboard.html  # Admin dashboard
│   └── profile-modal.html    # Profile modal component
├── assets/                   # Static assets
│   ├── css/                  # Stylesheets
│   │   ├── login-styles.css
│   │   └── dashboard-styles.css
│   ├── js/                   # JavaScript files
│   │   ├── login-script.js
│   │   └── dashboard-script.js
│   └── images/               # Images and media files
├── components/               # Reusable components
├── config/                   # Configuration files
└── README.md                # Project documentation
```

## Getting Started

1. Open `index.html` in your browser
2. You'll be redirected to the login page
3. After login, access the admin dashboard

## Features

- User authentication
- Admin dashboard with KPI metrics
- Order management
- **Customer management** (supports multiple locations with shared email)
- Vendor management
- Employee management
- Project tracking
- Payment processing
- Reporting system

## Recent Updates

### Customer Management Enhancement (Latest)

The customer management system now supports:

1. **Multiple customers with the same email address**
   - Perfect for businesses with multiple office locations
   - Example: Dentistry groups, retail chains, property management companies

2. **Multiple physical addresses per customer**
   - Store headquarters, warehouses, branches, etc.
   - Each address can be labeled (Primary, Branch Office, etc.)

**Documentation:**
- 📘 Full Guide: [CUSTOMER_MANAGEMENT_UPDATE.md](CUSTOMER_MANAGEMENT_UPDATE.md)
- 🚀 Quick Reference: [CUSTOMER_QUICK_REFERENCE.md](CUSTOMER_QUICK_REFERENCE.md)
- 📊 Visual Guide: [CUSTOMER_VISUAL_GUIDE.md](CUSTOMER_VISUAL_GUIDE.md)
- ✅ Deployment Checklist: [CUSTOMER_DEPLOYMENT_CHECKLIST.md](CUSTOMER_DEPLOYMENT_CHECKLIST.md)

**Migration Required:**
```bash
cd backend
node remove-email-unique-index.js
```