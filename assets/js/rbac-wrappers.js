// RBAC Function Wrappers
// This file wraps existing functions with permission checks

// Wait for RBAC to be initialized
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        wrapFunctionsWithPermissions();
    }, 200);
});

function wrapFunctionsWithPermissions() {
    if (!window.RBAC) return;
    
    // Wrap order functions
    if (typeof window.showAddOrderModal === 'function') {
        const originalShowAddOrderModal = window.showAddOrderModal;
        window.showAddOrderModal = function() {
            if (window.RBAC.checkPermission(window.PERMISSIONS.CREATE_ORDERS, 'You do not have permission to create orders')) {
                return originalShowAddOrderModal.apply(this, arguments);
            }
        };
    }
    
    if (typeof window.editOrder === 'function') {
        const originalEditOrder = window.editOrder;
        window.editOrder = function() {
            if (window.RBAC.checkPermission(window.PERMISSIONS.EDIT_ORDERS, 'You do not have permission to edit orders')) {
                return originalEditOrder.apply(this, arguments);
            }
        };
    }
    
    if (typeof window.deleteOrder === 'function') {
        const originalDeleteOrder = window.deleteOrder;
        window.deleteOrder = function() {
            if (window.RBAC.checkPermission(window.PERMISSIONS.DELETE_ORDERS, 'You do not have permission to delete orders')) {
                return originalDeleteOrder.apply(this, arguments);
            }
        };
    }
    
    // Wrap customer functions
    if (typeof window.showAddCustomerModal === 'function') {
        const originalShowAddCustomerModal = window.showAddCustomerModal;
        window.showAddCustomerModal = function() {
            if (window.RBAC.checkPermission(window.PERMISSIONS.CREATE_CUSTOMERS, 'You do not have permission to create customers')) {
                return originalShowAddCustomerModal.apply(this, arguments);
            }
        };
    }
    
    if (typeof window.editCustomer === 'function') {
        const originalEditCustomer = window.editCustomer;
        window.editCustomer = function() {
            if (window.RBAC.checkPermission(window.PERMISSIONS.EDIT_CUSTOMERS, 'You do not have permission to edit customers')) {
                return originalEditCustomer.apply(this, arguments);
            }
        };
    }
    
    if (typeof window.deleteCustomer === 'function') {
        const originalDeleteCustomer = window.deleteCustomer;
        window.deleteCustomer = function() {
            if (window.RBAC.checkPermission(window.PERMISSIONS.DELETE_CUSTOMERS, 'You do not have permission to delete customers')) {
                return originalDeleteCustomer.apply(this, arguments);
            }
        };
    }
    
    // Wrap vendor functions
    if (typeof window.showAddVendorModal === 'function') {
        const originalShowAddVendorModal = window.showAddVendorModal;
        window.showAddVendorModal = function() {
            if (window.RBAC.checkPermission(window.PERMISSIONS.CREATE_VENDORS, 'You do not have permission to create vendors')) {
                return originalShowAddVendorModal.apply(this, arguments);
            }
        };
    }
    
    if (typeof window.editVendor === 'function') {
        const originalEditVendor = window.editVendor;
        window.editVendor = function() {
            if (window.RBAC.checkPermission(window.PERMISSIONS.EDIT_VENDORS, 'You do not have permission to edit vendors')) {
                return originalEditVendor.apply(this, arguments);
            }
        };
    }
    
    if (typeof window.deleteVendor === 'function') {
        const originalDeleteVendor = window.deleteVendor;
        window.deleteVendor = function() {
            if (window.RBAC.checkPermission(window.PERMISSIONS.DELETE_VENDORS, 'You do not have permission to delete vendors')) {
                return originalDeleteVendor.apply(this, arguments);
            }
        };
    }
    
    // Wrap employee functions
    if (typeof window.showAddEmployeeModal === 'function') {
        const originalShowAddEmployeeModal = window.showAddEmployeeModal;
        window.showAddEmployeeModal = function() {
            if (window.RBAC.checkPermission(window.PERMISSIONS.CREATE_EMPLOYEES, 'You do not have permission to create employees')) {
                return originalShowAddEmployeeModal.apply(this, arguments);
            }
        };
    }
    
    if (typeof window.editEmployee === 'function') {
        const originalEditEmployee = window.editEmployee;
        window.editEmployee = function() {
            if (window.RBAC.checkPermission(window.PERMISSIONS.EDIT_EMPLOYEES, 'You do not have permission to edit employees')) {
                return originalEditEmployee.apply(this, arguments);
            }
        };
    }
    
    if (typeof window.deleteEmployee === 'function') {
        const originalDeleteEmployee = window.deleteEmployee;
        window.deleteEmployee = function() {
            if (window.RBAC.checkPermission(window.PERMISSIONS.DELETE_EMPLOYEES, 'You do not have permission to delete employees')) {
                return originalDeleteEmployee.apply(this, arguments);
            }
        };
    }
    
    // Wrap payment functions
    if (typeof window.showAddPaymentModal === 'function') {
        const originalShowAddPaymentModal = window.showAddPaymentModal;
        window.showAddPaymentModal = function() {
            if (window.RBAC.checkPermission(window.PERMISSIONS.CREATE_PAYMENTS, 'You do not have permission to create payments')) {
                return originalShowAddPaymentModal.apply(this, arguments);
            }
        };
    }
    
    if (typeof window.editPayment === 'function') {
        const originalEditPayment = window.editPayment;
        window.editPayment = function() {
            if (window.RBAC.checkPermission(window.PERMISSIONS.EDIT_PAYMENTS, 'You do not have permission to edit payments')) {
                return originalEditPayment.apply(this, arguments);
            }
        };
    }
    
    if (typeof window.deletePayment === 'function') {
        const originalDeletePayment = window.deletePayment;
        window.deletePayment = function() {
            if (window.RBAC.checkPermission(window.PERMISSIONS.DELETE_PAYMENTS, 'You do not have permission to delete payments')) {
                return originalDeletePayment.apply(this, arguments);
            }
        };
    }
    
    // Wrap settings functions
    if (typeof window.saveSettings === 'function') {
        const originalSaveSettings = window.saveSettings;
        window.saveSettings = function() {
            if (window.RBAC.checkPermission(window.PERMISSIONS.MANAGE_SETTINGS, 'You do not have permission to modify settings')) {
                return originalSaveSettings.apply(this, arguments);
            }
        };
    }
    
    // Wrap report functions
    if (typeof window.generateReports === 'function') {
        const originalGenerateReports = window.generateReports;
        window.generateReports = function() {
            if (window.RBAC.checkPermission(window.PERMISSIONS.GENERATE_REPORTS, 'You do not have permission to generate reports')) {
                return originalGenerateReports.apply(this, arguments);
            }
        };
    }
}
