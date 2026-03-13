// Role-Based Access Control (RBAC) System

const ROLES = {
    ADMIN: 'admin',
    MANAGER: 'manager',
    ACCOUNT_REP: 'account_rep'
};

const PERMISSIONS = {
    // Dashboard
    VIEW_DASHBOARD: 'view_dashboard',
    
    // Orders/Projects
    VIEW_ORDERS: 'view_orders',
    CREATE_ORDERS: 'create_orders',
    EDIT_ORDERS: 'edit_orders',
    DELETE_ORDERS: 'delete_orders',
    
    // Customers
    VIEW_CUSTOMERS: 'view_customers',
    CREATE_CUSTOMERS: 'create_customers',
    EDIT_CUSTOMERS: 'edit_customers',
    DELETE_CUSTOMERS: 'delete_customers',
    
    // Vendors
    VIEW_VENDORS: 'view_vendors',
    CREATE_VENDORS: 'create_vendors',
    EDIT_VENDORS: 'edit_vendors',
    DELETE_VENDORS: 'delete_vendors',
    
    // Employees
    VIEW_EMPLOYEES: 'view_employees',
    CREATE_EMPLOYEES: 'create_employees',
    EDIT_EMPLOYEES: 'edit_employees',
    DELETE_EMPLOYEES: 'delete_employees',
    
    // Pipeline
    VIEW_PIPELINE: 'view_pipeline',
    MANAGE_PIPELINE: 'manage_pipeline',
    
    // Payments
    VIEW_PAYMENTS: 'view_payments',
    CREATE_PAYMENTS: 'create_payments',
    EDIT_PAYMENTS: 'edit_payments',
    DELETE_PAYMENTS: 'delete_payments',
    
    // Accounting
    VIEW_ACCOUNTING: 'view_accounting',
    MANAGE_ACCOUNTING: 'manage_accounting',
    
    // Reports
    VIEW_REPORTS: 'view_reports',
    GENERATE_REPORTS: 'generate_reports',
    
    // Settings
    VIEW_SETTINGS: 'view_settings',
    MANAGE_SETTINGS: 'manage_settings'
};

// Role permissions mapping
const ROLE_PERMISSIONS = {
    [ROLES.ADMIN]: [
        // Full access to everything
        PERMISSIONS.VIEW_DASHBOARD,
        PERMISSIONS.VIEW_ORDERS, PERMISSIONS.CREATE_ORDERS, PERMISSIONS.EDIT_ORDERS, PERMISSIONS.DELETE_ORDERS,
        PERMISSIONS.VIEW_CUSTOMERS, PERMISSIONS.CREATE_CUSTOMERS, PERMISSIONS.EDIT_CUSTOMERS, PERMISSIONS.DELETE_CUSTOMERS,
        PERMISSIONS.VIEW_VENDORS, PERMISSIONS.CREATE_VENDORS, PERMISSIONS.EDIT_VENDORS, PERMISSIONS.DELETE_VENDORS,
        PERMISSIONS.VIEW_EMPLOYEES, PERMISSIONS.CREATE_EMPLOYEES, PERMISSIONS.EDIT_EMPLOYEES, PERMISSIONS.DELETE_EMPLOYEES,
        PERMISSIONS.VIEW_PIPELINE, PERMISSIONS.MANAGE_PIPELINE,
        PERMISSIONS.VIEW_PAYMENTS, PERMISSIONS.CREATE_PAYMENTS, PERMISSIONS.EDIT_PAYMENTS, PERMISSIONS.DELETE_PAYMENTS,
        PERMISSIONS.VIEW_ACCOUNTING, PERMISSIONS.MANAGE_ACCOUNTING,
        PERMISSIONS.VIEW_REPORTS, PERMISSIONS.GENERATE_REPORTS,
        PERMISSIONS.VIEW_SETTINGS, PERMISSIONS.MANAGE_SETTINGS
    ],
    
    [ROLES.MANAGER]: [
        // Operations but not finances or settings
        PERMISSIONS.VIEW_DASHBOARD,
        PERMISSIONS.VIEW_ORDERS, PERMISSIONS.CREATE_ORDERS, PERMISSIONS.EDIT_ORDERS, PERMISSIONS.DELETE_ORDERS,
        PERMISSIONS.VIEW_CUSTOMERS, PERMISSIONS.CREATE_CUSTOMERS, PERMISSIONS.EDIT_CUSTOMERS, PERMISSIONS.DELETE_CUSTOMERS,
        PERMISSIONS.VIEW_VENDORS, PERMISSIONS.CREATE_VENDORS, PERMISSIONS.EDIT_VENDORS, PERMISSIONS.DELETE_VENDORS,
        PERMISSIONS.VIEW_EMPLOYEES, PERMISSIONS.CREATE_EMPLOYEES, PERMISSIONS.EDIT_EMPLOYEES, PERMISSIONS.DELETE_EMPLOYEES,
        PERMISSIONS.VIEW_PIPELINE, PERMISSIONS.MANAGE_PIPELINE
        // NO: Accounting, Payments, Settings, Reports
    ],
    
    [ROLES.ACCOUNT_REP]: [
        // Customer management and sales
        PERMISSIONS.VIEW_DASHBOARD,
        PERMISSIONS.VIEW_ORDERS, PERMISSIONS.CREATE_ORDERS, PERMISSIONS.EDIT_ORDERS,
        PERMISSIONS.VIEW_CUSTOMERS, PERMISSIONS.CREATE_CUSTOMERS, PERMISSIONS.EDIT_CUSTOMERS,
        PERMISSIONS.VIEW_PIPELINE, PERMISSIONS.MANAGE_PIPELINE
        // NO: Delete operations, Vendors, Employees, Payments, Accounting, Reports, Settings
    ]
};

class RBACManager {
    constructor() {
        this.currentUser = null;
        this.currentRole = null;
    }
    
    // Initialize RBAC with user session
    init() {
        const session = localStorage.getItem('huttaSession') || sessionStorage.getItem('huttaSession');
        if (session) {
            try {
                const sessionData = JSON.parse(session);
                this.currentUser = sessionData.user;
                this.currentRole = sessionData.user?.role || ROLES.ADMIN; // Default to admin if not set
                this.applyRoleRestrictions();
            } catch (error) {
                console.error('Failed to parse session:', error);
            }
        }
    }
    
    // Check if user has permission
    hasPermission(permission) {
        if (!this.currentRole) return false;
        const permissions = ROLE_PERMISSIONS[this.currentRole] || [];
        return permissions.includes(permission);
    }
    
    // Check if user has role
    hasRole(role) {
        return this.currentRole === role;
    }
    
    // Get current role
    getRole() {
        return this.currentRole;
    }
    
    // Apply role-based UI restrictions
    applyRoleRestrictions() {
        this.hideUnauthorizedMenuItems();
        this.hideUnauthorizedButtons();
        this.updateRoleDisplay();
    }
    
    // Hide menu items based on role
    hideUnauthorizedMenuItems() {
        const menuItems = {
            'payments': PERMISSIONS.VIEW_PAYMENTS,
            'accounting': PERMISSIONS.VIEW_ACCOUNTING,
            'reports': PERMISSIONS.VIEW_REPORTS,
            'settings': PERMISSIONS.VIEW_SETTINGS,
            'employees': PERMISSIONS.VIEW_EMPLOYEES,
            'vendors': PERMISSIONS.VIEW_VENDORS
        };
        
        Object.entries(menuItems).forEach(([section, permission]) => {
            if (!this.hasPermission(permission)) {
                const menuItem = document.querySelector(`[data-section="${section}"]`)?.parentElement;
                if (menuItem) {
                    menuItem.style.display = 'none';
                }
            }
        });
        
        // Hide menu items with data-rbac-role attribute
        document.querySelectorAll('[data-rbac-role]').forEach(element => {
            const requiredRole = element.getAttribute('data-rbac-role');
            if (!this.hasRole(requiredRole)) {
                element.style.display = 'none';
            }
        });
    }
    
    // Hide action buttons based on permissions
    hideUnauthorizedButtons() {
        // Hide create buttons
        if (!this.hasPermission(PERMISSIONS.CREATE_ORDERS)) {
            this.hideElements('.btn-primary[onclick*="showAddOrderModal"]');
        }
        if (!this.hasPermission(PERMISSIONS.CREATE_CUSTOMERS)) {
            this.hideElements('.btn-primary[onclick*="showAddCustomerModal"]');
        }
        if (!this.hasPermission(PERMISSIONS.CREATE_VENDORS)) {
            this.hideElements('.btn-primary[onclick*="showAddVendorModal"]');
        }
        if (!this.hasPermission(PERMISSIONS.CREATE_EMPLOYEES)) {
            this.hideElements('.btn-primary[onclick*="showAddEmployeeModal"]');
        }
        if (!this.hasPermission(PERMISSIONS.CREATE_PAYMENTS)) {
            this.hideElements('.btn-primary[onclick*="showAddPaymentModal"]');
        }
        
        // Hide delete buttons
        if (!this.hasPermission(PERMISSIONS.DELETE_ORDERS)) {
            this.hideElements('.action-btn.delete[onclick*="deleteOrder"]');
        }
        if (!this.hasPermission(PERMISSIONS.DELETE_CUSTOMERS)) {
            this.hideElements('.action-btn.delete[onclick*="deleteCustomer"]');
        }
        if (!this.hasPermission(PERMISSIONS.DELETE_VENDORS)) {
            this.hideElements('.action-btn.delete[onclick*="deleteVendor"]');
        }
        if (!this.hasPermission(PERMISSIONS.DELETE_EMPLOYEES)) {
            this.hideElements('.action-btn.delete[onclick*="deleteEmployee"]');
        }
        
        // Hide edit buttons for account reps on certain sections
        if (this.hasRole(ROLES.ACCOUNT_REP)) {
            this.hideElements('.action-btn.edit[onclick*="editVendor"]');
            this.hideElements('.action-btn.edit[onclick*="editEmployee"]');
        }
    }
    
    // Helper to hide elements
    hideElements(selector) {
        document.querySelectorAll(selector).forEach(el => {
            el.style.display = 'none';
        });
    }
    
    // Update role display in UI
    updateRoleDisplay() {
        const roleElement = document.querySelector('.admin-role');
        if (roleElement && this.currentRole) {
            const roleNames = {
                [ROLES.ADMIN]: 'Administrator',
                [ROLES.MANAGER]: 'Manager',
                [ROLES.ACCOUNT_REP]: 'Account Representative'
            };
            roleElement.textContent = roleNames[this.currentRole] || 'User';
        }
    }
    
    // Check permission before action
    checkPermission(permission, errorMessage = 'You do not have permission to perform this action') {
        if (!this.hasPermission(permission)) {
            if (typeof showToast === 'function') {
                showToast(errorMessage, 'error');
            } else {
                alert(errorMessage);
            }
            return false;
        }
        return true;
    }
    
    // Wrap function with permission check
    requirePermission(permission, fn, errorMessage) {
        return (...args) => {
            if (this.checkPermission(permission, errorMessage)) {
                return fn(...args);
            }
        };
    }
}

// Create global RBAC instance
window.RBAC = new RBACManager();

// Initialize RBAC when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Wait for session to be loaded
    setTimeout(() => {
        window.RBAC.init();
    }, 100);
});

// Export for use in other modules
window.ROLES = ROLES;
window.PERMISSIONS = PERMISSIONS;
