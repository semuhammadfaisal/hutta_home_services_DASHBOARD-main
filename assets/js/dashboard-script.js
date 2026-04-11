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
                } else if (targetSection === 'users') {
                    loadUsersSection();
                } else if (targetSection === 'recurring-calendar') {
                    loadRecurringCalendarSection();
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
            
            // Always load fresh data - no caching for real-time pipeline updates
            // Clear APIService cache first to ensure fresh data
            if (window.APIService && window.APIService.clearCache) {
                window.APIService.clearCache();
            }
            
            const [orders, vendors, employees, customers, payments, kpi] = await Promise.all([
                window.APIService.getOrdersFresh().catch(err => { console.error('Orders error:', err); return []; }),
                window.APIService.getVendors().catch(() => []),
                window.APIService.getEmployees().catch(() => []),
                window.APIService.getCustomers().catch(() => []),
                window.APIService.getPayments().catch(() => []),
                window.APIService.getPaymentsCollected().catch(() => ({ paymentsCollected: 0 }))
            ]);
            
            console.log('Dashboard data loaded:', { orders: orders.length, vendors: vendors.length, employees: employees.length, customers: customers.length });
            
            if (orders.length === 0 && vendors.length === 0 && employees.length === 0 && customers.length === 0) {
                console.warn('⚠️ All data arrays are empty - possible server connection issue');
                console.log('API Base URL:', window.APIService.baseURL);
                console.log('Token available:', !!window.APIService.getToken());
            }
            
            const totalRevenue = orders.reduce((sum, order) => sum + (order.amount || 0), 0);
            const paymentsCollected = kpi.paymentsCollected || 0;
            
            const stats = {
                totalOrders: orders.length,
                totalRevenue: totalRevenue,
                paymentsCollected: paymentsCollected,
                totalVendors: vendors.length,
                totalCustomers: customers.length
            };
            
            // Render all sections with fresh data
            this.renderKPIs(stats);
            this.renderVendorCategories(vendors);
            this.renderEmployeeLeaderboard(orders, employees);
            this.renderFinancialOverview(orders, payments);
            this.renderWorkflowFromOrders(orders);
            this.renderOrdersTable(orders);
            this.renderRecentActivity(orders);
            
            console.log('Dashboard rendered with fresh data');
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
        
        // Cache valid for 2 minutes (reduced from 5 minutes for more frequent updates)
        if (age < 2 * 60 * 1000) {
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

    clearCache() {
        sessionStorage.removeItem('dashboardCache');
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
        const totalRevenueEl = document.getElementById('totalRevenue');
        const paymentsCollectedEl = document.getElementById('paymentsCollected');
        const totalVendorsEl = document.getElementById('totalVendors');
        const totalCustomersEl = document.getElementById('totalCustomers');
        
        if (stats) {
            if (totalOrdersEl) totalOrdersEl.textContent = stats.totalOrders || 0;
            if (totalRevenueEl) totalRevenueEl.textContent = `$${(stats.totalRevenue || 0).toLocaleString()}`;
            if (paymentsCollectedEl) paymentsCollectedEl.textContent = `$${(stats.paymentsCollected || 0).toLocaleString()}`;
            if (totalVendorsEl) totalVendorsEl.textContent = stats.totalVendors || 0;
            if (totalCustomersEl) totalCustomersEl.textContent = stats.totalCustomers || 0;
        } else {
            if (totalOrdersEl) totalOrdersEl.textContent = '0';
            if (totalRevenueEl) totalRevenueEl.textContent = '$0';
            if (paymentsCollectedEl) paymentsCollectedEl.textContent = '$0';
            if (totalVendorsEl) totalVendorsEl.textContent = '0';
            if (totalCustomersEl) totalCustomersEl.textContent = '0';
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
                    <td colspan="11" class="orders-empty-state">
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
                            <div class="order-number" style="display: flex; align-items: center; gap: 8px;">
                                <span>${orderNumber}</span>
                                <button class="btn-copy-order-id" onclick="copyOrderId('${orderNumber}')" title="Copy Order ID" style="background: none; border: none; color: #6b7280; cursor: pointer; padding: 4px; border-radius: 4px; transition: all 0.2s;">
                                    <i class="fas fa-copy" style="font-size: 12px;"></i>
                                </button>
                            </div>
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
                <td><span class="order-amount" style="color: #10b981; font-weight: 600;">$${order.amount?.toLocaleString() || '0'}</span></td>
                <td><span class="order-cost" style="color: #ef4444; font-weight: 600;">$${order.vendorCost?.toLocaleString() || '0'}</span></td>
                <td><span class="order-profit" style="color: #3b82f6; font-weight: 600;">$${((order.amount || 0) - (order.vendorCost || 0)).toLocaleString()}</span></td>
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

    renderEmployeeLeaderboard(orders, employees) {
        const leaderboardContainer = document.getElementById('employeeLeaderboard');
        
        if (!leaderboardContainer) return;
        
        if (!orders || orders.length === 0 || !employees || employees.length === 0) {
            leaderboardContainer.innerHTML = `
                <div class="leaderboard-empty">
                    <i class="fas fa-users"></i>
                    <p>No employee data available</p>
                </div>
            `;
            return;
        }
        
        // Calculate revenue for each employee
        const employeeStats = employees.map(employee => {
            const employeeOrders = orders.filter(order => 
                order.employee && 
                (order.employee._id === employee._id || order.employee === employee._id)
            );
            
            const totalRevenue = employeeOrders.reduce((sum, order) => sum + (order.amount || 0), 0);
            const orderCount = employeeOrders.length;
            
            return {
                id: employee._id,
                name: employee.name,
                revenue: totalRevenue,
                orderCount: orderCount
            };
        });
        
        // Sort by revenue (descending) and take top 5
        const topEmployees = employeeStats
            .filter(emp => emp.revenue > 0)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);
        
        if (topEmployees.length === 0) {
            leaderboardContainer.innerHTML = `
                <div class="leaderboard-empty">
                    <i class="fas fa-chart-line"></i>
                    <p>No revenue data yet</p>
                </div>
            `;
            return;
        }
        
        // Render leaderboard
        leaderboardContainer.innerHTML = topEmployees.map((employee, index) => {
            const rank = index + 1;
            const rankClass = rank <= 3 ? `rank-${rank}` : '';
            
            return `
                <div class="leaderboard-item ${rankClass}">
                    <div class="rank">${rank}</div>
                    <div class="employee-info">
                        <div class="employee-name">${employee.name}</div>
                        <div class="employee-stats">
                            <span class="revenue-amount">$${employee.revenue.toLocaleString()}</span>
                            <span class="order-count">${employee.orderCount} order${employee.orderCount !== 1 ? 's' : ''}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
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
        const revenueEl = document.getElementById('financialRevenue');
        const costEl = document.getElementById('financialCost');
        const profitEl = document.getElementById('financialProfit');
        const periodLabel = document.getElementById('financialPeriodLabel');
        
        // Get date range from inputs
        const startDateInput = document.getElementById('financialStartDate');
        const endDateInput = document.getElementById('financialEndDate');
        
        let filteredOrders = orders;
        let periodText = 'All Time';
        
        if (startDateInput && endDateInput && startDateInput.value && endDateInput.value) {
            const startDate = new Date(startDateInput.value);
            const endDate = new Date(endDateInput.value);
            endDate.setHours(23, 59, 59, 999);
            
            filteredOrders = orders.filter(order => {
                const orderDate = new Date(order.createdAt);
                return orderDate >= startDate && orderDate <= endDate;
            });
            
            periodText = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
        }
        
        const totalRevenue = filteredOrders.reduce((sum, order) => sum + (order.amount || 0), 0);
        const totalCost = filteredOrders.reduce((sum, order) => sum + (order.vendorCost || 0), 0);
        const totalProfit = totalRevenue - totalCost;
        
        if (revenueEl) revenueEl.textContent = `$${totalRevenue.toLocaleString()}`;
        if (costEl) costEl.textContent = `$${totalCost.toLocaleString()}`;
        if (profitEl) profitEl.textContent = `$${totalProfit.toLocaleString()}`;
        if (periodLabel) periodLabel.textContent = periodText;
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

// Global function to test pipeline refresh
window.testPipelineRefresh = function() {
    console.log('=== TESTING PIPELINE REFRESH ===');
    console.log('Dashboard object:', window.dashboard);
    console.log('Refresh functions available:', {
        refreshDashboard: typeof window.refreshDashboard,
        refreshDashboardKPIs: typeof window.refreshDashboardKPIs,
        onPipelineStageChange: typeof window.onPipelineStageChange,
        forceRefreshDashboard: typeof window.forceRefreshDashboard
    });
    
    // Simulate pipeline stage change
    console.log('Simulating pipeline stage change...');
    if (window.onPipelineStageChange) {
        window.onPipelineStageChange();
    } else {
        console.error('onPipelineStageChange function not found!');
    }
};

// Global function to manually refresh KPIs
window.manualRefreshKPIs = async function() {
    console.log('=== MANUAL KPI REFRESH ===');
    if (window.dashboard) {
        // Clear cache first
        if (window.dashboard.clearCache) {
            console.log('Clearing cache...');
            window.dashboard.clearCache();
        }
        console.log('Calling dashboard.renderDashboard()...');
        await window.dashboard.renderDashboard();
        console.log('Manual refresh complete');
    } else {
        console.error('Dashboard object not found!');
    }
};

// Global function to force refresh dashboard with fresh data
window.forceRefreshDashboard = async function() {
    console.log('=== FORCE REFRESH DASHBOARD ===');
    if (window.dashboard) {
        // Clear any cached data
        if (window.dashboard.clearCache) {
            window.dashboard.clearCache();
        }
        
        // Force fresh data load
        await window.dashboard.renderDashboard();
        console.log('Dashboard force refreshed');
    } else {
        console.error('Dashboard object not found!');
    }
};

// Global function to check current order data
window.checkOrderData = async function() {
    console.log('=== CHECKING ORDER DATA ===');
    
    // Clear APIService cache first
    if (window.APIService && window.APIService.clearCache) {
        console.log('Clearing APIService cache before check...');
        window.APIService.clearCache();
    }
    
    try {
        const orders = await window.APIService.getOrders();
        console.log('Total orders:', orders.length);
        
        // Show all orders with their pipeline stages
        console.log('All orders with pipeline info:');
        orders.forEach((order, index) => {
            console.log(`Order ${index + 1}:`, {
                id: order._id,
                orderId: order.orderId,
                customer: order.customer?.name || order.customer,
                amount: order.amount,
                pipelineStage: order.pipelineStage,
                pipelineRecordId: order.pipelineRecordId,
                status: order.status
            });
        });
        
        const paidOrders = orders.filter(order => order.pipelineStage === 'Paid');
        console.log('Orders in Paid stage:', paidOrders.length);
        console.log('Paid orders:', paidOrders.map(o => ({ id: o._id, amount: o.amount, stage: o.pipelineStage })));
        
        const paymentsCollected = paidOrders.reduce((sum, order) => sum + (order.amount || 0), 0);
        console.log('Calculated payments collected:', paymentsCollected);
        
        const unpaidOrders = orders.filter(order => order.pipelineStage !== 'Paid');
        console.log('Unpaid orders:', unpaidOrders.length);
        console.log('Unpaid orders:', unpaidOrders.map(o => ({ id: o._id, amount: o.amount, stage: o.pipelineStage || 'no stage' })));
        
        const pendingPayments = unpaidOrders.reduce((sum, order) => sum + (order.amount || 0), 0);
        console.log('Calculated pending payments:', pendingPayments);
        
        // Also check pipeline records
        console.log('\n=== CHECKING PIPELINE RECORDS ===');
        const response = await fetch('/api/pipeline-records');
        const pipelineRecords = await response.json();
        console.log('Total pipeline records:', pipelineRecords.length);
        pipelineRecords.forEach((record, index) => {
            console.log(`Pipeline Record ${index + 1}:`, {
                id: record._id,
                orderId: record.orderId,
                customerName: record.customerName,
                stageId: record.stageId
            });
        });
        
        // Check stages
        console.log('\n=== CHECKING STAGES ===');
        const stagesResponse = await fetch('/api/stages');
        const stages = await stagesResponse.json();
        console.log('Stages:', stages.map(s => ({ id: s._id, name: s.name })));
        
        return { orders, paidOrders, paymentsCollected, pendingPayments, pipelineRecords, stages };
    } catch (error) {
        console.error('Error checking order data:', error);
    }
};

// Global refresh dashboard function - force immediate refresh
window.refreshDashboard = async function() {
    if (window.dashboard) {
        console.log('Force refreshing dashboard...');
        // Clear cache to ensure fresh data
        if (window.dashboard.clearCache) {
            window.dashboard.clearCache();
        }
        await window.dashboard.renderDashboard();
    }
};

// Global function to refresh dashboard when pipeline changes - immediate refresh
window.refreshDashboardKPIs = async function() {
    if (window.dashboard) {
        console.log('Refreshing dashboard KPIs due to pipeline change...');
        // Clear cache to ensure fresh data
        if (window.dashboard.clearCache) {
            window.dashboard.clearCache();
        }
        await window.dashboard.renderDashboard();
    }
};

// Function to refresh dashboard from pipeline system
window.onPipelineStageChange = async function() {
    console.log('Pipeline stage changed - refreshing dashboard...');
    if (window.dashboard) {
        // Clear cache to ensure fresh data
        if (window.dashboard.clearCache) {
            window.dashboard.clearCache();
        }
        await window.dashboard.renderDashboard();
    }
};

// Loading Overlay Functions
function showLoading(message = 'Loading...') {
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div style="text-align: center;">
                <div class="loading-spinner"></div>
                <div class="loading-text" id="loadingText">${message}</div>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    const loadingText = document.getElementById('loadingText');
    if (loadingText) loadingText.textContent = message;
    setTimeout(() => overlay.classList.add('show'), 10);
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.remove('show');
    }
}

function updateLoadingMessage(message) {
    const loadingText = document.getElementById('loadingText');
    if (loadingText) loadingText.textContent = message;
}

// Button Loading State
function setButtonLoading(button, loading = true) {
    if (loading) {
        button.classList.add('loading');
        button.disabled = true;
        button.dataset.originalText = button.innerHTML;
    } else {
        button.classList.remove('loading');
        button.disabled = false;
        if (button.dataset.originalText) {
            button.innerHTML = button.dataset.originalText;
        }
    }
}

// Table Loading State
function setTableLoading(tableContainer, loading = true) {
    if (loading) {
        tableContainer.classList.add('table-loading');
    } else {
        tableContainer.classList.remove('table-loading');
    }
}

// Card Loading State
function setCardLoading(card, loading = true) {
    if (loading) {
        card.classList.add('card-loading');
    } else {
        card.classList.remove('card-loading');
    }
}

// Global loading functions
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.updateLoadingMessage = updateLoadingMessage;
window.setButtonLoading = setButtonLoading;
window.setTableLoading = setTableLoading;
window.setCardLoading = setCardLoading;

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on the dashboard page
    if (!window.location.pathname.includes('admin-dashboard')) {
        return;
    }
    
    // Set current date in the header
    const currentDateElement = document.getElementById('currentDate');
    if (currentDateElement) {
        const today = new Date();
        const options = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        };
        currentDateElement.textContent = today.toLocaleDateString('en-US', options);
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
        populateCustomerSelectOptions();
    } catch (error) {
        console.error('Failed to load customers:', error);
    }
}

function populateCustomerSelectOptions() {
    const dropdown = document.getElementById('customerSelectDropdown');
    
    // Clear existing options except search input and "Add New Customer"
    const searchContainer = dropdown.querySelector('.search-input-container');
    const addNewOption = dropdown.querySelector('[data-value="new"]');
    dropdown.innerHTML = '';
    dropdown.appendChild(searchContainer);
    dropdown.appendChild(addNewOption);
    
    // Add customer options
    orderCustomers.forEach(customer => {
        const option = document.createElement('div');
        option.className = 'select-option';
        option.setAttribute('data-value', customer._id);
        option.innerHTML = `<i class="fas fa-user"></i> ${customer.name} (${customer.email})`;
        
        // Simple click handler that directly sets the value
        option.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            console.log('Customer clicked:', customer.name);
            
            // Set the input value to show only customer name
            const input = document.getElementById('customerSearchInput');
            const hiddenSelect = document.getElementById('customerSelect');
            
            // Show only the customer name in the input field
            input.value = customer.name;
            hiddenSelect.value = customer._id;
            
            // Trigger change events
            input.dispatchEvent(new Event('change', { bubbles: true }));
            hiddenSelect.dispatchEvent(new Event('change', { bubbles: true }));
            
            console.log('Set input to:', input.value);
            console.log('Set hidden select to:', hiddenSelect.value);
            
            // Close dropdown
            dropdown.classList.remove('show');
            document.querySelector('.searchable-select').classList.remove('open');
            
            // Handle customer selection
            handleCustomerSelect();
        };
        
        dropdown.appendChild(option);
    });
    
    // Add event listener for "Add New Customer" option
    addNewOption.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('Add New Customer clicked');
        
        const input = document.getElementById('customerSearchInput');
        const hiddenSelect = document.getElementById('customerSelect');
        
        input.value = 'Add New Customer';
        hiddenSelect.value = 'new';
        
        // Trigger change events
        input.dispatchEvent(new Event('change', { bubbles: true }));
        hiddenSelect.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Close dropdown
        dropdown.classList.remove('show');
        document.querySelector('.searchable-select').classList.remove('open');
        
        // Handle customer selection
        handleCustomerSelect();
    };
}

function filterCustomerOptions(searchTerm) {
    const dropdown = document.getElementById('customerSelectDropdown');
    const searchContainer = dropdown.querySelector('.search-input-container');
    const addNewOption = dropdown.querySelector('[data-value="new"]');
    
    if (!searchTerm.trim()) {
        populateCustomerSelectOptions();
        return;
    }
    
    const filtered = orderCustomers.filter(customer => 
        customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    // Clear and rebuild options while preserving search input focus
    const currentFocus = document.activeElement;
    const isSearchFocused = currentFocus && currentFocus.id === 'customerSearchFilter';
    
    dropdown.innerHTML = '';
    dropdown.appendChild(searchContainer);
    dropdown.appendChild(addNewOption);
    
    // Restore focus if it was on search input
    if (isSearchFocused) {
        setTimeout(() => {
            const searchFilter = document.getElementById('customerSearchFilter');
            if (searchFilter) {
                searchFilter.focus();
                // Set cursor to end of input
                searchFilter.setSelectionRange(searchFilter.value.length, searchFilter.value.length);
            }
        }, 0);
    }
    
    filtered.forEach(customer => {
        const option = document.createElement('div');
        option.className = 'select-option';
        option.setAttribute('data-value', customer._id);
        option.innerHTML = `<i class="fas fa-user"></i> ${customer.name} (${customer.email})`;
        
        // Simple click handler that directly sets the value
        option.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            console.log('Filtered customer clicked:', customer.name);
            
            // Set the input value to show only customer name
            const input = document.getElementById('customerSearchInput');
            const hiddenSelect = document.getElementById('customerSelect');
            
            // Show only the customer name in the input field
            input.value = customer.name;
            hiddenSelect.value = customer._id;
            
            // Trigger change events
            input.dispatchEvent(new Event('change', { bubbles: true }));
            hiddenSelect.dispatchEvent(new Event('change', { bubbles: true }));
            
            console.log('Set input to:', input.value);
            console.log('Set hidden select to:', hiddenSelect.value);
            
            // Close dropdown
            dropdown.classList.remove('show');
            document.querySelector('.searchable-select').classList.remove('open');
            
            // Handle customer selection
            handleCustomerSelect();
        };
        
        dropdown.appendChild(option);
    });
    
    // Re-add event listener for "Add New Customer" option
    addNewOption.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('Add New Customer clicked (filtered)');
        
        const input = document.getElementById('customerSearchInput');
        const hiddenSelect = document.getElementById('customerSelect');
        
        input.value = 'Add New Customer';
        hiddenSelect.value = 'new';
        
        // Trigger change events
        input.dispatchEvent(new Event('change', { bubbles: true }));
        hiddenSelect.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Close dropdown
        dropdown.classList.remove('show');
        document.querySelector('.searchable-select').classList.remove('open');
        
        // Handle customer selection
        handleCustomerSelect();
    };
    
    if (filtered.length === 0) {
        const noResults = document.createElement('div');
        noResults.className = 'select-option';
        noResults.style.color = '#6b7280';
        noResults.style.cursor = 'default';
        noResults.innerHTML = '<i class="fas fa-search"></i> No customers found';
        dropdown.appendChild(noResults);
    }
}

function toggleCustomerDropdown(event) {
    if (event) {
        event.stopPropagation();
    }
    
    const dropdown = document.getElementById('customerSelectDropdown');
    const container = document.querySelector('.searchable-select');
    
    if (dropdown.classList.contains('show')) {
        // Hide dropdown
        dropdown.classList.remove('show');
        container.classList.remove('open');
        
        // Clear search filter
        const searchFilter = document.getElementById('customerSearchFilter');
        if (searchFilter) {
            searchFilter.value = '';
            filterCustomerOptions(''); // Reset to show all options
        }
        
        // Remove click outside listener
        document.removeEventListener('click', handleOutsideClick);
    } else {
        // Show dropdown
        dropdown.classList.add('show');
        container.classList.add('open');
        
        // Focus on search input inside dropdown after a short delay
        setTimeout(() => {
            const searchFilter = document.getElementById('customerSearchFilter');
            if (searchFilter) {
                searchFilter.focus();
            }
        }, 100);
        
        // Add click outside listener after a delay to prevent immediate closing
        setTimeout(() => {
            document.addEventListener('click', handleOutsideClick);
        }, 150);
    }
}



function handleOutsideClick(event) {
    const container = document.querySelector('.searchable-select');
    
    // Check if click is outside the searchable-select container
    if (container && !container.contains(event.target)) {
        const dropdown = document.getElementById('customerSelectDropdown');
        dropdown.classList.remove('show');
        container.classList.remove('open');
        
        // Clear search filter
        const searchFilter = document.getElementById('customerSearchFilter');
        if (searchFilter) {
            searchFilter.value = '';
            filterCustomerOptions(''); // Reset to show all options
        }
        
        // Remove this listener
        document.removeEventListener('click', handleOutsideClick);
    }
}

window.filterCustomerOptions = filterCustomerOptions;
window.toggleCustomerDropdown = toggleCustomerDropdown;

function handleCustomerSelect() {
    const hiddenSelect = document.getElementById('customerSelect');
    const newCustomerFields = document.getElementById('newCustomerFields');
    const customerAddressSelection = document.getElementById('customerAddressSelection');
    const selectedValue = hiddenSelect.value;
    
    console.log('handleCustomerSelect called with value:', selectedValue);
    
    if (selectedValue === 'new' || selectedValue === '') {
        console.log('Showing new customer fields');
        // Show new customer fields
        newCustomerFields.style.display = 'block';
        customerAddressSelection.style.display = 'none';
        
        // Clear fields
        document.getElementById('customerName').value = '';
        document.getElementById('customerEmail').value = '';
        document.getElementById('customerPhone').value = '';
        document.getElementById('customerAddress').value = '';
        
        // Make fields required
        document.getElementById('customerName').required = true;
        document.getElementById('customerEmail').required = true;
        document.getElementById('customerAddressSelect').required = false;
    } else {
        console.log('Showing address selection for existing customer');
        // Hide new customer fields and show address selection
        const customer = orderCustomers.find(c => c._id === selectedValue);
        console.log('Found customer:', customer);
        
        if (customer) {
            newCustomerFields.style.display = 'none';
            customerAddressSelection.style.display = 'block';
            
            // Populate customer info (these fields will be used when saving)
            document.getElementById('customerName').value = customer.name;
            document.getElementById('customerEmail').value = customer.email;
            document.getElementById('customerPhone').value = customer.phone || '';
            
            // Make fields not required but keep them filled
            document.getElementById('customerName').required = false;
            document.getElementById('customerEmail').required = false;
            document.getElementById('customerAddressSelect').required = false;
            
            // Populate address dropdown
            populateCustomerAddresses(customer);
        } else {
            console.error('Customer not found in orderCustomers array');
        }
    }
}

function populateCustomerAddresses(customer) {
    const addressSelect = document.getElementById('customerAddressSelect');
    addressSelect.innerHTML = '<option value="">-- Select Address --</option>';
    
    // Add addresses from addresses array (preferred method)
    if (customer.addresses && customer.addresses.length > 0) {
        customer.addresses.forEach((addr, index) => {
            if (addr.address) {
                const addressOption = document.createElement('option');
                addressOption.value = JSON.stringify({
                    address: addr.address,
                    city: addr.city || '',
                    state: addr.state || '',
                    zipCode: addr.zipCode || '',
                    label: addr.label || `Address ${index + 1}`
                });
                
                const displayText = `${addr.label || `Address ${index + 1}`}: ${addr.address}`;
                addressOption.textContent = displayText;
                addressSelect.appendChild(addressOption);
            }
        });
    } else if (customer.address) {
        // Fallback: Add primary address only if addresses array is empty (backward compatibility)
        const addressOption = document.createElement('option');
        addressOption.value = JSON.stringify({
            address: customer.address,
            city: customer.city || '',
            state: customer.state || '',
            zipCode: customer.zipCode || '',
            label: 'Primary Address'
        });
        addressOption.textContent = `Primary Address: ${customer.address}`;
        addressSelect.appendChild(addressOption);
    }
    
    // If no addresses found, show message
    if (addressSelect.children.length === 1) {
        const noAddressOption = document.createElement('option');
        noAddressOption.value = '';
        noAddressOption.textContent = 'No addresses found for this customer';
        noAddressOption.disabled = true;
        addressSelect.appendChild(noAddressOption);
    }
}

window.handleCustomerSelect = handleCustomerSelect;

function showAddOrderModal() {
    currentOrderId = null;
    document.getElementById('orderModalTitle').textContent = 'Add New Order';
    document.getElementById('orderForm').reset();
    
    // Reset customer search and hide address selection
    document.getElementById('customerSearchInput').value = '-- Select Existing Customer --';
    document.getElementById('customerSelect').value = '';
    document.getElementById('newCustomerFields').style.display = 'block';
    document.getElementById('customerAddressSelection').style.display = 'none';
    document.getElementById('customerSelectDropdown').classList.remove('show');
    document.querySelector('.searchable-select').classList.remove('open');
    
    // Reset search filter
    const searchFilter = document.getElementById('customerSearchFilter');
    if (searchFilter) {
        searchFilter.value = '';
    }
    
    // Reset required fields
    document.getElementById('customerName').required = true;
    document.getElementById('customerAddressSelect').required = false;
    
    // Make customer fields editable (remove read-only)
    document.getElementById('customerName').readOnly = false;
    document.getElementById('customerEmail').readOnly = false;
    document.getElementById('customerPhone').readOnly = false;
    document.getElementById('customerAddress').readOnly = false;
    
    // Enable customer selection dropdown
    document.getElementById('customerSearchInput').disabled = false;
    document.getElementById('customerSearchInput').style.cursor = '';
    document.getElementById('customerSearchInput').style.backgroundColor = '';
    
    // Remove read-only styling
    document.getElementById('customerName').style.cssText = '';
    document.getElementById('customerEmail').style.cssText = '';
    document.getElementById('customerPhone').style.cssText = '';
    document.getElementById('customerAddress').style.cssText = '';
    
    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('startDate').value = today;
    
    // Reset order type and recurring fields
    document.getElementById('orderType').value = 'one-time';
    document.getElementById('recurringFrequency').value = 'weekly';
    document.getElementById('recurringEndDate').value = '';
    document.getElementById('recurringNotes').value = '';
    toggleRecurringFields(); // Hide recurring fields by default
    
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
        
        // Populate form - make customer fields read-only
        document.getElementById('customerSelect').value = 'new';
        document.getElementById('newCustomerFields').style.display = 'block';
        document.getElementById('customerName').value = order.customer.name || '';
        document.getElementById('customerEmail').value = order.customer.email || '';
        document.getElementById('customerPhone').value = order.customer.phone || '';
        document.getElementById('customerAddress').value = order.customer.address || '';
        
        // Make customer fields read-only
        document.getElementById('customerName').readOnly = true;
        document.getElementById('customerEmail').readOnly = true;
        document.getElementById('customerPhone').readOnly = true;
        document.getElementById('customerAddress').readOnly = true;
        
        // Disable customer selection dropdown
        document.getElementById('customerSearchInput').disabled = true;
        document.getElementById('customerSearchInput').style.cursor = 'not-allowed';
        document.getElementById('customerSearchInput').style.backgroundColor = '#f3f4f6';
        
        // Add visual styling to indicate read-only
        const readOnlyStyle = 'background-color: #f3f4f6; cursor: not-allowed;';
        document.getElementById('customerName').style.cssText = readOnlyStyle;
        document.getElementById('customerEmail').style.cssText = readOnlyStyle;
        document.getElementById('customerPhone').style.cssText = readOnlyStyle;
        document.getElementById('customerAddress').style.cssText = readOnlyStyle;
        
        document.getElementById('service').value = order.service || '';
        document.getElementById('amount').value = order.amount || '';
        document.getElementById('vendorCost').value = order.vendorCost || '';
        document.getElementById('processingFee').value = order.processingFee || '';
        document.getElementById('profit').value = order.profit || '';
        document.getElementById('startDate').value = order.startDate ? order.startDate.split('T')[0] : '';
        document.getElementById('endDate').value = order.endDate ? order.endDate.split('T')[0] : '';
        document.getElementById('status').value = order.status || 'new';
        document.getElementById('priority').value = order.priority || 'medium';
        document.getElementById('description').value = order.description || '';
        document.getElementById('notes').value = order.notes || '';
        
        // Populate recurring order fields
        document.getElementById('orderType').value = order.orderType || 'one-time';
        
        // Trigger toggle to show/hide recurring fields
        toggleRecurringFields();
        
        // If recurring order, populate recurring fields
        if (order.orderType === 'recurring') {
            document.getElementById('recurringFrequency').value = order.recurringFrequency || 'weekly';
            document.getElementById('recurringEndDate').value = order.recurringEndDate ? order.recurringEndDate.split('T')[0] : '';
            document.getElementById('recurringNotes').value = order.recurringNotes || '';
        }
        
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
    
    // Check if we're editing a pipeline record
    const isPipelineEdit = window.currentPipelineRecordId && !currentOrderId;
    
    // Show button loading state
    setButtonLoading(saveBtn, true);
    showLoading(currentOrderId ? 'Updating order...' : (isPipelineEdit ? 'Updating pipeline record...' : 'Creating order...'));
    
    // Determine customer data based on selection
    let customerData;
    const hiddenSelect = document.getElementById('customerSelect');
    const selectedCustomerId = hiddenSelect.value;
    
    if (selectedCustomerId && selectedCustomerId !== 'new') {
        // Existing customer - get selected address (optional now)
        const addressSelect = document.getElementById('customerAddressSelect');
        const selectedAddressData = addressSelect.value;
        
        // Address selection is now optional - use customer's primary address if none selected
        const customer = orderCustomers.find(c => c._id === selectedCustomerId);
        
        if (selectedAddressData) {
            // Use selected address
            const addressInfo = JSON.parse(selectedAddressData);
            customerData = {
                name: customer.name,
                email: customer.email,
                phone: customer.phone || '',
                address: addressInfo.address,
                city: addressInfo.city || '',
                state: addressInfo.state || '',
                zipCode: addressInfo.zipCode || '',
                selectedAddressLabel: addressInfo.label
            };
        } else {
            // Use customer's primary address
            customerData = {
                name: customer.name,
                email: customer.email,
                phone: customer.phone || '',
                address: customer.address || '',
                city: customer.city || '',
                state: customer.state || '',
                zipCode: customer.zipCode || ''
            };
        }
    } else {
        // New customer
        customerData = {
            name: document.getElementById('customerName').value,
            email: document.getElementById('customerEmail').value,
            phone: document.getElementById('customerPhone').value || '',
            address: document.getElementById('customerAddress').value || ''
        };
    }
    
    // If editing pipeline record, update it instead of creating/updating order
    if (isPipelineEdit) {
        try {
            const pipelineData = {
                customerName: customerData.name,
                email: customerData.email,
                phone: customerData.phone,
                address: customerData.address,
                priority: document.getElementById('priority').value || 'medium',
                budget: parseFloat(document.getElementById('amount').value) || 0,
                startDate: document.getElementById('startDate').value,
                description: document.getElementById('description').value || '',
                notes: document.getElementById('notes').value || ''
            };
            
            const response = await fetch(`${window.API_BASE_URL || 'http://localhost:3000/api'}/pipeline-records/${window.currentPipelineRecordId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pipelineData)
            });
            
            if (!response.ok) throw new Error('Failed to update pipeline record');
            
            showToast('Pipeline record updated successfully!', 'success');
            closeOrderModal();
            
            // Store the record ID to reopen view modal
            const recordIdToView = window.currentPipelineRecordId;
            
            // Clear pipeline record ID
            window.currentPipelineRecordId = null;
            
            // Refresh pipeline
            if (typeof window.loadDataFromDB === 'function') {
                await window.loadDataFromDB();
            }
            
            // Reopen the view modal with updated data
            if (typeof window.viewRecord === 'function') {
                setTimeout(() => {
                    window.viewRecord(recordIdToView);
                }, 100);
            }
            
            setButtonLoading(saveBtn, false);
            hideLoading();
            return;
        } catch (error) {
            console.error('Error updating pipeline record:', error);
            showToast('Failed to update pipeline record: ' + error.message, 'error');
            setButtonLoading(saveBtn, false);
            hideLoading();
            return;
        }
    }
    
    const orderData = {
        customer: customerData,
        service: document.getElementById('service').value,
        amount: parseFloat(document.getElementById('amount').value),
        vendorCost: parseFloat(document.getElementById('vendorCost').value) || 0,
        processingFee: parseFloat(document.getElementById('processingFee').value) || 0,
        profit: parseFloat(document.getElementById('profit').value) || 0,
        vendor: document.getElementById('vendor').value || null,
        employee: document.getElementById('employee').value || null,
        startDate: document.getElementById('startDate').value,
        endDate: document.getElementById('orderType').value === 'recurring' ? null : document.getElementById('endDate').value,
        status: document.getElementById('status').value || 'new',
        priority: document.getElementById('priority').value || 'medium',
        description: document.getElementById('description').value || '',
        notes: document.getElementById('notes').value || '',
        // Recurring order fields
        orderType: document.getElementById('orderType').value || 'one-time'
    };
    
    // Add recurring fields if orderType is 'recurring'
    if (orderData.orderType === 'recurring') {
        const recurringFrequency = document.getElementById('recurringFrequency').value;
        if (!recurringFrequency) {
            showToast('Recurring frequency is required for recurring orders', 'error');
            setButtonLoading(saveBtn, false);
            hideLoading();
            return;
        }
        orderData.recurringFrequency = recurringFrequency;
        orderData.recurringEndDate = document.getElementById('recurringEndDate').value || null;
        orderData.recurringNotes = document.getElementById('recurringNotes').value || '';
    }
    
    try {
        if (currentOrderId) {
            updateLoadingMessage('Updating order...');
            await window.APIService.updateOrder(currentOrderId, orderData);
            showToast('Order updated successfully!', 'success');
            
            // If this order was edited from pipeline, store the pipeline record ID
            const pipelineRecordId = window.currentPipelineRecordId;
            
            closeOrderModal();
            
            // If edited from pipeline, refresh pipeline and reopen view modal
            if (pipelineRecordId) {
                if (typeof window.loadDataFromDB === 'function') {
                    await window.loadDataFromDB();
                }
                // Reopen the view modal with updated data
                if (typeof window.viewRecord === 'function') {
                    setTimeout(() => {
                        window.viewRecord(pipelineRecordId);
                    }, 100);
                }
            }
        } else {
            updateLoadingMessage('Creating order...');
            await window.APIService.createOrder(orderData);
            showToast('Order created successfully! Payment record auto-created.', 'success');
            
            // If this was a new customer, refresh the customers list
            if (!selectedCustomerId || selectedCustomerId === 'new') {
                // Clear customer cache to ensure fresh data
                if (window.APIService && window.APIService.clearCache) {
                    window.APIService.clearCache();
                }
                // Refresh customers in background
                try {
                    await refreshCustomers();
                } catch (error) {
                    console.log('Customer refresh failed:', error);
                }
            }
            
            // Refresh payments list to show the auto-created payment
            try {
                await refreshPayments();
            } catch (error) {
                console.log('Payment refresh failed:', error);
            }
            
            closeOrderModal();
        }
        
        // Clear API cache to ensure fresh data everywhere
        if (window.APIService && window.APIService.clearCache) {
            window.APIService.clearCache();
        }
        
        // Refresh orders tab
        await refreshOrders();
        
        // Refresh pipeline if it's loaded
        if (typeof loadDataFromDB === 'function') {
            console.log('Refreshing pipeline after order save...');
            await loadDataFromDB();
        }
        
        // Refresh dashboard KPIs
        if (window.dashboard && window.dashboard.renderDashboard) {
            console.log('Refreshing dashboard after order save...');
            await window.dashboard.renderDashboard();
        }
    } catch (error) {
        console.error('Save order error:', error);
        showToast(error.message || 'Failed to save order', 'error');
    } finally {
        setButtonLoading(saveBtn, false);
        hideLoading();
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

async function showOrderDetail(orderId, fromPipeline = false) {
    try {
        const order = await window.APIService.getOrder(orderId);
        
        // If opened from pipeline, show modal instead of full page
        if (fromPipeline) {
            // Populate modal fields
            document.getElementById('modalOrderDetailTitle').textContent = `Order Details - ${order.orderId || '#' + order._id.substring(0, 8).toUpperCase()}`;
            document.getElementById('modalDetailOrderId').textContent = order.orderId || '#' + order._id.substring(0, 8).toUpperCase();
            document.getElementById('modalDetailOrderStatus').innerHTML = `<span class="order-status-badge ${order.status}">${order.status.replace('-', ' ')}</span>`;
            document.getElementById('modalDetailOrderPriority').innerHTML = `<span class="priority-badge ${order.priority || 'medium'}">${order.priority || 'medium'}</span>`;
            document.getElementById('modalDetailOrderRevenue').textContent = order.amount ? `$${order.amount.toLocaleString()}` : '-';
            document.getElementById('modalDetailOrderCost').textContent = order.vendorCost ? `$${order.vendorCost.toLocaleString()}` : '-';
            document.getElementById('modalDetailOrderProfit').textContent = order.amount && order.vendorCost ? `$${(order.amount - order.vendorCost).toLocaleString()}` : '-';
            document.getElementById('modalDetailOrderService').textContent = order.service || '-';
            document.getElementById('modalDetailOrderVendor').textContent = order.vendor?.name || '-';
            document.getElementById('modalDetailOrderStartDate').textContent = order.startDate ? new Date(order.startDate).toLocaleDateString() : '-';
            document.getElementById('modalDetailOrderEndDate').textContent = order.endDate ? new Date(order.endDate).toLocaleDateString() : '-';
            document.getElementById('modalDetailOrderCustomerName').textContent = order.customer?.name || '-';
            document.getElementById('modalDetailOrderCustomerEmail').textContent = order.customer?.email || '-';
            document.getElementById('modalDetailOrderCustomerPhone').textContent = order.customer?.phone || '-';
            document.getElementById('modalDetailOrderCustomerAddress').textContent = order.customer?.address || '-';
            document.getElementById('modalDetailOrderDescription').textContent = order.description || 'No description provided';
            document.getElementById('modalDetailOrderNotes').textContent = order.notes || 'No notes';
            
            // Show modal
            document.getElementById('orderDetailModal').classList.add('show');
            return;
        }
        
        // Store the source for back navigation
        window.orderDetailSource = fromPipeline ? 'pipeline' : 'orders';
        
        // Update back button text and function
        const backButton = document.querySelector('#order-detail .btn-secondary');
        if (backButton) {
            if (fromPipeline) {
                backButton.innerHTML = '<i class="fas fa-arrow-left"></i> Back to Pipeline';
                backButton.onclick = () => showSection('pipeline');
            } else {
                backButton.innerHTML = '<i class="fas fa-arrow-left"></i> Back to Orders';
                backButton.onclick = backToOrders;
            }
        }
        
        document.getElementById('orderDetailTitle').textContent = `Order ${order.orderId || '#' + order._id.substring(0, 8).toUpperCase()}`;
        const detailOrderId = document.getElementById('detailOrderId');
        const detailOrderStatus = document.getElementById('detailOrderStatusValue');
        const detailOrderPriority = document.getElementById('detailOrderPriority');
        const detailOrderRevenue = document.getElementById('detailOrderRevenue');
        const detailOrderCost = document.getElementById('detailOrderCost');
        const detailOrderProfit = document.getElementById('detailOrderProfit');
        const detailOrderService = document.getElementById('detailOrderService');
        const detailOrderVendor = document.getElementById('detailOrderVendor');
        const detailOrderStartDate = document.getElementById('detailOrderStartDate');
        const detailOrderEndDate = document.getElementById('detailOrderEndDate');
        const detailOrderCustomerName = document.getElementById('detailOrderCustomerName');
        const detailOrderCustomerEmail = document.getElementById('detailOrderCustomerEmail');
        const detailOrderCustomerPhone = document.getElementById('detailOrderCustomerPhone');
        const detailOrderCustomerAddress = document.getElementById('detailOrderCustomerAddress');
        const detailOrderDescription = document.getElementById('detailOrderDescription');
        const detailOrderNotes = document.getElementById('detailOrderNotes');
        
        if (detailOrderId) detailOrderId.textContent = order.orderId || '#' + order._id.substring(0, 8).toUpperCase();
        if (detailOrderStatus) detailOrderStatus.innerHTML = `<span class="order-status-badge ${order.status}">${order.status.replace('-', ' ')}</span>`;
        if (detailOrderPriority) detailOrderPriority.innerHTML = `<span class="priority-badge ${order.priority || 'medium'}">${order.priority || 'medium'}</span>`;
        if (detailOrderRevenue) detailOrderRevenue.textContent = '$' + (order.amount?.toLocaleString() || '0');
        if (detailOrderCost) detailOrderCost.textContent = '$' + (order.vendorCost?.toLocaleString() || '0');
        if (detailOrderProfit) detailOrderProfit.textContent = '$' + (order.profit?.toLocaleString() || '0');
        if (detailOrderService) detailOrderService.textContent = order.service || '-';
        if (detailOrderVendor) detailOrderVendor.textContent = order.vendor?.name || 'N/A';
        if (detailOrderStartDate) detailOrderStartDate.textContent = order.startDate ? new Date(order.startDate).toLocaleDateString() : '-';
        if (detailOrderEndDate) detailOrderEndDate.textContent = order.endDate ? new Date(order.endDate).toLocaleDateString() : '-';
        
        if (detailOrderCustomerName) detailOrderCustomerName.textContent = order.customer?.name || order.customer || '-';
        if (detailOrderCustomerEmail) detailOrderCustomerEmail.textContent = order.customer?.email || '-';
        if (detailOrderCustomerPhone) detailOrderCustomerPhone.textContent = order.customer?.phone || '-';
        if (detailOrderCustomerAddress) detailOrderCustomerAddress.textContent = order.customer?.address || '-';
        
        if (detailOrderDescription) detailOrderDescription.textContent = order.description || 'No description provided';
        if (detailOrderNotes) detailOrderNotes.textContent = order.notes || 'No notes';
        
        showSection('order-detail');
    } catch (error) {
        console.error('Failed to load order details:', error);
        showToast('Failed to load order details: ' + error.message, 'error');
    }
}

function backToOrders() {
    showSection('orders');
}

function closeOrderDetailModal() {
    document.getElementById('orderDetailModal').classList.remove('show');
}

window.showOrderDetail = showOrderDetail;
window.backToOrders = backToOrders;
window.closeOrderDetailModal = closeOrderDetailModal;

function closeOrderModal() {
    document.getElementById('orderModal').classList.remove('show');
    
    // Re-enable form inputs
    const inputs = document.querySelectorAll('#orderForm input, #orderForm select, #orderForm textarea');
    inputs.forEach(input => input.disabled = false);
    
    document.querySelector('.modal-footer .btn-primary').style.display = 'inline-block';
    
    // Clear pipeline record ID
    window.currentPipelineRecordId = null;
    
    // Reset customer fields to editable state
    document.getElementById('customerName').readOnly = false;
    document.getElementById('customerEmail').readOnly = false;
    document.getElementById('customerPhone').readOnly = false;
    document.getElementById('customerAddress').readOnly = false;
    document.getElementById('customerSearchInput').disabled = false;
    document.getElementById('customerSearchInput').style.cursor = '';
    document.getElementById('customerSearchInput').style.backgroundColor = '';
    
    // Remove read-only styling
    document.getElementById('customerName').style.cssText = '';
    document.getElementById('customerEmail').style.cssText = '';
    document.getElementById('customerPhone').style.cssText = '';
    document.getElementById('customerAddress').style.cssText = '';
}

async function refreshOrders() {
    try {
        if (window.ordersRefreshing) return; // Prevent duplicate calls
        window.ordersRefreshing = true;
        
        // Show table loading state
        const tableContainer = document.querySelector('.orders-table-container');
        if (tableContainer) setTableLoading(tableContainer, true);
        
        const orders = await window.APIService.getOrders();
        window.dashboard.renderOrdersTable(orders);
        
            // Refresh dashboard stats after order changes (debounced)
            clearTimeout(window.statsRefreshTimer);
            window.statsRefreshTimer = setTimeout(async () => {
                const [orders, vendors, employees, customers, kpi] = await Promise.all([
                    window.APIService.getOrders().catch(() => []),
                    window.APIService.getVendors().catch(() => []),
                    window.APIService.getEmployees().catch(() => []),
                    window.APIService.getCustomers().catch(() => []),
                    window.APIService.getPaymentsCollected().catch(() => ({ paymentsCollected: 0 }))
                ]);
                
                const stats = {
                    totalOrders: orders.length,
                    totalRevenue: orders.reduce((sum, order) => sum + (order.amount || 0), 0),
                    paymentsCollected: kpi.paymentsCollected || 0,
                    totalVendors: vendors.length,
                    totalCustomers: customers.length
                };
                
                window.dashboard.renderKPIs(stats);
                window.dashboard.renderWorkflowFromOrders(orders);
            }, 300);
    } catch (error) {
        console.error('Failed to refresh orders:', error);
    } finally {
        window.ordersRefreshing = false;
        const tableContainer = document.querySelector('.orders-table-container');
        if (tableContainer) setTableLoading(tableContainer, false);
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
        document.getElementById('paymentInvoiceNumber').value = payment.invoiceNumber ? payment.invoiceNumber.replace('INV-', '') : '';
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
        paymentMethod: document.getElementById('paymentMethod').value || null,
        status: document.getElementById('paymentStatus').value,
        order: document.getElementById('paymentOrder').value || null,
        paymentDate: document.getElementById('paymentDate').value || null,
        dueDate: document.getElementById('paymentDueDate').value || null,
        invoiceNumber: document.getElementById('paymentInvoiceNumber').value ? 'INV-' + document.getElementById('paymentInvoiceNumber').value : '',
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
        
        // Refresh dashboard KPIs if payment status changed to received/completed
        if (paymentData.status === 'received' || paymentData.status === 'completed') {
            if (window.dashboard && window.dashboard.renderDashboard) {
                await window.dashboard.renderDashboard();
            }
        }
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
    
    // Update stats
    updatePaymentStats(payments);
    
    if (!payments || payments.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="payments-empty-state">
                    <i class="fas fa-credit-card"></i>
                    <h3>No Payments Found</h3>
                    <p>Payments will be automatically created when orders are created</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = payments.map(payment => `
        <tr>
            <td>
                <div style="display: flex; flex-direction: column;">
                    <strong>${payment.paymentId}</strong>
                    ${payment.order ? `<small style="color: #6b7280; font-size: 11px;">Order: ${payment.order.orderId || payment.order}</small>` : ''}
                </div>
            </td>
            <td>
                <span style="color: #3b82f6; font-weight: 500; cursor: pointer;" onclick="editInvoiceNumber('${payment._id}', '${payment.invoiceNumber || ''}')" title="Click to edit invoice number">
                    ${payment.invoiceNumber || '<span style="color: #9ca3af;">-</span>'}
                </span>
            </td>
            <td>${payment.customer?.name || 'N/A'}</td>
            <td><strong>$${payment.amount.toLocaleString()}</strong></td>
            <td><span class="method-badge ${payment.paymentMethod || 'pending'}">${payment.paymentMethod ? payment.paymentMethod.replace('-', ' ') : 'Not Set'}</span></td>
            <td>
                <select class="payment-status-select status-${payment.status}" onchange="quickUpdatePaymentStatus('${payment._id}', this.value)" style="padding: 6px 10px; border-radius: 6px; border: 1px solid #e5e7eb; font-size: 13px; font-weight: 500; cursor: pointer;">
                    <option value="pending" ${payment.status === 'pending' ? 'selected' : ''}>⏳ Pending</option>
                    <option value="received" ${payment.status === 'received' ? 'selected' : ''}>✅ Received</option>
                    <option value="completed" ${payment.status === 'completed' ? 'selected' : ''}>✔️ Completed</option>
                    <option value="failed" ${payment.status === 'failed' ? 'selected' : ''}>❌ Failed</option>
                    <option value="refunded" ${payment.status === 'refunded' ? 'selected' : ''}>↩️ Refunded</option>
                    <option value="cancelled" ${payment.status === 'cancelled' ? 'selected' : ''}>🚫 Cancelled</option>
                </select>
            </td>
            <td>${payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : 'Not Paid'}</td>
            <td>
                ${payment.order ? `<span style="color: #6b7280;">${payment.order.orderId || payment.order}</span>` : 'N/A'}
            </td>
            <td>
                <button class="btn-action" onclick="viewPayment('${payment._id}')" title="View">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn-action delete" onclick="deletePayment('${payment._id}')" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function updatePaymentStats(payments) {
    const totalCount = document.getElementById('totalPaymentsCount');
    const completedCount = document.getElementById('completedPaymentsCount');
    
    if (totalCount) totalCount.textContent = payments.length;
    if (completedCount) {
        const completed = payments.filter(p => p.status === 'received' || p.status === 'completed').length;
        completedCount.textContent = completed;
    }
}

// Load payments when payments section is shown
function loadPaymentsSection() {
    const tableContainer = document.querySelector('.payments-table-container');
    if (tableContainer) setTableLoading(tableContainer, true);
    
    refreshPayments().finally(() => {
        if (tableContainer) setTableLoading(tableContainer, false);
    });
}

// Global functions for button clicks
window.viewPayment = viewPayment;
window.editPayment = editPayment;
window.deletePayment = deletePayment;
window.showAddPaymentModal = showAddPaymentModal;
window.closePaymentModal = closePaymentModal;
window.savePayment = savePayment;

// Quick update payment status from table
async function quickUpdatePaymentStatus(paymentId, newStatus) {
    try {
        const payment = await window.APIService.getPayment(paymentId);
        
        // Update only the status
        const updateData = {
            ...payment,
            status: newStatus,
            // Set payment date if status is received/completed and not already set
            paymentDate: (newStatus === 'received' || newStatus === 'completed') && !payment.paymentDate 
                ? new Date().toISOString() 
                : payment.paymentDate
        };
        
        await window.APIService.updatePayment(paymentId, updateData);
        showToast(`Payment status updated to ${newStatus}!`, 'success');
        
        // Refresh payments table
        await refreshPayments();
        
        // Refresh dashboard if status changed to received/completed
        if (newStatus === 'received' || newStatus === 'completed') {
            if (window.dashboard && window.dashboard.renderDashboard) {
                await window.dashboard.renderDashboard();
            }
        }
    } catch (error) {
        console.error('Quick status update error:', error);
        showToast('Failed to update status: ' + error.message, 'error');
        // Refresh to revert the dropdown
        await refreshPayments();
    }
}

window.quickUpdatePaymentStatus = quickUpdatePaymentStatus;

// Inline edit invoice number
async function editInvoiceNumber(paymentId, currentInvoice) {
    // Remove INV- prefix if present for editing
    const currentNumber = currentInvoice ? currentInvoice.replace('INV-', '') : '';
    
    // Create custom modal
    const modal = document.createElement('div');
    modal.className = 'invoice-edit-modal-overlay';
    modal.innerHTML = `
        <div class="invoice-edit-modal">
            <div class="invoice-modal-header">
                <h3><i class="fas fa-file-invoice"></i> Edit Invoice Number</h3>
                <button class="invoice-modal-close" onclick="this.closest('.invoice-edit-modal-overlay').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="invoice-modal-body">
                <div class="invoice-input-group">
                    <label for="invoiceNumberInput">Invoice Number</label>
                    <div class="invoice-input-wrapper">
                        <span class="invoice-prefix">INV-</span>
                        <input type="text" id="invoiceNumberInput" class="invoice-number-input" value="${currentNumber}" placeholder="000000" autofocus>
                    </div>
                    <small class="invoice-help-text">Enter only the number. "INV-" will be added automatically.</small>
                </div>
            </div>
            <div class="invoice-modal-footer">
                <button class="btn-invoice-cancel" onclick="this.closest('.invoice-edit-modal-overlay').remove()">
                    <i class="fas fa-times"></i> Cancel
                </button>
                <button class="btn-invoice-save" onclick="saveInvoiceNumber('${paymentId}')">
                    <i class="fas fa-save"></i> Save
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Focus input and select text
    setTimeout(() => {
        const input = document.getElementById('invoiceNumberInput');
        if (input) {
            input.focus();
            input.select();
        }
    }, 100);
    
    // Handle Enter key
    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveInvoiceNumber(paymentId);
        } else if (e.key === 'Escape') {
            modal.remove();
        }
    });
    
    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

async function saveInvoiceNumber(paymentId) {
    const input = document.getElementById('invoiceNumberInput');
    const modal = document.querySelector('.invoice-edit-modal-overlay');
    const saveBtn = document.querySelector('.btn-invoice-save');
    
    if (!input) return;
    
    // Get the trimmed number
    const trimmedNumber = input.value.trim();
    
    // Disable button and show loading
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    }
    
    try {
        // Get the payment data
        const payment = await window.APIService.getPayment(paymentId);
        
        console.log('Current payment data:', payment);
        console.log('New invoice number:', trimmedNumber ? 'INV-' + trimmedNumber : '(empty)');
        
        // Update with new invoice number (add INV- prefix)
        const updateData = {
            customer: payment.customer._id || payment.customer,
            amount: payment.amount,
            paymentMethod: payment.paymentMethod,
            status: payment.status,
            order: payment.order?._id || payment.order || null,
            paymentDate: payment.paymentDate,
            dueDate: payment.dueDate,
            invoiceNumber: trimmedNumber ? 'INV-' + trimmedNumber : '',
            transactionId: payment.transactionId || '',
            receiptNumber: payment.receiptNumber || '',
            description: payment.description || '',
            notes: payment.notes || ''
        };
        
        console.log('Sending update data:', updateData);
        
        // Save to backend
        const result = await window.APIService.updatePayment(paymentId, updateData);
        
        console.log('Update result:', result);
        
        // Close modal
        if (modal) modal.remove();
        
        // Show success message
        showToast('Invoice number updated successfully!', 'success');
        
        // Refresh the payments table
        await refreshPayments();
    } catch (error) {
        console.error('Invoice number update error:', error);
        showToast('Failed to update invoice number: ' + error.message, 'error');
        
        // Re-enable button
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Save';
        }
    }
}

window.editInvoiceNumber = editInvoiceNumber;
window.saveInvoiceNumber = saveInvoiceNumber;

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
        
        // Display existing documents with remove option
        const docsPreview = document.getElementById('employeeDocsPreview');
        if (employee.documents && employee.documents.length > 0) {
            docsPreview.innerHTML = employee.documents.map((doc, index) => `
                <div class="existing-doc-item" data-doc-index="${index}" style="display: flex; align-items: center; justify-content: space-between; padding: 8px; background: #f3f4f6; border-radius: 6px; margin-top: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-file-pdf" style="color: #ef4444;"></i>
                        <span style="font-size: 14px;">${doc.name}</span>
                    </div>
                    <button type="button" class="btn-remove-doc" onclick="removeExistingEmployeeDoc(${index})" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `).join('');
        } else {
            docsPreview.innerHTML = '';
        }
        
        // Store original documents for comparison
        window.currentEmployeeDocuments = employee.documents || [];
        
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
                // Combine existing documents with newly uploaded ones
                const existingDocs = window.currentEmployeeDocuments || [];
                employeeData.documents = [...existingDocs, ...uploadedDocs];
            }
        } else if (window.currentEmployeeDocuments) {
            // No new uploads, just keep existing documents
            employeeData.documents = window.currentEmployeeDocuments;
        }
        
        if (currentEmployeeId) {
            await window.APIService.updateEmployee(currentEmployeeId, employeeData);
            showToast('Employee updated successfully!', 'success');
        } else {
            await window.APIService.createEmployee(employeeData);
            showToast('Employee created successfully!', 'success');
        }
        
        // Clear uploaded files and stored documents
        if (window.uploadedFiles) {
            window.uploadedFiles.employee = [];
        }
        window.currentEmployeeDocuments = null;
        
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
        const tableContainer = document.querySelector('.employees-table-container');
        if (tableContainer) setTableLoading(tableContainer, true);
        
        allEmployees = await window.APIService.getEmployees();
        renderEmployeesTable(allEmployees);
        initializeEmployeeFilters();
    } catch (error) {
        console.error('Failed to load employees:', error);
        renderEmployeesTable([]);
    } finally {
        const tableContainer = document.querySelector('.employees-table-container');
        if (tableContainer) setTableLoading(tableContainer, false);
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

// Function to remove existing employee document
window.removeExistingEmployeeDoc = function(index) {
    if (confirm('Are you sure you want to remove this document?')) {
        const docItem = document.querySelector(`[data-doc-index="${index}"]`);
        if (docItem) {
            docItem.remove();
        }
        // Remove from stored documents array
        if (window.currentEmployeeDocuments) {
            window.currentEmployeeDocuments.splice(index, 1);
            // Re-render to update indices
            const docsPreview = document.getElementById('employeeDocsPreview');
            if (window.currentEmployeeDocuments.length > 0) {
                docsPreview.innerHTML = window.currentEmployeeDocuments.map((doc, idx) => `
                    <div class="existing-doc-item" data-doc-index="${idx}" style="display: flex; align-items: center; justify-content: space-between; padding: 8px; background: #f3f4f6; border-radius: 6px; margin-top: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-file-pdf" style="color: #ef4444;"></i>
                            <span style="font-size: 14px;">${doc.name}</span>
                        </div>
                        <button type="button" class="btn-remove-doc" onclick="removeExistingEmployeeDoc(${idx})" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `).join('');
            } else {
                docsPreview.innerHTML = '';
            }
        }
    }
};

// Vendor Management Functions
let currentVendorId = null;
let vendorEmailCounter = 1;
let vendorPhoneCounter = 1;

function addVendorEmail() {
    const container = document.getElementById('vendorEmailsContainer');
    const newEmailGroup = document.createElement('div');
    newEmailGroup.className = 'email-group';
    newEmailGroup.setAttribute('data-vendor-email-index', vendorEmailCounter);
    newEmailGroup.style.marginTop = '20px';
    newEmailGroup.style.paddingTop = '20px';
    newEmailGroup.style.borderTop = '1px solid #e5e7eb';
    newEmailGroup.style.position = 'relative';
    
    newEmailGroup.innerHTML = `
        <button type="button" class="btn-remove-email" onclick="removeVendorEmail(${vendorEmailCounter})" style="position: absolute; top: 5px; right: 0; background: #ef4444; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 14px; min-width: 80px; z-index: 10;">
            <i class="fas fa-times"></i> Remove
        </button>
        <div class="form-group">
            <label for="vendorEmail_${vendorEmailCounter}">Email ${vendorEmailCounter + 1}</label>
            <input type="email" id="vendorEmail_${vendorEmailCounter}" class="vendor-email-field">
        </div>
    `;
    
    container.appendChild(newEmailGroup);
    vendorEmailCounter++;
}

function removeVendorEmail(index) {
    const emailGroup = document.querySelector(`[data-vendor-email-index="${index}"]`);
    if (emailGroup) {
        emailGroup.remove();
    }
}

function addVendorPhone() {
    const container = document.getElementById('vendorPhonesContainer');
    const newPhoneGroup = document.createElement('div');
    newPhoneGroup.className = 'phone-group';
    newPhoneGroup.setAttribute('data-vendor-phone-index', vendorPhoneCounter);
    newPhoneGroup.style.marginTop = '20px';
    newPhoneGroup.style.paddingTop = '20px';
    newPhoneGroup.style.borderTop = '1px solid #e5e7eb';
    newPhoneGroup.style.position = 'relative';
    
    newPhoneGroup.innerHTML = `
        <button type="button" class="btn-remove-phone" onclick="removeVendorPhone(${vendorPhoneCounter})" style="position: absolute; top: 5px; right: 0; background: #ef4444; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 14px; min-width: 80px; z-index: 10;">
            <i class="fas fa-times"></i> Remove
        </button>
        <div class="form-group">
            <label for="vendorPhone_${vendorPhoneCounter}">Phone ${vendorPhoneCounter + 1}</label>
            <input type="tel" id="vendorPhone_${vendorPhoneCounter}" class="vendor-phone-field">
        </div>
    `;
    
    container.appendChild(newPhoneGroup);
    vendorPhoneCounter++;
}

function removeVendorPhone(index) {
    const phoneGroup = document.querySelector(`[data-vendor-phone-index="${index}"]`);
    if (phoneGroup) {
        phoneGroup.remove();
    }
}

function handleVendorCategoryChange() {
    const categorySelect = document.getElementById('vendorCategory');
    const customInput = document.getElementById('vendorCategoryCustom');
    
    if (categorySelect.value === '__add_new__') {
        customInput.style.display = 'block';
        customInput.required = true;
        customInput.focus();
    } else {
        customInput.style.display = 'none';
        customInput.required = false;
        customInput.value = '';
    }
}

function updateVendorCategoryOptions() {
    const categorySelect = document.getElementById('vendorCategory');
    const addNewOption = categorySelect.querySelector('[value="__add_new__"]');
    
    if (addNewOption) {
        // Check if user is admin
        const isAdmin = window.RBAC && window.RBAC.hasRole(window.ROLES.ADMIN);
        
        if (isAdmin) {
            addNewOption.style.display = 'block';
        } else {
            addNewOption.style.display = 'none';
            // If non-admin had selected "Add New", reset to empty
            if (categorySelect.value === '__add_new__') {
                categorySelect.value = '';
                const customInput = document.getElementById('vendorCategoryCustom');
                if (customInput) {
                    customInput.style.display = 'none';
                    customInput.required = false;
                    customInput.value = '';
                }
            }
        }
    }
}

window.handleVendorCategoryChange = handleVendorCategoryChange;
window.updateVendorCategoryOptions = updateVendorCategoryOptions;

function showAddVendorModal() {
    currentVendorId = null;
    vendorEmailCounter = 1;
    vendorPhoneCounter = 1;
    document.getElementById('vendorModalTitle').textContent = 'Add New Vendor';
    document.getElementById('vendorForm').reset();
    
    // Clear the containers
    const emailContainer = document.getElementById('vendorEmailsContainer');
    const phoneContainer = document.getElementById('vendorPhonesContainer');
    emailContainer.innerHTML = '';
    phoneContainer.innerHTML = '';
    
    // Reset custom category input
    const customInput = document.getElementById('vendorCategoryCustom');
    if (customInput) {
        customInput.style.display = 'none';
        customInput.required = false;
        customInput.value = '';
    }
    
    // Show/hide "Add New Category" option based on user role
    updateVendorCategoryOptions();
    
    document.getElementById('vendorModal').classList.add('show');
}

async function editVendor(vendorId) {
    try {
        currentVendorId = vendorId;
        const vendor = await window.APIService.getVendor(vendorId);
        
        document.getElementById('vendorModalTitle').textContent = 'Edit Vendor';
        
        // Populate basic fields
        document.getElementById('vendorName').value = vendor.name || '';
        document.getElementById('vendorEmail').value = vendor.email || '';
        document.getElementById('vendorPhone').value = vendor.phone || '';
        document.getElementById('vendorAddress').value = vendor.address || '';
        document.getElementById('vendorCategory').value = vendor.category || '';
        document.getElementById('vendorRating').value = vendor.rating || 5;
        document.getElementById('vendorStatus').value = vendor.isActive.toString();
        document.getElementById('vendorNotes').value = vendor.notes || '';
        
        // Show/hide "Add New Category" option based on user role
        updateVendorCategoryOptions();
        
        // Reset and populate emails and phones
        vendorEmailCounter = 1;
        vendorPhoneCounter = 1;
        const emailContainer = document.getElementById('vendorEmailsContainer');
        const phoneContainer = document.getElementById('vendorPhonesContainer');
        emailContainer.innerHTML = '';
        phoneContainer.innerHTML = '';
        
        // Populate additional emails
        if (vendor.emails && vendor.emails.length > 0) {
            vendor.emails.forEach((email, index) => {
                if (index > 0) { // Skip first email as it's in the main field
                    const emailGroup = document.createElement('div');
                    emailGroup.className = 'email-group';
                    emailGroup.setAttribute('data-vendor-email-index', index);
                    emailGroup.style.marginTop = '20px';
                    emailGroup.style.paddingTop = '20px';
                    emailGroup.style.borderTop = '1px solid #e5e7eb';
                    emailGroup.style.position = 'relative';
                    
                    emailGroup.innerHTML = `
                        <button type="button" class="btn-remove-email" onclick="removeVendorEmail(${index})" style="position: absolute; top: 10px; right: 0; background: #ef4444; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">
                            <i class="fas fa-times"></i> Remove
                        </button>
                        <div class="form-group">
                            <label for="vendorEmail_${index}">Email ${index + 1}</label>
                            <input type="email" id="vendorEmail_${index}" class="vendor-email-field" value="${email.address || ''}">
                        </div>
                    `;
                    
                    emailContainer.appendChild(emailGroup);
                }
            });
            vendorEmailCounter = vendor.emails.length;
        }
        
        // Populate additional phones
        if (vendor.phones && vendor.phones.length > 0) {
            vendor.phones.forEach((phone, index) => {
                if (index > 0) { // Skip first phone as it's in the main field
                    const phoneGroup = document.createElement('div');
                    phoneGroup.className = 'phone-group';
                    phoneGroup.setAttribute('data-vendor-phone-index', index);
                    phoneGroup.style.marginTop = '20px';
                    phoneGroup.style.paddingTop = '20px';
                    phoneGroup.style.borderTop = '1px solid #e5e7eb';
                    phoneGroup.style.position = 'relative';
                    
                    phoneGroup.innerHTML = `
                        <button type="button" class="btn-remove-phone" onclick="removeVendorPhone(${index})" style="position: absolute; top: 10px; right: 0; background: #ef4444; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">
                            <i class="fas fa-times"></i> Remove
                        </button>
                        <div class="form-group">
                            <label for="vendorPhone_${index}">Phone ${index + 1}</label>
                            <input type="tel" id="vendorPhone_${index}" class="vendor-phone-field" value="${phone.number || ''}">
                        </div>
                    `;
                    
                    phoneContainer.appendChild(phoneGroup);
                }
            });
            vendorPhoneCounter = vendor.phones.length;
        }
        
        // Load custom fields
        loadVendorCustomFields(vendor.customFields || []);
        
        // Display existing documents with remove option
        const docsPreview = document.getElementById('vendorDocsPreview');
        if (vendor.documents && vendor.documents.length > 0) {
            docsPreview.innerHTML = vendor.documents.map((doc, index) => `
                <div class="existing-doc-item" data-doc-index="${index}" style="display: flex; align-items: center; justify-content: space-between; padding: 8px; background: #f3f4f6; border-radius: 6px; margin-top: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-file-pdf" style="color: #ef4444;"></i>
                        <span style="font-size: 14px;">${doc.name}</span>
                    </div>
                    <button type="button" class="btn-remove-doc" onclick="removeExistingVendorDoc(${index})" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `).join('');
        } else {
            docsPreview.innerHTML = '';
        }
        
        // Store original documents for comparison
        window.currentVendorDocuments = vendor.documents || [];
        
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
    
    const saveBtn = document.querySelector('#vendorModal .btn-primary');
    setButtonLoading(saveBtn, true);
    showLoading(currentVendorId ? 'Updating vendor...' : 'Creating vendor...');
    
    // Collect all emails
    const emails = [];
    
    // Primary email
    const primaryEmail = document.getElementById('vendorEmail')?.value;
    if (primaryEmail) {
        emails.push({
            label: 'Primary',
            address: primaryEmail,
            isPrimary: true
        });
    }
    
    // Additional emails
    const emailGroups = document.querySelectorAll('#vendorEmailsContainer .email-group');
    emailGroups.forEach((group) => {
        const emailIndex = group.getAttribute('data-vendor-email-index');
        const emailAddress = document.getElementById(`vendorEmail_${emailIndex}`)?.value;
        
        if (emailAddress) {
            emails.push({
                label: `Email ${emails.length + 1}`,
                address: emailAddress,
                isPrimary: false
            });
        }
    });
    
    // Collect all phones
    const phones = [];
    
    // Primary phone
    const primaryPhone = document.getElementById('vendorPhone')?.value;
    if (primaryPhone) {
        phones.push({
            label: 'Primary',
            number: primaryPhone,
            isPrimary: true
        });
    }
    
    // Additional phones
    const phoneGroups = document.querySelectorAll('#vendorPhonesContainer .phone-group');
    phoneGroups.forEach((group) => {
        const phoneIndex = group.getAttribute('data-vendor-phone-index');
        const phoneNumber = document.getElementById(`vendorPhone_${phoneIndex}`)?.value;
        
        if (phoneNumber) {
            phones.push({
                label: `Phone ${phones.length + 1}`,
                number: phoneNumber,
                isPrimary: false
            });
        }
    });
    
    // Get category - check if custom category was entered
    const categorySelect = document.getElementById('vendorCategory');
    const customCategoryInput = document.getElementById('vendorCategoryCustom');
    let category = categorySelect.value;
    
    if (category === '__add_new__') {
        const customCategory = customCategoryInput.value.trim();
        if (!customCategory) {
            showToast('Please enter a category name', 'error');
            customCategoryInput.focus();
            setButtonLoading(saveBtn, false);
            hideLoading();
            return;
        }
        category = customCategory.toLowerCase().replace(/\s+/g, '-');
        
        // Add the new category to the dropdown for future use
        const newOption = document.createElement('option');
        newOption.value = category;
        newOption.textContent = customCategory;
        categorySelect.insertBefore(newOption, categorySelect.querySelector('[value="__add_new__"]'));
    }
    
    const vendorData = {
        name: document.getElementById('vendorName').value,
        email: document.getElementById('vendorEmail').value,
        phone: document.getElementById('vendorPhone').value,
        address: document.getElementById('vendorAddress').value,
        category: category,
        rating: parseInt(document.getElementById('vendorRating').value),
        isActive: document.getElementById('vendorStatus').value === 'true',
        notes: document.getElementById('vendorNotes').value,
        emails: emails,
        phones: phones,
        customFields: getVendorCustomFields()
    };
    
    console.log('=== SAVING VENDOR ===');
    console.log('Custom fields being saved:', vendorData.customFields);
    
    console.log('=== SAVING VENDOR ===');
    console.log('Emails being saved:', emails);
    console.log('Phones being saved:', phones);
    console.log('Category being saved:', category);
    console.log('Full vendor data:', vendorData);
    
    try {
        // Upload documents if any
        if (window.uploadedFiles && window.uploadedFiles.vendor && window.uploadedFiles.vendor.length > 0) {
            console.log('Uploading vendor documents:', window.uploadedFiles.vendor.length, 'files');
            updateLoadingMessage('Uploading documents...');
            const uploadedDocs = await window.uploadFiles(window.uploadedFiles.vendor);
            console.log('Upload response:', uploadedDocs);
            if (uploadedDocs && uploadedDocs.length > 0) {
                // Combine existing documents with newly uploaded ones
                const existingDocs = window.currentVendorDocuments || [];
                vendorData.documents = [...existingDocs, ...uploadedDocs];
                console.log('Documents added to vendorData:', vendorData.documents);
            }
        } else if (window.currentVendorDocuments) {
            // No new uploads, just keep existing documents
            vendorData.documents = window.currentVendorDocuments;
        }
        
        console.log('Final vendor data:', vendorData);
        console.log('Documents type:', typeof vendorData.documents);
        console.log('Documents is array:', Array.isArray(vendorData.documents));
        
        if (currentVendorId) {
            updateLoadingMessage('Updating vendor...');
            await window.APIService.updateVendor(currentVendorId, vendorData);
            showToast('Vendor updated successfully!', 'success');
        } else {
            updateLoadingMessage('Creating vendor...');
            await window.APIService.createVendor(vendorData);
            showToast('Vendor created successfully!', 'success');
        }
        
        // Clear uploaded files and stored documents
        if (window.uploadedFiles) {
            window.uploadedFiles.vendor = [];
        }
        window.currentVendorDocuments = null;
        
        closeVendorModal();
        await refreshVendors();
    } catch (error) {
        console.error('Save vendor error:', error);
        showToast('Failed to save vendor: ' + error.message, 'error');
    } finally {
        setButtonLoading(saveBtn, false);
        hideLoading();
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
    
    // Reset custom category input
    const customInput = document.getElementById('vendorCategoryCustom');
    if (customInput) {
        customInput.style.display = 'none';
        customInput.required = false;
        customInput.value = '';
    }
    
    // Clear custom fields
    clearVendorCustomFields();
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
    
    // Sort vendors by creation date (newest first)
    const sortedVendors = [...vendors].sort((a, b) => {
        const dateA = new Date(a.createdAt || 0);
        const dateB = new Date(b.createdAt || 0);
        return dateB - dateA; // Newest first
    });
    
    tbody.innerHTML = sortedVendors.map(vendor => {
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
        const tableContainer = document.querySelector('.vendors-table-container');
        if (tableContainer) setTableLoading(tableContainer, true);
        
        allVendors = await window.APIService.getVendors();
        renderVendorsTable(allVendors);
        initializeVendorFilters();
    } catch (error) {
        console.error('Failed to load vendors:', error);
        renderVendorsTable([]);
    } finally {
        const tableContainer = document.querySelector('.vendors-table-container');
        if (tableContainer) setTableLoading(tableContainer, false);
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
window.addVendorEmail = addVendorEmail;
window.removeVendorEmail = removeVendorEmail;
window.addVendorPhone = addVendorPhone;
window.removeVendorPhone = removeVendorPhone;

// Function to remove existing vendor document
window.removeExistingVendorDoc = function(index) {
    if (confirm('Are you sure you want to remove this document?')) {
        const docItem = document.querySelector(`[data-doc-index="${index}"]`);
        if (docItem) {
            docItem.remove();
        }
        // Remove from stored documents array
        if (window.currentVendorDocuments) {
            window.currentVendorDocuments.splice(index, 1);
            // Re-render to update indices
            const docsPreview = document.getElementById('vendorDocsPreview');
            if (window.currentVendorDocuments.length > 0) {
                docsPreview.innerHTML = window.currentVendorDocuments.map((doc, idx) => `
                    <div class="existing-doc-item" data-doc-index="${idx}" style="display: flex; align-items: center; justify-content: space-between; padding: 8px; background: #f3f4f6; border-radius: 6px; margin-top: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-file-pdf" style="color: #ef4444;"></i>
                            <span style="font-size: 14px;">${doc.name}</span>
                        </div>
                        <button type="button" class="btn-remove-doc" onclick="removeExistingVendorDoc(${idx})" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `).join('');
            } else {
                docsPreview.innerHTML = '';
            }
        }
    }
};

// Customer Management Functions
let currentCustomerId = null;
let addressCounter = 1;
let emailCounter = 1;
let phoneCounter = 1;

function addEmailAddress() {
    const container = document.getElementById('emailsContainer');
    const newEmailGroup = document.createElement('div');
    newEmailGroup.className = 'email-group';
    newEmailGroup.setAttribute('data-email-index', emailCounter);
    newEmailGroup.style.marginTop = '20px';
    newEmailGroup.style.paddingTop = '20px';
    newEmailGroup.style.borderTop = '1px solid #e5e7eb';
    newEmailGroup.style.position = 'relative';
    
    newEmailGroup.innerHTML = `
        <button type="button" class="btn-remove-email" onclick="removeEmailAddress(${emailCounter})" style="position: absolute; top: 5px; right: 0; background: #ef4444; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 14px; min-width: 80px; z-index: 10;">
            <i class="fas fa-times"></i> Remove
        </button>
        <div class="form-group">
            <label for="customerEmailField_${emailCounter}">Email ${emailCounter + 2}</label>
            <input type="email" id="customerEmailField_${emailCounter}" class="customer-email-field">
        </div>
    `;
    
    container.appendChild(newEmailGroup);
    emailCounter++;
}

function removeEmailAddress(index) {
    const emailGroup = document.querySelector(`[data-email-index="${index}"]`);
    if (emailGroup) {
        emailGroup.remove();
    }
}

function addPhoneNumber() {
    const container = document.getElementById('phonesContainer');
    const newPhoneGroup = document.createElement('div');
    newPhoneGroup.className = 'phone-group';
    newPhoneGroup.setAttribute('data-phone-index', phoneCounter);
    newPhoneGroup.style.marginTop = '20px';
    newPhoneGroup.style.paddingTop = '20px';
    newPhoneGroup.style.borderTop = '1px solid #e5e7eb';
    newPhoneGroup.style.position = 'relative';
    
    newPhoneGroup.innerHTML = `
        <button type="button" class="btn-remove-phone" onclick="removePhoneNumber(${phoneCounter})" style="position: absolute; top: 5px; right: 0; background: #ef4444; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 14px; min-width: 80px; z-index: 10;">
            <i class="fas fa-times"></i> Remove
        </button>
        <div class="form-group">
            <label for="customerPhoneField_${phoneCounter}">Phone ${phoneCounter + 2}</label>
            <input type="tel" id="customerPhoneField_${phoneCounter}" class="customer-phone-field">
        </div>
    `;
    
    container.appendChild(newPhoneGroup);
    phoneCounter++;
}

function removePhoneNumber(index) {
    const phoneGroup = document.querySelector(`[data-phone-index="${index}"]`);
    if (phoneGroup) {
        phoneGroup.remove();
    }
}

function addPhysicalAddress() {
    const container = document.getElementById('addressesContainer');
    const currentIndex = addressCounter;
    const newAddressGroup = document.createElement('div');
    newAddressGroup.className = 'address-group';
    newAddressGroup.setAttribute('data-address-index', currentIndex);
    newAddressGroup.style.marginTop = '20px';
    newAddressGroup.style.paddingTop = '20px';
    newAddressGroup.style.borderTop = '1px solid #e5e7eb';
    newAddressGroup.style.position = 'relative';
    
    const addressNumber = container.querySelectorAll('.address-group').length + 2;
    
    newAddressGroup.innerHTML = `
        <button type="button" class="btn-remove-address" onclick="removePhysicalAddress(${currentIndex})" style="position: absolute; top: 5px; right: 0; background: #ef4444; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 14px; min-width: 80px; z-index: 10;">
            <i class="fas fa-times"></i> Remove
        </button>
        <div class="form-group">
            <label for="customerAddressField_${currentIndex}">Address ${addressNumber}</label>
            <textarea id="customerAddressField_${currentIndex}" class="customer-address-field" rows="2"></textarea>
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
    emailCounter = 1;
    phoneCounter = 1;
    document.getElementById('customerModalTitle').textContent = 'Add New Customer';
    document.getElementById('customerForm').reset();
    
    // Clear the containers
    const addressContainer = document.getElementById('addressesContainer');
    const emailContainer = document.getElementById('emailsContainer');
    const phoneContainer = document.getElementById('phonesContainer');
    addressContainer.innerHTML = '';
    emailContainer.innerHTML = '';
    phoneContainer.innerHTML = '';
    
    // Clear custom fields
    clearCustomerCustomFields();
    
    document.getElementById('customerModal').classList.add('show');
}

async function editCustomer(customerId) {
    try {
        currentCustomerId = customerId;
        const customer = await window.APIService.getCustomer(customerId);
        
        document.getElementById('customerModalTitle').textContent = 'Edit Customer';
        
        // Populate basic fields
        document.getElementById('customerNameField').value = customer.name || '';
        document.getElementById('customerType').value = customer.customerType || 'one-time';
        document.getElementById('customerStatus').value = customer.status || 'active';
        document.getElementById('customerNotes').value = customer.notes || '';
        
        // Reset counters
        addressCounter = 1;
        emailCounter = 1;
        phoneCounter = 1;
        
        // Clear containers
        const addressContainer = document.getElementById('addressesContainer');
        const emailContainer = document.getElementById('emailsContainer');
        const phoneContainer = document.getElementById('phonesContainer');
        addressContainer.innerHTML = '';
        emailContainer.innerHTML = '';
        phoneContainer.innerHTML = '';
        
        // Clear the primary address field (outside container)
        document.getElementById('customerAddressField_0').value = '';
        
        // Populate primary email
        document.getElementById('customerEmailField').value = customer.email || (customer.emails && customer.emails.length > 0 ? customer.emails[0].address : '');
        
        // Populate primary phone
        document.getElementById('customerPhoneField').value = customer.phone || (customer.phones && customer.phones.length > 0 ? customer.phones[0].number : '');
        
        // Populate primary address
        if (customer.addresses && customer.addresses.length > 0) {
            document.getElementById('customerAddressField_0').value = customer.addresses[0].address || '';
            
            // Add additional addresses (skip first one as it's already in primary field)
            for (let i = 1; i < customer.addresses.length; i++) {
                const addr = customer.addresses[i];
                const currentIndex = addressCounter;
                const addressGroup = document.createElement('div');
                addressGroup.className = 'address-group';
                addressGroup.setAttribute('data-address-index', currentIndex);
                addressGroup.style.marginTop = '20px';
                addressGroup.style.paddingTop = '20px';
                addressGroup.style.borderTop = '1px solid #e5e7eb';
                addressGroup.style.position = 'relative';
                
                addressGroup.innerHTML = `
                    <button type="button" class="btn-remove-address" onclick="removePhysicalAddress(${currentIndex})" style="position: absolute; top: 5px; right: 0; background: #ef4444; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 14px; min-width: 80px; z-index: 10;">
                        <i class="fas fa-times"></i> Remove
                    </button>
                    <div class="form-group">
                        <label for="customerAddressField_${currentIndex}">Address ${i + 1}</label>
                        <textarea id="customerAddressField_${currentIndex}" class="customer-address-field" rows="2">${addr.address || ''}</textarea>
                    </div>
                `;
                
                addressContainer.appendChild(addressGroup);
                addressCounter++;
            }
        } else if (customer.address) {
            // Backward compatibility: use old address field
            document.getElementById('customerAddressField_0').value = customer.address;
        }
        
        // Populate additional emails (skip first one as it's already in primary field)
        if (customer.emails && customer.emails.length > 1) {
            for (let i = 1; i < customer.emails.length; i++) {
                const email = customer.emails[i];
                const emailGroup = document.createElement('div');
                emailGroup.className = 'email-group';
                emailGroup.setAttribute('data-email-index', emailCounter);
                emailGroup.style.marginTop = '20px';
                emailGroup.style.paddingTop = '20px';
                emailGroup.style.borderTop = '1px solid #e5e7eb';
                emailGroup.style.position = 'relative';
                
                emailGroup.innerHTML = `
                    <button type="button" class="btn-remove-email" onclick="removeEmailAddress(${emailCounter})" style="position: absolute; top: 5px; right: 0; background: #ef4444; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 14px; min-width: 80px; z-index: 10;">
                        <i class="fas fa-times"></i> Remove
                    </button>
                    <div class="form-group">
                        <label for="customerEmailField_${emailCounter}">Email ${i + 1}</label>
                        <input type="email" id="customerEmailField_${emailCounter}" class="customer-email-field" value="${email.address || ''}">
                    </div>
                `;
                
                emailContainer.appendChild(emailGroup);
                emailCounter++;
            }
        }
        
        // Populate additional phones (skip first one as it's already in primary field)
        if (customer.phones && customer.phones.length > 1) {
            for (let i = 1; i < customer.phones.length; i++) {
                const phone = customer.phones[i];
                const phoneGroup = document.createElement('div');
                phoneGroup.className = 'phone-group';
                phoneGroup.setAttribute('data-phone-index', phoneCounter);
                phoneGroup.style.marginTop = '20px';
                phoneGroup.style.paddingTop = '20px';
                phoneGroup.style.borderTop = '1px solid #e5e7eb';
                phoneGroup.style.position = 'relative';
                
                phoneGroup.innerHTML = `
                    <button type="button" class="btn-remove-phone" onclick="removePhoneNumber(${phoneCounter})" style="position: absolute; top: 5px; right: 0; background: #ef4444; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 14px; min-width: 80px; z-index: 10;">
                        <i class="fas fa-times"></i> Remove
                    </button>
                    <div class="form-group">
                        <label for="customerPhoneField_${phoneCounter}">Phone ${i + 1}</label>
                        <input type="tel" id="customerPhoneField_${phoneCounter}" class="customer-phone-field" value="${phone.number || ''}">
                    </div>
                `;
                
                phoneContainer.appendChild(phoneGroup);
                phoneCounter++;
            }
        }
        
        // Load custom fields
        loadCustomerCustomFields(customer.customFields || []);
        
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
    
    const saveBtn = document.querySelector('#customerModal .btn-primary');
    setButtonLoading(saveBtn, true);
    showLoading(currentCustomerId ? 'Updating customer...' : 'Creating customer...');
    
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
    
    // Collect all emails
    const emails = [];
    
    // Primary email
    const primaryEmail = document.getElementById('customerEmailField')?.value;
    if (primaryEmail) {
        emails.push({
            label: 'Primary',
            address: primaryEmail,
            isPrimary: true
        });
    }
    
    // Additional emails
    const emailGroups = document.querySelectorAll('#emailsContainer .email-group');
    emailGroups.forEach((group) => {
        const emailIndex = group.getAttribute('data-email-index');
        const emailAddress = document.getElementById(`customerEmailField_${emailIndex}`)?.value;
        
        if (emailAddress) {
            emails.push({
                label: `Email ${emails.length + 1}`,
                address: emailAddress,
                isPrimary: false
            });
        }
    });
    
    // Collect all phones
    const phones = [];
    
    // Primary phone
    const primaryPhone = document.getElementById('customerPhoneField')?.value;
    if (primaryPhone) {
        phones.push({
            label: 'Primary',
            number: primaryPhone,
            isPrimary: true
        });
    }
    
    // Additional phones
    const phoneGroups = document.querySelectorAll('#phonesContainer .phone-group');
    phoneGroups.forEach((group) => {
        const phoneIndex = group.getAttribute('data-phone-index');
        const phoneNumber = document.getElementById(`customerPhoneField_${phoneIndex}`)?.value;
        
        if (phoneNumber) {
            phones.push({
                label: `Phone ${phones.length + 1}`,
                number: phoneNumber,
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
        addresses: addresses,
        emails: emails,
        phones: phones,
        customFields: getCustomerCustomFields()
    };
    
    console.log('=== SAVING CUSTOMER ===');
    console.log('Custom fields being saved:', customerData.customFields);
    
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
            console.log('Uploading customer documents:', window.uploadedFiles.customer.length, 'files');
            updateLoadingMessage('Uploading documents...');
            const uploadedDocs = await window.uploadFiles(window.uploadedFiles.customer);
            console.log('Upload response:', uploadedDocs);
            if (uploadedDocs && uploadedDocs.length > 0) {
                customerData.documents = uploadedDocs;
                console.log('Documents added to customerData:', customerData.documents);
            }
        } else {
            // Initialize documents as empty array if no files uploaded
            customerData.documents = [];
        }
        
        if (currentCustomerId) {
            updateLoadingMessage('Updating customer...');
            await window.APIService.updateCustomer(currentCustomerId, customerData);
            showToast('Customer updated successfully!', 'success');
        } else {
            updateLoadingMessage('Creating customer...');
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
    } finally {
        setButtonLoading(saveBtn, false);
        hideLoading();
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
        
        // Display all emails
        const emailElement = document.getElementById('profileEmail');
        if (profileData.customer.emails && profileData.customer.emails.length > 0) {
            emailElement.innerHTML = profileData.customer.emails.map((email, index) => 
                `<div style="margin-bottom: ${index < profileData.customer.emails.length - 1 ? '5px' : '0'};"><strong>${email.label || 'Email ' + (index + 1)}:</strong> ${email.address || '-'}</div>`
            ).join('');
        } else {
            emailElement.textContent = profileData.customer.email || '-';
        }
        
        // Display all phones
        const phoneElement = document.getElementById('profilePhone');
        if (profileData.customer.phones && profileData.customer.phones.length > 0) {
            phoneElement.innerHTML = profileData.customer.phones.map((phone, index) => 
                `<div style="margin-bottom: ${index < profileData.customer.phones.length - 1 ? '5px' : '0'};"><strong>${phone.label || 'Phone ' + (index + 1)}:</strong> ${phone.number || '-'}</div>`
            ).join('');
        } else {
            phoneElement.textContent = profileData.customer.phone || '-';
        }
        
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
        
        // Display custom fields
        console.log('Customer custom fields:', profileData.customer.customFields);
        const customFieldsContainer = document.getElementById('profileCustomFields');
        console.log('Custom fields container found:', customFieldsContainer);
        if (profileData.customer.customFields && profileData.customer.customFields.length > 0) {
            console.log('Displaying', profileData.customer.customFields.length, 'custom fields');
            customFieldsContainer.innerHTML = profileData.customer.customFields.map(field => 
                `<div class="info-item">
                    <label>${field.name}:</label>
                    <span>${field.value || '-'}</span>
                </div>`
            ).join('');
            customFieldsContainer.style.display = 'grid';
        } else {
            console.log('No custom fields to display');
            customFieldsContainer.style.display = 'none';
        }
        
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
    
    // Clear custom fields
    clearCustomerCustomFields();
}

async function refreshCustomers() {
    try {
        const tableContainer = document.querySelector('.customers-table-container');
        if (tableContainer) setTableLoading(tableContainer, true);
        
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
    } finally {
        const tableContainer = document.querySelector('.customers-table-container');
        if (tableContainer) setTableLoading(tableContainer, false);
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
        const tableContainer = document.querySelector('.customers-table-container');
        if (tableContainer) setTableLoading(tableContainer, true);
        
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
    } finally {
        const tableContainer = document.querySelector('.customers-table-container');
        if (tableContainer) setTableLoading(tableContainer, false);
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
window.addEmailAddress = addEmailAddress;
window.removeEmailAddress = removeEmailAddress;
window.addPhoneNumber = addPhoneNumber;
window.removePhoneNumber = removePhoneNumber;

// Global functions for button clicks
window.viewOrder = viewOrder;
window.editOrder = editOrder;
window.deleteOrder = deleteOrder;
window.showAddOrderModal = showAddOrderModal;
window.closeOrderModal = closeOrderModal;
window.saveOrder = saveOrder;

// Calculate Profit Function
function calculateProfit() {
    const revenue = parseFloat(document.getElementById('amount').value) || 0;
    const cost = parseFloat(document.getElementById('vendorCost').value) || 0;
    const processingFeePercent = parseFloat(document.getElementById('processingFee').value) || 0;
    
    const processingFeeAmount = (revenue * processingFeePercent) / 100;
    const profit = revenue - cost - processingFeeAmount;
    
    document.getElementById('profit').value = profit.toFixed(2);
}

window.calculateProfit = calculateProfit;

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
        
        // Show loading state
        const tableContainer = document.querySelector('.orders-table-container');
        if (tableContainer) setTableLoading(tableContainer, true);
        
        allOrders = await window.APIService.getOrders();
        console.log('Orders loaded:', allOrders.length);
        window.dashboard.renderOrdersTable(allOrders);
        initializeOrderFilters();
    } catch (error) {
        console.error('Failed to load orders:', error);
        window.dashboard.renderOrdersTable([]);
    } finally {
        window.ordersLoading = false;
        const tableContainer = document.querySelector('.orders-table-container');
        if (tableContainer) setTableLoading(tableContainer, false);
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
    console.log('Loading pipeline section...');
    
    // Show loading state immediately
    const stagesContainer = document.getElementById('stagesContainer');
    if (stagesContainer) {
        stagesContainer.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px;">
                <div class="loading-spinner" style="margin: 0 auto 20px;"></div>
                <div style="color: #6b7280; font-size: 14px; font-weight: 500;">Initializing pipeline...</div>
            </div>
        `;
    }
    
    // The pipeline-mongodb.js script should already be loaded and initialized
    // Just make sure the data is loaded
    if (typeof loadDataFromDB === 'function') {
        console.log('Calling loadDataFromDB from pipeline script...');
        loadDataFromDB();
    } else {
        console.error('Pipeline script not loaded or loadDataFromDB function not found');
        if (stagesContainer) {
            stagesContainer.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444; margin-bottom: 16px;"></i>
                    <div style="color: #1f2937; font-size: 16px; font-weight: 600; margin-bottom: 8px;">Pipeline Not Available</div>
                    <div style="color: #6b7280; font-size: 14px;">Pipeline script failed to load</div>
                </div>
            `;
        }
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
        console.log('Vendor data received:', vendor);
        console.log('Vendor notes:', vendor.notes);
        console.log('Vendor notes type:', typeof vendor.notes);
        
        document.getElementById('vendorDetailName').textContent = vendor.name;
        
        // Display all emails
        const emailElement = document.getElementById('detailVendorEmail');
        console.log('Full vendor object:', vendor);
        console.log('Vendor emails array:', vendor.emails);
        console.log('Vendor email field:', vendor.email);
        
        // Build emails array from both sources
        let emailsToDisplay = [];
        
        if (vendor.emails && Array.isArray(vendor.emails) && vendor.emails.length > 0) {
            emailsToDisplay = vendor.emails;
        } else if (vendor.email) {
            // Fallback: create array from single email field
            emailsToDisplay = [{ label: 'Primary', address: vendor.email, isPrimary: true }];
        }
        
        if (emailsToDisplay.length > 0) {
            console.log('Displaying emails:', emailsToDisplay);
            emailElement.innerHTML = emailsToDisplay.map((email, index) => 
                `<div style="margin-bottom: ${index < emailsToDisplay.length - 1 ? '5px' : '0'};"><strong>${email.label || 'Email ' + (index + 1)}:</strong> ${email.address || '-'}</div>`
            ).join('');
        } else {
            console.log('No email data found');
            emailElement.textContent = '-';
        }
        
        // Display all phones
        const phoneElement = document.getElementById('detailVendorPhone');
        console.log('Vendor phones array:', vendor.phones);
        console.log('Vendor phone field:', vendor.phone);
        
        // Build phones array from both sources
        let phonesToDisplay = [];
        
        if (vendor.phones && Array.isArray(vendor.phones) && vendor.phones.length > 0) {
            phonesToDisplay = vendor.phones;
        } else if (vendor.phone) {
            // Fallback: create array from single phone field
            phonesToDisplay = [{ label: 'Primary', number: vendor.phone, isPrimary: true }];
        }
        
        if (phonesToDisplay.length > 0) {
            console.log('Displaying phones:', phonesToDisplay);
            phoneElement.innerHTML = phonesToDisplay.map((phone, index) => 
                `<div style="margin-bottom: ${index < phonesToDisplay.length - 1 ? '5px' : '0'};"><strong>${phone.label || 'Phone ' + (index + 1)}:</strong> ${phone.number || '-'}</div>`
            ).join('');
        } else {
            console.log('No phone data found');
            phoneElement.textContent = '-';
        }
        
        document.getElementById('detailVendorCategory').textContent = vendor.category || '-';
        document.getElementById('detailVendorRating').innerHTML = '⭐'.repeat(vendor.rating || 0);
        document.getElementById('detailVendorAddress').textContent = vendor.address || '-';
        document.getElementById('detailVendorStatus').innerHTML = vendor.isActive 
            ? '<span style="color: #22c55e;">Active</span>' 
            : '<span style="color: #ef4444;">Inactive</span>';
        
        // Display notes if available
        const notesElement = document.getElementById('detailVendorNotes');
        if (notesElement) {
            const notesText = vendor.notes && vendor.notes.trim() ? vendor.notes.trim() : 'No notes available';
            console.log('Setting notes text to:', notesText);
            notesElement.textContent = notesText;
        }
        
        // Display custom fields
        console.log('Vendor custom fields:', vendor.customFields);
        const customFieldsContainer = document.getElementById('detailVendorCustomFields');
        console.log('Custom fields container found:', customFieldsContainer);
        if (vendor.customFields && vendor.customFields.length > 0) {
            console.log('Displaying', vendor.customFields.length, 'custom fields');
            customFieldsContainer.innerHTML = vendor.customFields.map(field => 
                `<div class="info-item">
                    <label>${field.name}:</label>
                    <span>${field.value || '-'}</span>
                </div>`
            ).join('');
            customFieldsContainer.style.display = 'grid';
        } else {
            console.log('No custom fields to display');
            customFieldsContainer.style.display = 'none';
        }
        
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
    const baseURL = window.location.hostname === 'localhost' 
        ? 'http://localhost:10000'
        : window.location.origin;
    
    // Extract just the filename from the URL
    let filename = url;
    if (url.includes('/uploads/')) {
        filename = url.split('/uploads/')[1];
    }
    
    // Use direct uploads path
    const downloadUrl = `${baseURL}/uploads/${filename}`;
    
    // Create a temporary link and click it to trigger download
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function viewDocument(url) {
    const baseURL = window.location.hostname === 'localhost' 
        ? 'http://localhost:10000'
        : window.location.origin;
    
    // Extract just the filename from the URL
    let filename = url;
    if (url.includes('/uploads/')) {
        filename = url.split('/uploads/')[1];
    }
    
    // Use direct uploads path
    const viewUrl = `${baseURL}/uploads/${filename}`;
    window.open(viewUrl, '_blank');
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

// User Management Functions
async function loadUsersSection() {
    try {
        const users = await window.APIService.getUsers();
        renderUsersTable(users);
    } catch (error) {
        console.error('Failed to load users:', error);
        showToast('Failed to load users: ' + error.message, 'error');
    }
}

function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    
    // Update stats
    const pendingCount = users.filter(u => u.role === 'pending').length;
    const activeCount = users.filter(u => u.role !== 'pending').length;
    
    document.getElementById('pendingUsersCount').textContent = pendingCount;
    document.getElementById('activeUsersCount').textContent = activeCount;
    
    if (!users || users.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="users-empty-state">
                    <i class="fas fa-users-cog"></i>
                    <h3>No Users Found</h3>
                    <p>No users have signed up yet</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = users.map(user => {
        const initials = ((user.firstName || '')[0] + (user.lastName || '')[0]).toUpperCase() || 'U';
        const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown';
        const userId = `#${user._id.substring(0, 8).toUpperCase()}`;
        const signupDate = new Date(user.createdAt).toLocaleDateString();
        const isPending = user.role === 'pending';
        const requestedRoleName = user.requestedRole ? user.requestedRole.replace('_', ' ') : 'Not specified';
        
        return `
        <tr>
            <td>
                <div class="user-info">
                    <div class="user-avatar">${initials}</div>
                    <div class="user-details">
                        <div class="user-name">${fullName}</div>
                        <div class="user-id">${userId}</div>
                    </div>
                </div>
            </td>
            <td>${user.email}</td>
            <td>
                <span class="role-badge ${user.role}">${user.role.replace('_', ' ')}</span>
                ${isPending && user.requestedRole ? `<br><small style="color: #6b7280; font-size: 11px;">Wants: ${requestedRoleName}</small>` : ''}
            </td>
            <td>${signupDate}</td>
            <td>
                <span class="status-badge ${isPending ? 'pending' : 'active'}">
                    <i class="fas fa-${isPending ? 'clock' : 'check-circle'}"></i>
                    ${isPending ? 'Pending' : 'Active'}
                </span>
            </td>
            <td>
                ${isPending ? `
                    ${user.requestedRole ? `
                        <button class="btn-assign-role" onclick="approveUserRole('${user._id}', '${user.requestedRole}')" style="background: #10b981; margin-right: 8px;">
                            <i class="fas fa-check"></i> Approve
                        </button>
                    ` : ''}
                    <select class="role-select" id="role-${user._id}" style="width: auto; display: inline-block;">
                        <option value="">Or assign...</option>
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="account_rep">Account Rep</option>
                    </select>
                    <button class="btn-assign-role" onclick="assignUserRole('${user._id}')">
                        <i class="fas fa-user-check"></i> Assign
                    </button>
                ` : `
                    <select class="role-select" id="role-${user._id}" onchange="changeUserRole('${user._id}')">
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                        <option value="manager" ${user.role === 'manager' ? 'selected' : ''}>Manager</option>
                        <option value="account_rep" ${user.role === 'account_rep' ? 'selected' : ''}>Account Rep</option>
                    </select>
                `}
            </td>
            <td>
                <button class="action-btn delete" onclick="deleteUser('${user._id}')" title="Delete User">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `;
    }).join('');
}

async function assignUserRole(userId) {
    const roleSelect = document.getElementById(`role-${userId}`);
    const role = roleSelect.value;
    
    if (!role) {
        showToast('Please select a role', 'error');
        return;
    }
    
    try {
        await window.APIService.assignUserRole(userId, role);
        showToast('Role assigned successfully! User must logout and login to see changes.', 'success');
        await loadUsersSection();
    } catch (error) {
        showToast('Failed to assign role: ' + error.message, 'error');
    }
}

async function changeUserRole(userId) {
    const roleSelect = document.getElementById(`role-${userId}`);
    const role = roleSelect.value;
    
    if (!confirm(`Are you sure you want to change this user's role to ${role.replace('_', ' ')}?`)) {
        await loadUsersSection();
        return;
    }
    
    try {
        await window.APIService.assignUserRole(userId, role);
        showToast('Role updated successfully! User must logout and login to see changes.', 'success');
        await loadUsersSection();
    } catch (error) {
        showToast('Failed to update role: ' + error.message, 'error');
        await loadUsersSection();
    }
}

async function approveUserRole(userId, requestedRole) {
    if (!confirm(`Approve user's request for ${requestedRole.replace('_', ' ')} role?`)) {
        return;
    }
    
    try {
        await window.APIService.assignUserRole(userId, requestedRole);
        showToast('User approved! They can now login with their requested role.', 'success');
        await loadUsersSection();
    } catch (error) {
        showToast('Failed to approve user: ' + error.message, 'error');
    }
}

async function deleteUser(userId) {
    showConfirmModal(
        'Delete User',
        'Are you sure you want to delete this user?',
        'This action cannot be undone. The user will be permanently removed from the system.',
        async () => {
            try {
                await window.APIService.deleteUser(userId);
                showToast('User deleted successfully!', 'success');
                await loadUsersSection();
            } catch (error) {
                showToast('Failed to delete user: ' + error.message, 'error');
            }
        }
    );
}

// Custom Confirmation Modal
function showConfirmModal(title, message, warning, onConfirm) {
    // Remove existing modal if any
    const existingModal = document.getElementById('customConfirmModal');
    if (existingModal) existingModal.remove();
    
    // Create modal HTML
    const modalHTML = `
        <div class="confirm-modal-overlay" id="customConfirmModal">
            <div class="confirm-modal">
                <div class="confirm-modal-header">
                    <div class="confirm-modal-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h2 class="confirm-modal-title">${title}</h2>
                </div>
                <div class="confirm-modal-body">
                    <p class="confirm-modal-message">${message}</p>
                    ${warning ? `
                        <div class="confirm-modal-warning">
                            <div class="confirm-modal-warning-title">
                                <i class="fas fa-info-circle"></i>
                                <span>Warning</span>
                            </div>
                            <p class="confirm-modal-warning-text">${warning}</p>
                        </div>
                    ` : ''}
                </div>
                <div class="confirm-modal-footer">
                    <button class="confirm-modal-btn confirm-modal-btn-cancel" onclick="closeConfirmModal()">
                        <i class="fas fa-times"></i>
                        Cancel
                    </button>
                    <button class="confirm-modal-btn confirm-modal-btn-confirm" onclick="confirmAction()">
                        <i class="fas fa-trash"></i>
                        Delete
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Store callback
    window.confirmCallback = onConfirm;
    
    // Show modal with animation
    setTimeout(() => {
        document.getElementById('customConfirmModal').classList.add('show');
    }, 10);
    
    // Close on overlay click
    document.getElementById('customConfirmModal').addEventListener('click', (e) => {
        if (e.target.id === 'customConfirmModal') {
            closeConfirmModal();
        }
    });
}

function closeConfirmModal() {
    const modal = document.getElementById('customConfirmModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
    window.confirmCallback = null;
}

function confirmAction() {
    if (window.confirmCallback) {
        window.confirmCallback();
    }
    closeConfirmModal();
}

window.closeConfirmModal = closeConfirmModal;
window.confirmAction = confirmAction;

window.loadUsersSection = loadUsersSection;
window.assignUserRole = assignUserRole;
window.changeUserRole = changeUserRole;
window.approveUserRole = approveUserRole;
window.deleteUser = deleteUser;

// Add User Functions
function showAddUserModal() {
    document.getElementById('addUserForm').reset();
    document.getElementById('sendEmailCheckbox').checked = true;
    document.getElementById('addUserModal').classList.add('show');
}

function closeAddUserModal() {
    document.getElementById('addUserModal').classList.remove('show');
}

async function saveNewUser() {
    const form = document.getElementById('addUserForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const saveBtn = document.querySelector('#addUserModal .btn-primary');
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
    
    const userData = {
        firstName: document.getElementById('newUserFirstName').value,
        lastName: document.getElementById('newUserLastName').value,
        email: document.getElementById('newUserEmail').value,
        password: document.getElementById('newUserPassword').value,
        role: document.getElementById('newUserRole').value
    };
    
    try {
        await window.APIService.createUser(userData);
        
        const sendEmail = document.getElementById('sendEmailCheckbox').checked;
        if (sendEmail) {
            showToast('User created successfully! Login credentials have been sent to their email.', 'success');
        } else {
            showToast('User created successfully!', 'success');
        }
        
        closeAddUserModal();
        await loadUsersSection();
    } catch (error) {
        showToast('Failed to create user: ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Create User';
    }
}

window.showAddUserModal = showAddUserModal;
window.closeAddUserModal = closeAddUserModal;
window.saveNewUser = saveNewUser;
window.forceRefreshDashboard = forceRefreshDashboard;


// Copy Order ID to Clipboard
function copyOrderId(orderId) {
    navigator.clipboard.writeText(orderId).then(() => {
        showToast('Order ID copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Failed to copy:', err);
        showToast('Failed to copy Order ID', 'error');
    });
}

window.copyOrderId = copyOrderId;

// Financial Filter Functions
async function applyFinancialFilter() {
    const startDate = document.getElementById('financialStartDate').value;
    const endDate = document.getElementById('financialEndDate').value;
    
    if (!startDate || !endDate) {
        showToast('Please select both start and end dates', 'error');
        return;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
        showToast('Start date must be before end date', 'error');
        return;
    }
    
    // Refresh financial overview with date filter
    if (window.dashboard) {
        const [orders, payments] = await Promise.all([
            window.APIService.getOrders().catch(() => []),
            window.APIService.getPayments().catch(() => [])
        ]);
        window.dashboard.renderFinancialOverview(orders, payments);
    }
}

function resetFinancialFilter() {
    document.getElementById('financialStartDate').value = '';
    document.getElementById('financialEndDate').value = '';
    
    // Refresh financial overview without filter
    if (window.dashboard) {
        window.dashboard.renderDashboard();
    }
}

window.applyFinancialFilter = applyFinancialFilter;
window.resetFinancialFilter = resetFinancialFilter;

// Toggle recurring fields in order form
function toggleRecurringFields() {
    const orderType = document.getElementById('orderType').value;
    const recurringFields = document.getElementById('recurringFields');
    const recurringFrequency = document.getElementById('recurringFrequency');
    
    if (orderType === 'recurring') {
        recurringFields.style.display = 'block';
        recurringFrequency.required = true;
    } else {
        recurringFields.style.display = 'none';
        recurringFrequency.required = false;
        // Clear recurring fields when switching to one-time
        document.getElementById('recurringFrequency').value = 'weekly';
        document.getElementById('recurringEndDate').value = '';
        document.getElementById('recurringNotes').value = '';
    }
}

// Make function globally available
window.toggleRecurringFields = toggleRecurringFields;

// Recurring Calendar navigation functions
// recurringCurrentMonth and recurringCurrentYear are declared in calendar.js

function previousRecurringMonth() {
    recurringCurrentMonth--;
    if (recurringCurrentMonth < 0) {
        recurringCurrentMonth = 11;
        recurringCurrentYear--;
    }
    if (typeof window.renderRecurringCalendar === 'function') window.renderRecurringCalendar();
}

function nextRecurringMonth() {
    recurringCurrentMonth++;
    if (recurringCurrentMonth > 11) {
        recurringCurrentMonth = 0;
        recurringCurrentYear++;
    }
    if (typeof window.renderRecurringCalendar === 'function') window.renderRecurringCalendar();
}

function closeRecurringDetailPanel() {
    const panel = document.getElementById('recurringDetailPanel');
    if (panel) panel.style.display = 'none';
}

window.previousRecurringMonth = previousRecurringMonth;
window.nextRecurringMonth = nextRecurringMonth;
window.closeRecurringDetailPanel = closeRecurringDetailPanel;

function loadRecurringCalendarSection() {
    if (typeof window.renderRecurringCalendar === 'function') {
        window.renderRecurringCalendar();
    }
}

window.loadRecurringCalendarSection = loadRecurringCalendarSection;


// Toggle Recurring Fields Function
function toggleRecurringFields() {
    const orderType = document.getElementById('orderType').value;
    const recurringFields = document.getElementById('recurringFields');
    const endDateGroup = document.getElementById('endDateGroup');
    const endDateInput = document.getElementById('endDate');

    if (orderType === 'recurring') {
        recurringFields.style.display = 'block';
        if (endDateGroup) {
            endDateGroup.style.display = 'none';
        }
        if (endDateInput) {
            endDateInput.required = false;
        }
    } else {
        recurringFields.style.display = 'none';
        if (endDateGroup) {
            endDateGroup.style.display = 'block';
        }
        if (endDateInput) {
            endDateInput.required = true;
        }
    }
}

window.toggleRecurringFields = toggleRecurringFields;


