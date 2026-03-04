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
                console.log('Menu clicked:', targetSection);
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
            // Show loading state immediately
            this.showLoadingState();
            
            // Check cache first (5 minute TTL)
            const cached = this.getCachedData();
            if (cached) {
                this.renderFromCache(cached);
            }
            
            // Load all data in parallel for instant display
            const [orders, vendors, employees, customers, payments] = await Promise.all([
                window.APIService.getOrders().catch(err => { console.error('Orders error:', err); return []; }),
                window.APIService.getVendors().catch(() => []),
                window.APIService.getEmployees().catch(() => []),
                window.APIService.getCustomers().catch(() => []),
                window.APIService.getPayments().catch(() => [])
            ]);
            
            console.log('Dashboard data loaded:', { orders: orders.length, vendors: vendors.length, employees: employees.length });
            
            // Calculate stats from orders
            const currentMonth = new Date().getMonth();
            const currentYear = new Date().getFullYear();
            const monthlyRevenue = orders
                .filter(order => {
                    const orderDate = new Date(order.createdAt);
                    return orderDate.getMonth() === currentMonth && 
                           orderDate.getFullYear() === currentYear;
                })
                .reduce((sum, order) => sum + (order.amount || 0), 0);
            
            const stats = {
                totalOrders: orders.length,
                monthlyRevenue: monthlyRevenue,
                totalVendors: vendors.length,
                totalEmployees: employees.length
            };
            
            // Cache the data
            this.cacheData({ orders, vendors, employees, customers, payments, stats });
            
            // Render all sections instantly
            this.renderKPIs(stats);
            this.renderVendorCategories(vendors);
            this.renderCustomerSummary(customers);
            this.renderFinancialOverview(orders, payments);
            this.renderWorkflowFromOrders(orders);
            this.renderOrdersTable(orders);
            this.renderRecentActivity(orders);
            
            console.log('Orders table rendered with', orders.length, 'orders');
            this.hideLoadingState();
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
            this.hideLoadingState();
            this.renderKPIs();
            this.renderWorkflowFromOrders([]);
            this.renderOrdersTable([]);
            this.renderRecentActivity([]);
        }
    }

    getCachedData() {
        const cached = sessionStorage.getItem('dashboardCache');
        if (!cached) return null;
        
        const { data, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        
        // Cache valid for 5 minutes
        if (age < 5 * 60 * 1000) {
            return data;
        }
        return null;
    }

    cacheData(data) {
        sessionStorage.setItem('dashboardCache', JSON.stringify({
            data,
            timestamp: Date.now()
        }));
    }

    renderFromCache(cached) {
        console.log('Rendering from cache:', cached);
        this.renderKPIs(cached.stats);
        this.renderVendorCategories(cached.vendors);
        this.renderCustomerSummary(cached.customers);
        this.renderFinancialOverview(cached.orders, cached.payments);
        this.renderWorkflowFromOrders(cached.orders);
        this.renderOrdersTable(cached.orders);
        this.renderRecentActivity(cached.orders);
    }

    showLoadingState() {
        const kpis = ['totalOrders', 'monthlyRevenue', 'totalVendors', 'totalEmployees'];
        kpis.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<div class="skeleton-loader"></div>';
        });
    }

    hideLoadingState() {
        // Loading state is replaced by actual content
    }

    renderKPIs(stats = null) {
        const totalOrdersEl = document.getElementById('totalOrders');
        const monthlyRevenueEl = document.getElementById('monthlyRevenue');
        const totalVendorsEl = document.getElementById('totalVendors');
        const totalEmployeesEl = document.getElementById('totalEmployees');
        
        if (stats) {
            if (totalOrdersEl) totalOrdersEl.textContent = stats.totalOrders || 0;
            if (monthlyRevenueEl) monthlyRevenueEl.textContent = `$${(stats.monthlyRevenue || 0).toLocaleString()}`;
            if (totalVendorsEl) totalVendorsEl.textContent = stats.totalVendors || 0;
            if (totalEmployeesEl) totalEmployeesEl.textContent = stats.totalEmployees || 0;
        } else {
            if (totalOrdersEl) totalOrdersEl.textContent = '0';
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
        
        console.log('renderOrdersTable called with:', ordersData ? ordersData.length : 0, 'orders');
        
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
            const statusDisplay = order.pipelineStage || order.status.replace('-', ' ');
            const statusClass = order.pipelineStage ? 'pipeline' : order.status;
            
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
                <td><span class="order-status-badge ${statusClass}">${this.formatStatus(statusDisplay)}</span></td>
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

    renderRecentActivity(orders) {
        const activityList = document.getElementById('recentActivity');
        if (!activityList) return;
        
        if (!orders || orders.length === 0) {
            activityList.innerHTML = '<div class="activity-item"><p>No recent activity</p></div>';
            return;
        }
        
        const recentOrders = orders
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 5);
        
        activityList.innerHTML = recentOrders.map(order => {
            const timeAgo = this.getTimeAgo(order.createdAt);
            const customerName = order.customer?.name || order.customer;
            
            return `
                <div class="activity-item">
                    <div class="activity-icon orders">
                        <i class="fas fa-clipboard-list"></i>
                    </div>
                    <div class="activity-content">
                        <p>New order from ${customerName}</p>
                        <span>${timeAgo}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    getTimeAgo(date) {
        const now = new Date();
        const past = new Date(date);
        const diffMs = now - past;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    }

    renderCustomerSummary(customers) {
        const permanentCount = document.getElementById('permanentCustomers');
        const oneTimeCount = document.getElementById('oneTimeCustomers');
        
        if (!customers || customers.length === 0) {
            if (permanentCount) permanentCount.textContent = '0';
            if (oneTimeCount) oneTimeCount.textContent = '0';
            return;
        }
        
        const permanent = customers.filter(c => c.customerType === 'permanent').length;
        const oneTime = customers.filter(c => c.customerType === 'one-time').length;
        
        if (permanentCount) permanentCount.textContent = permanent;
        if (oneTimeCount) oneTimeCount.textContent = oneTime;
    }

    renderVendorCategories(vendors) {
        const electricalCount = document.getElementById('electricalVendors');
        const plumbingCount = document.getElementById('plumbingVendors');
        const civilCount = document.getElementById('civilVendors');
        const carpentryCount = document.getElementById('carpentryVendors');
        
        if (!vendors || vendors.length === 0) {
            if (electricalCount) electricalCount.textContent = '0';
            if (plumbingCount) plumbingCount.textContent = '0';
            if (civilCount) civilCount.textContent = '0';
            if (carpentryCount) carpentryCount.textContent = '0';
            return;
        }
        
        const electrical = vendors.filter(v => v.category === 'electrical').length;
        const plumbing = vendors.filter(v => v.category === 'plumbing').length;
        const civil = vendors.filter(v => v.category === 'civil').length;
        const carpentry = vendors.filter(v => v.category === 'carpentry').length;
        
        if (electricalCount) electricalCount.textContent = electrical;
        if (plumbingCount) plumbingCount.textContent = plumbing;
        if (civilCount) civilCount.textContent = civil;
        if (carpentryCount) carpentryCount.textContent = carpentry;
    }

    renderFinancialOverview(orders, payments) {
        const totalRevenueEl = document.getElementById('totalRevenue');
        const pendingPaymentsEl = document.getElementById('pendingPayments');
        const thisMonthRevenueEl = document.getElementById('thisMonthRevenue');
        
        const totalRevenue = orders.reduce((sum, order) => sum + (order.amount || 0), 0);
        const pendingPayments = payments.filter(p => p.status === 'pending').reduce((sum, p) => sum + (p.amount || 0), 0);
        
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        const thisMonthRevenue = orders
            .filter(order => {
                const orderDate = new Date(order.createdAt);
                return orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear;
            })
            .reduce((sum, order) => sum + (order.amount || 0), 0);
        
        if (totalRevenueEl) totalRevenueEl.textContent = `$${totalRevenue.toLocaleString()}`;
        if (pendingPaymentsEl) pendingPaymentsEl.textContent = `$${pendingPayments.toLocaleString()}`;
        if (thisMonthRevenueEl) thisMonthRevenueEl.textContent = `$${thisMonthRevenue.toLocaleString()}`;
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
let orderCustomers = [];
let employees = [];

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

async function loadEmployees() {
    try {
        employees = await window.APIService.getEmployees();
        const employeeSelect = document.getElementById('employee');
        employeeSelect.innerHTML = '<option value="">Select Employee</option>' +
            employees.map(emp => `<option value="${emp._id}">${emp.name} - ${emp.role.replace('-', ' ')}</option>`).join('');
    } catch (error) {
        console.error('Failed to load employees:', error);
    }
}

async function loadOrderCustomers() {
    try {
        orderCustomers = await window.APIService.getCustomers();
        const customerSelect = document.getElementById('customerSelect');
        customerSelect.innerHTML = '<option value="">-- Select Existing Customer --</option>' +
            '<option value="new">+ Add New Customer</option>' +
            orderCustomers.map(customer => `<option value="${customer._id}">${customer.name} (${customer.email})</option>`).join('');
    } catch (error) {
        console.error('Failed to load customers:', error);
    }
}

function handleCustomerSelect() {
    const customerSelect = document.getElementById('customerSelect');
    const newCustomerFields = document.getElementById('newCustomerFields');
    const selectedValue = customerSelect.value;
    
    if (selectedValue === 'new' || selectedValue === '') {
        // Show new customer fields
        newCustomerFields.style.display = 'block';
        document.getElementById('customerName').value = '';
        document.getElementById('customerEmail').value = '';
        document.getElementById('customerPhone').value = '';
        document.getElementById('customerAddress').value = '';
        
        // Make fields required
        document.getElementById('customerName').required = true;
        document.getElementById('customerEmail').required = true;
    } else {
        // Hide new customer fields and populate with existing customer
        const customer = orderCustomers.find(c => c._id === selectedValue);
        if (customer) {
            document.getElementById('customerName').value = customer.name;
            document.getElementById('customerEmail').value = customer.email;
            document.getElementById('customerPhone').value = customer.phone || '';
            document.getElementById('customerAddress').value = customer.address || '';
            
            // Make fields not required (already exists)
            document.getElementById('customerName').required = false;
            document.getElementById('customerEmail').required = false;
            
            // Hide fields
            newCustomerFields.style.display = 'none';
        }
    }
}

window.handleCustomerSelect = handleCustomerSelect;

function showAddOrderModal() {
    currentOrderId = null;
    document.getElementById('orderModalTitle').textContent = 'Add New Order';
    document.getElementById('orderForm').reset();
    
    // Reset customer select
    document.getElementById('customerSelect').value = '';
    document.getElementById('newCustomerFields').style.display = 'block';
    
    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('startDate').value = today;
    
    loadVendors();
    loadEmployees();
    loadOrderCustomers();
    document.getElementById('orderModal').classList.add('show');
}

async function editOrder(orderId) {
    try {
        currentOrderId = orderId;
        const order = await window.APIService.getOrder(orderId);
        
        document.getElementById('orderModalTitle').textContent = 'Edit Order';
        
        // Load customers and vendors first
        await loadVendors();
        await loadEmployees();
        await loadOrderCustomers();
        
        // Populate form
        document.getElementById('customerSelect').value = 'new';
        document.getElementById('newCustomerFields').style.display = 'block';
        document.getElementById('customerName').value = order.customer.name || '';
        document.getElementById('customerEmail').value = order.customer.email || '';
        document.getElementById('customerPhone').value = order.customer.phone || '';
        document.getElementById('customerAddress').value = order.customer.address || '';
        document.getElementById('service').value = order.service || '';
        document.getElementById('amount').value = order.amount || '';
        document.getElementById('vendorCost').value = order.vendorCost || '';
        document.getElementById('startDate').value = order.startDate ? order.startDate.split('T')[0] : '';
        document.getElementById('endDate').value = order.endDate ? order.endDate.split('T')[0] : '';
        document.getElementById('status').value = order.status || 'new';
        document.getElementById('priority').value = order.priority || 'medium';
        document.getElementById('description').value = order.description || '';
        document.getElementById('notes').value = order.notes || '';
        
        if (order.vendor) {
            document.getElementById('vendor').value = order.vendor._id || order.vendor;
        }
        
        if (order.employee) {
            document.getElementById('employee').value = order.employee._id || order.employee;
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
    
    const saveBtn = document.querySelector('#orderModal .btn-primary');
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    
    const orderData = {
        customer: {
            name: document.getElementById('customerName').value,
            email: document.getElementById('customerEmail').value,
            phone: document.getElementById('customerPhone').value || '',
            address: document.getElementById('customerAddress').value || ''
        },
        service: document.getElementById('service').value,
        amount: parseFloat(document.getElementById('amount').value),
        vendorCost: parseFloat(document.getElementById('vendorCost').value) || 0,
        vendor: document.getElementById('vendor').value || null,
        employee: document.getElementById('employee').value || null,
        startDate: document.getElementById('startDate').value,
        endDate: document.getElementById('endDate').value,
        status: document.getElementById('status').value || 'new',
        priority: document.getElementById('priority').value || 'medium',
        description: document.getElementById('description').value || '',
        notes: document.getElementById('notes').value || ''
    };
    
    try {
        if (currentOrderId) {
            await window.APIService.updateOrder(currentOrderId, orderData);
            showToast('Order updated successfully!', 'success');
        } else {
            await window.APIService.createOrder(orderData);
            showToast('Order created successfully!', 'success');
        }
        
        closeOrderModal();
        await refreshOrders();
    } catch (error) {
        console.error('Save order error:', error);
        showToast(error.message || 'Failed to save order', 'error');
    } finally {
        saveBtn.disabled = false;
    }
}

async function deleteOrder(orderId) {
    if (!confirm('Are you sure you want to delete this order?')) {
        return;
    }
    
    try {
        await window.APIService.deleteOrder(orderId);
        showToast('Order deleted successfully!', 'success');
        await refreshOrders();
    } catch (error) {
        showToast('Failed to delete order: ' + error.message, 'error');
    }
}

function viewOrder(orderId) {
    showOrderDetail(orderId);
}

async function showOrderDetail(orderId) {
    try {
        const order = await window.APIService.getOrder(orderId);
        
        document.getElementById('orderDetailTitle').textContent = `Order ${order.orderId || '#' + order._id.substring(0, 8).toUpperCase()}`;
        document.getElementById('detailOrderId').textContent = order.orderId || '#' + order._id.substring(0, 8).toUpperCase();
        document.getElementById('detailOrderStatus').innerHTML = `<span class="order-status-badge ${order.status}">${order.status.replace('-', ' ')}</span>`;
        document.getElementById('detailOrderPriority').innerHTML = `<span class="priority-badge ${order.priority || 'medium'}">${order.priority || 'medium'}</span>`;
        document.getElementById('detailOrderAmount').textContent = '$' + (order.amount?.toLocaleString() || '0');
        document.getElementById('detailOrderService').textContent = order.service || '-';
        document.getElementById('detailOrderVendor').textContent = order.vendor?.name || 'N/A';
        document.getElementById('detailOrderStartDate').textContent = order.startDate ? new Date(order.startDate).toLocaleDateString() : '-';
        document.getElementById('detailOrderEndDate').textContent = order.endDate ? new Date(order.endDate).toLocaleDateString() : '-';
        
        document.getElementById('detailOrderCustomerName').textContent = order.customer?.name || order.customer || '-';
        document.getElementById('detailOrderCustomerEmail').textContent = order.customer?.email || '-';
        document.getElementById('detailOrderCustomerPhone').textContent = order.customer?.phone || '-';
        document.getElementById('detailOrderCustomerAddress').textContent = order.customer?.address || '-';
        
        document.getElementById('detailOrderDescription').textContent = order.description || 'No description provided';
        document.getElementById('detailOrderNotes').textContent = order.notes || 'No notes';
        
        showSection('order-detail');
    } catch (error) {
        console.error('Failed to load order details:', error);
        showToast('Failed to load order details: ' + error.message, 'error');
    }
}

function backToOrders() {
    showSection('orders');
}

window.showOrderDetail = showOrderDetail;
window.backToOrders = backToOrders;

function closeOrderModal() {
    document.getElementById('orderModal').classList.remove('show');
    
    // Re-enable form inputs
    const inputs = document.querySelectorAll('#orderForm input, #orderForm select, #orderForm textarea');
    inputs.forEach(input => input.disabled = false);
    
    document.querySelector('.modal-footer .btn-primary').style.display = 'inline-block';
}

async function refreshOrders() {
    try {
        if (window.ordersRefreshing) return; // Prevent duplicate calls
        window.ordersRefreshing = true;
        
        const orders = await window.APIService.getOrders();
        window.dashboard.renderOrdersTable(orders);
        
        // Refresh dashboard stats after order changes (debounced)
        clearTimeout(window.statsRefreshTimer);
        window.statsRefreshTimer = setTimeout(async () => {
            const stats = await window.APIService.getOrderStats();
            window.dashboard.renderKPIs(stats);
            window.dashboard.renderWorkflowFromOrders(orders);
        }, 300);
    } catch (error) {
        console.error('Failed to refresh orders:', error);
    } finally {
        window.ordersRefreshing = false;
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
        
        showToast('Settings saved successfully!', 'success');
    } catch (error) {
        showToast('Failed to save settings: ' + error.message, 'error');
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
        showToast('Settings reset to default successfully!', 'success');
    } catch (error) {
        showToast('Failed to reset settings: ' + error.message, 'error');
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
        const [financial, orders, customers] = await Promise.all([
            window.APIService.getFinancialReport(startDate, endDate),
            window.APIService.getOrdersReport(startDate, endDate),
            window.APIService.getCustomersReport()
        ]);
        
        // Render financial report
        renderFinancialReport(financial);
        
        // Render orders report
        renderOrdersReport(orders);
        
        // Render customers report
        renderCustomersReport(customers);
        
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

async function loadPaymentData() {
    try {
        [paymentCustomers, paymentOrders] = await Promise.all([
            window.APIService.getCustomers(),
            window.APIService.getOrders()
        ]);
        
        // Populate customer dropdown
        const customerSelect = document.getElementById('paymentCustomer');
        customerSelect.innerHTML = '<option value="">Select Customer</option>' +
            paymentCustomers.map(customer => `<option value="${customer._id}">${customer.name}</option>`).join('');
        
        // Populate order dropdown
        const orderSelect = document.getElementById('paymentOrder');
        orderSelect.innerHTML = '<option value="">Select Order (Optional)</option>' +
            paymentOrders.map(order => `<option value="${order._id}">${order.orderId} - ${order.service}</option>`).join('');
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
            showToast('Payment updated successfully!', 'success');
        } else {
            await window.APIService.createPayment(paymentData);
            showToast('Payment recorded successfully!', 'success');
        }
        
        closePaymentModal();
        await refreshPayments();
    } catch (error) {
        showToast('Failed to save payment: ' + error.message, 'error');
    }
}

async function deletePayment(paymentId) {
    if (!confirm('Are you sure you want to delete this payment?')) {
        return;
    }
    
    try {
        await window.APIService.deletePayment(paymentId);
        showToast('Payment deleted successfully!', 'success');
        await refreshPayments();
    } catch (error) {
        showToast('Failed to delete payment: ' + error.message, 'error');
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
                ${payment.order ? `Order: ${payment.order.orderId}` : 'N/A'}
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
        // Upload documents if any
        if (window.uploadedFiles && window.uploadedFiles.employee && window.uploadedFiles.employee.length > 0) {
            const uploadedDocs = await window.uploadFiles(window.uploadedFiles.employee);
            if (uploadedDocs && uploadedDocs.length > 0) {
                employeeData.documents = uploadedDocs;
            }
        }
        
        if (currentEmployeeId) {
            await window.APIService.updateEmployee(currentEmployeeId, employeeData);
            showToast('Employee updated successfully!', 'success');
        } else {
            await window.APIService.createEmployee(employeeData);
            showToast('Employee created successfully!', 'success');
        }
        
        // Clear uploaded files
        if (window.uploadedFiles) {
            window.uploadedFiles.employee = [];
        }
        
        closeEmployeeModal();
        await refreshEmployees();
    } catch (error) {
        showToast('Failed to save employee: ' + error.message, 'error');
    }
}

async function deleteEmployee(employeeId) {
    if (!confirm('Are you sure you want to delete this employee?')) {
        return;
    }
    
    try {
        await window.APIService.deleteEmployee(employeeId);
        showToast('Employee deleted successfully!', 'success');
        await refreshEmployees();
    } catch (error) {
        showToast('Failed to delete employee: ' + error.message, 'error');
    }
}

function viewEmployee(employeeId) {
    console.log('viewEmployee called with ID:', employeeId);
    showEmployeeDetail(employeeId);
}

async function showEmployeeDetail(employeeId) {
    try {
        console.log('Loading employee details for:', employeeId);
        const employee = await window.APIService.getEmployee(employeeId);
        console.log('Employee data loaded:', employee);
        
        document.getElementById('employeeDetailName').textContent = employee.name;
        document.getElementById('detailEmployeeEmail').textContent = employee.email || '-';
        document.getElementById('detailEmployeePhone').textContent = employee.phone || '-';
        document.getElementById('detailEmployeeRole').textContent = employee.role.replace('-', ' ') || '-';
        document.getElementById('detailEmployeeDepartment').textContent = employee.department || '-';
        document.getElementById('detailEmployeeStatus').innerHTML = `<span class="employee-status-badge ${employee.status}">${employee.status.replace('-', ' ')}</span>`;
        document.getElementById('detailEmployeeHireDate').textContent = employee.hireDate ? new Date(employee.hireDate).toLocaleDateString() : '-';
        document.getElementById('detailEmployeeAddress').textContent = employee.address || '-';
        document.getElementById('detailEmployeeSkills').textContent = employee.skills && employee.skills.length > 0 ? employee.skills.join(', ') : '-';
        
        // Load performance stats
        console.log('Loading employee stats...');
        const stats = await window.APIService.getEmployeeStats(employeeId);
        console.log('Stats loaded:', stats);
        console.log('Stats breakdown:', {
            totalOrders: stats.totalOrders,
            totalRevenue: stats.totalRevenue,
            totalProfit: stats.totalProfit,
            activeOrders: stats.activeOrders,
            completedOrders: stats.completedOrders
        });
        document.getElementById('employeeTotalOrders').textContent = stats.totalOrders || 0;
        document.getElementById('employeeActiveOrders').textContent = stats.activeOrders || 0;
        document.getElementById('employeeCompletedOrders').textContent = stats.completedOrders || 0;
        document.getElementById('employeeTotalRevenue').textContent = `$${(stats.totalRevenue || 0).toLocaleString()}`;
        document.getElementById('employeeTotalProfit').textContent = `$${(stats.totalProfit || 0).toLocaleString()}`;
        
        // Show message if no orders assigned
        if (stats.totalOrders === 0) {
            console.log('No orders assigned to this employee yet');
        }
        
        const docsList = document.getElementById('employeeDocumentsList');
        if (employee.documents && employee.documents.length > 0) {
            docsList.innerHTML = employee.documents.map(doc => `
                <div class="document-item">
                    <div class="document-info">
                        <div class="document-icon">
                            <i class="fas fa-file-${getDocIcon(doc.name)}"></i>
                        </div>
                        <div class="document-details">
                            <div class="document-name">${doc.name}</div>
                            <div class="document-meta">${formatFileSize(doc.size)} • ${new Date(doc.uploadedAt).toLocaleDateString()}</div>
                        </div>
                    </div>
                    <div class="document-actions">
                        <button class="btn-icon" onclick="downloadDocument('${doc.url}')" title="Download">
                            <i class="fas fa-download"></i>
                        </button>
                        <button class="btn-icon" onclick="viewDocument('${doc.url}')" title="View">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            docsList.innerHTML = '<p class="no-documents">No documents uploaded</p>';
        }
        
        console.log('Showing employee-detail section');
        showSection('employee-detail');
    } catch (error) {
        console.error('Failed to load employee details:', error);
        showToast('Failed to load employee details: ' + error.message, 'error');
    }
}

function backToEmployees() {
    showSection('employees');
}

function closeEmployeeModal() {
    document.getElementById('employeeModal').classList.remove('show');
    
    // Re-enable form inputs
    const inputs = document.querySelectorAll('#employeeForm input, #employeeForm select, #employeeForm textarea');
    inputs.forEach(input => input.disabled = false);
    
    document.querySelector('#employeeModal .modal-footer .btn-primary').style.display = 'inline-block';
    
    // Clear file input and preview
    const fileInput = document.getElementById('employeeDocs');
    const filePreview = document.getElementById('employeeDocsPreview');
    if (fileInput) fileInput.value = '';
    if (filePreview) filePreview.innerHTML = '';
    if (window.uploadedFiles) window.uploadedFiles.employee = [];
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
window.showEmployeeDetail = showEmployeeDetail;
window.backToEmployees = backToEmployees;

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
        // Upload documents if any
        if (window.uploadedFiles && window.uploadedFiles.vendor && window.uploadedFiles.vendor.length > 0) {
            const uploadedDocs = await window.uploadFiles(window.uploadedFiles.vendor);
            console.log('Uploaded docs response:', uploadedDocs);
            if (uploadedDocs && uploadedDocs.length > 0) {
                vendorData.documents = uploadedDocs;
            }
        }
        
        console.log('Final vendor data:', vendorData);
        console.log('Documents type:', typeof vendorData.documents);
        console.log('Documents is array:', Array.isArray(vendorData.documents));
        
        if (currentVendorId) {
            await window.APIService.updateVendor(currentVendorId, vendorData);
            showToast('Vendor updated successfully!', 'success');
        } else {
            await window.APIService.createVendor(vendorData);
            showToast('Vendor created successfully!', 'success');
        }
        
        // Clear uploaded files
        if (window.uploadedFiles) {
            window.uploadedFiles.vendor = [];
        }
        
        closeVendorModal();
        await refreshVendors();
    } catch (error) {
        console.error('Save vendor error:', error);
        showToast('Failed to save vendor: ' + error.message, 'error');
    }
}

async function deleteVendor(vendorId) {
    if (!confirm('Are you sure you want to delete this vendor?')) {
        return;
    }
    
    try {
        await window.APIService.deleteVendor(vendorId);
        showToast('Vendor deleted successfully!', 'success');
        await refreshVendors();
    } catch (error) {
        showToast('Failed to delete vendor: ' + error.message, 'error');
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
    
    // Clear file input and preview
    const fileInput = document.getElementById('vendorDocs');
    const filePreview = document.getElementById('vendorDocsPreview');
    if (fileInput) fileInput.value = '';
    if (filePreview) filePreview.innerHTML = '';
    if (window.uploadedFiles) window.uploadedFiles.vendor = [];
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
    
    // Store vendors globally for detail view
    window.vendorsData = vendors;
    
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
                    <button class="action-btn view" onclick="showVendorDetail('${vendor._id}')" title="View Details">
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
let addressCounter = 1;

function addPhysicalAddress() {
    const container = document.getElementById('addressesContainer');
    const newAddressGroup = document.createElement('div');
    newAddressGroup.className = 'address-group';
    newAddressGroup.setAttribute('data-address-index', addressCounter);
    newAddressGroup.style.marginTop = '20px';
    newAddressGroup.style.paddingTop = '20px';
    newAddressGroup.style.borderTop = '1px solid #e5e7eb';
    newAddressGroup.style.position = 'relative';
    
    newAddressGroup.innerHTML = `
        <button type="button" class="btn-remove-address" onclick="removePhysicalAddress(${addressCounter})" style="position: absolute; top: 10px; right: 0; background: #ef4444; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">
            <i class="fas fa-times"></i> Remove
        </button>
        <div class="form-group">
            <label for="customerAddressField_${addressCounter}">Address ${addressCounter + 1}</label>
            <textarea id="customerAddressField_${addressCounter}" class="customer-address-field" rows="2"></textarea>
        </div>
    `;
    
    container.appendChild(newAddressGroup);
    addressCounter++;
}

function removePhysicalAddress(index) {
    const addressGroup = document.querySelector(`[data-address-index="${index}"]`);
    if (addressGroup) {
        addressGroup.remove();
    }
}

function showAddCustomerModal() {
    currentCustomerId = null;
    addressCounter = 1;
    document.getElementById('customerModalTitle').textContent = 'Add New Customer';
    document.getElementById('customerForm').reset();
    
    // Clear the addresses container
    const container = document.getElementById('addressesContainer');
    container.innerHTML = '';
    
    document.getElementById('customerModal').classList.add('show');
}

async function editCustomer(customerId) {
    try {
        currentCustomerId = customerId;
        const customer = await window.APIService.getCustomer(customerId);
        
        document.getElementById('customerModalTitle').textContent = 'Edit Customer';
        
        // Populate basic fields
        document.getElementById('customerNameField').value = customer.name || '';
        document.getElementById('customerEmailField').value = customer.email || '';
        document.getElementById('customerPhoneField').value = customer.phone || '';
        document.getElementById('customerType').value = customer.customerType || 'one-time';
        document.getElementById('customerStatus').value = customer.status || 'active';
        document.getElementById('customerNotes').value = customer.notes || '';
        
        // Reset and populate addresses
        addressCounter = 1;
        const container = document.getElementById('addressesContainer');
        container.innerHTML = '';
        
        if (customer.addresses && customer.addresses.length > 0) {
            customer.addresses.forEach((addr, index) => {
                const addressGroup = document.createElement('div');
                addressGroup.className = 'address-group';
                addressGroup.setAttribute('data-address-index', index);
                if (index > 0) {
                    addressGroup.style.marginTop = '20px';
                    addressGroup.style.paddingTop = '20px';
                    addressGroup.style.borderTop = '1px solid #e5e7eb';
                    addressGroup.style.position = 'relative';
                }
                
                addressGroup.innerHTML = `
                    ${index > 0 ? `<button type="button" class="btn-remove-address" onclick="removePhysicalAddress(${index})" style="position: absolute; top: 10px; right: 0; background: #ef4444; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">
                        <i class="fas fa-times"></i> Remove
                    </button>` : ''}
                    <div class="form-group">
                        <label for="customerAddressField_${index}">Address${index > 0 ? ' ' + (index + 1) : ''}</label>
                        <textarea id="customerAddressField_${index}" class="customer-address-field" rows="2">${addr.address || ''}</textarea>
                    </div>
                `;
                
                container.appendChild(addressGroup);
            });
            addressCounter = customer.addresses.length;
        } else {
            // No addresses, show default empty address
            container.innerHTML = `
                <div class="address-group" data-address-index="0">
                    <div class="form-group">
                        <label for="customerAddressField_0">Address</label>
                        <textarea id="customerAddressField_0" class="customer-address-field" rows="2">${customer.address || ''}</textarea>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="customerCity_0">City</label>
                            <input type="text" id="customerCity_0" class="customer-city-field" value="${customer.city || ''}">
                        </div>
                        <div class="form-group">
                            <label for="customerState_0">State</label>
                            <input type="text" id="customerState_0" class="customer-state-field" value="${customer.state || ''}">
                        </div>
                        <div class="form-group">
                            <label for="customerZip_0">Zip Code</label>
                            <input type="text" id="customerZip_0" class="customer-zip-field" value="${customer.zipCode || ''}">
                        </div>
                    </div>
                </div>
            `;
        }
        
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
    
    // Collect all addresses
    const addresses = [];
    
    // First address (index 0) - just the address field
    const address0 = document.getElementById('customerAddressField_0')?.value;
    if (address0) {
        addresses.push({
            label: 'Primary',
            address: address0,
            city: '',
            state: '',
            zipCode: '',
            isPrimary: true
        });
    }
    
    // Additional addresses (inside container)
    const addressGroups = document.querySelectorAll('#addressesContainer .address-group');
    addressGroups.forEach((group) => {
        const addressIndex = group.getAttribute('data-address-index');
        const address = document.getElementById(`customerAddressField_${addressIndex}`)?.value;
        
        if (address) {
            addresses.push({
                label: `Address ${addresses.length + 1}`,
                address: address || '',
                city: '',
                state: '',
                zipCode: '',
                isPrimary: false
            });
        }
    });
    
    const customerData = {
        name: document.getElementById('customerNameField').value,
        email: document.getElementById('customerEmailField').value,
        phone: document.getElementById('customerPhoneField').value,
        customerType: document.getElementById('customerType').value,
        status: document.getElementById('customerStatus').value,
        notes: document.getElementById('customerNotes').value,
        addresses: addresses
    };
    
    // For backward compatibility, set primary address fields
    if (addresses.length > 0) {
        customerData.address = addresses[0].address;
        customerData.city = addresses[0].city;
        customerData.state = addresses[0].state;
        customerData.zipCode = addresses[0].zipCode;
    }
    
    try {
        // Upload documents if any
        if (window.uploadedFiles && window.uploadedFiles.customer && window.uploadedFiles.customer.length > 0) {
            const uploadedDocs = await window.uploadFiles(window.uploadedFiles.customer);
            if (uploadedDocs && uploadedDocs.length > 0) {
                customerData.documents = uploadedDocs;
            }
        }
        
        if (currentCustomerId) {
            await window.APIService.updateCustomer(currentCustomerId, customerData);
            showToast('Customer updated successfully!', 'success');
        } else {
            await window.APIService.createCustomer(customerData);
            showToast('Customer created successfully!', 'success');
        }
        
        // Clear uploaded files
        if (window.uploadedFiles) {
            window.uploadedFiles.customer = [];
        }
        
        closeCustomerModal();
        await refreshCustomers();
    } catch (error) {
        showToast('Failed to save customer: ' + error.message, 'error');
    }
}

async function deleteCustomer(customerId) {
    if (!confirm('Are you sure you want to delete this customer?')) {
        return;
    }
    
    try {
        await window.APIService.deleteCustomer(customerId);
        showToast('Customer deleted successfully!', 'success');
        await refreshCustomers();
    } catch (error) {
        showToast('Failed to delete customer: ' + error.message, 'error');
    }
}

function viewCustomer(customerId) {
    showCustomerProfile(customerId);
}

async function showCustomerProfile(customerId) {
    try {
        const profileData = await window.APIService.getCustomerProfile(customerId);
        
        // Hide customers section, show profile section
        document.getElementById('customers').classList.remove('active');
        document.getElementById('customer-profile').classList.add('active');
        
        // Update menu
        document.querySelectorAll('.menu-item').forEach(mi => mi.classList.remove('active'));
        
        // Populate customer info
        document.getElementById('customerProfileName').textContent = profileData.customer.name;
        document.getElementById('profileEmail').textContent = profileData.customer.email || '-';
        document.getElementById('profilePhone').textContent = profileData.customer.phone || '-';
        
        // Display all addresses
        const addressElement = document.getElementById('profileAddress');
        if (profileData.customer.addresses && profileData.customer.addresses.length > 0) {
            addressElement.innerHTML = profileData.customer.addresses.map((addr, index) => 
                `<div style="margin-bottom: ${index < profileData.customer.addresses.length - 1 ? '10px' : '0'};"><strong>${addr.label || 'Address ' + (index + 1)}:</strong> ${addr.address || '-'}</div>`
            ).join('');
        } else {
            addressElement.textContent = profileData.customer.address || '-';
        }
        
        document.getElementById('profileType').textContent = profileData.customer.customerType || '-';
        document.getElementById('profileStatus').textContent = profileData.customer.status || '-';
        
        // Populate stats
        document.getElementById('profileTotalOrders').textContent = profileData.stats.totalOrders;
        document.getElementById('profileCompletedOrders').textContent = profileData.stats.completedOrders;
        document.getElementById('profileActiveOrders').textContent = profileData.stats.activeOrders;
        document.getElementById('profileTotalSpent').textContent = `$${profileData.stats.totalSpent.toLocaleString()}`;
        
        // Populate orders table
        const ordersBody = document.getElementById('profileOrdersBody');
        if (profileData.orders.length === 0) {
            ordersBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No orders found</td></tr>';
        } else {
            ordersBody.innerHTML = profileData.orders.map(order => {
                const statusDisplay = order.pipelineStage || order.status.replace('-', ' ');
                const statusClass = order.pipelineStage ? 'pipeline' : order.status;
                return `
                <tr>
                    <td><strong>${order.workOrderNumber || '-'}</strong></td>
                    <td>${order.orderId}</td>
                    <td>${order.service}</td>
                    <td><span class="order-status-badge ${statusClass}">${statusDisplay}</span></td>
                    <td>$${order.amount.toLocaleString()}</td>
                    <td>${new Date(order.createdAt).toLocaleDateString()}</td>
                </tr>
            `;
            }).join('');
        }
        
        // Populate documents
        const docsList = document.getElementById('customerDocumentsList');
        if (profileData.customer.documents && profileData.customer.documents.length > 0) {
            docsList.innerHTML = profileData.customer.documents.map(doc => `
                <div class="document-item">
                    <div class="document-info">
                        <div class="document-icon">
                            <i class="fas fa-file-${getDocIcon(doc.name)}"></i>
                        </div>
                        <div class="document-details">
                            <div class="document-name">${doc.name}</div>
                            <div class="document-meta">${formatFileSize(doc.size)} • ${new Date(doc.uploadedAt).toLocaleDateString()}</div>
                        </div>
                    </div>
                    <div class="document-actions">
                        <button class="btn-icon" onclick="downloadDocument('${doc.url}')" title="Download">
                            <i class="fas fa-download"></i>
                        </button>
                        <button class="btn-icon" onclick="viewDocument('${doc.url}')" title="View">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            docsList.innerHTML = '<p class="no-documents">No documents uploaded</p>';
        }
    } catch (error) {
        console.error('Failed to load customer profile:', error);
        showToast('Failed to load customer profile: ' + error.message, 'error');
    }
}

function backToCustomers() {
    document.getElementById('customer-profile').classList.remove('active');
    document.getElementById('customers').classList.add('active');
    
    // Update menu
    document.querySelectorAll('.menu-item').forEach(mi => mi.classList.remove('active'));
    document.querySelector('[data-section="customers"]').parentElement.classList.add('active');
}

function closeCustomerModal() {
    document.getElementById('customerModal').classList.remove('show');
    
    // Re-enable form inputs
    const inputs = document.querySelectorAll('#customerForm input, #customerForm select, #customerForm textarea');
    inputs.forEach(input => input.disabled = false);
    
    document.querySelector('#customerModal .modal-footer .btn-primary').style.display = 'inline-block';
    
    // Clear file input and preview
    const fileInput = document.getElementById('customerDocs');
    const filePreview = document.getElementById('customerDocsPreview');
    if (fileInput) fileInput.value = '';
    if (filePreview) filePreview.innerHTML = '';
    if (window.uploadedFiles) window.uploadedFiles.customer = [];
}

async function refreshCustomers() {
    try {
        const customers = await window.APIService.getCustomers();
        const orders = await window.APIService.getOrders();
        
        // Count orders for each customer
        customers.forEach(customer => {
            customer.totalOrders = orders.filter(order => {
                const customerId = order.customer?._id || order.customer;
                const customerEmail = order.customer?.email;
                return customerId === customer._id || customerEmail === customer.email;
            }).length;
        });
        
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
                <td colspan="8" class="customers-empty-state">
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
        const orders = await window.APIService.getOrders();
        
        // Count orders for each customer
        allCustomers.forEach(customer => {
            customer.totalOrders = orders.filter(order => {
                const customerId = order.customer?._id || order.customer;
                const customerEmail = order.customer?.email;
                return customerId === customer._id || customerEmail === customer.email;
            }).length;
        });
        
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
window.backToCustomers = backToCustomers;
window.addPhysicalAddress = addPhysicalAddress;
window.removePhysicalAddress = removePhysicalAddress;

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
        console.log('loadOrdersSection called');
        if (window.ordersLoading) return; // Prevent duplicate calls
        window.ordersLoading = true;
        
        allOrders = await window.APIService.getOrders();
        console.log('Orders loaded:', allOrders.length);
        window.dashboard.renderOrdersTable(allOrders);
        initializeOrderFilters();
    } catch (error) {
        console.error('Failed to load orders:', error);
        window.dashboard.renderOrdersTable([]);
    } finally {
        window.ordersLoading = false;
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
        
        showToast('Profile updated successfully!', 'success');
        closeProfileModal();
    }).catch(error => {
        console.error('Profile update error:', error);
        showToast('Failed to update profile: ' + error.message, 'error');
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
                showToast('Image size must be less than 2MB', 'error');
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

// Vendor Detail Functions
async function showVendorDetail(vendorId) {
    try {
        const vendor = await window.APIService.getVendor(vendorId);
        
        document.getElementById('vendorDetailName').textContent = vendor.name;
        document.getElementById('detailVendorEmail').textContent = vendor.email || '-';
        document.getElementById('detailVendorPhone').textContent = vendor.phone || '-';
        document.getElementById('detailVendorCategory').textContent = vendor.category || '-';
        document.getElementById('detailVendorRating').innerHTML = '⭐'.repeat(vendor.rating || 0);
        document.getElementById('detailVendorAddress').textContent = vendor.address || '-';
        document.getElementById('detailVendorStatus').innerHTML = vendor.isActive 
            ? '<span style="color: #22c55e;">Active</span>' 
            : '<span style="color: #ef4444;">Inactive</span>';
        
        const docsList = document.getElementById('vendorDocumentsList');
        if (vendor.documents && vendor.documents.length > 0) {
            docsList.innerHTML = vendor.documents.map(doc => `
                <div class="document-item">
                    <div class="document-info">
                        <div class="document-icon">
                            <i class="fas fa-file-${getDocIcon(doc.name)}"></i>
                        </div>
                        <div class="document-details">
                            <div class="document-name">${doc.name}</div>
                            <div class="document-meta">${formatFileSize(doc.size)} • ${new Date(doc.uploadedAt).toLocaleDateString()}</div>
                        </div>
                    </div>
                    <div class="document-actions">
                        <button class="btn-icon" onclick="downloadDocument('${doc.url}')" title="Download">
                            <i class="fas fa-download"></i>
                        </button>
                        <button class="btn-icon" onclick="viewDocument('${doc.url}')" title="View">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            docsList.innerHTML = '<p class="no-documents">No documents uploaded</p>';
        }
        
        const orders = await window.APIService.getOrders();
        const vendorOrders = orders.filter(order => order.vendor && (order.vendor._id === vendorId || order.vendor === vendorId));
        
        // Calculate financial summary
        const totalValue = vendorOrders.reduce((sum, order) => sum + (order.amount || 0), 0);
        const totalCost = vendorOrders.reduce((sum, order) => sum + (order.vendorCost || 0), 0);
        const totalProfit = totalValue - totalCost;
        
        document.getElementById('vendorTotalValue').textContent = `$${totalValue.toLocaleString()}`;
        document.getElementById('vendorTotalCost').textContent = `$${totalCost.toLocaleString()}`;
        document.getElementById('vendorTotalProfit').textContent = `$${totalProfit.toLocaleString()}`;
        
        const ordersList = document.getElementById('vendorOrdersList');
        if (vendorOrders.length > 0) {
            ordersList.innerHTML = vendorOrders.map(order => `
                <div class="order-item">
                    <div class="order-info">
                        <div class="order-header">
                            <strong>${order.orderId || '#' + order._id.substring(0, 8).toUpperCase()}</strong>
                            <span class="order-status-badge ${order.status}">${order.status.replace('-', ' ')}</span>
                        </div>
                        <div class="order-details">
                            <span><i class="fas fa-user"></i> ${order.customer?.name || order.customer}</span>
                            <span><i class="fas fa-wrench"></i> ${order.service}</span>
                            <span><i class="fas fa-dollar-sign"></i> $${order.amount?.toLocaleString() || '0'}</span>
                            <span><i class="fas fa-calendar"></i> ${order.startDate ? new Date(order.startDate).toLocaleDateString() : 'N/A'}</span>
                        </div>
                    </div>
                    <button class="btn-icon" onclick="viewOrder('${order._id}')" title="View Order">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
            `).join('');
        } else {
            ordersList.innerHTML = '<p class="no-orders">No orders assigned</p>';
        }
        
        showSection('vendor-detail');
    } catch (error) {
        console.error('Failed to load vendor details:', error);
        showToast('Failed to load vendor details: ' + error.message, 'error');
    }
}

function backToVendors() {
    showSection('vendors');
}

function getDocIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (['doc', 'docx'].includes(ext)) return 'word';
    if (['jpg', 'jpeg', 'png'].includes(ext)) return 'image';
    return 'alt';
}

function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function downloadDocument(url) {
    window.open('http://localhost:10000' + url, '_blank');
}

function viewDocument(url) {
    window.open('http://localhost:10000' + url, '_blank');
}

window.showVendorDetail = showVendorDetail;
window.backToVendors = backToVendors;
window.downloadDocument = downloadDocument;
window.viewDocument = viewDocument;

// Global showSection function
window.showSection = function(sectionId) {
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
    }
};
