// Dashboard Data and Functionality
class DashboardManager {
    constructor() {
        this.initializeData();
        this.initializeEventListeners();
        this.renderDashboard();
    }

    initializeData() {
        // Data will be loaded from API
        this.data = {
            kpis: {
                totalOrders: 0,
                activeProjects: 0,
                totalVendors: 0,
                totalEmployees: 0,
                monthlyRevenue: 0
            }
        };
    }

    initializeEventListeners() {
        // Sidebar toggle
        const sidebarToggle = document.getElementById('sidebarToggle');
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.getElementById('mainContent');

        if (sidebarToggle && sidebar && mainContent) {
            sidebarToggle.addEventListener('click', () => {
                sidebar.classList.toggle('collapsed');
                sidebar.classList.toggle('show');
                mainContent.classList.toggle('expanded');
            });
        }

        // Menu navigation
        const menuItems = document.querySelectorAll('.menu-item a');
        menuItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const targetSection = item.getAttribute('data-section');
                this.showSection(targetSection);
                
                // Load section-specific data
                if (targetSection === 'orders') {
                    loadOrdersSection();
                } else if (targetSection === 'customers') {
                    loadCustomersSection();
                } else if (targetSection === 'vendors') {
                    loadVendorsSection();
                } else if (targetSection === 'employees') {
                    loadEmployeesSection();
                } else if (targetSection === 'projects') {
                    loadProjectsSection();
                } else if (targetSection === 'payments') {
                    loadPaymentsSection();
                } else if (targetSection === 'reports') {
                    loadReportsSection();
                } else if (targetSection === 'settings') {
                    loadSettingsSection();
                } else if (targetSection === 'pipeline') {
                    loadPipelineSection();
                } else if (targetSection === 'accounting') {
                    loadAccountingSection();
                }
                
                // Update active menu item
                document.querySelectorAll('.menu-item').forEach(mi => mi.classList.remove('active'));
                item.parentElement.classList.add('active');
            });
        });

        // Handle mobile responsiveness
        this.handleResize();
        window.addEventListener('resize', () => this.handleResize());
    }

    handleResize() {
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.getElementById('mainContent');
        
        if (window.innerWidth <= 768) {
            sidebar.classList.add('collapsed');
            mainContent.classList.add('expanded');
        } else {
            sidebar.classList.remove('show');
        }
    }

    showSection(sectionId) {
        // Hide all sections
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });
        
        // Show target section
        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.add('active');
        }
    }

    async renderDashboard() {
        try {
            const stats = await window.APIService.getOrderStats();
            this.renderKPIs(stats);
            
            const orders = await window.APIService.getOrders();
            this.renderWorkflowFromOrders(orders);
            this.renderOrdersTable(orders);
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
            // Show empty state
            this.renderKPIs();
            this.renderWorkflowFromOrders([]);
            this.renderOrdersTable([]);
        }
    }

    renderKPIs(stats = null) {
        const totalOrdersEl = document.getElementById('totalOrders');
        const activeProjectsEl = document.getElementById('activeProjects');
        const monthlyRevenueEl = document.getElementById('monthlyRevenue');
        const totalVendorsEl = document.getElementById('totalVendors');
        const totalEmployeesEl = document.getElementById('totalEmployees');
        
        if (stats) {
            if (totalOrdersEl) totalOrdersEl.textContent = stats.totalOrders || 0;
            if (activeProjectsEl) activeProjectsEl.textContent = stats.activeProjects || 0;
            if (monthlyRevenueEl) monthlyRevenueEl.textContent = `$${(stats.monthlyRevenue || 0).toLocaleString()}`;
            if (totalVendorsEl) totalVendorsEl.textContent = stats.totalVendors || 0;
            if (totalEmployeesEl) totalEmployeesEl.textContent = stats.totalEmployees || 0;
        } else {
            if (totalOrdersEl) totalOrdersEl.textContent = '0';
            if (activeProjectsEl) activeProjectsEl.textContent = '0';
            if (monthlyRevenueEl) monthlyRevenueEl.textContent = '$0';
            if (totalVendorsEl) totalVendorsEl.textContent = '0';
            if (totalEmployeesEl) totalEmployeesEl.textContent = '0';
        }
    }

    renderWorkflowFromOrders(orders) {
        const newRequests = orders.filter(o => o.status === 'new');
        const workOrders = orders.filter(o => o.status === 'in-progress');
        const completedWork = orders.filter(o => o.status === 'completed');
        const activeWork = orders.filter(o => ['in-progress', 'delayed'].includes(o.status));

        // Update counts with null checks
        const newRequestsEl = document.getElementById('newRequests');
        const workOrdersEl = document.getElementById('workOrders');
        const activeWorkEl = document.getElementById('activeWork');
        const completedWorkEl = document.getElementById('completedWork');
        
        if (newRequestsEl) newRequestsEl.textContent = newRequests.length;
        if (workOrdersEl) workOrdersEl.textContent = workOrders.length;
        if (activeWorkEl) activeWorkEl.textContent = activeWork.length;
        if (completedWorkEl) completedWorkEl.textContent = completedWork.length;

        // Update items with null checks
        const newRequestItemsEl = document.getElementById('newRequestItems');
        if (newRequestItemsEl) {
            newRequestItemsEl.innerHTML = 
                newRequests.slice(0, 3).map(order => 
                    `<div class="stage-item">${order.orderId} - ${order.customer?.name || order.customer}</div>`
                ).join('') || '<div class="stage-item">No new requests</div>';
        }

        const workOrderItemsEl = document.getElementById('workOrderItems');
        if (workOrderItemsEl) {
            workOrderItemsEl.innerHTML = 
                workOrders.slice(0, 3).map(order => 
                    `<div class="stage-item">${order.orderId} - ${order.customer?.name || order.customer}</div>`
                ).join('') || '<div class="stage-item">No work orders</div>';
        }

        const activeWorkItemsEl = document.getElementById('activeWorkItems');
        if (activeWorkItemsEl) {
            activeWorkItemsEl.innerHTML = 
                activeWork.slice(0, 3).map(order => 
                    `<div class="stage-item">${order.orderId} - ${order.customer?.name || order.customer}</div>`
                ).join('') || '<div class="stage-item">No active work</div>';
        }

        const completedWorkItemsEl = document.getElementById('completedWorkItems');
        if (completedWorkItemsEl) {
            completedWorkItemsEl.innerHTML = 
                completedWork.slice(0, 3).map(order => 
                    `<div class="stage-item">${order.orderId} - ${order.customer?.name || order.customer}</div>`
                ).join('') || '<div class="stage-item">No completed work</div>';
        }
    }



    renderOrdersTable(orders = null) {
        const tbody = document.getElementById('ordersTableBody');
        const ordersData = orders || this.data.orders;
        
        // Update stats
        updateOrderStats(ordersData);
        
        if (!ordersData || ordersData.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="orders-empty-state">
                        <i class="fas fa-clipboard-list"></i>
                        <h3>No Orders Found</h3>
                        <p>Start by creating your first order</p>
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = ordersData.map(order => {
            const orderNumber = order.orderId || `#${order._id.substring(0, 8).toUpperCase()}`;
            const orderDate = order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
            const customerName = order.customer?.name || order.customer;
            const customerEmail = order.customer?.email || '';
            
            return `
            <tr>
                <td>
                    <div class="order-id">
                        <div class="order-icon">
                            <i class="fas fa-file-alt"></i>
                        </div>
                        <div class="order-info">
                            <div class="order-number">${orderNumber}</div>
                            <div class="order-date">${orderDate}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="order-customer">
                        <div class="customer-name-text">${customerName}</div>
                        ${customerEmail ? `<div class="customer-email-text">${customerEmail}</div>` : ''}
                    </div>
                </td>
                <td><span class="service-badge">${order.service}</span></td>
                <td><span class="order-vendor">${order.vendor?.name || 'N/A'}</span></td>
                <td><span class="order-status-badge ${order.status}">${this.formatStatus(order.status)}</span></td>
                <td><span class="priority-badge ${order.priority || 'medium'}">${order.priority || 'medium'}</span></td>
                <td>${order.startDate ? this.formatDate(order.startDate) : 'N/A'}</td>
                <td><span class="order-amount">$${order.amount?.toLocaleString() || '0'}</span></td>
                <td>
                    <div class="order-actions">
                        <button class="action-btn view" onclick="viewOrder('${order._id || order.id}')" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="action-btn edit" onclick="editOrder('${order._id || order.id}')" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="action-btn delete" onclick="deleteOrder('${order._id || order.id}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
        }).join('');
    }



    formatStatus(status) {
        return status.split('-').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    // Action handlers
    viewOrder(orderId) {
        alert(`Viewing order: ${orderId}`);
    }

    editOrder(orderId) {
        alert(`Editing order: ${orderId}`);
    }

    // Removed - was causing random number changes
    // Real-time updates should come from actual data refreshes, not simulated changes
}

// Utility functions for additional interactivity
function addHoverEffects() {
    // Add hover effects to cards
    const cards = document.querySelectorAll('.kpi-card, .summary-card, .employee-card');
    cards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-2px)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
        });
    });
}

// Search functionality
function initializeSearch() {
    const searchInput = document.querySelector('.search-box input');
    searchInput.addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase();
        
        // Simple search simulation
        if (searchTerm.length > 2) {
            console.log(`Searching for: ${searchTerm}`);
            // In a real application, this would filter data
        }
    });
}

// Notification handling
let notificationIntervalId = null;

function initializeNotifications() {
    const notificationIcon = document.querySelector('.notification-icon');
    
    if (!notificationIcon) return;
    
    // Load unread count
    loadUnreadCount();
    
    // Set up click handler
    notificationIcon.addEventListener('click', function(e) {
        e.stopPropagation();
        showNotificationPanel();
    });
    
    // Clear any existing interval
    if (notificationIntervalId) {
        clearInterval(notificationIntervalId);
    }
    
    // Refresh notifications every 60 seconds (reduced frequency)
    notificationIntervalId = setInterval(loadUnreadCount, 60000);
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (notificationIntervalId) {
        clearInterval(notificationIntervalId);
        notificationIntervalId = null;
    }
});

async function loadUnreadCount() {
    try {
        const response = await window.APIService.getUnreadCount();
        const badge = document.querySelector('.notification-badge');
        if (response.count > 0) {
            if (badge) {
                badge.textContent = response.count;
                badge.style.display = 'block';
            }
        } else {
            if (badge) badge.style.display = 'none';
        }
    } catch (error) {
        console.error('Failed to load notification count:', error);
        
        // If unauthorized, clear interval and redirect to login
        if (error.message.includes('Access token required') || error.message.includes('Invalid token')) {
            if (notificationIntervalId) {
                clearInterval(notificationIntervalId);
                notificationIntervalId = null;
            }
            localStorage.removeItem('huttaSession');
            sessionStorage.removeItem('huttaSession');
            window.location.href = '/pages/login.html';
        }
    }
}

async function showNotificationPanel() {
    try {
        const notifications = await window.APIService.getNotifications();
        displayNotificationPanel(notifications);
    } catch (error) {
        console.error('Failed to load notifications:', error);
    }
}

function displayNotificationPanel(notifications) {
    // Remove existing panel
    const existingPanel = document.getElementById('notificationPanel');
    if (existingPanel) existingPanel.remove();
    
    // Create notification panel
    const panel = document.createElement('div');
    panel.id = 'notificationPanel';
    panel.className = 'notification-panel';
    
    const header = `
        <div class="notification-header">
            <h3>Notifications</h3>
            <button onclick="markAllAsRead()" class="mark-all-read">Mark All Read</button>
            <button onclick="closeNotificationPanel()" class="close-panel">×</button>
        </div>
    `;
    
    const notificationList = notifications.length > 0 ? 
        notifications.map(notification => `
            <div class="notification-item ${notification.isRead ? 'read' : 'unread'}" data-id="${notification._id}">
                <div class="notification-icon ${notification.type}">
                    <i class="fas fa-${getNotificationIcon(notification.type)}"></i>
                </div>
                <div class="notification-content">
                    <h4>${notification.title}</h4>
                    <p>${notification.message}</p>
                    <span class="notification-time">${formatTime(notification.createdAt)}</span>
                </div>
                ${!notification.isRead ? '<div class="unread-dot"></div>' : ''}
            </div>
        `).join('') : 
        '<div class="no-notifications">No notifications</div>';
    
    panel.innerHTML = header + '<div class="notification-list">' + notificationList + '</div>';
    
    // Add to page
    document.body.appendChild(panel);
    
    // Add click handlers for individual notifications
    panel.querySelectorAll('.notification-item.unread').forEach(item => {
        item.addEventListener('click', () => markNotificationAsRead(item.dataset.id));
    });
    
    // Close panel when clicking outside
    setTimeout(() => {
        document.addEventListener('click', closeNotificationPanel, { once: true });
    }, 100);
}

function getNotificationIcon(type) {
    const icons = {
        info: 'info-circle',
        success: 'check-circle',
        warning: 'exclamation-triangle',
        error: 'exclamation-circle',
        order: 'clipboard-list',
        payment: 'credit-card',
        system: 'cog'
    };
    return icons[type] || 'bell';
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
}

async function markNotificationAsRead(notificationId) {
    try {
        await window.APIService.markAsRead(notificationId);
        const item = document.querySelector(`[data-id="${notificationId}"]`);
        if (item) {
            item.classList.remove('unread');
            item.classList.add('read');
            const dot = item.querySelector('.unread-dot');
            if (dot) dot.remove();
        }
        loadUnreadCount();
    } catch (error) {
        console.error('Failed to mark notification as read:', error);
    }
}

async function markAllAsRead() {
    try {
        await window.APIService.markAllAsRead();
        document.querySelectorAll('.notification-item.unread').forEach(item => {
            item.classList.remove('unread');
            item.classList.add('read');
            const dot = item.querySelector('.unread-dot');
            if (dot) dot.remove();
        });
        loadUnreadCount();
    } catch (error) {
        console.error('Failed to mark all as read:', error);
    }
}

function closeNotificationPanel() {
    const panel = document.getElementById('notificationPanel');
    if (panel) panel.remove();
}

// Global refresh dashboard function
window.refreshDashboard = async function() {
    if (window.dashboard) {
        await window.dashboard.renderDashboard();
    }
};

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on the dashboard page
    if (!window.location.pathname.includes('admin-dashboard')) {
        return;
    }
    
    // Check authentication
    const session = localStorage.getItem('huttaSession') || sessionStorage.getItem('huttaSession');
    
    if (!session) {
        console.log('No session, redirecting to login...');
        window.location.href = '/pages/login.html';
        return;
    }
    
    let sessionData;
    try {
        sessionData = JSON.parse(session);
    } catch (error) {
        console.log('Invalid session, redirecting to login...');
        localStorage.removeItem('huttaSession');
        sessionStorage.removeItem('huttaSession');
        window.location.href = '/pages/login.html';
        return;
    }
    
    if (!sessionData.isAuthenticated || !sessionData.token) {
        console.log('Not authenticated, redirecting to login...');
        window.location.href = '/pages/login.html';
        return;
    }
    
    console.log('Session valid, initializing dashboard...');
    
    // Update user info in dashboard
    updateUserInfo(sessionData);
    
    // Create global dashboard instance
    window.dashboard = new DashboardManager();
    
    // Initialize additional features
    addHoverEffects();
    initializeSearch();
    initializeNotifications();
    initializeLogout();
    
    // Apply saved theme on initialization
    applySavedTheme();
    
    console.log('Hutta Home Services Admin Dashboard initialized successfully!');
});

// Update user information in dashboard
function updateUserInfo(sessionData) {
    const adminName = document.getElementById('adminName');
    const adminAvatar = document.getElementById('adminAvatar');
    
    if (adminName && sessionData.user) {
        const user = sessionData.user;
        const displayName = user.firstName && user.lastName ? 
            `${user.firstName} ${user.lastName}` : 
            (user.firstName || user.email.split('@')[0]);
        
        adminName.textContent = displayName;
        
        // Update avatar with fallback
        if (adminAvatar) {
            if (user.avatar) {
                adminAvatar.src = user.avatar;
            } else {
                const firstLetter = (user.firstName || user.email).charAt(0).toUpperCase();
                // Use data URI instead of placeholder service
                adminAvatar.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%234CAF50'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='20' fill='white'%3E${firstLetter}%3C/text%3E%3C/svg%3E`;
            }
            adminAvatar.alt = displayName;
        }
    }
}

// Initialize logout functionality
function initializeLogout() {
    const adminProfile = document.getElementById('adminProfile');
    const profileDropdown = document.getElementById('profileDropdown');
    
    if (!adminProfile || !profileDropdown) return;
    
    adminProfile.addEventListener('click', function(e) {
        e.stopPropagation();
        adminProfile.classList.toggle('active');
        profileDropdown.classList.toggle('show');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function() {
        adminProfile.classList.remove('active');
        profileDropdown.classList.remove('show');
    });
}

// Order Management Functions
let currentOrderId = null;
let vendors = [];

async function loadVendors() {
    try {
        vendors = await window.APIService.getVendors();
        const vendorSelect = document.getElementById('vendor');
        vendorSelect.innerHTML = '<option value="">Select Vendor</option>' +
            vendors.map(vendor => `<option value="${vendor._id}">${vendor.name} (${vendor.category})</option>`).join('');
    } catch (error) {
        console.error('Failed to load vendors:', error);
    }
}

function showAddOrderModal() {
    currentOrderId = null;
    document.getElementById('orderModalTitle').textContent = 'Add New Order';
    document.getElementById('orderForm').reset();
    
    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('startDate').value = today;
    
    loadVendors();
    document.getElementById('orderModal').classList.add('show');
}

async function editOrder(orderId) {
    try {
        currentOrderId = orderId;
        const order = await window.APIService.getOrder(orderId);
        
        document.getElementById('orderModalTitle').textContent = 'Edit Order';
        
        // Populate form
        document.getElementById('customerName').value = order.customer.name || '';
        document.getElementById('customerEmail').value = order.customer.email || '';
        document.getElementById('customerPhone').value = order.customer.phone || '';
        document.getElementById('customerAddress').value = order.customer.address || '';
        document.getElementById('service').value = order.service || '';
        document.getElementById('amount').value = order.amount || '';
        document.getElementById('startDate').value = order.startDate ? order.startDate.split('T')[0] : '';
        document.getElementById('endDate').value = order.endDate ? order.endDate.split('T')[0] : '';
        document.getElementById('status').value = order.status || 'new';
        document.getElementById('priority').value = order.priority || 'medium';
        document.getElementById('description').value = order.description || '';
        document.getElementById('notes').value = order.notes || '';
        
        await loadVendors();
        if (order.vendor) {
            document.getElementById('vendor').value = order.vendor._id || order.vendor;
        }
        
        document.getElementById('orderModal').classList.add('show');
    } catch (error) {
        alert('Failed to load order: ' + error.message);
    }
}

async function saveOrder() {
    const form = document.getElementById('orderForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const orderData = {
        customer: {
            name: document.getElementById('customerName').value,
            email: document.getElementById('customerEmail').value,
            phone: document.getElementById('customerPhone').value,
            address: document.getElementById('customerAddress').value
        },
        service: document.getElementById('service').value,
        amount: parseFloat(document.getElementById('amount').value),
        vendor: document.getElementById('vendor').value || null,
        startDate: document.getElementById('startDate').value,
        endDate: document.getElementById('endDate').value,
        status: document.getElementById('status').value,
        priority: document.getElementById('priority').value,
        description: document.getElementById('description').value,
        notes: document.getElementById('notes').value
    };
    
    try {
        if (currentOrderId) {
            await window.APIService.updateOrder(currentOrderId, orderData);
            alert('Order updated successfully!');
        } else {
            await window.APIService.createOrder(orderData);
            alert('Order created successfully!');
        }
        
        closeOrderModal();
        await refreshOrders();
        if (window.refreshCalendar) window.refreshCalendar();
    } catch (error) {
        alert('Failed to save order: ' + error.message);
    }
}

async function deleteOrder(orderId) {
    if (!confirm('Are you sure you want to delete this order?')) {
        return;
    }
    
    try {
        await window.APIService.deleteOrder(orderId);
        alert('Order deleted successfully!');
        await refreshOrders();
    } catch (error) {
        alert('Failed to delete order: ' + error.message);
    }
}

function viewOrder(orderId) {
    editOrder(orderId);
    // Make form read-only
    const inputs = document.querySelectorAll('#orderForm input, #orderForm select, #orderForm textarea');
    inputs.forEach(input => input.disabled = true);
    
    document.getElementById('orderModalTitle').textContent = 'View Order';
    document.querySelector('.modal-footer .btn-primary').style.display = 'none';
}

function closeOrderModal() {
    document.getElementById('orderModal').classList.remove('show');
    
    // Re-enable form inputs
    const inputs = document.querySelectorAll('#orderForm input, #orderForm select, #orderForm textarea');
    inputs.forEach(input => input.disabled = false);
    
    document.querySelector('.modal-footer .btn-primary').style.display = 'inline-block';
}

async function refreshOrders() {
    try {
        const orders = await window.APIService.getOrders();
        window.dashboard.renderOrdersTable(orders);
        
        // Refresh dashboard stats after order changes
        const stats = await window.APIService.getOrderStats();
        window.dashboard.renderKPIs(stats);
        window.dashboard.renderWorkflowFromOrders(orders);
    } catch (error) {
        console.error('Failed to refresh orders:', error);
    }
}

// Settings Management Functions
let currentSettings = null;

async function loadSettings() {
    try {
        currentSettings = await window.APIService.getSettings();
        populateSettingsForm(currentSettings);
    } catch (error) {
        console.error('Failed to load settings:', error);
        // Create default settings object
        currentSettings = {
            theme: 'light',
            language: 'en',
            timezone: 'UTC',
            notifications: {
                email: true,
                push: true,
                sms: false
            },
            dashboard: {
                itemsPerPage: 10,
                defaultView: 'table',
                autoRefresh: true,
                refreshInterval: 30
            },
            company: {
                name: '',
                address: '',
                phone: '',
                email: '',
                website: ''
            }
        };
        populateSettingsForm(currentSettings);
    }
}

function populateSettingsForm(settings) {
    // User Preferences
    document.getElementById('settingsTheme').value = settings.theme || 'light';
    document.getElementById('settingsLanguage').value = settings.language || 'en';
    document.getElementById('settingsTimezone').value = settings.timezone || 'UTC';
    
    // Notifications
    document.getElementById('notificationsEmail').checked = settings.notifications?.email ?? true;
    document.getElementById('notificationsPush').checked = settings.notifications?.push ?? true;
    document.getElementById('notificationsSms').checked = settings.notifications?.sms ?? false;
    
    // Dashboard
    document.getElementById('dashboardItemsPerPage').value = settings.dashboard?.itemsPerPage || 10;
    document.getElementById('dashboardDefaultView').value = settings.dashboard?.defaultView || 'table';
    document.getElementById('dashboardAutoRefresh').checked = settings.dashboard?.autoRefresh ?? true;
    document.getElementById('dashboardRefreshInterval').value = settings.dashboard?.refreshInterval || 30;
    
    // Company
    document.getElementById('companyName').value = settings.company?.name || '';
    document.getElementById('companyAddress').value = settings.company?.address || '';
    document.getElementById('companyPhone').value = settings.company?.phone || '';
    document.getElementById('companyEmail').value = settings.company?.email || '';
    document.getElementById('companyWebsite').value = settings.company?.website || '';
    
    // Apply theme
    applyTheme(settings.theme || 'light');
}

async function saveSettings() {
    const settingsData = {
        theme: document.getElementById('settingsTheme').value,
        language: document.getElementById('settingsLanguage').value,
        timezone: document.getElementById('settingsTimezone').value,
        notifications: {
            email: document.getElementById('notificationsEmail').checked,
            push: document.getElementById('notificationsPush').checked,
            sms: document.getElementById('notificationsSms').checked
        },
        dashboard: {
            itemsPerPage: parseInt(document.getElementById('dashboardItemsPerPage').value),
            defaultView: document.getElementById('dashboardDefaultView').value,
            autoRefresh: document.getElementById('dashboardAutoRefresh').checked,
            refreshInterval: parseInt(document.getElementById('dashboardRefreshInterval').value)
        },
        company: {
            name: document.getElementById('companyName').value,
            address: document.getElementById('companyAddress').value,
            phone: document.getElementById('companyPhone').value,
            email: document.getElementById('companyEmail').value,
            website: document.getElementById('companyWebsite').value
        }
    };
    
    try {
        await window.APIService.updateSettings(settingsData);
        currentSettings = { ...currentSettings, ...settingsData };
        
        // Apply theme immediately
        applyTheme(settingsData.theme);
        
        alert('Settings saved successfully!');
    } catch (error) {
        alert('Failed to save settings: ' + error.message);
    }
}

async function resetSettings() {
    if (!confirm('Are you sure you want to reset all settings to default?')) {
        return;
    }
    
    try {
        const defaultSettings = await window.APIService.resetSettings();
        currentSettings = defaultSettings;
        populateSettingsForm(defaultSettings);
        alert('Settings reset to default successfully!');
    } catch (error) {
        alert('Failed to reset settings: ' + error.message);
    }
}

function applyTheme(theme) {
    document.body.className = theme === 'dark' ? 'dark-theme' : '';
    
    // Store theme preference in localStorage for immediate application
    localStorage.setItem('theme', theme);
}

// Load settings when settings section is shown
function loadSettingsSection() {
    loadSettings();
}

// Apply saved theme on page load
function applySavedTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        applyTheme(savedTheme);
    }
}

// Global functions
window.saveSettings = saveSettings;
window.resetSettings = resetSettings;

// Reports Management Functions
async function generateReports() {
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    
    try {
        // Load all reports
        const [financial, orders, customers, projects] = await Promise.all([
            window.APIService.getFinancialReport(startDate, endDate),
            window.APIService.getOrdersReport(startDate, endDate),
            window.APIService.getCustomersReport(),
            window.APIService.getProjectsReport()
        ]);
        
        // Render financial report
        renderFinancialReport(financial);
        
        // Render orders report
        renderOrdersReport(orders);
        
        // Render customers report
        renderCustomersReport(customers);
        
        // Render projects report
        renderProjectsReport(projects);
        
    } catch (error) {
        console.error('Failed to generate reports:', error);
        alert('Failed to generate reports: ' + error.message);
    }
}

function renderFinancialReport(data) {
    document.getElementById('reportTotalRevenue').textContent = `$${data.totalRevenue.toLocaleString()}`;
    document.getElementById('reportTotalPayments').textContent = `$${data.totalPayments.toLocaleString()}`;
    document.getElementById('reportPendingPayments').textContent = `$${data.pendingPayments.toLocaleString()}`;
    document.getElementById('reportCompletedOrders').textContent = data.completedOrders.toLocaleString();
}

function renderOrdersReport(data) {
    // Render orders status chart
    const statusChart = document.getElementById('ordersStatusChart');
    statusChart.innerHTML = data.statusBreakdown.map(item => `
        <div class="chart-item">
            <div class="chart-bar" style="width: ${(item.count / Math.max(...data.statusBreakdown.map(s => s.count))) * 100}%"></div>
            <span class="chart-label">${item._id}: ${item.count}</span>
        </div>
    `).join('');
    
    // Render monthly orders chart
    const monthlyChart = document.getElementById('monthlyOrdersChart');
    monthlyChart.innerHTML = data.monthlyOrders.map(item => `
        <div class="chart-item">
            <div class="chart-bar" style="width: ${(item.count / Math.max(...data.monthlyOrders.map(m => m.count))) * 100}%"></div>
            <span class="chart-label">${item._id}: ${item.count} orders ($${item.revenue.toLocaleString()})</span>
        </div>
    `).join('');
}

function renderCustomersReport(data) {
    // Render customer types chart
    const typesChart = document.getElementById('customerTypesChart');
    typesChart.innerHTML = data.customerTypes.map(item => `
        <div class="chart-item">
            <div class="chart-bar" style="width: ${(item.count / Math.max(...data.customerTypes.map(t => t.count))) * 100}%"></div>
            <span class="chart-label">${item._id}: ${item.count}</span>
        </div>
    `).join('');
    
    // Render top customers list
    const topList = document.getElementById('topCustomersList');
    topList.innerHTML = data.topCustomers.map((customer, index) => `
        <div class="top-item">
            <span class="rank">#${index + 1}</span>
            <div class="customer-info">
                <strong>${customer.name}</strong>
                <small>${customer.email}</small>
            </div>
            <div class="customer-stats">
                <span>$${customer.totalSpent.toLocaleString()}</span>
                <small>${customer.totalOrders} orders</small>
            </div>
        </div>
    `).join('');
}

function renderProjectsReport(data) {
    // Render project status chart
    const statusChart = document.getElementById('projectStatusChart');
    statusChart.innerHTML = data.statusBreakdown.map(item => `
        <div class="chart-item">
            <div class="chart-bar" style="width: ${(item.count / Math.max(...data.statusBreakdown.map(s => s.count))) * 100}%"></div>
            <span class="chart-label">${item._id}: ${item.count}</span>
        </div>
    `).join('');
    
    // Render budget analysis
    document.getElementById('totalBudget').textContent = `$${data.budgetAnalysis.totalBudget.toLocaleString()}`;
    document.getElementById('totalActualCost').textContent = `$${data.budgetAnalysis.totalActualCost.toLocaleString()}`;
    document.getElementById('avgProgress').textContent = `${Math.round(data.budgetAnalysis.avgProgress)}%`;
}

// Load reports when reports section is shown
function loadReportsSection() {
    // Set default date range (last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    document.getElementById('reportStartDate').value = startDate.toISOString().split('T')[0];
    document.getElementById('reportEndDate').value = endDate.toISOString().split('T')[0];
    
    generateReports();
}

// Global functions
window.generateReports = generateReports;

// Payment Management Functions
let currentPaymentId = null;
let paymentCustomers = [];
let paymentOrders = [];
let paymentProjects = [];

async function loadPaymentData() {
    try {
        [paymentCustomers, paymentOrders, paymentProjects] = await Promise.all([
            window.APIService.getCustomers(),
            window.APIService.getOrders(),
            window.APIService.getProjects()
        ]);
        
        // Populate customer dropdown
        const customerSelect = document.getElementById('paymentCustomer');
        customerSelect.innerHTML = '<option value="">Select Customer</option>' +
            paymentCustomers.map(customer => `<option value="${customer._id}">${customer.name}</option>`).join('');
        
        // Populate order dropdown
        const orderSelect = document.getElementById('paymentOrder');
        orderSelect.innerHTML = '<option value="">Select Order (Optional)</option>' +
            paymentOrders.map(order => `<option value="${order._id}">${order.orderId} - ${order.service}</option>`).join('');
        
        // Populate project dropdown
        const projectSelect = document.getElementById('paymentProject');
        projectSelect.innerHTML = '<option value="">Select Project (Optional)</option>' +
            paymentProjects.map(project => `<option value="${project._id}">${project.projectId} - ${project.name}</option>`).join('');
    } catch (error) {
        console.error('Failed to load payment data:', error);
    }
}

function showAddPaymentModal() {
    currentPaymentId = null;
    document.getElementById('paymentModalTitle').textContent = 'Record New Payment';
    document.getElementById('paymentForm').reset();
    
    // Set default payment date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('paymentDate').value = today;
    
    loadPaymentData();
    document.getElementById('paymentModal').classList.add('show');
}

async function editPayment(paymentId) {
    try {
        currentPaymentId = paymentId;
        const payment = await window.APIService.getPayment(paymentId);
        
        document.getElementById('paymentModalTitle').textContent = 'Edit Payment';
        
        // Load data first
        await loadPaymentData();
        
        // Populate form
        document.getElementById('paymentCustomer').value = payment.customer?._id || '';
        document.getElementById('paymentAmount').value = payment.amount || '';
        document.getElementById('paymentMethod').value = payment.paymentMethod || '';
        document.getElementById('paymentStatus').value = payment.status || 'pending';
        document.getElementById('paymentOrder').value = payment.order?._id || '';
        document.getElementById('paymentProject').value = payment.project?._id || '';
        document.getElementById('paymentDate').value = payment.paymentDate ? payment.paymentDate.split('T')[0] : '';
        document.getElementById('paymentDueDate').value = payment.dueDate ? payment.dueDate.split('T')[0] : '';
        document.getElementById('paymentTransactionId').value = payment.transactionId || '';
        document.getElementById('paymentReceiptNumber').value = payment.receiptNumber || '';
        document.getElementById('paymentDescription').value = payment.description || '';
        document.getElementById('paymentNotes').value = payment.notes || '';
        
        document.getElementById('paymentModal').classList.add('show');
    } catch (error) {
        alert('Failed to load payment: ' + error.message);
    }
}

async function savePayment() {
    const form = document.getElementById('paymentForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const paymentData = {
        customer: document.getElementById('paymentCustomer').value,
        amount: parseFloat(document.getElementById('paymentAmount').value),
        paymentMethod: document.getElementById('paymentMethod').value,
        status: document.getElementById('paymentStatus').value,
        order: document.getElementById('paymentOrder').value || null,
        project: document.getElementById('paymentProject').value || null,
        paymentDate: document.getElementById('paymentDate').value,
        dueDate: document.getElementById('paymentDueDate').value || null,
        transactionId: document.getElementById('paymentTransactionId').value,
        receiptNumber: document.getElementById('paymentReceiptNumber').value,
        description: document.getElementById('paymentDescription').value,
        notes: document.getElementById('paymentNotes').value
    };
    
    try {
        if (currentPaymentId) {
            await window.APIService.updatePayment(currentPaymentId, paymentData);
            alert('Payment updated successfully!');
        } else {
            await window.APIService.createPayment(paymentData);
            alert('Payment recorded successfully!');
        }
        
        closePaymentModal();
        await refreshPayments();
    } catch (error) {
        alert('Failed to save payment: ' + error.message);
    }
}

async function deletePayment(paymentId) {
    if (!confirm('Are you sure you want to delete this payment?')) {
        return;
    }
    
    try {
        await window.APIService.deletePayment(paymentId);
        alert('Payment deleted successfully!');
        await refreshPayments();
    } catch (error) {
        alert('Failed to delete payment: ' + error.message);
    }
}

function viewPayment(paymentId) {
    editPayment(paymentId);
    // Make form read-only
    const inputs = document.querySelectorAll('#paymentForm input, #paymentForm select, #paymentForm textarea');
    inputs.forEach(input => input.disabled = true);
    
    document.getElementById('paymentModalTitle').textContent = 'View Payment';
    document.querySelector('#paymentModal .modal-footer .btn-primary').style.display = 'none';
}

function closePaymentModal() {
    document.getElementById('paymentModal').classList.remove('show');
    
    // Re-enable form inputs
    const inputs = document.querySelectorAll('#paymentForm input, #paymentForm select, #paymentForm textarea');
    inputs.forEach(input => input.disabled = false);
    
    document.querySelector('#paymentModal .modal-footer .btn-primary').style.display = 'inline-block';
}

async function refreshPayments() {
    try {
        const payments = await window.APIService.getPayments();
        renderPaymentsTable(payments);
    } catch (error) {
        console.error('Failed to refresh payments:', error);
    }
}

function renderPaymentsTable(payments) {
    const tbody = document.getElementById('paymentsTableBody');
    
    tbody.innerHTML = payments.map(payment => `
        <tr>
            <td>${payment.paymentId}</td>
            <td>${payment.customer?.name || 'N/A'}</td>
            <td>$${payment.amount.toLocaleString()}</td>
            <td><span class="method-badge ${payment.paymentMethod}">${payment.paymentMethod.replace('-', ' ')}</span></td>
            <td><span class="status-badge ${payment.status}">${payment.status}</span></td>
            <td>${payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : 'N/A'}</td>
            <td>
                ${payment.order ? `Order: ${payment.order.orderId}` : ''}
                ${payment.project ? `Project: ${payment.project.projectId}` : ''}
                ${!payment.order && !payment.project ? 'N/A' : ''}
            </td>
            <td>
                <button class="btn-action" onclick="viewPayment('${payment._id}')" title="View">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn-action" onclick="editPayment('${payment._id}')" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-action delete" onclick="deletePayment('${payment._id}')" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// Load payments when payments section is shown
function loadPaymentsSection() {
    refreshPayments();
}

// Global functions for button clicks
window.viewPayment = viewPayment;
window.editPayment = editPayment;
window.deletePayment = deletePayment;
window.showAddPaymentModal = showAddPaymentModal;
window.closePaymentModal = closePaymentModal;
window.savePayment = savePayment;

// Project Management Functions
let currentProjectId = null;
let projectCustomers = [];
let projectVendors = [];
let projectEmployees = [];

async function loadProjectData() {
    try {
        [projectCustomers, projectVendors, projectEmployees] = await Promise.all([
            window.APIService.getCustomers(),
            window.APIService.getVendors(),
            window.APIService.getEmployees()
        ]);
        
        // Populate customer dropdown
        const customerSelect = document.getElementById('projectCustomer');
        customerSelect.innerHTML = '<option value="">Select Customer</option>' +
            projectCustomers.map(customer => `<option value="${customer._id}">${customer.name}</option>`).join('');
        
        // Populate vendor dropdown
        const vendorSelect = document.getElementById('projectVendor');
        vendorSelect.innerHTML = '<option value="">Select Vendor</option>' +
            projectVendors.map(vendor => `<option value="${vendor._id}">${vendor.name} (${vendor.category})</option>`).join('');
        
        // Populate employees dropdown
        const employeeSelect = document.getElementById('projectEmployees');
        employeeSelect.innerHTML = projectEmployees.map(employee => 
            `<option value="${employee._id}">${employee.name} - ${employee.role}</option>`
        ).join('');
    } catch (error) {
        console.error('Failed to load project data:', error);
    }
}

function showAddProjectModal() {
    currentProjectId = null;
    document.getElementById('projectModalTitle').textContent = 'Add New Project';
    document.getElementById('projectForm').reset();
    
    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('projectStartDate').value = today;
    
    loadProjectData();
    document.getElementById('projectModal').classList.add('show');
}

async function editProject(projectId) {
    try {
        currentProjectId = projectId;
        const project = await window.APIService.getProject(projectId);
        
        document.getElementById('projectModalTitle').textContent = 'Edit Project';
        
        // Load data first
        await loadProjectData();
        
        // Populate form
        document.getElementById('projectName').value = project.name || '';
        document.getElementById('projectDescription').value = project.description || '';
        document.getElementById('projectCustomer').value = project.customer?._id || '';
        document.getElementById('projectVendor').value = project.vendor?._id || '';
        document.getElementById('projectBudget').value = project.budget || '';
        document.getElementById('projectStartDate').value = project.startDate ? project.startDate.split('T')[0] : '';
        document.getElementById('projectEndDate').value = project.endDate ? project.endDate.split('T')[0] : '';
        document.getElementById('projectStatus').value = project.status || 'planning';
        document.getElementById('projectPriority').value = project.priority || 'medium';
        document.getElementById('projectProgress').value = project.progress || 0;
        document.getElementById('projectLocation').value = project.location || '';
        document.getElementById('projectNotes').value = project.notes || '';
        
        // Select assigned employees
        const employeeSelect = document.getElementById('projectEmployees');
        const assignedIds = project.assignedEmployees?.map(emp => emp._id) || [];
        Array.from(employeeSelect.options).forEach(option => {
            option.selected = assignedIds.includes(option.value);
        });
        
        document.getElementById('projectModal').classList.add('show');
    } catch (error) {
        alert('Failed to load project: ' + error.message);
    }
}

async function saveProject() {
    const form = document.getElementById('projectForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const employeeSelect = document.getElementById('projectEmployees');
    const selectedEmployees = Array.from(employeeSelect.selectedOptions).map(option => option.value);
    
    const projectData = {
        name: document.getElementById('projectName').value,
        description: document.getElementById('projectDescription').value,
        customer: document.getElementById('projectCustomer').value,
        vendor: document.getElementById('projectVendor').value || null,
        budget: parseFloat(document.getElementById('projectBudget').value),
        startDate: document.getElementById('projectStartDate').value,
        endDate: document.getElementById('projectEndDate').value,
        status: document.getElementById('projectStatus').value,
        priority: document.getElementById('projectPriority').value,
        progress: parseInt(document.getElementById('projectProgress').value) || 0,
        location: document.getElementById('projectLocation').value,
        assignedEmployees: selectedEmployees,
        notes: document.getElementById('projectNotes').value
    };
    
    try {
        if (currentProjectId) {
            await window.APIService.updateProject(currentProjectId, projectData);
            alert('Project updated successfully!');
        } else {
            await window.APIService.createProject(projectData);
            alert('Project created successfully!');
        }
        
        closeProjectModal();
        await refreshProjects();
        if (window.refreshCalendar) window.refreshCalendar();
    } catch (error) {
        alert('Failed to save project: ' + error.message);
    }
}

async function deleteProject(projectId) {
    if (!confirm('Are you sure you want to delete this project?')) {
        return;
    }
    
    try {
        await window.APIService.deleteProject(projectId);
        alert('Project deleted successfully!');
        await refreshProjects();
    } catch (error) {
        alert('Failed to delete project: ' + error.message);
    }
}

function viewProject(projectId) {
    editProject(projectId);
    // Make form read-only
    const inputs = document.querySelectorAll('#projectForm input, #projectForm select, #projectForm textarea');
    inputs.forEach(input => input.disabled = true);
    
    document.getElementById('projectModalTitle').textContent = 'View Project';
    document.querySelector('#projectModal .modal-footer .btn-primary').style.display = 'none';
}

function closeProjectModal() {
    document.getElementById('projectModal').classList.remove('show');
    
    // Re-enable form inputs
    const inputs = document.querySelectorAll('#projectForm input, #projectForm select, #projectForm textarea');
    inputs.forEach(input => input.disabled = false);
    
    document.querySelector('#projectModal .modal-footer .btn-primary').style.display = 'inline-block';
}

function renderProjectsTable(projects) {
    const tbody = document.getElementById('projectsTableBody');
    
    updateProjectStats(projects);
    
    if (!projects || projects.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="projects-empty-state">
                    <i class="fas fa-project-diagram"></i>
                    <h3>No Projects Found</h3>
                    <p>Start by creating your first project</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = projects.map(project => {
        const initials = project.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        const projectId = project.projectId || `#${project._id.substring(0, 8).toUpperCase()}`;
        
        return `
        <tr>
            <td>
                <span class="project-icon">${initials}</span>
                <div class="project-info">
                    <div class="project-name">${project.name}</div>
                    <div class="project-id">${projectId}</div>
                </div>
            </td>
            <td>${project.customer?.name || 'N/A'}</td>
            <td><span class="project-status-badge ${project.status}">${project.status.replace('-', ' ')}</span></td>
            <td><span class="project-priority-badge ${project.priority}">${project.priority}</span></td>
            <td>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${project.progress}%"></div>
                    <span class="progress-text">${project.progress}%</span>
                </div>
            </td>
            <td><span class="project-budget">$${project.budget.toLocaleString()}</span></td>
            <td>${project.endDate ? new Date(project.endDate).toLocaleDateString() : 'N/A'}</td>
            <td>
                <div class="project-actions">
                    <button class="action-btn view" onclick="viewProject('${project._id}')" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn edit" onclick="editProject('${project._id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete" onclick="deleteProject('${project._id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
    }).join('');
}

function updateProjectStats(projects) {
    const totalCount = document.getElementById('totalProjectsCount');
    const activeCount = document.getElementById('activeProjectsCount');
    
    if (totalCount) totalCount.textContent = projects.length;
    if (activeCount) {
        const activeProjects = projects.filter(p => ['planning', 'in-progress'].includes(p.status)).length;
        activeCount.textContent = activeProjects;
    }
}

let allProjects = [];

async function loadProjectsSection() {
    try {
        allProjects = await window.APIService.getProjects();
        renderProjectsTable(allProjects);
        initializeProjectFilters();
    } catch (error) {
        console.error('Failed to load projects:', error);
        renderProjectsTable([]);
    }
}

function initializeProjectFilters() {
    const searchInput = document.getElementById('projectSearchInput');
    const statusFilter = document.getElementById('projectStatusFilter');
    const priorityFilter = document.getElementById('projectPriorityFilter');
    
    if (searchInput) {
        searchInput.addEventListener('input', filterProjects);
    }
    
    if (statusFilter) {
        statusFilter.addEventListener('change', filterProjects);
    }
    
    if (priorityFilter) {
        priorityFilter.addEventListener('change', filterProjects);
    }
}

function filterProjects() {
    const searchTerm = document.getElementById('projectSearchInput')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('projectStatusFilter')?.value || 'all';
    const priorityFilter = document.getElementById('projectPriorityFilter')?.value || 'all';
    
    let filtered = allProjects;
    
    if (searchTerm) {
        filtered = filtered.filter(project => 
            project.name.toLowerCase().includes(searchTerm) ||
            (project.projectId || '').toLowerCase().includes(searchTerm) ||
            (project.customer?.name || '').toLowerCase().includes(searchTerm)
        );
    }
    
    if (statusFilter !== 'all') {
        filtered = filtered.filter(project => project.status === statusFilter);
    }
    
    if (priorityFilter !== 'all') {
        filtered = filtered.filter(project => project.priority === priorityFilter);
    }
    
    renderProjectsTable(filtered);
}

async function refreshProjects() {
    try {
        allProjects = await window.APIService.getProjects();
        renderProjectsTable(allProjects);
    } catch (error) {
        console.error('Failed to refresh projects:', error);
    }
}

// Global functions for button clicks
window.viewProject = viewProject;
window.editProject = editProject;
window.deleteProject = deleteProject;
window.showAddProjectModal = showAddProjectModal;
window.closeProjectModal = closeProjectModal;
window.saveProject = saveProject;

// Employee Management Functions
let currentEmployeeId = null;

function showAddEmployeeModal() {
    currentEmployeeId = null;
    document.getElementById('employeeModalTitle').textContent = 'Add New Employee';
    document.getElementById('employeeForm').reset();
    
    // Set default hire date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('employeeHireDate').value = today;
    
    document.getElementById('employeeModal').classList.add('show');
}

async function editEmployee(employeeId) {
    try {
        currentEmployeeId = employeeId;
        const employee = await window.APIService.getEmployee(employeeId);
        
        document.getElementById('employeeModalTitle').textContent = 'Edit Employee';
        
        // Populate form
        document.getElementById('employeeName').value = employee.name || '';
        document.getElementById('employeeEmail').value = employee.email || '';
        document.getElementById('employeePhone').value = employee.phone || '';
        document.getElementById('employeeAddress').value = employee.address || '';
        document.getElementById('employeeRole').value = employee.role || '';
        document.getElementById('employeeDepartment').value = employee.department || '';
        document.getElementById('employeeSalary').value = employee.salary || '';
        document.getElementById('employeeHireDate').value = employee.hireDate ? employee.hireDate.split('T')[0] : '';
        document.getElementById('employeeStatus').value = employee.status || 'available';
        document.getElementById('employeeSkills').value = employee.skills ? employee.skills.join(', ') : '';
        
        document.getElementById('employeeModal').classList.add('show');
    } catch (error) {
        alert('Failed to load employee: ' + error.message);
    }
}

async function saveEmployee() {
    const form = document.getElementById('employeeForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const skillsText = document.getElementById('employeeSkills').value;
    const skills = skillsText ? skillsText.split(',').map(skill => skill.trim()).filter(skill => skill) : [];
    
    const employeeData = {
        name: document.getElementById('employeeName').value,
        email: document.getElementById('employeeEmail').value,
        phone: document.getElementById('employeePhone').value,
        address: document.getElementById('employeeAddress').value,
        role: document.getElementById('employeeRole').value,
        department: document.getElementById('employeeDepartment').value,
        salary: parseFloat(document.getElementById('employeeSalary').value) || 0,
        hireDate: document.getElementById('employeeHireDate').value,
        status: document.getElementById('employeeStatus').value,
        skills: skills
    };
    
    try {
        if (currentEmployeeId) {
            await window.APIService.updateEmployee(currentEmployeeId, employeeData);
            alert('Employee updated successfully!');
        } else {
            await window.APIService.createEmployee(employeeData);
            alert('Employee created successfully!');
        }
        
        closeEmployeeModal();
        await refreshEmployees();
    } catch (error) {
        alert('Failed to save employee: ' + error.message);
    }
}

async function deleteEmployee(employeeId) {
    if (!confirm('Are you sure you want to delete this employee?')) {
        return;
    }
    
    try {
        await window.APIService.deleteEmployee(employeeId);
        alert('Employee deleted successfully!');
        await refreshEmployees();
    } catch (error) {
        alert('Failed to delete employee: ' + error.message);
    }
}

function viewEmployee(employeeId) {
    editEmployee(employeeId);
    // Make form read-only
    const inputs = document.querySelectorAll('#employeeForm input, #employeeForm select, #employeeForm textarea');
    inputs.forEach(input => input.disabled = true);
    
    document.getElementById('employeeModalTitle').textContent = 'View Employee';
    document.querySelector('#employeeModal .modal-footer .btn-primary').style.display = 'none';
}

function closeEmployeeModal() {
    document.getElementById('employeeModal').classList.remove('show');
    
    // Re-enable form inputs
    const inputs = document.querySelectorAll('#employeeForm input, #employeeForm select, #employeeForm textarea');
    inputs.forEach(input => input.disabled = false);
    
    document.querySelector('#employeeModal .modal-footer .btn-primary').style.display = 'inline-block';
}

async function refreshEmployees() {
    try {
        const employees = await window.APIService.getEmployees();
        renderEmployeesTable(employees);
    } catch (error) {
        console.error('Failed to refresh employees:', error);
    }
}

function renderEmployeesTable(employees) {
    const tbody = document.getElementById('employeesTableBody');
    
    // Update stats
    updateEmployeeStats(employees);
    
    if (!employees || employees.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="employees-empty-state">
                    <i class="fas fa-user-tie"></i>
                    <h3>No Employees Found</h3>
                    <p>Start by adding your first employee</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = employees.map(employee => {
        const initials = employee.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        const employeeId = `#${employee._id.substring(0, 8).toUpperCase()}`;
        
        return `
        <tr>
            <td>
                <span class="employee-avatar">${initials}</span>
                <div class="employee-info">
                    <div class="employee-name">${employee.name}</div>
                    <div class="employee-id">${employeeId}</div>
                </div>
            </td>
            <td><a href="mailto:${employee.email}" class="customer-email">${employee.email}</a></td>
            <td><span class="customer-phone">${employee.phone || 'N/A'}</span></td>
            <td><span class="employee-role-badge">${employee.role.replace('-', ' ')}</span></td>
            <td>${employee.department || 'N/A'}</td>
            <td><span class="employee-status-badge ${employee.status}">${employee.status.replace('-', ' ')}</span></td>
            <td>${employee.hireDate ? new Date(employee.hireDate).toLocaleDateString() : 'N/A'}</td>
            <td>
                <div class="employee-actions">
                    <button class="action-btn view" onclick="viewEmployee('${employee._id}')" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn edit" onclick="editEmployee('${employee._id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete" onclick="deleteEmployee('${employee._id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
    }).join('');
}

function updateEmployeeStats(employees) {
    const totalCount = document.getElementById('totalEmployeesCount');
    const availableCount = document.getElementById('availableEmployeesCount');
    
    if (totalCount) totalCount.textContent = employees.length;
    if (availableCount) {
        const availableEmployees = employees.filter(e => e.status === 'available').length;
        availableCount.textContent = availableEmployees;
    }
}

let allEmployees = [];

async function loadEmployeesSection() {
    try {
        allEmployees = await window.APIService.getEmployees();
        renderEmployeesTable(allEmployees);
        initializeEmployeeFilters();
    } catch (error) {
        console.error('Failed to load employees:', error);
        renderEmployeesTable([]);
    }
}

function initializeEmployeeFilters() {
    const searchInput = document.getElementById('employeeSearchInput');
    const roleFilter = document.getElementById('employeeRoleFilter');
    const statusFilter = document.getElementById('employeeStatusFilter');
    
    if (searchInput) {
        searchInput.addEventListener('input', filterEmployees);
    }
    
    if (roleFilter) {
        roleFilter.addEventListener('change', filterEmployees);
    }
    
    if (statusFilter) {
        statusFilter.addEventListener('change', filterEmployees);
    }
}

function filterEmployees() {
    const searchTerm = document.getElementById('employeeSearchInput')?.value.toLowerCase() || '';
    const roleFilter = document.getElementById('employeeRoleFilter')?.value || 'all';
    const statusFilter = document.getElementById('employeeStatusFilter')?.value || 'all';
    
    let filtered = allEmployees;
    
    if (searchTerm) {
        filtered = filtered.filter(employee => 
            employee.name.toLowerCase().includes(searchTerm) ||
            employee.email.toLowerCase().includes(searchTerm) ||
            employee.role.toLowerCase().includes(searchTerm)
        );
    }
    
    if (roleFilter !== 'all') {
        filtered = filtered.filter(employee => employee.role === roleFilter);
    }
    
    if (statusFilter !== 'all') {
        filtered = filtered.filter(employee => employee.status === statusFilter);
    }
    
    renderEmployeesTable(filtered);
}

// Global functions for button clicks
window.viewEmployee = viewEmployee;
window.editEmployee = editEmployee;
window.deleteEmployee = deleteEmployee;
window.showAddEmployeeModal = showAddEmployeeModal;
window.closeEmployeeModal = closeEmployeeModal;
window.saveEmployee = saveEmployee;

// Vendor Management Functions
let currentVendorId = null;

function showAddVendorModal() {
    currentVendorId = null;
    document.getElementById('vendorModalTitle').textContent = 'Add New Vendor';
    document.getElementById('vendorForm').reset();
    document.getElementById('vendorModal').classList.add('show');
}

async function editVendor(vendorId) {
    try {
        currentVendorId = vendorId;
        const vendor = await window.APIService.getVendor(vendorId);
        
        document.getElementById('vendorModalTitle').textContent = 'Edit Vendor';
        
        // Populate form
        document.getElementById('vendorName').value = vendor.name || '';
        document.getElementById('vendorEmail').value = vendor.email || '';
        document.getElementById('vendorPhone').value = vendor.phone || '';
        document.getElementById('vendorAddress').value = vendor.address || '';
        document.getElementById('vendorCategory').value = vendor.category || '';
        document.getElementById('vendorRating').value = vendor.rating || 5;
        document.getElementById('vendorStatus').value = vendor.isActive.toString();
        
        document.getElementById('vendorModal').classList.add('show');
    } catch (error) {
        alert('Failed to load vendor: ' + error.message);
    }
}

async function saveVendor() {
    const form = document.getElementById('vendorForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const vendorData = {
        name: document.getElementById('vendorName').value,
        email: document.getElementById('vendorEmail').value,
        phone: document.getElementById('vendorPhone').value,
        address: document.getElementById('vendorAddress').value,
        category: document.getElementById('vendorCategory').value,
        rating: parseInt(document.getElementById('vendorRating').value),
        isActive: document.getElementById('vendorStatus').value === 'true'
    };
    
    try {
        if (currentVendorId) {
            await window.APIService.updateVendor(currentVendorId, vendorData);
            alert('Vendor updated successfully!');
        } else {
            await window.APIService.createVendor(vendorData);
            alert('Vendor created successfully!');
        }
        
        closeVendorModal();
        await refreshVendors();
    } catch (error) {
        alert('Failed to save vendor: ' + error.message);
    }
}

async function deleteVendor(vendorId) {
    if (!confirm('Are you sure you want to delete this vendor?')) {
        return;
    }
    
    try {
        await window.APIService.deleteVendor(vendorId);
        alert('Vendor deleted successfully!');
        await refreshVendors();
    } catch (error) {
        alert('Failed to delete vendor: ' + error.message);
    }
}

function viewVendor(vendorId) {
    editVendor(vendorId);
    // Make form read-only
    const inputs = document.querySelectorAll('#vendorForm input, #vendorForm select, #vendorForm textarea');
    inputs.forEach(input => input.disabled = true);
    
    document.getElementById('vendorModalTitle').textContent = 'View Vendor';
    document.querySelector('#vendorModal .modal-footer .btn-primary').style.display = 'none';
}

function closeVendorModal() {
    document.getElementById('vendorModal').classList.remove('show');
    
    // Re-enable form inputs
    const inputs = document.querySelectorAll('#vendorForm input, #vendorForm select, #vendorForm textarea');
    inputs.forEach(input => input.disabled = false);
    
    document.querySelector('#vendorModal .modal-footer .btn-primary').style.display = 'inline-block';
}

async function refreshVendors() {
    try {
        const vendors = await window.APIService.getVendors();
        renderVendorsTable(vendors);
    } catch (error) {
        console.error('Failed to refresh vendors:', error);
    }
}

function renderVendorsTable(vendors) {
    const tbody = document.getElementById('vendorsTableBody');
    
    // Update stats
    updateVendorStats(vendors);
    
    if (!vendors || vendors.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="vendors-empty-state">
                    <i class="fas fa-handshake"></i>
                    <h3>No Vendors Found</h3>
                    <p>Start by adding your first vendor</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = vendors.map(vendor => {
        const initials = vendor.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        const vendorId = `#${vendor._id.substring(0, 8).toUpperCase()}`;
        const stars = '★'.repeat(vendor.rating) + '☆'.repeat(5 - vendor.rating);
        
        return `
        <tr>
            <td>
                <span class="vendor-avatar">${initials}</span>
                <div class="vendor-info">
                    <div class="vendor-name">${vendor.name}</div>
                    <div class="vendor-id">${vendorId}</div>
                </div>
            </td>
            <td><a href="mailto:${vendor.email}" class="customer-email">${vendor.email}</a></td>
            <td><span class="customer-phone">${vendor.phone || 'N/A'}</span></td>
            <td><span class="vendor-category-badge ${vendor.category}">${vendor.category}</span></td>
            <td><div class="vendor-rating">${stars.split('').map(s => `<span class="${s === '★' ? 'star-filled' : 'star-empty'}">${s}</span>`).join('')}</div></td>
            <td><span class="vendor-status-badge ${vendor.isActive ? 'active' : 'inactive'}">${vendor.isActive ? 'Active' : 'Inactive'}</span></td>
            <td>
                <div class="vendor-actions">
                    <button class="action-btn view" onclick="viewVendor('${vendor._id}')" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn edit" onclick="editVendor('${vendor._id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete" onclick="deleteVendor('${vendor._id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
    }).join('');
}

function updateVendorStats(vendors) {
    const totalCount = document.getElementById('totalVendorsCount');
    const activeCount = document.getElementById('activeVendorsCount');
    
    if (totalCount) totalCount.textContent = vendors.length;
    if (activeCount) {
        const activeVendors = vendors.filter(v => v.isActive).length;
        activeCount.textContent = activeVendors;
    }
}

// Vendor search and filter functionality
let allVendors = [];

async function loadVendorsSection() {
    try {
        allVendors = await window.APIService.getVendors();
        renderVendorsTable(allVendors);
        initializeVendorFilters();
    } catch (error) {
        console.error('Failed to load vendors:', error);
        renderVendorsTable([]);
    }
}

function initializeVendorFilters() {
    const searchInput = document.getElementById('vendorSearchInput');
    const categoryFilter = document.getElementById('vendorCategoryFilter');
    const statusFilter = document.getElementById('vendorStatusFilter');
    
    if (searchInput) {
        searchInput.addEventListener('input', filterVendors);
    }
    
    if (categoryFilter) {
        categoryFilter.addEventListener('change', filterVendors);
    }
    
    if (statusFilter) {
        statusFilter.addEventListener('change', filterVendors);
    }
}

function filterVendors() {
    const searchTerm = document.getElementById('vendorSearchInput')?.value.toLowerCase() || '';
    const categoryFilter = document.getElementById('vendorCategoryFilter')?.value || 'all';
    const statusFilter = document.getElementById('vendorStatusFilter')?.value || 'all';
    
    let filtered = allVendors;
    
    // Apply search filter
    if (searchTerm) {
        filtered = filtered.filter(vendor => 
            vendor.name.toLowerCase().includes(searchTerm) ||
            vendor.email.toLowerCase().includes(searchTerm) ||
            vendor.category.toLowerCase().includes(searchTerm)
        );
    }
    
    // Apply category filter
    if (categoryFilter !== 'all') {
        filtered = filtered.filter(vendor => vendor.category === categoryFilter);
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
        const isActive = statusFilter === 'true';
        filtered = filtered.filter(vendor => vendor.isActive === isActive);
    }
    
    renderVendorsTable(filtered);
}

// Global functions for button clicks
window.viewVendor = viewVendor;
window.editVendor = editVendor;
window.deleteVendor = deleteVendor;
window.showAddVendorModal = showAddVendorModal;
window.closeVendorModal = closeVendorModal;
window.saveVendor = saveVendor;

// Customer Management Functions
let currentCustomerId = null;

function showAddCustomerModal() {
    currentCustomerId = null;
    document.getElementById('customerModalTitle').textContent = 'Add New Customer';
    document.getElementById('customerForm').reset();
    document.getElementById('customerModal').classList.add('show');
}

async function editCustomer(customerId) {
    try {
        currentCustomerId = customerId;
        const customer = await window.APIService.getCustomer(customerId);
        
        document.getElementById('customerModalTitle').textContent = 'Edit Customer';
        
        // Populate form
        document.getElementById('customerNameField').value = customer.name || '';
        document.getElementById('customerEmailField').value = customer.email || '';
        document.getElementById('customerPhoneField').value = customer.phone || '';
        document.getElementById('customerAddressField').value = customer.address || '';
        document.getElementById('customerCity').value = customer.city || '';
        document.getElementById('customerState').value = customer.state || '';
        document.getElementById('customerZip').value = customer.zipCode || '';
        document.getElementById('customerType').value = customer.customerType || 'one-time';
        document.getElementById('customerStatus').value = customer.status || 'active';
        document.getElementById('customerNotes').value = customer.notes || '';
        
        document.getElementById('customerModal').classList.add('show');
    } catch (error) {
        alert('Failed to load customer: ' + error.message);
    }
}

async function saveCustomer() {
    const form = document.getElementById('customerForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const customerData = {
        name: document.getElementById('customerNameField').value,
        email: document.getElementById('customerEmailField').value,
        phone: document.getElementById('customerPhoneField').value,
        address: document.getElementById('customerAddressField').value,
        city: document.getElementById('customerCity').value,
        state: document.getElementById('customerState').value,
        zipCode: document.getElementById('customerZip').value,
        customerType: document.getElementById('customerType').value,
        status: document.getElementById('customerStatus').value,
        notes: document.getElementById('customerNotes').value
    };
    
    try {
        if (currentCustomerId) {
            await window.APIService.updateCustomer(currentCustomerId, customerData);
            alert('Customer updated successfully!');
        } else {
            await window.APIService.createCustomer(customerData);
            alert('Customer created successfully!');
        }
        
        closeCustomerModal();
        await refreshCustomers();
    } catch (error) {
        alert('Failed to save customer: ' + error.message);
    }
}

async function deleteCustomer(customerId) {
    if (!confirm('Are you sure you want to delete this customer?')) {
        return;
    }
    
    try {
        await window.APIService.deleteCustomer(customerId);
        alert('Customer deleted successfully!');
        await refreshCustomers();
    } catch (error) {
        alert('Failed to delete customer: ' + error.message);
    }
}

function viewCustomer(customerId) {
    editCustomer(customerId);
    // Make form read-only
    const inputs = document.querySelectorAll('#customerForm input, #customerForm select, #customerForm textarea');
    inputs.forEach(input => input.disabled = true);
    
    document.getElementById('customerModalTitle').textContent = 'View Customer';
    document.querySelector('#customerModal .modal-footer .btn-primary').style.display = 'none';
}

function closeCustomerModal() {
    document.getElementById('customerModal').classList.remove('show');
    
    // Re-enable form inputs
    const inputs = document.querySelectorAll('#customerForm input, #customerForm select, #customerForm textarea');
    inputs.forEach(input => input.disabled = false);
    
    document.querySelector('#customerModal .modal-footer .btn-primary').style.display = 'inline-block';
}

async function refreshCustomers() {
    try {
        const customers = await window.APIService.getCustomers();
        renderCustomersTable(customers);
    } catch (error) {
        console.error('Failed to refresh customers:', error);
    }
}

function renderCustomersTable(customers) {
    const tbody = document.getElementById('customersTableBody');
    
    // Update stats
    updateCustomerStats(customers);
    
    if (!customers || customers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="customers-empty-state">
                    <i class="fas fa-users"></i>
                    <h3>No Customers Found</h3>
                    <p>Start by adding your first customer</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = customers.map(customer => {
        const initials = customer.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        const customerId = `#${customer._id.substring(0, 8).toUpperCase()}`;
        
        return `
        <tr>
            <td>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div class="customer-avatar">${initials}</div>
                    <div class="customer-info">
                        <div class="customer-name">${customer.name}</div>
                        <div class="customer-id">${customerId}</div>
                    </div>
                </div>
            </td>
            <td><a href="mailto:${customer.email}" class="customer-email">${customer.email}</a></td>
            <td><span class="customer-phone">${customer.phone || 'N/A'}</span></td>
            <td>${customer.city || 'N/A'}</td>
            <td><span class="customer-type-badge ${customer.customerType}">${customer.customerType}</span></td>
            <td><span class="customer-status-badge ${customer.status}">${customer.status}</span></td>
            <td><span class="customer-orders-count">${customer.totalOrders || 0}</span></td>
            <td><span class="customer-total-spent">$${(customer.totalSpent || 0).toLocaleString()}</span></td>
            <td>
                <div class="customer-actions">
                    <button class="action-btn view" onclick="viewCustomer('${customer._id}')" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn edit" onclick="editCustomer('${customer._id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete" onclick="deleteCustomer('${customer._id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
    }).join('');
}

function updateCustomerStats(customers) {
    const totalCount = document.getElementById('totalCustomersCount');
    const activeCount = document.getElementById('activeCustomersCount');
    
    if (totalCount) totalCount.textContent = customers.length;
    if (activeCount) {
        const activeCustomers = customers.filter(c => c.status === 'active').length;
        activeCount.textContent = activeCustomers;
    }
}

// Customer search and filter functionality
let allCustomers = [];

async function loadCustomersSection() {
    try {
        allCustomers = await window.APIService.getCustomers();
        renderCustomersTable(allCustomers);
        initializeCustomerFilters();
    } catch (error) {
        console.error('Failed to load customers:', error);
        renderCustomersTable([]);
    }
}

function initializeCustomerFilters() {
    const searchInput = document.getElementById('customerSearchInput');
    const typeFilter = document.getElementById('customerTypeFilter');
    const statusFilter = document.getElementById('customerStatusFilter');
    
    if (searchInput) {
        searchInput.addEventListener('input', filterCustomers);
    }
    
    if (typeFilter) {
        typeFilter.addEventListener('change', filterCustomers);
    }
    
    if (statusFilter) {
        statusFilter.addEventListener('change', filterCustomers);
    }
}

function filterCustomers() {
    const searchTerm = document.getElementById('customerSearchInput')?.value.toLowerCase() || '';
    const typeFilter = document.getElementById('customerTypeFilter')?.value || 'all';
    const statusFilter = document.getElementById('customerStatusFilter')?.value || 'all';
    
    let filtered = allCustomers;
    
    // Apply search filter
    if (searchTerm) {
        filtered = filtered.filter(customer => 
            customer.name.toLowerCase().includes(searchTerm) ||
            customer.email.toLowerCase().includes(searchTerm) ||
            (customer.phone && customer.phone.includes(searchTerm))
        );
    }
    
    // Apply type filter
    if (typeFilter !== 'all') {
        filtered = filtered.filter(customer => customer.customerType === typeFilter);
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
        filtered = filtered.filter(customer => customer.status === statusFilter);
    }
    
    renderCustomersTable(filtered);
}

// Global functions for button clicks
window.viewCustomer = viewCustomer;
window.editCustomer = editCustomer;
window.deleteCustomer = deleteCustomer;
window.showAddCustomerModal = showAddCustomerModal;
window.closeCustomerModal = closeCustomerModal;
window.saveCustomer = saveCustomer;

// Global functions for button clicks
window.viewOrder = viewOrder;
window.editOrder = editOrder;
window.deleteOrder = deleteOrder;
window.showAddOrderModal = showAddOrderModal;
window.closeOrderModal = closeOrderModal;
window.saveOrder = saveOrder;

// Order Stats Update Function
function updateOrderStats(orders) {
    const totalCount = document.getElementById('totalOrdersCount');
    const activeCount = document.getElementById('activeOrdersCount');
    
    if (totalCount) totalCount.textContent = orders.length;
    if (activeCount) {
        const activeOrders = orders.filter(o => ['new', 'in-progress'].includes(o.status)).length;
        activeCount.textContent = activeOrders;
    }
}

// Order search and filter functionality
let allOrders = [];

async function loadOrdersSection() {
    try {
        allOrders = await window.APIService.getOrders();
        window.dashboard.renderOrdersTable(allOrders);
        initializeOrderFilters();
    } catch (error) {
        console.error('Failed to load orders:', error);
        window.dashboard.renderOrdersTable([]);
    }
}

function initializeOrderFilters() {
    const searchInput = document.getElementById('orderSearchInput');
    const statusFilter = document.getElementById('orderStatusFilter');
    const priorityFilter = document.getElementById('orderPriorityFilter');
    
    if (searchInput) {
        searchInput.addEventListener('input', filterOrders);
    }
    
    if (statusFilter) {
        statusFilter.addEventListener('change', filterOrders);
    }
    
    if (priorityFilter) {
        priorityFilter.addEventListener('change', filterOrders);
    }
}

function filterOrders() {
    const searchTerm = document.getElementById('orderSearchInput')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('orderStatusFilter')?.value || 'all';
    const priorityFilter = document.getElementById('orderPriorityFilter')?.value || 'all';
    
    let filtered = allOrders;
    
    // Apply search filter
    if (searchTerm) {
        filtered = filtered.filter(order => {
            const orderId = (order.orderId || order._id).toLowerCase();
            const customerName = (order.customer?.name || order.customer || '').toLowerCase();
            const service = (order.service || '').toLowerCase();
            
            return orderId.includes(searchTerm) ||
                   customerName.includes(searchTerm) ||
                   service.includes(searchTerm);
        });
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
        filtered = filtered.filter(order => order.status === statusFilter);
    }
    
    // Apply priority filter
    if (priorityFilter !== 'all') {
        filtered = filtered.filter(order => (order.priority || 'medium') === priorityFilter);
    }
    
    window.dashboard.renderOrdersTable(filtered);
}

// Update menu navigation to load orders section
function loadOrdersSectionOnNav() {
    loadOrdersSection();
}

// Global function
window.loadOrdersSection = loadOrdersSectionOnNav;

// Profile and settings functions
function showProfile() {
    const modal = document.getElementById('profileModal');
    const sessionData = SessionManager.getUserInfo();
    
    if (!modal) return;
    
    if (sessionData && sessionData.user) {
        const user = sessionData.user;
        const profileEmail = document.getElementById('profileEmail');
        const firstName = document.getElementById('firstName');
        const lastName = document.getElementById('lastName');
        const phone = document.getElementById('phone');
        const role = document.getElementById('role');
        const department = document.getElementById('department');
        const profileAvatar = document.getElementById('profileAvatar');
        
        if (profileEmail) profileEmail.value = user.email || '';
        if (firstName) firstName.value = user.firstName || '';
        if (lastName) lastName.value = user.lastName || '';
        if (phone) phone.value = user.phone || '';
        if (role) role.value = user.role || 'administrator';
        if (department) department.value = user.department || '';
        
        // Set avatar with fallback
        if (profileAvatar) {
            if (user.avatar) {
                profileAvatar.src = user.avatar;
            } else {
                const firstLetter = (user.firstName || 'A').charAt(0).toUpperCase();
                profileAvatar.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%234CAF50'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='50' fill='white'%3E${firstLetter}%3C/text%3E%3C/svg%3E`;
            }
        }
    }
    
    modal.classList.add('show');
}

function closeProfileModal() {
    const modal = document.getElementById('profileModal');
    modal.classList.remove('show');
}

function saveProfile() {
    const firstName = document.getElementById('firstName').value;
    const lastName = document.getElementById('lastName').value;
    const email = document.getElementById('profileEmail').value;
    const phone = document.getElementById('phone').value;
    const role = document.getElementById('role').value;
    const department = document.getElementById('department').value;
    const avatar = document.getElementById('profileAvatar').src;
    
    // Get current user info
    const sessionData = SessionManager.getUserInfo();
    if (!sessionData) {
        alert('Session expired. Please login again.');
        return;
    }
    
    // Update profile via API
    window.APIService.updateProfile({
        email,
        firstName,
        lastName,
        phone,
        department,
        avatar
    }).then(response => {
        // Update session data with new user info
        sessionData.user = {
            ...sessionData.user,
            email: response.user.email,
            firstName: response.user.firstName,
            lastName: response.user.lastName,
            phone: response.user.phone,
            department: response.user.department,
            avatar: response.user.avatar
        };
        
        // Save to storage
        const storage = localStorage.getItem('huttaSession') ? localStorage : sessionStorage;
        storage.setItem('huttaSession', JSON.stringify(sessionData));
        
        // Update UI
        updateUserInfo(sessionData);
        
        alert('Profile updated successfully!');
        closeProfileModal();
    }).catch(error => {
        console.error('Profile update error:', error);
        alert('Failed to update profile: ' + error.message);
    });
    
    // Clear password fields
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
}

function uploadAvatar() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            // Check file size (limit to 2MB)
            if (file.size > 2 * 1024 * 1024) {
                alert('Image size must be less than 2MB');
                return;
            }
            
            const reader = new FileReader();
            reader.onload = function(e) {
                const base64 = e.target.result;
                document.getElementById('profileAvatar').src = base64;
                document.getElementById('adminAvatar').src = base64;
            };
            reader.readAsDataURL(file);
        }
    };
    input.click();
}

function showSettings() {
    const settingsLink = document.querySelector('[data-section="settings"]');
    if (settingsLink) {
        settingsLink.click();
    }
}

// Add CSS for action buttons
const additionalStyles = `
.btn-action {
    background: none;
    border: none;
    color: var(--medium-gray);
    cursor: pointer;
    padding: 8px;
    border-radius: 4px;
    margin: 0 2px;
    transition: all 0.2s;
}

.btn-action:hover {
    background: var(--light-gray);
    color: var(--primary-blue);
}
`;

// Inject additional styles
const styleSheet = document.createElement('style');
styleSheet.textContent = additionalStyles;
document.head.appendChild(styleSheet);


// Pipeline section loader
function loadPipelineSection() {
    if (typeof PipelineManager !== 'undefined') {
        PipelineManager.loadStages();
        PipelineManager.loadProjects();
    }
}

// Accounting section loader
function loadAccountingSection() {
    if (typeof updateAccountingDashboard !== 'undefined') {
        updateAccountingDashboard();
    }
}

// Global function
window.loadPipelineSection = loadPipelineSection;
window.loadAccountingSection = loadAccountingSection;
