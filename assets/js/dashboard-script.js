// Arizona Time (America/Phoenix, MST / GMT-7) helpers — requires config/timezone-config.js
function tz() {
    return window.TimezoneConfig;
}
function todayDateInput() {
    const c = tz();
    return c ? c.todayInputMDT() : new Date().toISOString().split('T')[0];
}
function nowInMDT() {
    const c = tz();
    return c ? c.nowMDT() : new Date();
}
function formatDisplayDate(value, fallback = '-') {
    if (!value) return fallback;
    const c = tz();
    if (c) {
        const formatted = c.formatDateShortMDT(value);
        return formatted || fallback;
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? fallback : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
function formatDisplayDateInput(value) {
    if (!value) return '';
    const c = tz();
    return c ? c.formatForInput(value) : new Date(value).toISOString().split('T')[0];
}
function formatDashboardDateTime(date = new Date()) {
    return date.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: tz()?.TIMEZONE || 'America/Phoenix'
    });
}
function updateDashboardDateTime() {
    const currentDateElement = document.getElementById('currentDate');
    if (!currentDateElement) return;
    const now = nowInMDT();
    const timezone = tz()?.TIMEZONE || 'America/Phoenix';
    const dateText = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: timezone
    });
    const timeText = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: timezone
    });
    currentDateElement.innerHTML = `${dateText}<small>${timeText}</small>`;
}

// Dashboard Data and Functionality
class DashboardManager {
    constructor() {
        this.initializeData();
        this.initializeEventListeners();
        this.renderDashboard();
    }

    initializeData() {
        // Data will be loaded from API
        this.categoryOverviewExpanded = false;
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
            const syncSidebarToggleAria = () => {
                const narrow = window.matchMedia('(max-width: 768px)').matches;
                const open = narrow ? sidebar.classList.contains('show') : !sidebar.classList.contains('collapsed');
                sidebarToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            };
            sidebarToggle.addEventListener('click', () => {
                sidebar.classList.toggle('collapsed');
                sidebar.classList.toggle('show');
                mainContent.classList.toggle('expanded');
                syncSidebarToggleAria();
            });
            window.matchMedia('(max-width: 768px)').addEventListener('change', syncSidebarToggleAria);
            syncSidebarToggleAria();
        }

        // Menu navigation
        const menuItems = document.querySelectorAll('.menu-item a');
        menuItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const targetSection = item.getAttribute('data-section');
                window.AppLogger?.debug('Menu clicked:', targetSection);
                this.showSection(targetSection);
                
                // Load section-specific data
                if (targetSection === 'orders') {
                    loadOrdersSection();
                } else if (targetSection === 'workflow-center') {
                    loadWorkflowCenter();
                } else if (targetSection === 'incoming-quotes') {
                    window.loadIncomingQuotes?.();
                } else if (targetSection === 'outgoing-quotes') {
                    window.loadOutgoingQuotes?.();
                } else if (targetSection === 'customer-approvals') {
                    window.loadCustomerApprovals?.();
                } else if (targetSection === 'scheduling') {
                    window.loadScheduling?.();
                } else if (targetSection === 'customers') {
                    loadCustomersSection();
                } else if (targetSection === 'vendors') {
                    loadVendorsSection();
                } else if (targetSection === 'vendor-reviews') {
                    window.loadVendorReviews?.();
                    window.refreshVendorInvitations?.();
                    window.refreshVendorEmailStatus?.();
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
                } else if (targetSection === 'calendar') {
                    if (typeof window.loadCalendarSection === 'function') {
                        window.loadCalendarSection();
                    }
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

        // Recent activity: open order detail when a row with data-order-id is activated
        const recentActivityEl = document.getElementById('recentActivity');
        if (recentActivityEl && !recentActivityEl.dataset.orderNavBound) {
            recentActivityEl.dataset.orderNavBound = '1';
            recentActivityEl.addEventListener('click', (e) => {
                const row = e.target.closest('.activity-item[data-order-id]');
                if (!row) return;
                const id = row.getAttribute('data-order-id');
                if (id && typeof window.viewOrder === 'function') {
                    window.viewOrder(id, true);
                }
            });
            recentActivityEl.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                const row = e.target.closest('.activity-item[data-order-id]');
                if (!row || !recentActivityEl.contains(row)) return;
                e.preventDefault();
                const id = row.getAttribute('data-order-id');
                if (id && typeof window.viewOrder === 'function') {
                    window.viewOrder(id, true);
                }
            });
        }
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
        const sectionPermissions = {
            vendors: window.PERMISSIONS?.VIEW_VENDORS,
            'vendor-reviews': window.PERMISSIONS?.VIEW_VENDORS,
            employees: window.PERMISSIONS?.VIEW_EMPLOYEES,
            payments: window.PERMISSIONS?.VIEW_PAYMENTS,
            accounting: window.PERMISSIONS?.VIEW_ACCOUNTING,
            reports: window.PERMISSIONS?.VIEW_REPORTS,
            settings: window.PERMISSIONS?.VIEW_SETTINGS,
            users: window.PERMISSIONS?.MANAGE_SETTINGS
        };
        const requiredPermission = sectionPermissions[sectionId];
        if (requiredPermission && !window.RBAC?.hasPermission(requiredPermission)) {
            window.showToast?.('You do not have permission to access this section.', 'error');
            return;
        }
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
            this.showLoadingState();

            const stats = await window.APIService.getDashboardStats({
                refresh: this.forceFreshDashboardStats
            });
            this.forceFreshDashboardStats = false;

            this.renderKPIs(stats);
            this.renderExecutiveCommand(stats);
            this.renderPerformanceIntelligence(stats);
            this.renderVendorCategoriesFromStats(stats.vendorCategories, stats.totalVendors);
            this.renderEmployeeLeaderboardFromStats(stats.employeeLeaderboard);
            this.renderRevenueOverviewFromStats(stats.revenueTimeline);
            this.renderMiniCharts(stats);
            const syncedOrders = await this.getDashboardOrdersForOverview();
            const ordersOverview = await this.getSyncedOrdersOverview(stats, syncedOrders);
            this.renderOrdersOverview(stats, ordersOverview, syncedOrders);
            const serviceCategoryOverview = await this.getSyncedServiceCategoryOverview(stats, syncedOrders);
            this.renderServiceCategoryOverview(serviceCategoryOverview);
            this.renderTopPerformanceCards(stats.topPerformance, serviceCategoryOverview);
            this.renderFinancialOverviewSummary(stats.financialOverview);
            this.renderWorkflowSummary(stats.workflow);
            this.renderRecentActivity(stats.recentActivity || []);
            if (typeof window.setTopCustomersData === 'function') {
                window.setTopCustomersData(stats.topCustomers || []);
            }
            this.hideLoadingState();
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
            this.hideLoadingState();
            this.renderKPIs();
            this.renderExecutiveCommand();
            this.renderPerformanceIntelligence();
            this.renderVendorCategoriesFromStats();
            this.renderEmployeeLeaderboardFromStats();
            this.renderRevenueOverviewFromStats();
            this.renderMiniCharts();
            this.renderOrdersOverview();
            this.renderServiceCategoryOverview();
            this.renderTopPerformanceCards();
            this.renderFinancialOverviewSummary();
            this.renderWorkflowSummary();
            this.renderRecentActivity([]);
            if (window.showToast) {
                showToast('Failed to load dashboard summary. Please try refreshing.', 'error');
            }
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
        const kpiIds = ['totalOrders', 'totalRevenue', 'paymentsCollected', 'totalVendors', 'totalCustomers'];
        kpiIds.forEach((id) => {
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

    renderExecutiveCommand(stats = {}) {
        this.renderExecutiveHealth(stats.executiveHealth || {});
        this.renderRevenueControl(stats.revenueControl || {});
        this.renderExceptionQueue(stats.exceptionQueue || []);
        const exceptionCountEl = document.getElementById('businessExceptionCount');
        const exceptionCount = Number(stats.businessHealth?.exceptionCount || (stats.exceptionQueue || []).filter(item => item.priority !== 'low').length || 0);
        if (exceptionCountEl) {
            exceptionCountEl.textContent = `${exceptionCount.toLocaleString()} active exception${exceptionCount === 1 ? '' : 's'}`;
            exceptionCountEl.className = `executive-command-meta ${exceptionCount ? 'risk' : 'good'}`;
        }
    }

    renderExecutiveHealth(executiveHealth = {}) {
        const container = document.getElementById('executiveHealthGrid');
        if (!container) return;

        const items = Array.isArray(executiveHealth.healthItems) && executiveHealth.healthItems.length
            ? executiveHealth.healthItems
            : [
                { key: 'cash', label: 'Cash Health', value: '0%', status: 'watch', detail: 'No revenue data' },
                { key: 'margin', label: 'Margin Health', value: '0%', status: 'watch', detail: 'No margin data' },
                { key: 'operations', label: 'Operations Health', value: '0%', status: 'watch', detail: 'No job data' },
                { key: 'capacity', label: 'Capacity Health', value: '0%', status: 'watch', detail: 'No capacity data' },
                { key: 'customer', label: 'Customer Health', value: '0%', status: 'watch', detail: 'No customer data' }
            ];

        const icons = {
            cash: 'wallet',
            margin: 'chart-pie',
            operations: 'clipboard-check',
            capacity: 'users-cog',
            customer: 'user-shield'
        };

        container.innerHTML = items.map(item => `
            <article class="executive-health-card ${escapePaymentHtml(item.status || 'watch')}" role="listitem">
                <span class="executive-health-icon" aria-hidden="true"><i class="fas fa-${escapePaymentHtml(icons[item.key] || 'gauge-high')}"></i></span>
                <div class="executive-health-copy">
                    <small>${escapePaymentHtml(item.label || 'Health')}</small>
                    <strong>${escapePaymentHtml(item.value || '0')}</strong>
                    <span>${escapePaymentHtml(item.detail || '')}</span>
                </div>
                <em>${escapePaymentHtml(item.status || 'watch')}</em>
            </article>
        `).join('');
    }

    renderRevenueControl(revenueControl = {}) {
        const container = document.getElementById('revenueControlGrid');
        const marginEl = document.getElementById('revenueControlMargin');
        if (!container) return;

        const margin = Number(revenueControl.grossMargin || 0);
        if (marginEl) marginEl.textContent = `${margin}% gross margin`;
        const items = [
            { label: 'Booked revenue', value: this.formatRevenueOverviewCurrency(revenueControl.bookedRevenue || 0), tone: 'blue' },
            { label: 'Collected revenue', value: this.formatRevenueOverviewCurrency(revenueControl.collectedRevenue || 0), tone: 'green' },
            { label: 'Pending AR', value: this.formatRevenueOverviewCurrency(revenueControl.pendingReceivables || 0), tone: 'amber' },
            { label: 'Overdue AR', value: this.formatRevenueOverviewCurrency(revenueControl.overdueReceivables || 0), tone: 'red' },
            { label: 'Vendor payable', value: this.formatRevenueOverviewCurrency(revenueControl.vendorPayable || 0), tone: 'slate' },
            { label: 'Recurring revenue', value: `${this.formatRevenueOverviewCurrency(revenueControl.recurringRevenue || 0)} · ${Number(revenueControl.recurringRevenuePercent || 0)}%`, tone: 'purple' }
        ];

        container.innerHTML = items.map(item => `
            <div class="revenue-control-item ${item.tone}">
                <span>${escapePaymentHtml(item.label)}</span>
                <strong>${escapePaymentHtml(item.value)}</strong>
            </div>
        `).join('');
    }

    renderExceptionQueue(exceptionQueue = []) {
        const container = document.getElementById('exceptionQueueList');
        if (!container) return;

        if (!Array.isArray(exceptionQueue) || !exceptionQueue.length) {
            container.innerHTML = `
                <div class="exception-empty" role="status">
                    <i class="fas fa-check-circle" aria-hidden="true"></i>
                    <span>No active exceptions</span>
                </div>
            `;
            return;
        }

        container.innerHTML = exceptionQueue.map(item => `
            <div class="exception-row ${escapePaymentHtml(item.priority || 'low')}">
                <div>
                    <small>${escapePaymentHtml(item.title || 'Exception')}</small>
                    <strong>${escapePaymentHtml(item.value || '0')}</strong>
                    <span>${escapePaymentHtml(item.detail || '')}</span>
                </div>
            </div>
        `).join('');
    }

    renderPerformanceIntelligence(stats = {}) {
        this.renderMetricStack('jobAnalyticsGrid', [
            ['Active jobs', stats.jobAnalytics?.activeJobs || 0],
            ['Delayed jobs', stats.jobAnalytics?.delayedJobs || 0],
            ['Avg cycle time', `${stats.jobAnalytics?.avgCycleDays || 0}d`],
            ['Low-margin jobs', stats.jobAnalytics?.lowMarginJobs || 0],
            ['Unassigned jobs', stats.jobAnalytics?.unassignedJobs || 0]
        ]);
        this.renderMetricStack('customerAnalyticsGrid', [
            ['Retention rate', `${stats.customerAnalytics?.retentionRate || 0}%`],
            ['Avg customer revenue', this.formatRevenueOverviewCurrency(stats.customerAnalytics?.averageCustomerRevenue || 0)],
            ['Top 5 concentration', `${stats.customerAnalytics?.concentrationRisk || 0}%`],
            ['Recurring customers', stats.customerAnalytics?.recurringCustomers || 0],
            ['At-risk customers', stats.customerAnalytics?.atRiskCustomers || 0]
        ]);
        this.renderEmployeePerformance(stats.employeePerformance || {});
        this.renderVendorPerformance(stats.vendorPerformance || {});
        this.renderServicePerformance(stats.servicePerformance || []);
    }

    renderMetricStack(containerId, rows = []) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = rows.map(([label, value]) => `
            <div class="metric-stack-row">
                <span>${escapePaymentHtml(label)}</span>
                <strong>${escapePaymentHtml(String(value))}</strong>
            </div>
        `).join('');
    }

    renderVendorPerformance(vendorPerformance = {}) {
        const rows = Array.isArray(vendorPerformance.topVendors) ? vendorPerformance.topVendors : [];
        const baseRows = [
            ['Pending payables', this.formatRevenueOverviewCurrency(vendorPerformance.pendingPayables || 0)],
            ['Paid payables', this.formatRevenueOverviewCurrency(vendorPerformance.paidPayables || 0)]
        ];
        const vendorRows = rows.slice(0, 3).map(vendor => [
            vendor.name || 'Vendor',
            `${this.formatRevenueOverviewCurrency(vendor.revenue || 0)} · ${Number(vendor.margin || 0)}% margin`
        ]);
        this.renderMetricStack('vendorPerformanceGrid', [...baseRows, ...vendorRows]);
    }

    renderEmployeePerformance(employeePerformance = {}) {
        const rows = Array.isArray(employeePerformance.topEmployees) ? employeePerformance.topEmployees : [];
        const baseRows = [
            ['Total employees', employeePerformance.totalEmployees || 0],
            ['Utilization rate', `${employeePerformance.utilizationRate || 0}%`]
        ];
        const employeeRows = rows.slice(0, 3).map(employee => [
            employee.name || 'Employee',
            `${this.formatRevenueOverviewCurrency(employee.revenue || 0)} · ${Number(employee.completionRate || 0)}% complete`
        ]);
        this.renderMetricStack('employeePerformanceGrid', [...baseRows, ...employeeRows]);
    }

    renderServicePerformance(servicePerformance = []) {
        const container = document.getElementById('servicePerformanceTable');
        if (!container) return;
        const rows = Array.isArray(servicePerformance) ? servicePerformance.slice(0, 6) : [];
        if (!rows.length) {
            container.innerHTML = '<div class="service-performance-empty">No service performance data yet</div>';
            return;
        }
        container.innerHTML = `
            <div class="service-performance-head-row">
                <span>Service</span>
                <span>Revenue</span>
                <span>Margin</span>
                <span>SLA</span>
            </div>
            ${rows.map(service => `
                <div class="service-performance-row">
                    <strong>${escapePaymentHtml(service.label || service.key || 'Service')}</strong>
                    <span>${this.formatRevenueOverviewCurrency(service.revenue || 0)}</span>
                    <span>${Number(service.margin || 0)}%</span>
                    <span>${Number(service.completionRate || 0)}% complete</span>
                </div>
            `).join('')}
        `;
    }

    renderMiniCharts(stats = {}) {
        this.renderMiniRevenueTrend(stats.revenueTimeline || []);
        this.renderMiniOrdersByStatus(stats.orderStatusBreakdown || []);
        this.renderMiniMonthlyProfit(stats.monthlyProfitTimeline || []);
        this.renderMiniCustomerType(stats.customerTypeBreakdown || []);
    }

    normalizeOrderOverviewText(value) {
        return String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
    }

    getOrderOverviewStatus(order = {}) {
        const status = this.normalizeOrderOverviewText(order.status);
        const stage = this.normalizeOrderOverviewText(order.pipelineStage);
        const combined = `${status} ${stage}`;

        if (/(cancel|lost)/.test(combined)) return 'cancelled';
        if (status === 'delayed' || /delayed|on-hold|hold/.test(stage)) return 'delayed';
        if (status === 'completed' || /completed|complete|paid|closed|done/.test(stage)) return 'completed';
        if (status === 'in-progress' || /in-progress|work|active|scheduled|assigned|dispatch/.test(stage)) return 'inProgress';
        if (status === 'new' || /new|lead|request|intake/.test(stage)) return 'newOrders';
        return null;
    }

    buildOrdersOverviewFromOrders(orders = []) {
        const overview = {
            version: 'real-orders-v2',
            newOrders: 0,
            inProgress: 0,
            completed: 0,
            delayed: 0,
            cancelled: 0,
            highPriority: 0
        };

        (Array.isArray(orders) ? orders : []).forEach(order => {
            const bucket = this.getOrderOverviewStatus(order);
            if (bucket) overview[bucket] += 1;
            if (['high', 'urgent'].includes(this.normalizeOrderOverviewText(order.priority))) {
                overview.highPriority += 1;
            }
        });

        return overview;
    }

    async getDashboardOrdersForOverview() {
        try {
            return await window.APIService.getOrdersFresh();
        } catch (error) {
            console.warn('Unable to load orders for dashboard overview:', error);
            return null;
        }
    }

    async getSyncedOrdersOverview(stats = {}, orders = null) {
        if (Array.isArray(orders)) return this.buildOrdersOverviewFromOrders(orders);
        return stats.ordersOverview || {};
    }

    renderOrdersOverview(stats = {}, syncedOverview = null, orders = null) {
        const container = document.getElementById('ordersOverviewCards');
        const totalEl = document.getElementById('ordersOverviewTotal');
        if (!container) return;

        const statusCounts = new Map((Array.isArray(stats.orderStatusBreakdown) ? stats.orderStatusBreakdown : [])
            .map(row => [String(row.status || 'unknown').toLowerCase(), Number(row.count || 0)]));
        const overview = syncedOverview || stats.ordersOverview || {};
        const cards = [
            { key: 'new', label: 'New Orders', value: Number(overview.newOrders ?? statusCounts.get('new') ?? 0), icon: 'plus-circle' },
            { key: 'progress', label: 'In Progress', value: Number(overview.inProgress ?? statusCounts.get('in-progress') ?? 0), icon: 'spinner' },
            { key: 'completed', label: 'Completed', value: Number(overview.completed ?? statusCounts.get('completed') ?? 0), icon: 'check-circle' },
            { key: 'delayed', label: 'Delayed', value: Number(overview.delayed ?? statusCounts.get('delayed') ?? 0), icon: 'clock' },
            { key: 'cancelled', label: 'Cancelled', value: Number(overview.cancelled ?? statusCounts.get('cancelled') ?? statusCounts.get('canceled') ?? 0), icon: 'times-circle' },
            { key: 'priority', label: 'High Priority Orders', value: Number(overview.highPriority ?? 0), icon: 'exclamation-circle' }
        ];
        const ordersData = Array.isArray(orders) ? orders : null;
        const total = ordersData
            ? ordersData.length
            : Number(stats.totalOrders ?? cards.slice(0, 5).reduce((sum, card) => sum + card.value, 0));
        if (totalEl) totalEl.textContent = `${total.toLocaleString()} order${total === 1 ? '' : 's'}`;

        const liveOrders = ordersData || [];
        const activeOrders = cards.find(card => card.key === 'progress')?.value || 0;
        const completedOrders = cards.find(card => card.key === 'completed')?.value || 0;
        const completedRate = total ? Math.round((completedOrders / total) * 100) : 0;
        const priorityCounts = this.buildOrdersPriorityBreakdown(liveOrders, overview);
        const weeklySeries = this.buildOrdersWeeklyPerformanceSeries(liveOrders);
        const trendSeries = this.buildOrderVolumeDailySeriesForDays(liveOrders, 30);
        const recentHighPriority = this.getRecentHighPriorityOrders(liveOrders);
        const flowRows = [
            { key: 'new', label: 'New Orders', value: cards.find(card => card.key === 'new')?.value || 0, icon: 'plus-circle' },
            { key: 'progress', label: 'In Progress', value: activeOrders, icon: 'spinner' },
            { key: 'completed', label: 'Completed', value: completedOrders, icon: 'check-circle' }
        ];
        const statusRows = [
            { key: 'completed', label: 'Completed', value: completedOrders, color: '#176B4A' },
            { key: 'new', label: 'New Orders', value: cards.find(card => card.key === 'new')?.value || 0, color: '#0B0B0C' },
            { key: 'progress', label: 'In Progress', value: activeOrders, color: '#555559' },
            { key: 'delayed', label: 'Delayed', value: cards.find(card => card.key === 'delayed')?.value || 0, color: '#7A4E00' },
            { key: 'cancelled', label: 'Cancelled', value: cards.find(card => card.key === 'cancelled')?.value || 0, color: '#B42318' }
        ];
        const summaryTiles = [
            {
                key: 'total',
                label: 'Total Orders',
                value: total,
                icon: 'shopping-bag',
                delta: this.getOrdersDeltaLabel(liveOrders, () => true, 30),
                spark: trendSeries.slice(-10)
            },
            {
                key: 'active',
                label: 'Active Orders',
                value: activeOrders,
                icon: 'layer-group',
                delta: this.getOrdersDeltaLabel(liveOrders, order => this.getOrderOverviewStatus(order) === 'inProgress', 7),
                spark: this.buildOrdersStatusSparkline(liveOrders, 'inProgress')
            },
            {
                key: 'completed',
                label: 'Completed Rate',
                value: `${completedRate}%`,
                icon: 'check-circle',
                delta: this.getOrdersDeltaLabel(liveOrders, order => this.getOrderOverviewStatus(order) === 'completed', 30),
                spark: this.buildOrdersStatusSparkline(liveOrders, 'completed')
            },
            {
                key: 'priority',
                label: 'High Priority Orders',
                value: priorityCounts.high,
                icon: 'exclamation-circle',
                delta: this.getOrdersDeltaLabel(liveOrders, order => ['high', 'urgent'].includes(this.normalizeOrderOverviewText(order.priority)), 7),
                spark: this.buildOrdersPrioritySparkline(liveOrders)
            }
        ];

        container.innerHTML = `
            <div class="orders-overview-metric-row">
                ${summaryTiles.map(tile => this.renderOrdersOverviewMetricTile(tile)).join('')}
            </div>
            <div class="orders-overview-detail-grid">
                <article class="orders-overview-detail-card orders-status-distribution">
                    <div class="orders-detail-head">
                        <h3>Order status distribution</h3>
                    </div>
                    ${this.renderOrdersStatusDistribution(statusRows, total)}
                </article>
                <article class="orders-overview-detail-card orders-flow-card">
                    <div class="orders-detail-head">
                        <h3>Order flow</h3>
                    </div>
                    ${this.renderOrdersFlow(flowRows, completedRate)}
                </article>
                <article class="orders-overview-detail-card orders-trend-card">
                    <div class="orders-detail-head">
                        <h3>Orders trend <span>Last 30 days</span></h3>
                    </div>
                    ${this.renderOrdersOverviewTrendCard(trendSeries)}
                </article>
                <article class="orders-overview-detail-card orders-priority-card">
                    <div class="orders-detail-head">
                        <h3>Priority breakdown</h3>
                    </div>
                    ${this.renderOrdersPriorityBreakdown(priorityCounts)}
                </article>
                <article class="orders-overview-detail-card orders-weekly-card">
                    <div class="orders-detail-head">
                        <h3>Weekly performance <span>Orders created this week</span></h3>
                    </div>
                    ${this.renderOrdersWeeklyPerformance(weeklySeries)}
                </article>
                <article class="orders-overview-detail-card orders-recent-priority-card">
                    <div class="orders-detail-head">
                        <h3>Recent high-priority orders</h3>
                        <button type="button" onclick="openOrdersSection()">View all</button>
                    </div>
                    ${this.renderRecentHighPriorityOrders(recentHighPriority)}
                </article>
            </div>
        `;
    }

    renderOrdersOverviewMetricTile(tile) {
        return `
            <article class="orders-overview-metric-tile ${escapePaymentHtml(tile.key)}">
                <span class="orders-overview-metric-icon" aria-hidden="true"><i class="fas fa-${escapePaymentHtml(tile.icon)}"></i></span>
                <div class="orders-overview-metric-copy">
                    <small>${escapePaymentHtml(tile.label)}</small>
                    <strong>${typeof tile.value === 'number' ? tile.value.toLocaleString() : escapePaymentHtml(tile.value)}</strong>
                    <span class="orders-overview-delta ${tile.delta.direction}">
                        <i class="fas fa-arrow-${tile.delta.direction === 'down' ? 'down' : 'up'}" aria-hidden="true"></i>
                        ${escapePaymentHtml(tile.delta.label)}
                    </span>
                </div>
                ${this.renderOrdersSparkline(tile.spark, tile.key === 'priority' ? '#7A4E00' : tile.key === 'completed' ? '#176B4A' : '#0B0B0C')}
            </article>
        `;
    }

    getOrdersDeltaLabel(orders, predicate, days) {
        const currentEnd = todayDateInput();
        const currentStart = this.addRevenueDays(currentEnd, -(days - 1));
        const previousEnd = this.addRevenueDays(currentStart, -1);
        const previousStart = this.addRevenueDays(previousEnd, -(days - 1));
        const countInRange = (start, end) => orders.filter(order => {
            const dateInput = this.getOrderActivityDateInput(order);
            return dateInput && dateInput >= start && dateInput <= end && predicate(order);
        }).length;
        const current = countInRange(currentStart, currentEnd);
        const previous = countInRange(previousStart, previousEnd);
        const change = previous ? Math.round(((current - previous) / previous) * 100) : (current ? 100 : 0);
        const direction = change < 0 ? 'down' : 'up';
        return { direction, label: `${Math.abs(change)}% vs last ${days === 7 ? 'week' : 'month'}` };
    }

    buildOrdersStatusSparkline(orders, statusKey) {
        return this.buildOrderVolumeDailySeriesForDays(orders.filter(order => this.getOrderOverviewStatus(order) === statusKey), 10);
    }

    buildOrdersPrioritySparkline(orders) {
        return this.buildOrderVolumeDailySeriesForDays(orders.filter(order => ['high', 'urgent'].includes(this.normalizeOrderOverviewText(order.priority))), 10);
    }

    renderOrdersSparkline(series = [], color = '#0B0B0C') {
        const values = series.map(item => item.value);
        const max = Math.max(...values, 1);
        const points = values.map((value, index) => {
            const x = values.length <= 1 ? 96 : (index / (values.length - 1)) * 96;
            const y = 44 - ((value / max) * 34) - 5;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');
        return `
            <svg class="orders-overview-sparkline" viewBox="0 0 96 48" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                <title>${values.reduce((sum, value) => sum + value, 0).toLocaleString()} orders in this period</title>
                <polyline points="${points}" style="stroke:${color}"></polyline>
            </svg>
        `;
    }

    renderOrdersStatusDistribution(rows, total) {
        const actualTotal = Math.max(total, rows.reduce((sum, row) => sum + row.value, 0));
        const safeTotal = Math.max(actualTotal, 1);
        let cursor = 0;
        const segments = rows.map(row => {
            const start = cursor;
            cursor += (row.value / safeTotal) * 100;
            return `${row.color} ${start}% ${cursor}%`;
        }).join(', ');
        return `
            <div class="orders-status-distribution-body">
                <div class="orders-status-donut" style="--segments:${segments}">
                    <strong>${actualTotal.toLocaleString()}</strong>
                    <span>Total Orders</span>
                </div>
                <div class="orders-status-legend">
                    ${rows.map(row => {
                        const percent = safeTotal ? Math.round((row.value / safeTotal) * 100) : 0;
                        return `
                            <div class="orders-status-legend-row">
                                <span><i style="background:${row.color}"></i>${escapePaymentHtml(row.label)}</span>
                                <strong>${row.value.toLocaleString()}</strong>
                                <small>${percent}%</small>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    renderOrdersFlow(rows, completedRate) {
        return `
            <div class="orders-flow-list">
                ${rows.map((row, index) => `
                    <div class="orders-flow-step ${escapePaymentHtml(row.key)}">
                        <span><i class="fas fa-${escapePaymentHtml(row.icon)}" aria-hidden="true"></i>${escapePaymentHtml(row.label)}</span>
                        <strong>${row.value.toLocaleString()}</strong>
                    </div>
                    ${index < rows.length - 1 ? '<i class="fas fa-arrow-down orders-flow-arrow" aria-hidden="true"></i>' : ''}
                `).join('')}
            </div>
            <div class="orders-flow-footer">
                <span>Conversion Rate</span>
                <strong>${completedRate}%</strong>
            </div>
        `;
    }

    buildOrdersPriorityBreakdown(orders, overview = {}) {
        const counts = { high: Number(overview.highPriority || 0), medium: 0, low: 0 };
        if (!orders.length) return counts;
        counts.high = 0;
        orders.forEach(order => {
            const priority = this.normalizeOrderOverviewText(order.priority || 'medium');
            if (priority === 'low') counts.low += 1;
            else if (priority === 'high' || priority === 'urgent') counts.high += 1;
            else counts.medium += 1;
        });
        return counts;
    }

    renderOrdersPriorityBreakdown(counts) {
        const total = Math.max(counts.high + counts.medium + counts.low, 1);
        const rows = [
            { key: 'high', label: 'High Priority', value: counts.high, color: '#B42318' },
            { key: 'medium', label: 'Medium Priority', value: counts.medium, color: '#7A4E00' },
            { key: 'low', label: 'Low Priority', value: counts.low, color: '#77777B' }
        ];
        return `
            <div class="orders-priority-list">
                ${rows.map(row => {
                    const percent = Math.round((row.value / total) * 100);
                    return `
                        <div class="orders-priority-row">
                            <span>${escapePaymentHtml(row.label)}</span>
                            <div class="orders-priority-track"><i style="width:${percent}%; background:${row.color}"></i></div>
                            <strong>${row.value.toLocaleString()} (${percent}%)</strong>
                        </div>
                    `;
                }).join('')}
            </div>
            <small class="orders-overview-muted">Based on current orders</small>
        `;
    }

    buildOrdersWeeklyPerformanceSeries(orders) {
        const start = this.getOrderVolumeWeekStart(todayDateInput());
        const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const series = labels.map((label, index) => ({ label, value: 0, date: this.addRevenueDays(start, index) }));
        orders.forEach(order => {
            const dateInput = this.getOrderActivityDateInput(order);
            const bucket = series.find(item => item.date === dateInput);
            if (bucket) bucket.value += 1;
        });
        return series;
    }

    renderOrdersWeeklyPerformance(series) {
        const max = Math.max(...series.map(item => item.value), 1);
        return `
            <div class="orders-weekly-bars">
                ${series.map(item => `
                    <div class="orders-weekly-bar">
                        <span style="height:${Math.max(8, (item.value / max) * 92)}%"><strong>${item.value}</strong></span>
                        <small>${escapePaymentHtml(item.label)}</small>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderOrdersOverviewTrendSvg(series) {
        return this.renderOrdersInlineTrendChartSvg(series);
    }

    renderOrdersOverviewTrendCard(series = []) {
        const total = series.reduce((sum, item) => sum + Number(item.value || 0), 0);
        const peak = series.reduce((best, item) => Number(item.value || 0) > Number(best.value || 0) ? item : best, series[0] || { value: 0, tooltipLabel: '-' });
        const activeDays = series.filter(item => Number(item.value || 0) > 0).length;

        return `
            <div class="orders-trend-summary">
                <span><small>Total</small><strong>${total.toLocaleString()}</strong></span>
                <span><small>Peak Day</small><strong>${Number(peak.value || 0).toLocaleString()}</strong></span>
                <span><small>Active Days</small><strong>${activeDays.toLocaleString()}</strong></span>
            </div>
            <div class="orders-trend-plot">
                ${this.renderOrdersOverviewTrendSvg(series)}
                ${this.renderOrdersTrendAxisLabels(series)}
            </div>
        `;
    }

    renderOrdersTrendAxisLabels(series = []) {
        if (!series.length) return '';
        const labelEvery = Math.max(1, Math.ceil(series.length / 5));

        return `
            <div class="orders-trend-axis-labels" style="grid-template-columns: repeat(${series.length}, minmax(0, 1fr));" aria-hidden="true">
                ${series.map((item, index) => {
                    const visible = index % labelEvery === 0 || index === series.length - 1;
                    return `<span>${visible ? escapePaymentHtml(item.label) : ''}</span>`;
                }).join('')}
            </div>
        `;
    }

    buildOrderVolumeDailySeriesForDays(orders = [], days = 14) {
        const end = todayDateInput();
        const config = tz();
        const addDays = (dateInput, count) => config?.addDaysToDateString ? config.addDaysToDateString(dateInput, count) : this.addRevenueDays(dateInput, count);
        const start = addDays(end, -(Math.max(days, 1) - 1));
        const dates = this.getRevenueDateSeries(start, end);
        const counts = this.countOrdersByDate(orders);

        return dates.map(dateInput => ({
            key: dateInput,
            label: this.formatRevenueBucketLabel(dateInput),
            tooltipLabel: formatDisplayDate(dateInput),
            value: counts.get(dateInput) || 0
        }));
    }

    getRecentHighPriorityOrders(orders) {
        return [...orders]
            .filter(order => ['high', 'urgent'].includes(this.normalizeOrderOverviewText(order.priority)))
            .sort((a, b) => new Date(b.createdAt || b.scheduleDate || 0) - new Date(a.createdAt || a.scheduleDate || 0))
            .slice(0, 4);
    }

    renderRecentHighPriorityOrders(orders) {
        if (!orders.length) {
            return '<div class="orders-recent-empty">No high priority orders</div>';
        }
        return `
            <div class="orders-recent-list">
                ${orders.map(order => `
                    <div class="orders-recent-row">
                        <span class="orders-recent-alert"><i class="fas fa-exclamation-circle" aria-hidden="true"></i></span>
                        <strong>${escapePaymentHtml(this.getOrderOverviewDisplayId(order))}</strong>
                        <span title="${escapePaymentHtml(this.getOrderOverviewCustomerName(order))}">${escapePaymentHtml(this.getOrderOverviewCustomerName(order))}</span>
                        <small>${escapePaymentHtml(this.getTimeAgo(order.createdAt || order.scheduleDate || order.startDate))}</small>
                    </div>
                `).join('')}
            </div>
        `;
    }

    getOrderOverviewDisplayId(order = {}) {
        return order.orderId || order.orderNumber || order.workOrderId || `#${String(order._id || '').slice(-6).toUpperCase() || 'ORDER'}`;
    }

    getOrderOverviewCustomerName(order = {}) {
        const customer = order.customer;
        if (customer && typeof customer === 'object') {
            return customer.name || customer.fullName || customer.email || 'Unassigned';
        }
        return customer || order.customerName || order.name || 'Unassigned';
    }

    buildOrderVolumeDailySeries(orders = []) {
        return this.buildOrderVolumeDailySeriesForDays(orders, 14);
    }

    countOrdersByDate(orders = []) {
        const counts = new Map();
        (Array.isArray(orders) ? orders : []).forEach(order => {
            const dateInput = this.getOrderActivityDateInput(order);
            if (!dateInput) return;
            counts.set(dateInput, (counts.get(dateInput) || 0) + 1);
        });
        return counts;
    }

    getOrderVolumeWeekStart(dateInput) {
        const date = new Date(`${dateInput}T00:00:00`);
        if (Number.isNaN(date.getTime())) return dateInput;
        const day = date.getDay();
        const mondayOffset = day === 0 ? -6 : 1 - day;
        date.setDate(date.getDate() + mondayOffset);
        return this.toRevenueDateInput(date);
    }

    renderOrdersInlineTrendChartSvg(series = []) {
        if (!series.length) {
            return `
                <div class="orders-inline-trend-empty" role="status">
                    <i class="fas fa-chart-line" aria-hidden="true"></i>
                    <span>No order volume data yet</span>
                </div>
            `;
        }

        const width = 760;
        const height = 190;
        const pad = { top: 18, right: 18, bottom: 30, left: 34 };
        const plotWidth = width - pad.left - pad.right;
        const plotHeight = height - pad.top - pad.bottom;
        const maxValue = Math.max(...series.map(item => item.value), 1);
        const niceMax = Math.max(6, Math.ceil((maxValue * 1.15) / 2) * 2);
        const slotWidth = plotWidth / Math.max(series.length, 1);
        const barWidth = Math.max(8, Math.min(18, slotWidth * 0.62));
        const bars = series.map((item, index) => {
            const value = Number(item.value || 0);
            const barHeight = value ? Math.max(4, (value / niceMax) * plotHeight) : 2;
            const x = pad.left + index * slotWidth + (slotWidth - barWidth) / 2;
            const y = pad.top + plotHeight - barHeight;
            return { ...item, value, x, y, width: barWidth, height: barHeight };
        });
        const yTicks = [niceMax, niceMax * 0.5, 0];

        return `
            <svg class="orders-inline-trend-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                ${yTicks.map(tick => {
                    const y = pad.top + plotHeight - ((tick / niceMax) * plotHeight);
                    return `
                        <line class="orders-inline-grid-line" x1="${pad.left}" y1="${y.toFixed(2)}" x2="${width - pad.right}" y2="${y.toFixed(2)}"></line>
                    `;
                }).join('')}
                ${bars.map(bar => `
                    <g class="orders-inline-bar-group">
                        <title>${escapePaymentHtml(bar.tooltipLabel)}: ${bar.value.toLocaleString()} order${bar.value === 1 ? '' : 's'}</title>
                        <rect class="orders-inline-bar-hit" x="${(bar.x - 4).toFixed(2)}" y="${pad.top}" width="${(bar.width + 8).toFixed(2)}" height="${plotHeight}"></rect>
                        <rect class="orders-inline-bar ${bar.value ? '' : 'is-empty'}" x="${bar.x.toFixed(2)}" y="${bar.y.toFixed(2)}" width="${bar.width.toFixed(2)}" height="${bar.height.toFixed(2)}" rx="3"></rect>
                    </g>
                `).join('')}
            </svg>
        `;
    }

    getCategoryOverviewPalette() {
        return [
            '#0B0B0C',
            '#363638',
            '#555559',
            '#707074',
            '#858589',
            '#9A9A9E',
            '#AAAAAE',
            '#B6B6BA',
            '#C9C9CC',
            '#DEDEDF'
        ];
    }

    getCategoryOverviewIcon(label = '') {
        const normalized = String(label || '').toLowerCase();
        if (normalized.includes('electric')) return 'bolt';
        if (normalized.includes('plumb') || normalized.includes('pipe') || normalized.includes('drain')) return 'tint';
        if (normalized.includes('clean')) return 'broom';
        if (normalized.includes('hvac') || normalized.includes('air') || normalized.includes('heat') || normalized.includes('cool')) return 'wind';
        if (normalized.includes('carpent') || normalized.includes('wood') || normalized.includes('door')) return 'hammer';
        if (normalized.includes('civil') || normalized.includes('construct') || normalized.includes('masonry')) return 'hard-hat';
        return 'tools';
    }

    buildServiceCategoryOverviewFromOrders(orders = []) {
        const categoryMap = new Map();

        (Array.isArray(orders) ? orders : []).forEach(order => {
            const label = String(order.service || '').trim() || 'Uncategorized';
            const key = label.toLowerCase();
            const current = categoryMap.get(key) || { key, label, orders: 0, revenue: 0 };
            current.orders += 1;
            current.revenue += Number(order.amount || 0);
            categoryMap.set(key, current);
        });

        return Array.from(categoryMap.values())
            .sort((a, b) => {
                if (b.revenue !== a.revenue) return b.revenue - a.revenue;
                if (b.orders !== a.orders) return b.orders - a.orders;
                return a.label.localeCompare(b.label);
            });
    }

    async getSyncedServiceCategoryOverview(stats = {}, orders = null) {
        if (Array.isArray(stats.serviceCategoryOverview)) {
            return stats.serviceCategoryOverview;
        }

        try {
            const sourceOrders = Array.isArray(orders) ? orders : await window.APIService.getOrdersFresh();
            return this.buildServiceCategoryOverviewFromOrders(sourceOrders);
        } catch (error) {
            console.warn('Unable to sync service category overview from orders:', error);
            return [];
        }
    }

    renderServiceCategoryOverview(rows = []) {
        const container = document.getElementById('serviceCategoryOverview');
        const totalEl = document.getElementById('serviceCategoryTotal');
        if (!container) return;

        const palette = this.getCategoryOverviewPalette();
        const data = (Array.isArray(rows) ? rows : []).map((row, index) => {
            const label = String(row.label || row.key || 'Uncategorized').trim() || 'Uncategorized';
            return {
                key: String(row.key || label).toLowerCase(),
                label,
                icon: row.icon || this.getCategoryOverviewIcon(label),
                color: row.color || palette[index % palette.length],
                orders: Number(row.orders || row.count || 0),
                revenue: Number(row.revenue || 0)
            };
        }).sort((a, b) => {
            if (b.revenue !== a.revenue) return b.revenue - a.revenue;
            if (b.orders !== a.orders) return b.orders - a.orders;
            return a.label.localeCompare(b.label);
        });
        const totalOrders = data.reduce((sum, category) => sum + category.orders, 0);
        const totalRevenue = data.reduce((sum, category) => sum + category.revenue, 0);
        if (totalEl) {
            totalEl.textContent = `${totalOrders.toLocaleString()} order${totalOrders === 1 ? '' : 's'} | ${this.formatMiniCurrency(totalRevenue)}`;
        }

        if (!data.length) {
            container.innerHTML = `
                <div class="service-category-empty" role="status">
                    <i class="fas fa-tools" aria-hidden="true"></i>
                    <span>No category data yet</span>
                </div>
            `;
            return;
        }

        const visibleLimit = 6;
        const hasMoreCategories = data.length > visibleLimit;
        const visibleData = this.categoryOverviewExpanded ? data : data.slice(0, visibleLimit);
        const hiddenCount = Math.max(data.length - visibleLimit, 0);

        container.innerHTML = visibleData.map((category, index) => {
            return `
                <article class="service-category-card" role="listitem" style="--service-color: ${category.color};">
                    <span class="service-category-rank" aria-label="Revenue rank ${index + 1}">#${index + 1}</span>
                    <div class="service-category-card-head">
                        <span class="service-category-icon" aria-hidden="true"><i class="fas fa-${category.icon}"></i></span>
                        <div>
                            <h3>${escapePaymentHtml(category.label)}</h3>
                            <p>${category.orders.toLocaleString()} order${category.orders === 1 ? '' : 's'}</p>
                        </div>
                    </div>
                    <div class="service-category-values">
                        <span>
                            <small>Revenue</small>
                            <strong>${this.formatRevenueOverviewCurrency(category.revenue)}</strong>
                        </span>
                        <span>
                            <small>Revenue share</small>
                            <strong>${totalRevenue > 0 ? `${((category.revenue / totalRevenue) * 100).toFixed(1)}%` : '0%'}</strong>
                        </span>
                    </div>
                </article>
            `;
        }).join('') + (hasMoreCategories ? `
            <button type="button" class="service-category-toggle" id="serviceCategoryToggle" aria-expanded="${this.categoryOverviewExpanded ? 'true' : 'false'}">
                <span>${this.categoryOverviewExpanded ? 'Show top 6' : `Show all ${data.length} categories`}</span>
                <small>${this.categoryOverviewExpanded ? 'Collapse category list' : `${hiddenCount} more categor${hiddenCount === 1 ? 'y' : 'ies'}`}</small>
                <i class="fas fa-chevron-${this.categoryOverviewExpanded ? 'up' : 'down'}" aria-hidden="true"></i>
            </button>
        ` : '');

        const toggleButton = document.getElementById('serviceCategoryToggle');
        if (toggleButton) {
            toggleButton.addEventListener('click', () => {
                this.categoryOverviewExpanded = !this.categoryOverviewExpanded;
                this.renderServiceCategoryOverview(rows);
            });
        }
    }

    renderTopPerformanceCards(topPerformance = {}, categoryOverview = []) {
        const container = document.getElementById('topPerformanceCards');
        if (!container) return;

        const mostRequestedService = topPerformance?.mostRequestedService || [...(Array.isArray(categoryOverview) ? categoryOverview : [])]
            .sort((a, b) => {
                if (Number(b.orders || 0) !== Number(a.orders || 0)) return Number(b.orders || 0) - Number(a.orders || 0);
                return Number(b.revenue || 0) - Number(a.revenue || 0);
            })[0];
        const cards = [
            {
                type: 'customer',
                icon: 'user-tie',
                rank: '01',
                label: 'Top Customer',
                title: topPerformance?.topCustomer?.name || 'No customer data',
                value: this.formatRevenueOverviewCurrency(topPerformance?.topCustomer?.totalRevenue || 0),
                metric: 'Total revenue',
                meta: topPerformance?.topCustomer ? `${Number(topPerformance.topCustomer.totalOrders || 0).toLocaleString()} order${Number(topPerformance.topCustomer.totalOrders || 0) === 1 ? '' : 's'}` : 'Revenue leader'
            },
            {
                type: 'vendor',
                icon: 'truck',
                rank: '02',
                label: 'Top Vendor',
                title: topPerformance?.topVendor?.name || 'No vendor data',
                value: this.formatRevenueOverviewCurrency(topPerformance?.topVendor?.revenue || 0),
                metric: 'Order revenue',
                meta: topPerformance?.topVendor ? `${Number(topPerformance.topVendor.orderCount || 0).toLocaleString()} order${Number(topPerformance.topVendor.orderCount || 0) === 1 ? '' : 's'}${topPerformance.topVendor.category ? ` | ${topPerformance.topVendor.category}` : ''}` : 'Revenue leader'
            },
            {
                type: 'employee',
                icon: 'id-badge',
                rank: '03',
                label: 'Top Employee',
                title: topPerformance?.topEmployee?.name || 'No employee data',
                value: this.formatRevenueOverviewCurrency(topPerformance?.topEmployee?.revenue || 0),
                metric: 'Handled revenue',
                meta: topPerformance?.topEmployee ? `${Number(topPerformance.topEmployee.orderCount || 0).toLocaleString()} order${Number(topPerformance.topEmployee.orderCount || 0) === 1 ? '' : 's'}` : 'Revenue leader'
            },
            {
                type: 'service',
                icon: mostRequestedService ? this.getCategoryOverviewIcon(mostRequestedService.label) : 'tools',
                rank: '04',
                label: 'Most Requested Service',
                title: mostRequestedService?.label || 'No service data',
                value: `${Number(mostRequestedService?.orders || 0).toLocaleString()} order${Number(mostRequestedService?.orders || 0) === 1 ? '' : 's'}`,
                metric: 'Request volume',
                meta: `${this.formatRevenueOverviewCurrency(mostRequestedService?.revenue || 0)} revenue`
            },
            {
                type: 'job',
                icon: 'briefcase',
                rank: 'Featured',
                label: 'Highest Revenue Job',
                title: topPerformance?.highestRevenueJob?.orderId || 'No job data',
                value: this.formatRevenueOverviewCurrency(topPerformance?.highestRevenueJob?.revenue || 0),
                metric: 'Largest job',
                meta: topPerformance?.highestRevenueJob ? `${topPerformance.highestRevenueJob.customerName || 'Customer'} | ${topPerformance.highestRevenueJob.service || 'Service'}` : 'Largest order'
            }
        ];
        container.innerHTML = cards.map(card => `
            <article class="top-performance-card ${escapePaymentHtml(card.type)}" role="listitem">
                <div class="top-performance-card-head">
                    <small>${escapePaymentHtml(card.label)}</small>
                    <em>${escapePaymentHtml(card.rank)}</em>
                </div>
                <div class="top-performance-content">
                    <strong>${escapePaymentHtml(card.value)}</strong>
                    <h3 title="${escapePaymentHtml(card.title)}">${escapePaymentHtml(card.title)}</h3>
                    <p title="${escapePaymentHtml(card.meta)}">${escapePaymentHtml(card.metric)} | ${escapePaymentHtml(card.meta)}</p>
                </div>
            </article>
        `).join('');
    }

    renderMiniRevenueTrend(points = []) {
        const chartEl = document.getElementById('miniRevenueTrendChart');
        const metaEl = document.getElementById('miniRevenueTrendMeta');
        if (!chartEl) return;

        const data = (Array.isArray(points) ? points : [])
            .filter(point => point && point.date)
            .slice(-14)
            .map(point => ({
                label: this.formatMiniDateLabel(point.date),
                value: Number(point.amount || 0),
                orders: Number(point.orders || 0)
            }));
        const total = data.reduce((sum, point) => sum + point.value, 0);
        const orders = data.reduce((sum, point) => sum + point.orders, 0);
        const latest = [...data].reverse().find(point => point.value > 0 || point.orders > 0) || data[data.length - 1];
        if (metaEl) metaEl.textContent = total > 0 ? `${this.formatMiniCurrency(total)} latest ${data.length} day${data.length === 1 ? '' : 's'}` : 'No revenue yet';
        chartEl.innerHTML = `
            ${this.renderMiniValueStrip([
                { label: 'Revenue', value: this.formatMiniCurrency(total) },
                { label: 'Orders', value: orders.toLocaleString() },
                { label: latest ? latest.label : 'Latest', value: latest ? this.formatMiniCurrency(latest.value) : '$0' }
            ])}
            ${this.renderMiniLineChart(data, '#0B0B0C', 'Revenue')}
        `;
    }

    renderMiniOrdersByStatus(rows = []) {
        const chartEl = document.getElementById('miniOrdersStatusChart');
        const metaEl = document.getElementById('miniOrdersStatusMeta');
        if (!chartEl) return;

        const data = (Array.isArray(rows) ? rows : [])
            .filter(row => Number(row.count || 0) > 0)
            .sort((a, b) => Number(b.count || 0) - Number(a.count || 0))
            .slice(0, 5)
            .map(row => ({
                label: this.formatStatus(row.status || 'unknown'),
                value: Number(row.count || 0)
        }));
        const total = data.reduce((sum, row) => sum + row.value, 0);
        const topStatus = data[0];
        if (metaEl) metaEl.textContent = total ? `${total.toLocaleString()} real order${total === 1 ? '' : 's'} by status` : 'No orders yet';
        chartEl.innerHTML = `
            ${this.renderMiniValueStrip([
                { label: 'Total', value: total.toLocaleString() },
                { label: 'Top status', value: topStatus ? topStatus.label : '-' },
                { label: 'Top count', value: topStatus ? topStatus.value.toLocaleString() : '0' }
            ])}
            ${this.renderMiniHorizontalBars(data, ['#0B0B0C', '#4B4B4F', '#77777B', '#9A9A9E', '#B6B6BA'])}
        `;
    }

    renderMiniMonthlyProfit(rows = []) {
        const chartEl = document.getElementById('miniMonthlyProfitChart');
        const metaEl = document.getElementById('miniMonthlyProfitMeta');
        if (!chartEl) return;

        const data = (Array.isArray(rows) ? rows : []).slice(-6).map(row => ({
            label: this.formatMiniMonthLabel(row.month),
            value: Number(row.profit || 0)
        }));
        const total = data.reduce((sum, row) => sum + row.value, 0);
        const latest = data[data.length - 1];
        const best = data.reduce((winner, row) => !winner || row.value > winner.value ? row : winner, null);
        if (metaEl) metaEl.textContent = data.length ? `${this.formatMiniCurrency(total)} real profit total` : 'No profit data yet';
        chartEl.innerHTML = `
            ${this.renderMiniValueStrip([
                { label: '6-mo profit', value: this.formatMiniCurrency(total) },
                { label: latest ? latest.label : 'Latest', value: latest ? this.formatMiniCurrency(latest.value) : '$0' },
                { label: best ? `Best ${best.label}` : 'Best', value: best ? this.formatMiniCurrency(best.value) : '$0' }
            ])}
            ${this.renderMiniColumnChart(data, '#0B0B0C')}
        `;
    }

    renderMiniCustomerType(rows = []) {
        const chartEl = document.getElementById('miniCustomerTypeChart');
        const metaEl = document.getElementById('miniCustomerTypeMeta');
        if (!chartEl) return;

        const data = (Array.isArray(rows) ? rows : [])
            .filter(row => Number(row.count || 0) > 0)
            .map(row => ({
                label: this.formatCustomerTypeLabel(row.type),
                value: Number(row.count || 0)
        }));
        const total = data.reduce((sum, row) => sum + row.value, 0);
        const recurring = data.find(row => row.label.toLowerCase() === 'recurring')?.value || 0;
        const oneTime = data.find(row => row.label.toLowerCase() === 'one-time')?.value || 0;
        if (metaEl) metaEl.textContent = total ? `${total.toLocaleString()} real customer${total === 1 ? '' : 's'}` : 'No customers yet';
        chartEl.innerHTML = `
            ${this.renderMiniValueStrip([
                { label: 'Total', value: total.toLocaleString() },
                { label: 'Recurring', value: recurring.toLocaleString() },
                { label: 'One-time', value: oneTime.toLocaleString() }
            ])}
            ${this.renderMiniDonutChart(data, ['#0B0B0C', '#77777B', '#B6B6BA'])}
        `;
    }

    renderMiniValueStrip(items = []) {
        return `
            <div class="mini-value-strip" aria-label="Mini chart real values">
                ${items.map(item => `
                    <span class="mini-value-item">
                        <small>${escapePaymentHtml(item.label)}</small>
                        <strong title="${escapePaymentHtml(item.value)}">${escapePaymentHtml(item.value)}</strong>
                    </span>
                `).join('')}
            </div>
        `;
    }

    renderMiniLineChart(data, color, label) {
        const values = data.map(point => point.value);
        if (!values.length || Math.max(...values) <= 0) return this.renderMiniEmptyChart('chart-line', `No ${label.toLowerCase()} data`);

        const width = 320;
        const height = 128;
        const pad = { top: 14, right: 14, bottom: 28, left: 16 };
        const plotWidth = width - pad.left - pad.right;
        const plotHeight = height - pad.top - pad.bottom;
        const max = Math.max(...values, 1);
        const points = data.map((point, index) => {
            const x = pad.left + (data.length > 1 ? (index / (data.length - 1)) * plotWidth : plotWidth / 2);
            const y = pad.top + plotHeight - ((point.value / max) * plotHeight);
            return { ...point, x, y };
        });
        const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
        const areaPath = `${path} L ${points[points.length - 1].x.toFixed(2)} ${height - pad.bottom} L ${points[0].x.toFixed(2)} ${height - pad.bottom} Z`;

        return `
            <svg class="mini-chart-svg mini-line-svg" viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">
                <path class="mini-chart-area" d="${areaPath}" style="--mini-chart-color: ${color}"></path>
                <path class="mini-chart-line" d="${path}" stroke="${color}"></path>
                ${points.map(point => `
                    <g class="mini-chart-point-group">
                        <circle class="mini-chart-hit" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="11"></circle>
                        <circle class="mini-chart-point" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="3.2" fill="${color}"></circle>
                        ${this.renderMiniSvgTooltip({
                            x: point.x,
                            y: point.y,
                            label: point.label,
                            value: this.formatRevenueOverviewCurrency(point.value),
                            meta: point.orders !== undefined ? `${point.orders.toLocaleString()} order${point.orders === 1 ? '' : 's'}` : label
                        })}
                    </g>
                `).join('')}
                ${this.renderMiniXAxisLabels(points, height - 8)}
            </svg>
        `;
    }

    renderMiniHorizontalBars(data, colors) {
        if (!data.length) return this.renderMiniEmptyChart('tasks', 'No status data');
        const max = Math.max(...data.map(row => row.value), 1);
        return `
            <div class="mini-bars" aria-hidden="true">
                ${data.map((row, index) => {
                    const width = Math.max(5, (row.value / max) * 100);
                    return `
                        <div class="mini-bar-row" data-tooltip-title="${escapePaymentHtml(row.label)}" data-tooltip-value="${escapePaymentHtml(row.value.toLocaleString())}" data-tooltip-meta="${escapePaymentHtml(`${((row.value / max) * 100).toFixed(1)}% of top status`)}">
                            <span class="mini-bar-label">${escapePaymentHtml(row.label)}</span>
                            <span class="mini-bar-track"><span class="mini-bar-fill" style="width: ${width.toFixed(2)}%; background: ${colors[index % colors.length]};"></span></span>
                            <strong>${row.value.toLocaleString()}</strong>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    renderMiniColumnChart(data, color) {
        if (!data.length) return this.renderMiniEmptyChart('coins', 'No profit data');
        const width = 320;
        const height = 128;
        const pad = { top: 14, right: 14, bottom: 28, left: 16 };
        const plotWidth = width - pad.left - pad.right;
        const plotHeight = height - pad.top - pad.bottom;
        const values = data.map(row => row.value);
        const minValue = Math.min(0, ...values);
        const maxValue = Math.max(0, ...values);
        const range = Math.max(maxValue - minValue, 1);
        const yForValue = (value) => pad.top + plotHeight - (((value - minValue) / range) * plotHeight);
        const zeroY = yForValue(0);
        const gap = 8;
        const barWidth = Math.max(18, (plotWidth - gap * (data.length - 1)) / Math.max(data.length, 1));

        return `
            <svg class="mini-chart-svg mini-column-svg" viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">
                <line class="mini-chart-baseline" x1="${pad.left}" y1="${zeroY}" x2="${width - pad.right}" y2="${zeroY}"></line>
                ${data.map((row, index) => {
                    const valueY = yForValue(row.value);
                    const h = Math.max(3, Math.abs(zeroY - valueY));
                    const x = pad.left + index * (barWidth + gap);
                    const y = Math.min(valueY, zeroY);
                    const fill = row.value >= 0 ? color : '#B42318';
                    return `
                        <g class="mini-chart-column-group">
                            <rect class="mini-chart-column-hit" x="${x.toFixed(2)}" y="${pad.top}" width="${barWidth.toFixed(2)}" height="${plotHeight}" rx="6"></rect>
                            <rect class="mini-chart-column" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${h.toFixed(2)}" rx="5" fill="${fill}"></rect>
                            ${this.renderMiniSvgTooltip({
                                x: x + barWidth / 2,
                                y,
                                label: row.label,
                                value: this.formatRevenueOverviewCurrency(row.value),
                                meta: row.value >= 0 ? 'Profit' : 'Loss'
                            })}
                        </g>
                    `;
                }).join('')}
                ${data.map((row, index) => {
                    const x = pad.left + index * (barWidth + gap) + barWidth / 2;
                    return `<text class="mini-chart-x-label" x="${x.toFixed(2)}" y="${height - 8}" text-anchor="middle">${escapePaymentHtml(row.label)}</text>`;
                }).join('')}
            </svg>
        `;
    }

    renderMiniDonutChart(data, colors) {
        if (!data.length) return this.renderMiniEmptyChart('user-friends', 'No customer data');
        const total = data.reduce((sum, row) => sum + row.value, 0);
        let running = 0;
        const gradientStops = data.map((row, index) => {
            const start = (running / total) * 100;
            running += row.value;
            const end = (running / total) * 100;
            const color = colors[index % colors.length];
            return `${color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
        }).join(', ');

        return `
            <div class="mini-donut-wrap" aria-hidden="true">
                <div class="mini-donut" style="background: conic-gradient(${gradientStops});">
                    <span>${total.toLocaleString()}</span>
                </div>
                <div class="mini-donut-legend">
                    ${data.map((row, index) => `
                        <span data-tooltip-title="${escapePaymentHtml(row.label)}" data-tooltip-value="${escapePaymentHtml(row.value.toLocaleString())}" data-tooltip-meta="${escapePaymentHtml(`${((row.value / total) * 100).toFixed(1)}% of customers`)}"><i style="background: ${colors[index % colors.length]};"></i>${escapePaymentHtml(row.label)} <strong>${row.value.toLocaleString()}</strong></span>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderMiniSvgTooltip({ x, y, label, value, meta }) {
        const width = 124;
        const height = meta ? 58 : 44;
        const tx = Math.min(Math.max(x - width / 2, 8), 320 - width - 8);
        const ty = Math.max(4, y - height - 10);

        return `
            <g class="mini-svg-tooltip" transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)})">
                <rect width="${width}" height="${height}" rx="8"></rect>
                <text x="12" y="18">${escapePaymentHtml(label)}</text>
                <text class="mini-svg-tooltip-value" x="12" y="36">${escapePaymentHtml(value)}</text>
                ${meta ? `<text class="mini-svg-tooltip-meta" x="12" y="51">${escapePaymentHtml(meta)}</text>` : ''}
            </g>
        `;
    }

    renderMiniXAxisLabels(points, y) {
        if (!points.length) return '';
        const indexes = points.length > 2 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : points.map((_, index) => index);
        return indexes.map(index => `<text class="mini-chart-x-label" x="${points[index].x.toFixed(2)}" y="${y}" text-anchor="middle">${escapePaymentHtml(points[index].label)}</text>`).join('');
    }

    renderMiniEmptyChart(icon, message) {
        return `
            <div class="mini-chart-empty" role="status">
                <i class="fas fa-${icon}" aria-hidden="true"></i>
                <span>${escapePaymentHtml(message)}</span>
            </div>
        `;
    }

    formatMiniDateLabel(value) {
        const date = new Date(`${value}T00:00:00`);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    formatMiniMonthLabel(value) {
        if (!value) return '';
        const date = new Date(`${value}-01T00:00:00`);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleDateString('en-US', { month: 'short' });
    }

    formatCustomerTypeLabel(value) {
        const normalized = String(value || 'unknown').toLowerCase();
        if (normalized === 'one-time') return 'One-time';
        if (normalized === 'recurring') return 'Recurring';
        if (normalized === 'hoa') return 'HOA';
        return this.formatStatus(normalized);
    }

    formatMiniCurrency(value) {
        const amount = Number(value) || 0;
        const sign = amount < 0 ? '-' : '';
        const absolute = Math.abs(amount);
        if (absolute >= 1000000) return `${sign}$${(absolute / 1000000).toFixed(absolute >= 10000000 ? 0 : 1)}M`;
        if (absolute >= 1000) return `${sign}$${(absolute / 1000).toFixed(absolute >= 10000 ? 0 : 1)}K`;
        return `${sign}$${Math.round(absolute).toLocaleString()}`;
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
        
        window.AppLogger?.debug('renderOrdersTable called with:', ordersData ? ordersData.length : 0, 'orders');
        
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

        const rowHtml = (order) => {
            const orderNumber = order.orderId || `#${order._id.substring(0, 8).toUpperCase()}`;
            const orderDate = order.createdAt ? (tz() ? tz().formatDateMDT(order.createdAt, { month: 'short', day: 'numeric' }) : new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) : '';
            const customerName = order.customer?.name || order.customer;
            const customerEmail = order.customer?.email || '';
            const statusDisplay = getOrderVisibleStatus(order) || 'new';
            const statusClass = getOrderStatusBadgeClass(order);
            const workflowDisplay = order.workflowStatus ? formatOrderFilterLabel(order.workflowStatus) : '';
            const broadStatusDisplay = formatOrderFilterLabel(order.status || 'new');

            return `
            <tr onclick="viewOrder('${order._id || order.id}')">
                <td>
                    <div class="order-id">
                        <div class="order-info">
                            <div class="order-number">
                                <span>${orderNumber}</span>
                                <button class="btn-copy-order-id" onclick="event.stopPropagation(); copyOrderId('${orderNumber}')" title="Copy Order ID" aria-label="Copy order ID">
                                    <i class="fas fa-copy"></i>
                                </button>
                            </div>
                            <div class="order-date">${orderDate}</div>
                            ${order.source === 'website' ? `<div class="order-number-meta"><span class="order-source-badge"><i class="fas fa-globe"></i> Website</span>${order.requiresIntakeReview || order.missingData?.serviceCategory || order.missingData?.serviceAddress ? '<span class="order-missing-badge"><i class="fas fa-exclamation-triangle"></i> Intake incomplete</span>' : ''}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td>
                    <div class="order-customer">
                        <div class="customer-name-text">${customerName}</div>
                        ${customerEmail ? `<div class="customer-email-text">${customerEmail}</div>` : ''}
                    </div>
                </td>
                <td><span class="service-badge" title="${order.service || ''}">${order.service || 'N/A'}</span></td>
                <td><span class="order-vendor">${order.vendor?.name || 'N/A'}</span></td>
                <td>
                    <div class="order-status-stack">
                        <span class="order-status-badge ${statusClass}">${workflowDisplay || this.formatStatus(statusDisplay)}</span>
                        ${workflowDisplay ? `<small>${broadStatusDisplay}</small>` : ''}
                    </div>
                </td>
                <td><span class="priority-badge ${order.priority || 'medium'}">${order.priority || 'medium'}</span></td>
                <td><span class="order-date-cell">${order.startDate ? this.formatDate(order.startDate) : 'N/A'}</span></td>
                <td><span class="order-date-cell">${(order.scheduleDate || order.startDate) ? this.formatDate(order.scheduleDate || order.startDate) : 'N/A'}</span></td>
                <td><span class="order-amount">${order.pricingStatus === 'unquoted' ? 'Unquoted' : `$${Number(order.amount || 0).toLocaleString()}`}</span></td>
                <td><span class="order-cost">$${order.vendorCost?.toLocaleString() || '0'}</span></td>
                <td><span class="order-profit">${order.pricingStatus === 'unquoted' ? '—' : `$${((order.amount || 0) - (order.vendorCost || 0)).toLocaleString()}`}</span></td>
            </tr>
        `;
        };

        const CHUNK = 100;
        if (ordersData.length <= CHUNK) {
            tbody.innerHTML = ordersData.map(rowHtml).join('');
            return;
        }

        tbody.innerHTML = '';
        let idx = 0;
        const pump = () => {
            const slice = ordersData.slice(idx, idx + CHUNK);
            tbody.insertAdjacentHTML('beforeend', slice.map(rowHtml).join(''));
            idx += CHUNK;
            if (idx < ordersData.length) {
                requestAnimationFrame(pump);
            }
        };
        pump();
    }

    renderRecentActivity(orders) {
        const activityList = document.getElementById('recentActivity');
        if (!activityList) return;
        
        if (!orders || orders.length === 0) {
            activityList.innerHTML = `
                <div class="activity-empty" role="status">
                    <i class="fas fa-inbox" aria-hidden="true"></i>
                    <p>No recent activity</p>
                    <span>New orders will appear here after they are created.</span>
                </div>`;
            return;
        }
        
        const recentOrders = orders
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 5);

        activityList.innerHTML = recentOrders.map((order) => {
            const timeAgo = this.getTimeAgo(order.createdAt);
            const rawName = order.customer?.name || order.customer || 'Customer';
            const customerName = escapePaymentHtml(rawName);
            const timeSafe = escapePaymentHtml(timeAgo);
            const orderNumber = escapePaymentHtml(order.orderId || (order._id ? `#${String(order._id).slice(-6).toUpperCase()}` : 'New order'));
            const amount = Number(order.amount) || 0;
            const amountText = order.pricingStatus === 'unquoted' ? 'Unquoted' : `$${amount.toLocaleString(undefined, { minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
            const status = escapePaymentHtml(this.formatStatus(order.pipelineStage || order.status || 'created'));
            const orderId = order._id || order.id;
            if (!orderId) {
                return `
                <div class="activity-item">
                    <div class="activity-icon orders" aria-hidden="true">
                        <i class="fas fa-clipboard-list"></i>
                    </div>
                    <div class="activity-content">
                        <p>Order ${orderNumber} created</p>
                        <span>${customerName} &bull; ${amountText} &bull; ${status}</span>
                    </div>
                    <time class="activity-time">${timeSafe}</time>
                </div>`;
            }
            const idAttr = escapePaymentHtml(String(orderId));
            return `
                <div class="activity-item activity-item--order" role="button" tabindex="0" data-order-id="${idAttr}" title="View order details">
                    <div class="activity-icon orders" aria-hidden="true">
                        <i class="fas fa-clipboard-list"></i>
                    </div>
                    <div class="activity-content">
                        <p>Order ${orderNumber} created</p>
                        <span>${customerName} &bull; ${amountText} &bull; ${status}</span>
                    </div>
                    <time class="activity-time">${timeSafe}</time>
                </div>`;
        }).join('');
    }

    getTimeAgo(date) {
        const now = nowInMDT();
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
                <div class="leaderboard-empty" role="status">
                    <i class="fas fa-users" aria-hidden="true"></i>
                    <p>No employee data yet</p>
                    <span class="leaderboard-empty-hint">Add employees and assign them to orders to see rankings here.</span>
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
                <div class="leaderboard-empty" role="status">
                    <i class="fas fa-chart-line" aria-hidden="true"></i>
                    <p>No attributed revenue yet</p>
                    <span class="leaderboard-empty-hint">Rankings appear when orders with amounts are linked to employees.</span>
                </div>
            `;
            return;
        }

        // Render leaderboard
        leaderboardContainer.innerHTML = topEmployees.map((employee, index) => {
            const rank = index + 1;
            const rankClass = rank <= 3 ? `rank-${rank}` : '';
            const nameSafe = escapePaymentHtml(employee.name || 'Employee');
            const rev = typeof employee.revenue === 'number' ? employee.revenue : 0;
            const revSafe = escapePaymentHtml(`$${rev.toLocaleString()}`);
            const ordersLabel = `${employee.orderCount} order${employee.orderCount !== 1 ? 's' : ''}`;
            const ordersSafe = escapePaymentHtml(ordersLabel);

            return `
                <div class="leaderboard-item ${rankClass}">
                    <div class="rank" aria-hidden="true">${rank}</div>
                    <div class="employee-info">
                        <div class="employee-name">${nameSafe}</div>
                        <div class="employee-meta">
                            <span class="order-count">${ordersSafe}</span>
                            ${rank === 1 ? '<span class="top-performer"><i class="fas fa-star" aria-hidden="true"></i> Top performer</span>' : ''}
                        </div>
                    </div>
                    <div class="leaderboard-revenue">
                        <span class="revenue-label">Revenue</span>
                        <span class="revenue-amount">${revSafe}</span>
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
        const totalCount = document.getElementById('totalVendorCategoryCount');
        
        if (!vendors || vendors.length === 0) {
            if (electricalCount) electricalCount.textContent = '0';
            if (plumbingCount) plumbingCount.textContent = '0';
            if (civilCount) civilCount.textContent = '0';
            if (carpentryCount) carpentryCount.textContent = '0';
            if (totalCount) totalCount.textContent = '0';
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
        if (totalCount) totalCount.textContent = vendors.length;
    }

    renderVendorCategoriesFromStats(categories = {}, totalVendors = 0) {
        const count = (key) => Number(categories?.[key] || 0);
        const electricalCount = document.getElementById('electricalVendors');
        const plumbingCount = document.getElementById('plumbingVendors');
        const civilCount = document.getElementById('civilVendors');
        const carpentryCount = document.getElementById('carpentryVendors');
        const totalCount = document.getElementById('totalVendorCategoryCount');

        if (electricalCount) electricalCount.textContent = count('electrical');
        if (plumbingCount) plumbingCount.textContent = count('plumbing');
        if (civilCount) civilCount.textContent = count('civil');
        if (carpentryCount) carpentryCount.textContent = count('carpentry');
        if (totalCount) totalCount.textContent = Number(totalVendors || 0);
    }

    renderEmployeeLeaderboardFromStats(topEmployees = []) {
        const leaderboardContainer = document.getElementById('employeeLeaderboard');
        if (!leaderboardContainer) return;

        if (!Array.isArray(topEmployees) || topEmployees.length === 0) {
            leaderboardContainer.innerHTML = `
                <div class="leaderboard-empty" role="status">
                    <i class="fas fa-chart-line" aria-hidden="true"></i>
                    <p>No attributed revenue yet</p>
                    <span class="leaderboard-empty-hint">Rankings appear when orders with amounts are linked to employees.</span>
                </div>
            `;
            return;
        }

        leaderboardContainer.innerHTML = topEmployees.map((employee, index) => {
            const rank = index + 1;
            const rankClass = rank <= 3 ? `rank-${rank}` : '';
            const nameSafe = escapePaymentHtml(employee.name || 'Employee');
            const revenue = Number(employee.revenue) || 0;
            const orderCount = Number(employee.orderCount) || 0;
            const ordersSafe = escapePaymentHtml(`${orderCount} order${orderCount !== 1 ? 's' : ''}`);

            return `
                <div class="leaderboard-item ${rankClass}">
                    <div class="rank" aria-hidden="true">${rank}</div>
                    <div class="employee-info">
                        <div class="employee-name">${nameSafe}</div>
                        <div class="employee-meta">
                            <span class="order-count">${ordersSafe}</span>
                            ${rank === 1 ? '<span class="top-performer"><i class="fas fa-star" aria-hidden="true"></i> Top performer</span>' : ''}
                        </div>
                    </div>
                    <div class="leaderboard-revenue">
                        <span class="revenue-label">Revenue</span>
                        <span class="revenue-amount">${escapePaymentHtml(`$${revenue.toLocaleString()}`)}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderWorkflowSummary(workflow = {}) {
        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = Number(value || 0).toLocaleString();
        };

        setText('newRequests', workflow.newRequests);
        setText('workOrders', workflow.workOrders);
        setText('activeWork', workflow.activeWork);
        setText('completedWork', workflow.completedWork);
    }

    renderRevenueOverviewFromStats(revenueTimeline = []) {
        const syntheticOrders = Array.isArray(revenueTimeline)
            ? revenueTimeline.map(point => ({
                amount: Number(point.amount) || 0,
                createdAt: `${point.date}T00:00:00.000Z`
            }))
            : [];

        this.data.revenueTimeline = revenueTimeline || [];
        this.renderRevenueOverview(syntheticOrders);
    }

    renderFinancialOverviewSummary(summary = null) {
        const revenueEl = document.getElementById('financialRevenue');
        const costEl = document.getElementById('financialCost');
        const profitEl = document.getElementById('financialProfit');
        const ytdRevenueEl = document.getElementById('financialYtdRevenue');
        const monthRevenueEl = document.getElementById('financialMonthRevenue');
        const monthSalesEl = document.getElementById('financialMonthSales');
        const periodLabel = document.getElementById('financialPeriodLabel');
        const data = summary || {};

        if (revenueEl) revenueEl.textContent = `$${Number(data.totalRevenue || 0).toLocaleString()}`;
        if (costEl) costEl.textContent = `$${Number(data.totalCost || 0).toLocaleString()}`;
        if (profitEl) profitEl.textContent = `$${Number(data.totalProfit || 0).toLocaleString()}`;
        if (ytdRevenueEl) ytdRevenueEl.textContent = `$${Number(data.ytdRevenue || 0).toLocaleString()}`;
        if (monthRevenueEl) monthRevenueEl.textContent = `$${Number(data.monthRevenue || 0).toLocaleString()}`;
        if (monthSalesEl) monthSalesEl.textContent = Number(data.monthSales || 0).toLocaleString();
        if (periodLabel) periodLabel.textContent = 'All time | Monthly stats: Current month';
    }

    renderRevenueOverview(orders) {
        const ordersData = Array.isArray(orders) ? orders : [];
        const chartEl = document.getElementById('revenueOverviewChart');
        const totalEl = document.getElementById('revenueOverviewTotal');
        const ordersEl = document.getElementById('revenueOverviewOrders');
        const averageEl = document.getElementById('revenueOverviewAverage');
        const periodSelect = document.getElementById('revenueOverviewPeriod');
        if (!chartEl) return;

        const period = periodSelect?.value || 'last-30';
        const range = this.getRevenueOverviewRange(period, ordersData);
        const filteredOrders = ordersData.filter(order => this.isOrderInFinancialRange(order, range.start, range.end));
        const buckets = this.buildRevenueOverviewBuckets(range, filteredOrders);
        const totalRevenue = filteredOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
        const orderCount = filteredOrders.length;
        const averageRevenue = orderCount ? totalRevenue / orderCount : 0;

        if (totalEl) totalEl.textContent = this.formatRevenueOverviewCurrency(totalRevenue);
        if (ordersEl) ordersEl.textContent = orderCount.toLocaleString();
        if (averageEl) averageEl.textContent = this.formatRevenueOverviewCurrency(averageRevenue);

        if (!buckets.length || totalRevenue <= 0) {
            chartEl.innerHTML = `
                <div class="revenue-overview-empty" role="status">
                    <i class="fas fa-chart-line" aria-hidden="true"></i>
                    <p>No revenue in this period</p>
                </div>
            `;
            return;
        }

        chartEl.innerHTML = this.renderRevenueOverviewChartSvg(buckets, range);
    }

    getRevenueOverviewRange(period, orders = []) {
        const todayInput = todayDateInput();
        const todayYmd = this.getFinancialReferenceYmd(todayInput);
        const currentMonth = this.getFinancialMonthRange(todayYmd);
        const config = tz();
        const addDays = (dateString, days) => {
            if (config?.addDaysToDateString) return config.addDaysToDateString(dateString, days);
            return this.addRevenueDays(dateString, days);
        };

        if (period === 'last-month') {
            const month = todayYmd.month === 0 ? 11 : todayYmd.month - 1;
            const year = todayYmd.month === 0 ? todayYmd.year - 1 : todayYmd.year;
            const monthRange = this.getFinancialMonthRange({ year, month, day: 1 });
            return { ...monthRange, bucketMode: 'day', label: 'Last Month' };
        }

        if (period === 'last-30') {
            return { start: addDays(todayInput, -29), end: todayInput, bucketMode: 'day', label: 'Last 30 Days' };
        }

        if (period === 'year-to-date') {
            return { start: `${todayYmd.year}-01-01`, end: todayInput, bucketMode: 'month', label: 'Year to Date' };
        }

        if (period === 'all-time') {
            const datedOrders = orders
                .map(order => this.getRevenueOrderDateInput(order))
                .filter(Boolean)
                .sort();
            const start = datedOrders[0] || currentMonth.start;
            const end = datedOrders[datedOrders.length - 1] || currentMonth.end;
            const spanDays = this.getRevenueDateSpanDays(start, end);
            return { start, end, bucketMode: spanDays > 45 ? 'month' : 'day', label: 'All Time' };
        }

        return { ...currentMonth, bucketMode: 'day', label: 'This Month' };
    }

    buildRevenueOverviewBuckets(range, orders) {
        return range.bucketMode === 'month'
            ? this.buildRevenueMonthlyBuckets(range, orders)
            : this.buildRevenueDailyBuckets(range, orders);
    }

    buildRevenueDailyBuckets(range, orders) {
        const dates = this.getRevenueDateSeries(range.start, range.end);
        const amountByDate = new Map();
        orders.forEach(order => {
            const dateInput = this.getRevenueOrderDateInput(order);
            if (!dateInput) return;
            amountByDate.set(dateInput, (amountByDate.get(dateInput) || 0) + Number(order.amount || 0));
        });

        return dates.map(dateInput => ({
            key: dateInput,
            label: this.formatRevenueBucketLabel(dateInput),
            tooltipLabel: formatDisplayDate(dateInput),
            value: amountByDate.get(dateInput) || 0
        }));
    }

    buildRevenueMonthlyBuckets(range, orders) {
        const months = this.getRevenueMonthSeries(range.start, range.end);
        const amountByMonth = new Map();
        orders.forEach(order => {
            const dateInput = this.getRevenueOrderDateInput(order);
            if (!dateInput) return;
            const monthKey = dateInput.slice(0, 7);
            amountByMonth.set(monthKey, (amountByMonth.get(monthKey) || 0) + Number(order.amount || 0));
        });

        return months.map(monthKey => ({
            key: monthKey,
            label: new Date(`${monthKey}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short' }),
            tooltipLabel: new Date(`${monthKey}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
            value: amountByMonth.get(monthKey) || 0
        }));
    }

    renderRevenueOverviewChartSvg(buckets, range) {
        const width = 900;
        const height = 264;
        const pad = { top: 26, right: 30, bottom: 44, left: 48 };
        const plotWidth = width - pad.left - pad.right;
        const plotHeight = height - pad.top - pad.bottom;
        const maxValue = Math.max(...buckets.map(bucket => bucket.value), 1);
        const niceMax = this.getRevenueNiceMax(maxValue);
        const xStep = buckets.length > 1 ? plotWidth / (buckets.length - 1) : plotWidth;
        const points = buckets.map((bucket, index) => {
            const x = pad.left + (buckets.length > 1 ? index * xStep : plotWidth / 2);
            const y = pad.top + plotHeight - ((bucket.value / niceMax) * plotHeight);
            return { ...bucket, x, y };
        });
        const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
        const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${pad.top + plotHeight} L ${points[0].x.toFixed(2)} ${pad.top + plotHeight} Z`;
        const labelEvery = Math.max(1, Math.ceil(points.length / 6));
        const yTicks = [niceMax, niceMax * 0.75, niceMax * 0.5, niceMax * 0.25, 0];

        return `
            <svg class="revenue-overview-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                ${yTicks.map(tick => {
                    const y = pad.top + plotHeight - ((tick / niceMax) * plotHeight);
                    return `
                        <line class="revenue-grid-line" x1="${pad.left}" y1="${y.toFixed(2)}" x2="${width - pad.right}" y2="${y.toFixed(2)}"></line>
                    `;
                }).join('')}
                <path class="revenue-area-path" d="${areaPath}"></path>
                <path class="revenue-line-path" d="${linePath}"></path>
                ${points.map(point => `
                    <g class="revenue-point-group">
                        <circle class="revenue-point-hit" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="13"></circle>
                        <circle class="revenue-point" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4.5"></circle>
                    </g>
                `).join('')}
            </svg>
            <div class="revenue-chart-html-layer" aria-hidden="true">
                ${yTicks.map(tick => {
                    const y = pad.top + plotHeight - ((tick / niceMax) * plotHeight);
                    return `<span class="revenue-html-y-label" style="top:${((y / height) * 100).toFixed(3)}%; left:${(((pad.left - 14) / width) * 100).toFixed(3)}%;">${this.formatRevenueAxisLabel(tick)}</span>`;
                }).join('')}
                ${points.map((point, index) => {
                    if (!(index % labelEvery === 0 || index === points.length - 1)) return '';
                    return `<span class="revenue-html-x-label" style="left:${((point.x / width) * 100).toFixed(3)}%; top:${(((height - 12) / height) * 100).toFixed(3)}%;">${escapePaymentHtml(point.label)}</span>`;
                }).join('')}
            </div>
            <div class="revenue-chart-hover-layer" aria-hidden="true">
                ${points.map(point => {
                    const xPercent = (point.x / width) * 100;
                    const yPercent = (point.y / height) * 100;
                    const edgeClass = xPercent < 16 ? ' is-left-edge' : xPercent > 84 ? ' is-right-edge' : '';
                    const verticalClass = point.y < 76 ? ' is-below' : '';
                    return `
                        <span class="revenue-html-point${edgeClass}${verticalClass}" style="left:${xPercent.toFixed(3)}%; top:${yPercent.toFixed(3)}%;">
                            <span class="revenue-html-tooltip">
                                <small>${escapePaymentHtml(point.tooltipLabel)}</small>
                                <strong>${escapePaymentHtml(this.formatRevenueOverviewCurrency(point.value))}</strong>
                            </span>
                        </span>
                    `;
                }).join('')}
            </div>
        `;
    }

    getRevenueOrderDateInput(order) {
        const value = this.getOrderFinancialDate(order);
        if (!value) return null;
        const config = tz();
        if (config?.formatForInput) return config.formatForInput(value);
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : this.toRevenueDateInput(date);
    }

    getOrderActivityDateInput(order) {
        const value = order?.createdAt || order?.date || order?.scheduleDate || order?.startDate || null;
        if (!value) return null;
        const config = tz();
        if (config?.formatForInput) return config.formatForInput(value);
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : this.toRevenueDateInput(date);
    }

    getRevenueDateSeries(start, end) {
        const dates = [];
        const config = tz();
        let current = start;
        let guard = 0;
        while (current <= end && guard < 370) {
            dates.push(current);
            current = config?.addDaysToDateString ? config.addDaysToDateString(current, 1) : this.addRevenueDays(current, 1);
            guard += 1;
        }
        return dates.length ? dates : [start];
    }

    getRevenueMonthSeries(start, end) {
        const months = [];
        const startParts = start.split('-').map(Number);
        const endKey = end.slice(0, 7);
        let year = startParts[0];
        let month = startParts[1] - 1;
        let guard = 0;
        while (guard < 120) {
            const key = `${year}-${String(month + 1).padStart(2, '0')}`;
            months.push(key);
            if (key >= endKey) break;
            month += 1;
            if (month > 11) {
                month = 0;
                year += 1;
            }
            guard += 1;
        }
        return months;
    }

    addRevenueDays(dateInput, days) {
        const date = new Date(`${dateInput}T00:00:00`);
        date.setDate(date.getDate() + days);
        return this.toRevenueDateInput(date);
    }

    getRevenueDateSpanDays(start, end) {
        const startDate = new Date(`${start}T00:00:00`);
        const endDate = new Date(`${end}T00:00:00`);
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
        return Math.max(0, Math.round((endDate - startDate) / 86400000));
    }

    toRevenueDateInput(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    formatRevenueBucketLabel(dateInput) {
        const date = new Date(`${dateInput}T00:00:00`);
        if (Number.isNaN(date.getTime())) return dateInput;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    getRevenueNiceMax(value) {
        if (value <= 0) return 1;
        const magnitude = 10 ** Math.floor(Math.log10(value));
        const normalized = value / magnitude;
        const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
        return nice * magnitude;
    }

    formatRevenueAxisLabel(value) {
        if (value >= 1000000) return `${Math.round(value / 1000000)}M`;
        if (value >= 1000) return `${Math.round(value / 1000)}K`;
        return Math.round(value).toLocaleString();
    }

    formatRevenueOverviewCurrency(value) {
        const amount = Number(value) || 0;
        return amount.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: amount % 1 ? 2 : 0,
            maximumFractionDigits: 2
        });
    }

    renderFinancialOverview(orders, payments) {
        const ordersData = Array.isArray(orders) ? orders : [];
        const revenueEl = document.getElementById('financialRevenue');
        const costEl = document.getElementById('financialCost');
        const profitEl = document.getElementById('financialProfit');
        const ytdRevenueEl = document.getElementById('financialYtdRevenue');
        const monthRevenueEl = document.getElementById('financialMonthRevenue');
        const monthSalesEl = document.getElementById('financialMonthSales');
        const periodLabel = document.getElementById('financialPeriodLabel');
        
        // Get date range from inputs
        const startDateInput = document.getElementById('financialStartDate');
        const endDateInput = document.getElementById('financialEndDate');
        
        let filteredOrders = ordersData;
        let periodText = 'All time';
        let referenceDateInput = todayDateInput();
        
        if (startDateInput && endDateInput && startDateInput.value && endDateInput.value) {
            const startDate = startDateInput.value;
            const endDate = endDateInput.value;
            referenceDateInput = endDate;
            
            filteredOrders = ordersData.filter(order => {
                const orderDate = this.getOrderFinancialDate(order);
                if (!orderDate) return false;
                if (tz()) {
                    return tz().isDateInRangeMDT(orderDate, startDate, endDate);
                }
                const parsedOrderDate = new Date(orderDate);
                const start = new Date(startDate);
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                return parsedOrderDate >= start && parsedOrderDate <= end;
            });
            
            periodText = `${formatDisplayDate(startDate)} - ${formatDisplayDate(endDate)}`;
        }
        
        const totalRevenue = filteredOrders.reduce((sum, order) => sum + (Number(order.amount) || 0), 0);
        const totalCost = filteredOrders.reduce((sum, order) => sum + (Number(order.vendorCost) || 0), 0);
        const totalProfit = totalRevenue - totalCost;
        const referenceYmd = this.getFinancialReferenceYmd(referenceDateInput);
        const currentMonth = this.getCurrentFinancialMonthRange();
        const currentMonthYmd = currentMonth.ymd;
        const currentMonthRange = currentMonth.range;
        const ytdRange = this.getFinancialYtdRange(referenceYmd);
        const ytdRevenue = this.sumRevenueInRange(ordersData, ytdRange.start, ytdRange.end);
        const monthRevenue = this.sumRevenueInRange(ordersData, currentMonthRange.start, currentMonthRange.end);
        const monthSales = this.countOrdersInRange(ordersData, currentMonthRange.start, currentMonthRange.end);
        const selectedMonthLabel = this.formatFinancialMonthLabel(currentMonthYmd);
        
        if (revenueEl) revenueEl.textContent = `$${totalRevenue.toLocaleString()}`;
        if (costEl) costEl.textContent = `$${totalCost.toLocaleString()}`;
        if (profitEl) profitEl.textContent = `$${totalProfit.toLocaleString()}`;
        if (ytdRevenueEl) ytdRevenueEl.textContent = `$${ytdRevenue.toLocaleString()}`;
        if (monthRevenueEl) monthRevenueEl.textContent = `$${monthRevenue.toLocaleString()}`;
        if (monthSalesEl) monthSalesEl.textContent = monthSales.toLocaleString();
        if (periodLabel) periodLabel.textContent = `${periodText} | Monthly stats: ${selectedMonthLabel}`;
    }

    getOrderFinancialDate(order) {
        return order?.scheduleDate || order?.startDate || order?.endDate || order?.date || order?.createdAt || null;
    }

    getFinancialReferenceYmd(dateInput) {
        const config = tz();
        const ymd = config ? config.getYmdInMDT(config.dateInputToMDT(dateInput)) : null;
        if (ymd) return ymd;

        const fallback = new Date(dateInput || new Date());
        if (!Number.isNaN(fallback.getTime())) {
            return {
                year: fallback.getFullYear(),
                month: fallback.getMonth(),
                day: fallback.getDate()
            };
        }

        const today = new Date();
        return { year: today.getFullYear(), month: today.getMonth(), day: today.getDate() };
    }

    getFinancialMonthRange(referenceYmd) {
        const start = `${referenceYmd.year}-${String(referenceYmd.month + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(referenceYmd.year, referenceYmd.month + 1, 0).getDate();
        const end = `${referenceYmd.year}-${String(referenceYmd.month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        return { start, end };
    }

    getCurrentFinancialMonthRange() {
        const config = tz();
        const nowYmd = config?.nowYmdMDT ? config.nowYmdMDT() : this.getFinancialReferenceYmd(todayDateInput());
        return {
            ymd: nowYmd,
            range: this.getFinancialMonthRange(nowYmd)
        };
    }

    getFinancialYtdRange(referenceYmd) {
        return {
            start: `${referenceYmd.year}-01-01`,
            end: `${referenceYmd.year}-${String(referenceYmd.month + 1).padStart(2, '0')}-${String(referenceYmd.day).padStart(2, '0')}`
        };
    }

    isOrderInFinancialRange(order, startDate, endDate) {
        const orderDate = this.getOrderFinancialDate(order);
        if (!orderDate || !startDate || !endDate) return false;

        const config = tz();
        if (config) {
            return config.isDateInRangeMDT(orderDate, startDate, endDate);
        }

        const parsedOrderDate = new Date(orderDate);
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        return !Number.isNaN(parsedOrderDate.getTime()) && parsedOrderDate >= start && parsedOrderDate <= end;
    }

    sumRevenueInRange(orders, startDate, endDate) {
        return (orders || []).reduce((sum, order) => {
            if (!this.isOrderInFinancialRange(order, startDate, endDate)) return sum;
            return sum + Number(order.amount || 0);
        }, 0);
    }

    countSalesInRange(orders, startDate, endDate) {
        const completedStatuses = new Set(['completed', 'paid', 'closed']);
        return (orders || []).filter(order => {
            const status = String(order.status || '').toLowerCase();
            const pipelineStage = String(order.pipelineStage || '').toLowerCase();
            const isCompletedOrPaid = completedStatuses.has(status) || completedStatuses.has(pipelineStage);
            return isCompletedOrPaid && this.isOrderInFinancialRange(order, startDate, endDate);
        }).length;
    }

    countOrdersInRange(orders, startDate, endDate) {
        return (orders || []).filter(order => this.isOrderInFinancialRange(order, startDate, endDate)).length;
    }

    formatFinancialMonthLabel(referenceYmd) {
        return new Date(Date.UTC(referenceYmd.year, referenceYmd.month, 1)).toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC'
        });
    }



    formatStatus(status) {
        return status.split('-').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }

    formatDate(dateString) {
        return formatDisplayDate(dateString, '');
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
            window.AppLogger?.debug(`Searching for: ${searchTerm}`);
            // In a real application, this would filter data
        }
    });
}

function normalizeFilterValue(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[_\s]+/g, '-');
}

function normalizeSearchText(value) {
    return String(value || '').trim().toLowerCase();
}

function buildSearchText(values) {
    return values
        .filter(value => value !== undefined && value !== null)
        .map(value => {
            if (Array.isArray(value)) return value.join(' ');
            if (typeof value === 'object') return Object.values(value).join(' ');
            return value;
        })
        .join(' ')
        .toLowerCase();
}

function formatFilterLabel(value) {
    return String(value || '')
        .trim()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
}

function updateSelectOptions(selectId, items, getValues, defaultLabel, baseOptions = []) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const selectedValue = select.value || 'all';
    const optionMap = new Map(baseOptions.map(([value, label]) => [normalizeFilterValue(value), label]));

    items.forEach(item => {
        getValues(item).forEach(value => {
            const normalized = normalizeFilterValue(value);
            if (!normalized || normalized === 'all' || optionMap.has(normalized)) return;
            optionMap.set(normalized, formatFilterLabel(value));
        });
    });

    select.replaceChildren();

    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = defaultLabel;
    select.appendChild(allOption);

    optionMap.forEach((label, value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
    });

    const normalizedSelected = normalizeFilterValue(selectedValue);
    select.value = optionMap.has(normalizedSelected) ? normalizedSelected : 'all';
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
            window.APIService.handleUnauthorized();
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
            <button type="button" onclick="closeNotificationPanel()" class="close-panel" aria-label="Close notifications">×</button>
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
    const now = nowInMDT();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return formatDisplayDate(timestamp);
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

// Software update feed
const SOFTWARE_UPDATES = [
    {
        id: '2026-06-02-revenue-overview-chart',
        type: 'feature',
        icon: 'chart-line',
        title: 'Revenue Overview Chart',
        message: 'Revenue overview now appears after Vendor categories with all-time default totals, live order revenue data, period filtering, and hover details on each chart point.',
        createdAt: '2026-06-02T12:00:00Z'
    },
    {
        id: '2026-06-02-dashboard-overview-refresh',
        type: 'improvement',
        icon: 'chart-line',
        title: 'Dashboard Overview Refresh',
        message: 'The dashboard overview now has cleaner metric cards, redesigned action and activity panels, refreshed customer and financial sections, and corrected monthly financial totals.',
        createdAt: '2026-06-02T00:00:00Z'
    },
    {
        id: '2026-05-31-detail-page-redesign',
        type: 'improvement',
        icon: 'file-alt',
        title: 'Detail Page Redesign',
        message: 'Order, customer, vendor, employee, and pipeline order details now use cleaner stacked cards with row-style information.',
        createdAt: '2026-05-31T00:00:00Z'
    },
    {
        id: '2026-05-31-orders-toolbar-design',
        type: 'improvement',
        icon: 'sliders-h',
        title: 'Improved Orders Toolbar',
        message: 'The orders search, filters, date range, and summary stats are now better aligned and easier to scan.',
        createdAt: '2026-05-31T00:00:00Z'
    },
    {
        id: '2026-05-31-order-date-fields',
        type: 'feature',
        icon: 'calendar-plus',
        title: 'Created Date and Schedule Date',
        message: 'Orders now separate the date the order was created from the date service is scheduled to begin.',
        createdAt: '2026-05-31T00:00:00Z'
    },
    {
        id: '2026-05-31-optional-date-fields',
        type: 'improvement',
        icon: 'calendar-check',
        title: 'Optional Date Fields',
        message: 'Date fields no longer require an asterisk before saving orders, projects, or payments.',
        createdAt: '2026-05-31T00:00:00Z'
    }
];

const SOFTWARE_UPDATES_STORAGE_KEY = 'smplfixLatestReadSoftwareUpdate';
const LEGACY_SOFTWARE_UPDATES_STORAGE_KEY = 'huttaLatestReadSoftwareUpdate';

function getLatestReadSoftwareUpdate() {
    const current = localStorage.getItem(SOFTWARE_UPDATES_STORAGE_KEY);
    if (current) return current;
    const legacy = localStorage.getItem(LEGACY_SOFTWARE_UPDATES_STORAGE_KEY);
    if (legacy) {
        localStorage.setItem(SOFTWARE_UPDATES_STORAGE_KEY, legacy);
        localStorage.removeItem(LEGACY_SOFTWARE_UPDATES_STORAGE_KEY);
    }
    return legacy;
}

function initializeSoftwareUpdates() {
    const updatesIcon = document.querySelector('.updates-icon');
    if (!updatesIcon) return;

    updateSoftwareUpdatesBadge();

    updatesIcon.addEventListener('click', (event) => {
        event.stopPropagation();
        showSoftwareUpdatesPanel();
    });
}

function getUnseenSoftwareUpdatesCount() {
    const latestReadId = getLatestReadSoftwareUpdate();
    if (!latestReadId) return SOFTWARE_UPDATES.length;

    const latestReadIndex = SOFTWARE_UPDATES.findIndex(update => update.id === latestReadId);
    return latestReadIndex >= 0 ? latestReadIndex : SOFTWARE_UPDATES.length;
}

function isSoftwareUpdateUnread(updateId) {
    const latestReadId = getLatestReadSoftwareUpdate();
    if (!latestReadId) return true;

    const updateIndex = SOFTWARE_UPDATES.findIndex(update => update.id === updateId);
    const latestReadIndex = SOFTWARE_UPDATES.findIndex(update => update.id === latestReadId);
    if (updateIndex === -1 || latestReadIndex === -1) return true;
    return updateIndex < latestReadIndex;
}

function updateSoftwareUpdatesBadge() {
    const badge = document.querySelector('.updates-badge');
    if (!badge) return;

    const unseenCount = getUnseenSoftwareUpdatesCount();
    if (unseenCount > 0) {
        badge.textContent = unseenCount;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function showSoftwareUpdatesPanel() {
    closeNotificationPanel();
    closeSoftwareUpdatesPanel();

    const panel = document.createElement('div');
    panel.id = 'softwareUpdatesPanel';
    panel.className = 'notification-panel software-updates-panel';

    const updateList = SOFTWARE_UPDATES.length > 0
        ? SOFTWARE_UPDATES.map(update => `
            <div class="notification-item software-update-item ${isSoftwareUpdateUnread(update.id) ? 'unread' : 'read'}" data-id="${update.id}">
                <div class="notification-icon ${update.type}">
                    <i class="fas fa-${update.icon}"></i>
                </div>
                <div class="notification-content">
                    <h4>${update.title}</h4>
                    <p>${update.message}</p>
                    <span class="notification-time">${formatDisplayDate(update.createdAt)}</span>
                </div>
                ${isSoftwareUpdateUnread(update.id) ? '<div class="unread-dot"></div>' : ''}
            </div>
        `).join('')
        : '<div class="no-notifications">No software updates yet</div>';

    panel.innerHTML = `
        <div class="notification-header">
            <h3>What's New</h3>
            <button onclick="markSoftwareUpdatesAsRead()" class="mark-all-read">Mark as read</button>
            <button type="button" onclick="closeSoftwareUpdatesPanel()" class="close-panel" aria-label="Close software updates">&times;</button>
        </div>
        <div class="notification-list">${updateList}</div>
    `;

    document.body.appendChild(panel);
    panel.addEventListener('click', event => event.stopPropagation());

    setTimeout(() => {
        document.addEventListener('click', closeSoftwareUpdatesPanel, { once: true });
    }, 100);
}

function markSoftwareUpdatesAsRead() {
    if (SOFTWARE_UPDATES[0]) {
        localStorage.setItem(SOFTWARE_UPDATES_STORAGE_KEY, SOFTWARE_UPDATES[0].id);
    }

    document.querySelectorAll('.software-update-item.unread').forEach(item => {
        item.classList.remove('unread');
        item.classList.add('read');
        const dot = item.querySelector('.unread-dot');
        if (dot) dot.remove();
    });

    updateSoftwareUpdatesBadge();
}

function closeSoftwareUpdatesPanel() {
    const panel = document.getElementById('softwareUpdatesPanel');
    if (panel) panel.remove();
}

// Global function to test pipeline refresh
window.testPipelineRefresh = function() {
    window.AppLogger?.debug('=== TESTING PIPELINE REFRESH ===');
    window.AppLogger?.debug('Dashboard object:', window.dashboard);
    window.AppLogger?.debug('Refresh functions available:', {
        refreshDashboard: typeof window.refreshDashboard,
        refreshDashboardKPIs: typeof window.refreshDashboardKPIs,
        onPipelineStageChange: typeof window.onPipelineStageChange,
        forceRefreshDashboard: typeof window.forceRefreshDashboard
    });
    
    // Simulate pipeline stage change
    window.AppLogger?.debug('Simulating pipeline stage change...');
    if (window.onPipelineStageChange) {
        window.onPipelineStageChange();
    } else {
        console.error('onPipelineStageChange function not found!');
    }
};

// Global function to manually refresh KPIs
window.manualRefreshKPIs = async function() {
    window.AppLogger?.debug('=== MANUAL KPI REFRESH ===');
    if (window.dashboard) {
        // Clear cache first
        if (window.dashboard.clearCache) {
            window.AppLogger?.debug('Clearing cache...');
            window.dashboard.clearCache();
        }
        if (window.APIService && window.APIService.clearCache) {
            window.APIService.clearCache();
        }
        window.dashboard.forceFreshDashboardStats = true;
        window.AppLogger?.debug('Calling dashboard.renderDashboard()...');
        await window.dashboard.renderDashboard();
        window.AppLogger?.debug('Manual refresh complete');
    } else {
        console.error('Dashboard object not found!');
    }
};

// Global function to force refresh dashboard with fresh data
window.forceRefreshDashboard = async function() {
    window.AppLogger?.debug('=== FORCE REFRESH DASHBOARD ===');
    if (window.dashboard) {
        // Clear any cached data
        if (window.dashboard.clearCache) {
            window.dashboard.clearCache();
        }
        if (window.APIService && window.APIService.clearCache) {
            window.APIService.clearCache();
        }
        window.dashboard.forceFreshDashboardStats = true;
        
        // Force fresh data load
        await window.dashboard.renderDashboard();
        window.AppLogger?.debug('Dashboard force refreshed');
    } else {
        console.error('Dashboard object not found!');
    }
};

// Global function to check current order data
window.checkOrderData = async function() {
    window.AppLogger?.debug('=== CHECKING ORDER DATA ===');
    
    // Clear APIService cache first
    if (window.APIService && window.APIService.clearCache) {
        window.AppLogger?.debug('Clearing APIService cache before check...');
        window.APIService.clearCache();
    }
    
    try {
        const orders = await window.APIService.getOrders();
        window.AppLogger?.debug('Total orders:', orders.length);
        
        // Show all orders with their pipeline stages
        window.AppLogger?.debug('All orders with pipeline info:');
        orders.forEach((order, index) => {
            window.AppLogger?.debug(`Order ${index + 1}:`, {
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
        window.AppLogger?.debug('Orders in Paid stage:', paidOrders.length);
        window.AppLogger?.debug('Paid orders:', paidOrders.map(o => ({ id: o._id, amount: o.amount, stage: o.pipelineStage })));
        
        const paymentsCollected = paidOrders.reduce((sum, order) => sum + (order.amount || 0), 0);
        window.AppLogger?.debug('Calculated payments collected:', paymentsCollected);
        
        const unpaidOrders = orders.filter(order => order.pipelineStage !== 'Paid');
        window.AppLogger?.debug('Unpaid orders:', unpaidOrders.length);
        window.AppLogger?.debug('Unpaid orders:', unpaidOrders.map(o => ({ id: o._id, amount: o.amount, stage: o.pipelineStage || 'no stage' })));
        
        const pendingPayments = unpaidOrders.reduce((sum, order) => sum + (order.amount || 0), 0);
        window.AppLogger?.debug('Calculated pending payments:', pendingPayments);
        
        // Also check pipeline records
        window.AppLogger?.debug('\n=== CHECKING PIPELINE RECORDS ===');
        const response = await fetch('/api/pipeline-records');
        const pipelineRecords = await response.json();
        window.AppLogger?.debug('Total pipeline records:', pipelineRecords.length);
        pipelineRecords.forEach((record, index) => {
            window.AppLogger?.debug(`Pipeline Record ${index + 1}:`, {
                id: record._id,
                orderId: record.orderId,
                customerName: record.customerName,
                stageId: record.stageId
            });
        });
        
        // Check stages
        window.AppLogger?.debug('\n=== CHECKING STAGES ===');
        const stagesResponse = await fetch('/api/stages');
        const stages = await stagesResponse.json();
        window.AppLogger?.debug('Stages:', stages.map(s => ({ id: s._id, name: s.name })));
        
        return { orders, paidOrders, paymentsCollected, pendingPayments, pipelineRecords, stages };
    } catch (error) {
        console.error('Error checking order data:', error);
    }
};

// Global refresh dashboard function - force immediate refresh
window.refreshDashboard = async function() {
    if (window.dashboard) {
        window.AppLogger?.debug('Force refreshing dashboard...');
        // Clear cache to ensure fresh data
        if (window.dashboard.clearCache) {
            window.dashboard.clearCache();
        }
        if (window.APIService && window.APIService.clearCache) {
            window.APIService.clearCache();
        }
        window.dashboard.forceFreshDashboardStats = true;
        await window.dashboard.renderDashboard();
    }
};

// Global function to refresh dashboard when pipeline changes - immediate refresh
window.refreshDashboardKPIs = async function() {
    if (window.dashboard) {
        window.AppLogger?.debug('Refreshing dashboard KPIs due to pipeline change...');
        // Clear cache to ensure fresh data
        if (window.dashboard.clearCache) {
            window.dashboard.clearCache();
        }
        if (window.APIService && window.APIService.clearCache) {
            window.APIService.clearCache();
        }
        window.dashboard.forceFreshDashboardStats = true;
        await window.dashboard.renderDashboard();
    }
};

// Function to refresh dashboard from pipeline system
window.onPipelineStageChange = async function() {
    window.AppLogger?.debug('Pipeline stage changed - refreshing dashboard...');
    if (window.dashboard) {
        // Clear cache to ensure fresh data
        if (window.dashboard.clearCache) {
            window.dashboard.clearCache();
        }
        if (window.APIService && window.APIService.clearCache) {
            window.APIService.clearCache();
        }
        window.dashboard.forceFreshDashboardStats = true;
        await window.dashboard.renderDashboard();
    }
};

// Loading Overlay Functions
function showLoading(message = 'Loading records.') {
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
document.addEventListener('DOMContentLoaded', async function() {
    // Check if we're on the dashboard page
    if (!window.location.pathname.includes('admin-dashboard')) {
        return;
    }
    
    // Set current date and time in the header
    updateDashboardDateTime();
    setInterval(updateDashboardDateTime, 60 * 1000);
    
    try {
        await window.AuthReady;
    } catch (error) {
        return;
    }

    const sessionData = { user: window.AuthSession.user, isAuthenticated: true };
    window.RBAC?.init();
    
    window.AppLogger?.debug('Session valid, initializing dashboard...');
    
    // Update user info in dashboard
    updateUserInfo(sessionData);
    
    // Create global dashboard instance
    window.dashboard = new DashboardManager();

    if (window.location.hash === '#workflow-center') {
        window.dashboard.showSection('workflow-center');
        document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
        document.querySelector('[data-section="workflow-center"]')?.parentElement?.classList.add('active');
        loadWorkflowCenter();
    }
    if (window.location.hash === '#incoming-quotes') {
        window.dashboard.showSection('incoming-quotes');
        document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
        document.querySelector('[data-section="incoming-quotes"]')?.parentElement?.classList.add('active');
        window.loadIncomingQuotes?.();
    }
    if (window.location.hash === '#outgoing-quotes') {
        window.dashboard.showSection('outgoing-quotes');
        document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
        document.querySelector('[data-section="outgoing-quotes"]')?.parentElement?.classList.add('active');
        window.loadOutgoingQuotes?.();
    }
    if (window.location.hash === '#customer-approvals') {
        window.dashboard.showSection('customer-approvals');
        document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
        document.querySelector('[data-section="customer-approvals"]')?.parentElement?.classList.add('active');
        window.loadCustomerApprovals?.();
    }
    if (window.location.hash === '#scheduling') {
        window.dashboard.showSection('scheduling');
        document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
        document.querySelector('[data-section="scheduling"]')?.parentElement?.classList.add('active');
        window.loadScheduling?.();
    }
    
    // Initialize additional features
    addHoverEffects();
    initializeSearch();
    initializeNotifications();
    initializeSoftwareUpdates();
    initializeLogout();
    
    // Apply saved theme on initialization
    applySavedTheme();
    
    window.AppLogger?.debug('smplfix Admin Dashboard initialized successfully.');
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
                adminAvatar.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%230B0B0C'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Space Grotesk' font-size='20' fill='white'%3E${firstLetter}%3C/text%3E%3C/svg%3E`;
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
    
    const syncProfileAria = () => {
        const open = adminProfile.classList.contains('active');
        adminProfile.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    adminProfile.addEventListener('click', function(e) {
        e.stopPropagation();
        adminProfile.classList.toggle('active');
        profileDropdown.classList.toggle('show');
        syncProfileAria();
    });

    adminProfile.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            adminProfile.click();
        }
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function() {
        adminProfile.classList.remove('active');
        profileDropdown.classList.remove('show');
        syncProfileAria();
    });
}

// Order Management Functions
let currentOrderId = null;
let currentDetailOrderId = null;
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
            
            window.AppLogger?.debug('Customer clicked:', customer.name);
            
            // Set the input value to show only customer name
            const input = document.getElementById('customerSearchInput');
            const hiddenSelect = document.getElementById('customerSelect');
            
            // Show only the customer name in the input field
            input.value = customer.name;
            hiddenSelect.value = customer._id;
            
            // Trigger change events
            input.dispatchEvent(new Event('change', { bubbles: true }));
            hiddenSelect.dispatchEvent(new Event('change', { bubbles: true }));
            
            window.AppLogger?.debug('Set input to:', input.value);
            window.AppLogger?.debug('Set hidden select to:', hiddenSelect.value);
            
            // Close dropdown
            dropdown.classList.remove('show');
            const ss = document.querySelector('#orderModal .searchable-select');
            if (ss) ss.classList.remove('open');
            
            // Handle customer selection
            handleCustomerSelect();
        };
        
        dropdown.appendChild(option);
    });
    
    // Add event listener for "Add New Customer" option
    addNewOption.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        window.AppLogger?.debug('Add New Customer clicked');
        
        const input = document.getElementById('customerSearchInput');
        const hiddenSelect = document.getElementById('customerSelect');
        
        input.value = 'Add New Customer';
        hiddenSelect.value = 'new';
        
        // Trigger change events
        input.dispatchEvent(new Event('change', { bubbles: true }));
        hiddenSelect.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Close dropdown
        dropdown.classList.remove('show');
        const ss = document.querySelector('#orderModal .searchable-select');
        if (ss) ss.classList.remove('open');
        
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
            
            window.AppLogger?.debug('Filtered customer clicked:', customer.name);
            
            // Set the input value to show only customer name
            const input = document.getElementById('customerSearchInput');
            const hiddenSelect = document.getElementById('customerSelect');
            
            // Show only the customer name in the input field
            input.value = customer.name;
            hiddenSelect.value = customer._id;
            
            // Trigger change events
            input.dispatchEvent(new Event('change', { bubbles: true }));
            hiddenSelect.dispatchEvent(new Event('change', { bubbles: true }));
            
            window.AppLogger?.debug('Set input to:', input.value);
            window.AppLogger?.debug('Set hidden select to:', hiddenSelect.value);
            
            // Close dropdown
            dropdown.classList.remove('show');
            const ss = document.querySelector('#orderModal .searchable-select');
            if (ss) ss.classList.remove('open');
            
            // Handle customer selection
            handleCustomerSelect();
        };
        
        dropdown.appendChild(option);
    });
    
    // Re-add event listener for "Add New Customer" option
    addNewOption.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        window.AppLogger?.debug('Add New Customer clicked (filtered)');
        
        const input = document.getElementById('customerSearchInput');
        const hiddenSelect = document.getElementById('customerSelect');
        
        input.value = 'Add New Customer';
        hiddenSelect.value = 'new';
        
        // Trigger change events
        input.dispatchEvent(new Event('change', { bubbles: true }));
        hiddenSelect.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Close dropdown
        dropdown.classList.remove('show');
        const ss = document.querySelector('#orderModal .searchable-select');
        if (ss) ss.classList.remove('open');
        
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
    const container = document.querySelector('#orderModal .searchable-select');
    if (!container || !dropdown) return;
    
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
    const container = document.querySelector('#orderModal .searchable-select');
    
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
    
    window.AppLogger?.debug('handleCustomerSelect called with value:', selectedValue);
    
    if (selectedValue === 'new' || selectedValue === '') {
        window.AppLogger?.debug('Showing new customer fields');
        // Show new customer fields
        newCustomerFields.style.display = 'grid';
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
        window.AppLogger?.debug('Showing address selection for existing customer');
        // Hide new customer fields and show address selection
        const customer = orderCustomers.find(c => c._id === selectedValue);
        window.AppLogger?.debug('Found customer:', customer);
        
        if (customer) {
            newCustomerFields.style.display = 'none';
            customerAddressSelection.style.display = 'grid';
            
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
    try {
    currentOrderId = null;
    window.existingOrderDocs = [];
    if (window.uploadedFiles) window.uploadedFiles.order = [];
    const orderModal = document.getElementById('orderModal');
    orderModal.dataset.mode = 'create';
    document.getElementById('orderModalEyebrow').textContent = 'New order';
    document.getElementById('orderModalTitle').textContent = 'Create Order';
    document.getElementById('orderModalDescription').textContent = 'Build a complete service order and assign the right team.';
    document.getElementById('orderModalSubmit').innerHTML = '<i class="fas fa-plus" aria-hidden="true"></i> Create Order';
    document.getElementById('orderForm').reset();
    
    // Reset customer search and hide address selection
    document.getElementById('customerSearchInput').value = '-- Select Existing Customer --';
    document.getElementById('customerSelect').value = '';
    document.getElementById('newCustomerFields').style.display = 'grid';
    document.getElementById('customerAddressSelection').style.display = 'none';
    document.getElementById('customerSelectDropdown').classList.remove('show');
    const searchableSelect = document.querySelector('#orderModal .searchable-select');
    if (searchableSelect) searchableSelect.classList.remove('open');
    
    // Reset search filter
    const searchFilter = document.getElementById('customerSearchFilter');
    if (searchFilter) {
        searchFilter.value = '';
    }
    
    // Reset required fields
    document.getElementById('customerName').required = true;
    document.getElementById('customerAddressSelect').required = false;
    document.getElementById('amount').required = true;
    document.querySelector('label[for="amount"]').textContent = 'Revenue *';
    
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
    const today = todayDateInput();
    document.getElementById('startDate').value = today;
    document.getElementById('scheduleDate').value = today;
    
    // Reset order type and recurring fields
    document.getElementById('orderType').value = 'one-time';
    document.getElementById('recurringFrequency').value = 'weekly';
    document.getElementById('recurringEndDate').value = '';
    document.getElementById('recurringNotes').value = '';
    document.getElementById('recurringCustomDays').value = '';
    if (document.getElementById('customDaysGroup')) {
        document.getElementById('customDaysGroup').style.display = 'none';
    }
    toggleRecurringFields(); // Hide recurring fields by default
    renderNotesManager('orders', '', {}, 'notes');
    
    loadVendors();
    loadEmployees();
    loadOrderCustomers();
    initializeServiceSuggestions();
    closeServiceSuggestions();
    orderModal.style.display = '';
    orderModal.classList.add('show');
    } catch (error) {
        console.error('showAddOrderModal failed:', error);
        if (typeof showToast === 'function') {
            showToast('Could not open order form. Please refresh the page.', 'error');
        }
    }
}

async function editOrder(orderId) {
    try {
        currentOrderId = orderId;
        const order = await window.APIService.getOrder(orderId);
        
        const orderModal = document.getElementById('orderModal');
        orderModal.dataset.mode = 'edit';
        document.getElementById('orderModalEyebrow').textContent = order.orderId || 'Existing order';
        document.getElementById('orderModalTitle').textContent = 'Edit Order';
        document.getElementById('orderModalDescription').textContent = 'Update service details, pricing, scheduling, and assignments.';
        document.getElementById('orderModalSubmit').innerHTML = '<i class="fas fa-check" aria-hidden="true"></i> Save Changes';
        
        // Load customers and vendors first
        await loadVendors();
        await loadEmployees();
        await loadOrderCustomers();
        
        // Populate form - make customer fields read-only
        document.getElementById('customerSelect').value = 'new';
        document.getElementById('newCustomerFields').style.display = 'grid';
        document.getElementById('customerName').value = order.customer.name || '';
        document.getElementById('customerEmail').value = order.customer.email || '';
        document.getElementById('customerPhone').value = order.customer.phone || '';
        document.getElementById('customerAddress').value = order.customer.address || '';
        
        // Make customer fields read-only
        document.getElementById('customerName').readOnly = true;
        document.getElementById('customerEmail').readOnly = true;
        document.getElementById('customerPhone').readOnly = true;
        document.getElementById('customerAddress').readOnly = order.source !== 'website';
        
        // Disable customer selection dropdown
        document.getElementById('customerSearchInput').disabled = true;
        document.getElementById('customerSearchInput').style.cursor = 'not-allowed';
        document.getElementById('customerSearchInput').style.backgroundColor = '#f3f4f6';
        
        // Add visual styling to indicate read-only
        const readOnlyStyle = 'background-color: #f3f4f6; cursor: not-allowed;';
        document.getElementById('customerName').style.cssText = readOnlyStyle;
        document.getElementById('customerEmail').style.cssText = readOnlyStyle;
        document.getElementById('customerPhone').style.cssText = readOnlyStyle;
        document.getElementById('customerAddress').style.cssText = order.source === 'website' ? '' : readOnlyStyle;
        
        document.getElementById('service').value = order.service || '';
        document.getElementById('amount').value = order.amount || '';
        document.getElementById('amount').required = order.pricingStatus !== 'unquoted';
        document.querySelector('label[for="amount"]').textContent = order.pricingStatus === 'unquoted' ? 'Revenue (unquoted)' : 'Revenue *';
        document.getElementById('vendorCost').value = order.vendorCost || '';
        document.getElementById('processingFee').value = order.processingFee || '';
        document.getElementById('profit').value = order.profit || '';
        document.getElementById('startDate').value = order.startDate ? order.startDate.split('T')[0] : '';
        document.getElementById('scheduleDate').value = (order.scheduleDate || order.startDate) ? (order.scheduleDate || order.startDate).split('T')[0] : '';
        document.getElementById('endDate').value = order.endDate ? order.endDate.split('T')[0] : '';
        document.getElementById('status').value = order.status || 'new';
        document.getElementById('priority').value = order.priority || 'medium';
        document.getElementById('description').value = order.description || '';
        renderNotesManager('orders', order._id, order, 'notes');
        
        // Populate recurring order fields
        document.getElementById('orderType').value = order.orderType || 'one-time';
        
        // Trigger toggle to show/hide recurring fields
        toggleRecurringFields();
        
        // If recurring order, populate recurring fields
        if (order.orderType === 'recurring') {
            document.getElementById('recurringFrequency').value = order.recurringFrequency || 'weekly';
            document.getElementById('recurringEndDate').value = order.recurringEndDate ? order.recurringEndDate.split('T')[0] : '';
            document.getElementById('recurringNotes').value = order.recurringNotes || '';
            
            // Handle custom frequency
            if (order.recurringFrequency === 'custom' && order.recurringCustomDays) {
                document.getElementById('recurringCustomDays').value = order.recurringCustomDays;
                toggleCustomDaysField();
            }
        }
        
        if (order.vendor) {
            document.getElementById('vendor').value = order.vendor._id || order.vendor;
        }
        
        if (order.employee) {
            document.getElementById('employee').value = order.employee._id || order.employee;
        }
        initializeServiceSuggestions();
        closeServiceSuggestions();
        
        // Clear and populate documents
        if (window.uploadedFiles) {
            window.uploadedFiles.order = [];
        }
        const preview = document.getElementById('orderDocsPreview');
        if (preview) preview.replaceChildren();
        window.existingOrderDocs = Array.isArray(order.documents) ? order.documents : [];
        window.updateDocumentPreview?.('order', 'orderDocsPreview');
        
        orderModal.classList.add('show');
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
                startDate: document.getElementById('scheduleDate').value || document.getElementById('startDate').value,
                description: document.getElementById('description').value || '',
                notes: document.getElementById('notes').value || ''
            };
            
            const response = await fetch(`${window.API_BASE_URL || 'http://localhost:3000/api'}/pipeline-records/${window.currentPipelineRecordId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pipelineData)
            });
            
            if (!response.ok) throw new Error('Failed to update pipeline record');
            if (document.getElementById('notes')?.value.trim()) {
                try {
                    await window.APIService.addNote('pipeline-records', window.currentPipelineRecordId, document.getElementById('notes').value.trim());
                } catch (noteError) {
                    console.warn('Pipeline note save skipped:', noteError);
                    showToast('Pipeline record saved, but the note history API is not available yet. Restart the backend and try adding the note again.', 'warning');
                }
            }
            
            showToast('Pipeline record updated.', 'success');
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
        scheduleDate: document.getElementById('scheduleDate').value,
        endDate: document.getElementById('orderType').value === 'recurring' ? null : (document.getElementById('endDate').value || null),
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
        
        // Validate custom frequency
        if (recurringFrequency === 'custom') {
            const customDays = document.getElementById('recurringCustomDays').value;
            if (!customDays || customDays < 1) {
                showToast('Please enter number of days for custom frequency', 'error');
                setButtonLoading(saveBtn, false);
                hideLoading();
                return;
            }
            orderData.recurringCustomDays = parseInt(customDays);
        }
        
        orderData.recurringFrequency = recurringFrequency;
        orderData.recurringEndDate = document.getElementById('recurringEndDate').value || null;
        orderData.recurringNotes = document.getElementById('recurringNotes').value || '';
    }
    
    try {
        const pendingFiles = [...(window.uploadedFiles?.order || [])];
        if (currentOrderId) {
            updateLoadingMessage('Updating order...');
            await window.APIService.updateOrder(currentOrderId, orderData);
            if (pendingFiles.length) {
                updateLoadingMessage('Attaching order documents...');
                await window.uploadEntityAttachments('order', currentOrderId, pendingFiles);
            }
            if (document.getElementById('notes')?.value.trim()) {
                await addNoteEntry('orders', currentOrderId, 'notes');
            }
            showToast('Order updated.', 'success');
            
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
            const savedOrder = await window.APIService.createOrder(orderData);
            if (pendingFiles.length) {
                updateLoadingMessage('Attaching order documents...');
                await window.uploadEntityAttachments('order', savedOrder?._id, pendingFiles);
            }
            showToast('Order created. Payment record added.', 'success');
            
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
                    window.AppLogger?.debug('Customer refresh failed:', error);
                }
            }
            
            // Refresh payments list to show the auto-created payment
            try {
                await refreshPayments();
            } catch (error) {
                window.AppLogger?.debug('Payment refresh failed:', error);
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
            window.AppLogger?.debug('Refreshing pipeline after order save...');
            await loadDataFromDB();
        }
        
        // Refresh dashboard KPIs
        if (window.dashboard && window.dashboard.renderDashboard) {
            window.AppLogger?.debug('Refreshing dashboard after order save...');
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
    if (!confirm('Delete this order? This action cannot be undone.')) {
        return;
    }
    
    try {
        await window.APIService.deleteOrder(orderId);
        showToast('Order deleted.', 'success');
        await refreshOrders();
        if (currentDetailOrderId === orderId) {
            currentDetailOrderId = null;
            backToOrders();
        }
    } catch (error) {
        showToast('Failed to delete order: ' + error.message, 'error');
    }
}

function viewOrder(orderId, fromRecentActivity = false) {
    showOrderDetail(orderId, false, fromRecentActivity);
}

function getOrderStageDisplay(order) {
    const displayValue = getOrderVisibleStatus(order) || '-';
    const classValue = getOrderStatusBadgeClass(order);

    return {
        label: formatOrderFilterLabel(displayValue),
        className: classValue
    };
}

function renderOrderStageBadge(order) {
    const stageDisplay = getOrderStageDisplay(order);
    return `<span class="order-status-badge ${stageDisplay.className}">${stageDisplay.label}</span>`;
}

async function showOrderDetail(orderId, fromPipeline = false, fromRecentActivity = false, fromWorkflow = false) {
    try {
        const order = await window.APIService.getOrder(orderId);
        currentDetailOrderId = order._id || order.id || orderId;
        
        // If opened from pipeline, show modal instead of full page
        if (fromPipeline) {
            // Populate modal fields
            document.getElementById('modalOrderDetailTitle').textContent = `Order ${order.orderId || '#' + order._id.substring(0, 8).toUpperCase()}`;
            document.getElementById('modalDetailOrderId').textContent = order.orderId || '#' + order._id.substring(0, 8).toUpperCase();
            document.getElementById('modalDetailOrderStatus').innerHTML = renderOrderStageBadge(order);
            document.getElementById('modalDetailOrderPriority').innerHTML = `<span class="priority-badge ${order.priority || 'medium'}">${order.priority || 'medium'}</span>`;
            document.getElementById('modalDetailOrderRevenue').textContent = order.pricingStatus === 'unquoted' ? 'Unquoted' : (order.amount ? `$${order.amount.toLocaleString()}` : '-');
            document.getElementById('modalDetailOrderCost').textContent = order.vendorCost ? `$${order.vendorCost.toLocaleString()}` : '-';
            document.getElementById('modalDetailOrderProfit').textContent = order.amount && order.vendorCost ? `$${(order.amount - order.vendorCost).toLocaleString()}` : '-';
            document.getElementById('modalDetailOrderService').textContent = order.service || '-';
            document.getElementById('modalDetailOrderVendor').textContent = order.vendor?.name || '-';
            document.getElementById('modalDetailOrderStartDate').textContent = order.startDate ? formatDisplayDate(order.startDate) : '-';
            document.getElementById('modalDetailOrderScheduleDate').textContent = (order.scheduleDate || order.startDate) ? formatDisplayDate(order.scheduleDate || order.startDate) : '-';
            document.getElementById('modalDetailOrderEndDate').textContent = order.endDate ? formatDisplayDate(order.endDate) : '-';
            document.getElementById('modalDetailOrderCustomerName').textContent = order.customer?.name || '-';
            document.getElementById('modalDetailOrderCustomerEmail').textContent = order.customer?.email || '-';
            document.getElementById('modalDetailOrderCustomerPhone').textContent = order.customer?.phone || '-';
            document.getElementById('modalDetailOrderCustomerAddress').textContent = order.customer?.address || '-';
            document.getElementById('modalDetailOrderDescription').textContent = order.description || 'No description provided';
            renderNotesManager('orders', order._id, order, 'modalDetailOrderNoteComposer');
            
            // Display documents in modal
            const modalDocsList = document.getElementById('modalOrderDocumentsList');
            if (false && order.documents && order.documents.length > 0) {
                modalDocsList.innerHTML = order.documents.map(doc => `
                    <div class="document-item">
                        <div class="document-info">
                            <div class="document-icon">
                                <i class="fas fa-file-${getDocIcon(doc.name)}"></i>
                            </div>
                            <div class="document-details">
                                <div class="document-name">${doc.name}</div>
                                <div class="document-meta">${formatFileSize(doc.size)} • ${formatDisplayDate(doc.uploadedAt)}</div>
                            </div>
                        </div>
                        <div class="document-actions">
                            <button class="btn-icon" onclick="downloadDocument('${doc.url}')" title="Download" aria-label="Download document">
                                <i class="fas fa-download" aria-hidden="true"></i>
                            </button>
                            <button class="btn-icon" onclick="viewDocument('${doc.url}')" title="View" aria-label="View document">
                                <i class="fas fa-eye" aria-hidden="true"></i>
                            </button>
                        </div>
                    </div>
                `).join('');
            } else {
                modalDocsList.innerHTML = '<p class="no-documents">No documents uploaded</p>';
            }
            window.renderAttachmentList(modalDocsList, order.documents, {
                entityType: 'order', entityId: order._id,
                onChanged: () => showOrderDetail(order._id, true, false)
            });
            
            // Show modal
            document.getElementById('orderDetailModal').classList.add('show');
            document.getElementById('orderDetailModal').setAttribute('aria-hidden', 'false');
            return;
        }
        
        // Store the source for back navigation
        window.orderDetailSource = fromPipeline ? 'pipeline' : fromRecentActivity ? 'dashboard' : fromWorkflow ? 'workflow-center' : 'orders';

        // Update back button text and function
        const backButton = document.querySelector('#order-detail .btn-secondary');
        if (backButton) {
            if (fromPipeline) {
                backButton.innerHTML = '<i class="fas fa-arrow-left"></i> Back to Pipeline';
                backButton.onclick = () => showSection('pipeline');
            } else if (fromRecentActivity) {
                backButton.innerHTML = '<i class="fas fa-arrow-left"></i> Back to Dashboard';
                backButton.onclick = () => {
                    showSection('dashboard');
                    document.querySelectorAll('.menu-item').forEach((mi) => mi.classList.remove('active'));
                    const dashLink = document.querySelector('.menu-item a[data-section="dashboard"]');
                    if (dashLink && dashLink.parentElement) {
                        dashLink.parentElement.classList.add('active');
                    }
                };
            } else if (fromWorkflow) {
                backButton.innerHTML = '<i class="fas fa-arrow-left"></i> Back to Workflow Center';
                backButton.onclick = () => {
                    showSection('workflow-center');
                    loadWorkflowCenter();
                };
            } else {
                backButton.innerHTML = '<i class="fas fa-arrow-left"></i> Back to Orders';
                backButton.onclick = backToOrders;
            }
        }
        
        document.getElementById('orderDetailTitle').textContent = `Order ${order.orderId || '#' + order._id.substring(0, 8).toUpperCase()}`;
        const detailOrderId = document.getElementById('detailOrderId');
        const detailOrderRequestReference = document.getElementById('detailOrderRequestReference');
        const detailOrderSource = document.getElementById('detailOrderSource');
        const detailOrderIntakeBanner = document.getElementById('detailOrderIntakeBanner');
        const detailOrderStatus = document.getElementById('detailOrderStatus');
        const detailOrderPriority = document.getElementById('detailOrderPriority');
        const detailOrderRevenue = document.getElementById('detailOrderRevenue');
        const detailOrderCost = document.getElementById('detailOrderCost');
        const detailOrderProfit = document.getElementById('detailOrderProfit');
        const detailOrderService = document.getElementById('detailOrderService');
        const detailOrderVendor = document.getElementById('detailOrderVendor');
        const detailOrderStartDate = document.getElementById('detailOrderStartDate');
        const detailOrderScheduleDate = document.getElementById('detailOrderScheduleDate');
        const detailOrderEndDate = document.getElementById('detailOrderEndDate');
        const detailOrderCustomerName = document.getElementById('detailOrderCustomerName');
        const detailOrderCustomerEmail = document.getElementById('detailOrderCustomerEmail');
        const detailOrderCustomerPhone = document.getElementById('detailOrderCustomerPhone');
        const detailOrderCustomerAddress = document.getElementById('detailOrderCustomerAddress');
        const detailOrderDescription = document.getElementById('detailOrderDescription');
        const detailOrderNoteComposer = document.getElementById('detailOrderNoteComposer');
        
        if (detailOrderId) detailOrderId.textContent = order.orderId || '#' + order._id.substring(0, 8).toUpperCase();
        if (detailOrderRequestReference) detailOrderRequestReference.textContent = order.requestReference || '-';
        if (detailOrderSource) detailOrderSource.innerHTML = order.source === 'website' ? '<span class="order-source-badge"><i class="fas fa-globe"></i> Website</span>' : 'Manual';
        if (detailOrderIntakeBanner) {
            const missing = [];
            if (order.missingData?.serviceCategory) missing.push('service category');
            if (order.missingData?.serviceAddress) missing.push('service address');
            if (order.requiresIntakeReview) missing.push('customer match review');
            detailOrderIntakeBanner.hidden = order.source !== 'website' || !missing.length;
            detailOrderIntakeBanner.innerHTML = missing.length ? `<strong>Intake follow-up required:</strong> ${missing.map(escapePaymentHtml).join(', ')}.` : '';
        }
        if (detailOrderStatus) detailOrderStatus.innerHTML = renderOrderStageBadge(order);
        if (detailOrderPriority) detailOrderPriority.innerHTML = `<span class="priority-badge ${order.priority || 'medium'}">${order.priority || 'medium'}</span>`;
        if (detailOrderRevenue) detailOrderRevenue.textContent = order.pricingStatus === 'unquoted' ? 'Unquoted' : '$' + (order.amount?.toLocaleString() || '0');
        if (detailOrderCost) detailOrderCost.textContent = '$' + (order.vendorCost?.toLocaleString() || '0');
        if (detailOrderProfit) detailOrderProfit.textContent = '$' + (order.profit?.toLocaleString() || '0');
        if (detailOrderService) detailOrderService.textContent = order.service || '-';
        if (detailOrderVendor) detailOrderVendor.textContent = order.vendor?.name || 'N/A';
        if (detailOrderStartDate) detailOrderStartDate.textContent = order.startDate ? formatDisplayDate(order.startDate) : '-';
        if (detailOrderScheduleDate) detailOrderScheduleDate.textContent = (order.scheduleDate || order.startDate) ? formatDisplayDate(order.scheduleDate || order.startDate) : '-';
        if (detailOrderEndDate) detailOrderEndDate.textContent = order.endDate ? formatDisplayDate(order.endDate) : '-';
        
        if (detailOrderCustomerName) detailOrderCustomerName.textContent = order.customer?.name || order.customer || '-';
        if (detailOrderCustomerEmail) detailOrderCustomerEmail.textContent = order.customer?.email || '-';
        if (detailOrderCustomerPhone) detailOrderCustomerPhone.textContent = order.customer?.phone || '-';
        if (detailOrderCustomerAddress) detailOrderCustomerAddress.textContent = order.customer?.address || '-';
        
        if (detailOrderDescription) detailOrderDescription.textContent = order.description || 'No description provided';
        if (detailOrderNoteComposer) renderNotesManager('orders', order._id, order, 'detailOrderNoteComposer');
        
        // Display documents
        const docsList = document.getElementById('orderDocumentsList');
        if (docsList) {
            if (false && order.documents && order.documents.length > 0) {
                docsList.innerHTML = order.documents.map(doc => `
                    <div class="document-item">
                        <div class="document-info">
                            <div class="document-icon">
                                <i class="fas fa-file-${getDocIcon(doc.name)}"></i>
                            </div>
                            <div class="document-details">
                                <div class="document-name">${doc.name}</div>
                                <div class="document-meta">${formatFileSize(doc.size)} • ${formatDisplayDate(doc.uploadedAt)}</div>
                            </div>
                        </div>
                        <div class="document-actions">
                            <button class="btn-icon" onclick="downloadDocument('${doc.url}')" title="Download" aria-label="Download document">
                                <i class="fas fa-download" aria-hidden="true"></i>
                            </button>
                            <button class="btn-icon" onclick="viewDocument('${doc.url}')" title="View" aria-label="View document">
                                <i class="fas fa-eye" aria-hidden="true"></i>
                            </button>
                        </div>
                    </div>
                `).join('');
            } else {
                docsList.innerHTML = '<p class="no-documents">No documents uploaded</p>';
            }
            window.renderAttachmentList(docsList, order.documents, {
                entityType: 'order', entityId: order._id,
                onChanged: () => showOrderDetail(order._id, false, fromRecentActivity)
            });
        }
        
        showSection('order-detail');
    } catch (error) {
        console.error('Failed to load order details:', error);
        showToast('Failed to load order details: ' + error.message, 'error');
    }
}

function backToOrders() {
    currentDetailOrderId = null;
    if (window.orderDetailSource === 'workflow-center') {
        showSection('workflow-center');
        loadWorkflowCenter();
    } else {
        showSection('orders');
    }
}

function closeOrderDetailModal() {
    const modal = document.getElementById('orderDetailModal');
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
}

window.showOrderDetail = showOrderDetail;
window.backToOrders = backToOrders;
window.editCurrentDetailOrder = function() {
    if (currentDetailOrderId) {
        editOrder(currentDetailOrderId);
    }
};
window.deleteCurrentDetailOrder = function() {
    if (currentDetailOrderId) {
        deleteOrder(currentDetailOrderId);
    }
};
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
    
    // Clear uploaded files
    if (window.uploadedFiles) {
        window.uploadedFiles.order = [];
        const preview = document.getElementById('orderDocsPreview');
        if (preview) preview.innerHTML = '';
    }
    window.existingOrderDocs = [];
}

async function refreshOrders() {
    try {
        if (window.ordersRefreshing) return; // Prevent duplicate calls
        window.ordersRefreshing = true;
        
        // Show table loading state
        const tableContainer = document.querySelector('.orders-table-container');
        if (tableContainer) setTableLoading(tableContainer, true);
        
        allOrders = await window.APIService.getOrders();
        updateOrderStatusFilterOptions(allOrders);
        filterOrdersImmediate();
        
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

function setSettingsState(message = 'Ready', tone = '') {
    const target = document.getElementById('settingsSaveState');
    if (!target) return;
    const dot = document.createElement('span');
    dot.setAttribute('aria-hidden', 'true');
    target.replaceChildren(dot, document.createTextNode(String(message)));
    target.dataset.tone = tone;
}

function setSettingsBusy(isBusy) {
    const container = document.querySelector('#settings .settings-container');
    const saveButton = document.getElementById('settingsSaveButton');
    const resetButton = document.getElementById('settingsResetButton');
    container?.setAttribute('aria-busy', String(isBusy));
    if (saveButton) saveButton.disabled = isBusy;
    if (resetButton) resetButton.disabled = isBusy;
}

function syncRefreshIntervalControl() {
    const autoRefresh = document.getElementById('dashboardAutoRefresh');
    const interval = document.getElementById('dashboardRefreshInterval');
    if (!autoRefresh || !interval) return;
    interval.disabled = !autoRefresh.checked;
    interval.setAttribute('aria-disabled', String(!autoRefresh.checked));
}

async function loadSettings() {
    setSettingsBusy(true);
    setSettingsState('Loading…');
    try {
        currentSettings = await window.APIService.getSettings();
        populateSettingsForm(currentSettings);
        setSettingsState('All changes saved', 'success');
    } catch (error) {
        console.error('Failed to load settings:', error);
        // Create default settings object
        currentSettings = {
            theme: 'light',
            language: 'en',
            timezone: 'America/Phoenix',
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
        setSettingsState('Could not load saved settings', 'error');
        showToast('Saved settings could not be loaded. Review the defaults before saving.', 'error');
    } finally {
        setSettingsBusy(false);
    }
}

function populateSettingsForm(settings) {
    // User Preferences
    document.getElementById('settingsTheme').value = settings.theme || 'light';
    document.getElementById('settingsLanguage').value = settings.language || 'en';
    document.getElementById('settingsTimezone').value = settings.timezone || 'America/Phoenix';
    
    // Notifications
    document.getElementById('notificationsEmail').checked = settings.notifications?.email ?? true;
    document.getElementById('notificationsPush').checked = settings.notifications?.push ?? true;
    document.getElementById('notificationsSms').checked = settings.notifications?.sms ?? false;
    
    // Dashboard
    document.getElementById('dashboardItemsPerPage').value = settings.dashboard?.itemsPerPage || 10;
    document.getElementById('dashboardDefaultView').value = settings.dashboard?.defaultView || 'table';
    document.getElementById('dashboardAutoRefresh').checked = settings.dashboard?.autoRefresh ?? true;
    document.getElementById('dashboardRefreshInterval').value = settings.dashboard?.refreshInterval || 30;
    syncRefreshIntervalControl();
    
    // Company
    document.getElementById('companyName').value = settings.company?.name || '';
    document.getElementById('companyAddress').value = settings.company?.address || '';
    document.getElementById('companyPhone').value = settings.company?.phone || '';
    document.getElementById('companyEmail').value = settings.company?.email || '';
    document.getElementById('companyWebsite').value = settings.company?.website || '';
    
    // Apply theme
    applyTheme(settings.theme || 'light');
}

async function saveSettings(event) {
    event?.preventDefault();
    const form = document.getElementById('settingsForm');
    if (!form?.reportValidity()) return;
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
            name: document.getElementById('companyName').value.trim(),
            address: document.getElementById('companyAddress').value.trim(),
            phone: document.getElementById('companyPhone').value.trim(),
            email: document.getElementById('companyEmail').value.trim().toLowerCase(),
            website: document.getElementById('companyWebsite').value.trim()
        }
    };

    setSettingsBusy(true);
    setSettingsState('Saving…');
    try {
        currentSettings = await window.APIService.updateSettings(settingsData);
        
        // Apply theme immediately
        applyTheme(settingsData.theme);
        setSettingsState('All changes saved', 'success');
        showToast('Settings saved successfully.', 'success');
    } catch (error) {
        setSettingsState('Settings were not saved', 'error');
        showToast('Failed to save settings: ' + error.message, 'error');
    } finally {
        setSettingsBusy(false);
    }
}

async function resetSettings() {
    if (!confirm('Reset all settings to defaults? This action cannot be undone.')) {
        return;
    }
    
    setSettingsBusy(true);
    setSettingsState('Restoring defaults…');
    try {
        const defaultSettings = await window.APIService.resetSettings();
        currentSettings = defaultSettings;
        populateSettingsForm(defaultSettings);
        setSettingsState('Defaults restored', 'success');
        showToast('Settings reset to defaults.', 'success');
    } catch (error) {
        setSettingsState('Defaults could not be restored', 'error');
        showToast('Failed to reset settings: ' + error.message, 'error');
    } finally {
        setSettingsBusy(false);
    }
}

function applyTheme(theme) {
    document.body.classList.toggle('dark-theme', theme === 'dark');
    
    // Store theme preference in localStorage for immediate application
    localStorage.setItem('theme', theme);
}

// Load settings when settings section is shown
function loadSettingsSection() {
    const autoRefresh = document.getElementById('dashboardAutoRefresh');
    if (autoRefresh && autoRefresh.dataset.settingsBound !== 'true') {
        autoRefresh.dataset.settingsBound = 'true';
        autoRefresh.addEventListener('change', syncRefreshIntervalControl);
    }
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
let reportsInitialized = false;
let reportsSourceData = null;
let reportsActiveTab = 'overview';
let reportsAppliedFilters = {};
let reportsLoading = false;
let reportsRuntimeWarning = '';
let reportRecordsState = { rows: [], page: 1, pageSize: 25, total: 0, pages: 1, sort: 'date', direction: 'desc', error: '' };
const reportColors = ['#0B0B0C', '#363638', '#555559', '#707074', '#858589', '#9A9A9E', '#B6B6BA'];
const reportTabs = new Set(['overview', 'financial', 'operations', 'relationships', 'pipeline', 'details']);
const reportFilterLabels = {
    customerId: 'Customer', employeeId: 'Assigned employee', vendorId: 'Vendor', service: 'Service', orderStatus: 'Order status',
    paymentStatus: 'Payment status', pipelineStageId: 'Pipeline stage', city: 'City', state: 'State', zip: 'ZIP'
};
const reportFilterElementIds = {
    customerId: 'reportCustomerFilter', employeeId: 'reportEmployeeFilter', vendorId: 'reportVendorFilter', service: 'reportServiceFilter', orderStatus: 'reportOrderStatusFilter',
    paymentStatus: 'reportPaymentStatusFilter', pipelineStageId: 'reportPipelineStageFilter', city: 'reportCityFilter', state: 'reportStateFilter', zip: 'reportZipFilter'
};

function formatReportMoney(value) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);
}

function formatReportValue(value, format) {
    if (format === 'currency') return formatReportMoney(value);
    if (format === 'percent') return `${Number(value || 0).toFixed(1).replace('.0', '')}%`;
    return Number(value || 0).toLocaleString();
}

function escapeReportHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function encodeReportValue(value) {
    return encodeURIComponent(String(value ?? '')).replace(/'/g, '%27');
}

function getReportFilters() {
    return {
        startDate: document.getElementById('reportStartDate')?.value,
        endDate: document.getElementById('reportEndDate')?.value,
        customerId: document.getElementById('reportCustomerFilter')?.value,
        employeeId: document.getElementById('reportEmployeeFilter')?.value,
        vendorId: document.getElementById('reportVendorFilter')?.value,
        service: document.getElementById('reportServiceFilter')?.value,
        orderStatus: document.getElementById('reportOrderStatusFilter')?.value,
        paymentStatus: document.getElementById('reportPaymentStatusFilter')?.value,
        pipelineStageId: document.getElementById('reportPipelineStageFilter')?.value,
        city: document.getElementById('reportCityFilter')?.value,
        state: document.getElementById('reportStateFilter')?.value,
        zip: document.getElementById('reportZipFilter')?.value
    };
}

function reportFilterDifferences() {
    const draft = getReportFilters();
    return Object.keys(draft).filter(key => String(draft[key] || '') !== String(reportsAppliedFilters[key] || ''));
}

function selectedReportFilterLabel(key, value) {
    const select = document.getElementById(reportFilterElementIds[key]);
    return Array.from(select?.options || []).find(option => option.value === String(value))?.textContent?.trim() || value;
}

function markReportFiltersDirty() {
    const differences = reportFilterDifferences();
    const dirty = differences.length > 0 && Boolean(Object.keys(reportsAppliedFilters).length);
    const notice = document.getElementById('reportFilterDirty');
    const count = document.getElementById('reportDirtyCount');
    const exportButton = document.getElementById('reportExportButton');
    if (notice) notice.hidden = !dirty;
    if (count) {
        count.hidden = !dirty;
        count.textContent = String(differences.length);
    }
    if (exportButton) {
        exportButton.disabled = dirty || !reportsSourceData || reportsLoading;
        exportButton.title = dirty ? 'Apply filter changes before exporting' : '';
    }
    const advancedKeys = ['vendorId', 'orderStatus', 'paymentStatus', 'pipelineStageId', 'city', 'state', 'zip'];
    const advancedCount = advancedKeys.filter(key => getReportFilters()[key]).length;
    const badge = document.getElementById('reportAdvancedCount');
    if (badge) {
        badge.hidden = !advancedCount;
        badge.textContent = String(advancedCount);
    }
}

function renderAppliedFilterChips() {
    const container = document.getElementById('reportActiveFilters');
    if (!container) return;
    const entries = Object.entries(reportsAppliedFilters).filter(([key, value]) => value && reportFilterLabels[key]);
    container.innerHTML = entries.length
        ? `<span class="report-active-label">Applied:</span>${entries.map(([key, value]) => `<button type="button" onclick="clearReportFilter('${key}')"><span>${escapeReportHtml(reportFilterLabels[key])}: ${escapeReportHtml(selectedReportFilterLabel(key, value))}</span><i class="fas fa-xmark" aria-hidden="true"></i><span class="visually-hidden">Remove ${escapeReportHtml(reportFilterLabels[key])} filter</span></button>`).join('')}`
        : '';
}

function clearReportFilter(key) {
    const element = document.getElementById(reportFilterElementIds[key]);
    if (!element) return;
    element.value = '';
    applyReportFilters();
}

function setReportLoadingControls(loading) {
    const applyButton = document.getElementById('reportApplyButton');
    const refreshButton = document.getElementById('reportRefreshButton');
    const exportButton = document.getElementById('reportExportButton');
    if (applyButton) {
        applyButton.disabled = loading;
        applyButton.classList.toggle('is-loading', loading);
    }
    if (refreshButton) {
        refreshButton.disabled = loading;
        refreshButton.classList.toggle('is-loading', loading);
    }
    if (exportButton) exportButton.disabled = loading || reportFilterDifferences().length > 0 || !reportsSourceData;
    document.getElementById('reports')?.setAttribute('aria-busy', loading ? 'true' : 'false');
}

function showReportsSkeleton(show) {
    const skeleton = document.getElementById('reportsSkeleton');
    if (!skeleton) return;
    skeleton.innerHTML = show ? Array.from({ length: 8 }, () => '<div class="skeleton-block"></div>').join('') : '';
    skeleton.classList.toggle('active', show);
}

function setReportsStatus(type, title, message, retry = false) {
    const status = document.getElementById('reportsStatus');
    const dashboard = document.getElementById('reportsDashboard');
    if (!status || !dashboard) return;
    const icon = type === 'error' ? 'fa-triangle-exclamation' : type === 'empty' ? 'fa-inbox' : 'fa-chart-line';
    status.className = `reports-status ${type || ''}`;
    status.innerHTML = `<i class="fas ${icon}"></i><div><strong>${escapeReportHtml(title)}</strong><span>${escapeReportHtml(message)}</span>${retry ? '<button type="button" class="btn-secondary" onclick="refreshReports()">Retry</button>' : ''}</div>`;
    status.hidden = false;
    dashboard.hidden = true;
}

function validateReportsPayload(payload) {
    const valid = payload && typeof payload === 'object' && payload.meta && payload.summary && payload.charts && payload.tables && payload.filterOptions && payload.dataQuality;
    if (!valid) throw new Error('The reports service returned an incomplete response.');
    return payload;
}

async function generateReports(filters = reportsAppliedFilters) {
    if (reportsLoading) return;
    if (!filters.startDate || !filters.endDate || filters.startDate > filters.endDate) {
        setReportsStatus('error', 'Choose a valid date range', 'Start date must be on or before end date.');
        return;
    }
    const previousData = reportsSourceData;
    const previousFilters = { ...reportsAppliedFilters };
    reportsLoading = true;
    reportsAppliedFilters = { ...filters };
    reportsRuntimeWarning = '';
    setReportLoadingControls(true);
    showReportsSkeleton(true);
    setReportsStatus('loading', 'Loading reports…', 'Calculating live performance from your CRM data.');
    try {
        const [analyticsResult, recordsResult] = await Promise.allSettled([
            window.APIService.getAnalyticsReport(reportsAppliedFilters),
            window.APIService.getReportRecords({ ...reportsAppliedFilters, page: reportRecordsState.page, pageSize: reportRecordsState.pageSize, sort: reportRecordsState.sort, direction: reportRecordsState.direction })
        ]);
        if (analyticsResult.status === 'rejected') throw analyticsResult.reason;
        reportsSourceData = validateReportsPayload(analyticsResult.value);
        if (recordsResult.status === 'fulfilled') {
            reportRecordsState = { ...reportRecordsState, ...recordsResult.value.pagination, rows: recordsResult.value.rows || [], error: '' };
        } else {
            reportRecordsState = { ...reportRecordsState, rows: [], error: 'Detailed records could not be loaded.' };
        }
        populateReportFilters();
        renderAppliedFilterChips();
        renderReportsMeta();
        const status = document.getElementById('reportsStatus');
        const dashboard = document.getElementById('reportsDashboard');
        if (status) status.hidden = true;
        if (dashboard) dashboard.hidden = false;
        renderReportTabContent();
    } catch (error) {
        console.error('Failed to load live analytics report:', error);
        if (previousData) {
            reportsSourceData = previousData;
            reportsAppliedFilters = previousFilters;
            reportsRuntimeWarning = `Refresh failed. Showing the last successfully loaded report. ${error?.message || ''}`.trim();
            const status = document.getElementById('reportsStatus');
            const dashboard = document.getElementById('reportsDashboard');
            if (status) status.hidden = true;
            if (dashboard) dashboard.hidden = false;
            renderReportsMeta();
            renderReportTabContent();
        } else {
            reportsSourceData = null;
            setReportsStatus('error', 'Reports could not be loaded', error?.message || 'The service is unavailable. Check your connection and try again.', true);
        }
    } finally {
        reportsLoading = false;
        setReportLoadingControls(false);
        markReportFiltersDirty();
        showReportsSkeleton(false);
    }
}

function renderReportsDashboard() {
    if (!reportsSourceData) return;
    renderReportsMeta();
    renderReportTabContent();
}

function reportCard(title, subtitle, body, className = '') {
    return `
        <section class="analytics-card ${className} report-searchable" data-report-text="${title} ${subtitle}">
            <div class="analytics-card-header">
                <div class="report-title-group">
                    <span class="report-card-icon"><i class="fas ${getReportIcon(title)}"></i></span>
                    <div>
                    <h3>${escapeReportHtml(title)}</h3>
                    <p>${escapeReportHtml(subtitle)}</p>
                    </div>
                </div>
            </div>
            ${body || reportEmptyState('No report data available')}
        </section>
    `;
}

function getReportIcon(title) {
    if (/revenue|average job|recurring/i.test(title)) return 'fa-chart-line';
    if (/work order|approval/i.test(title)) return 'fa-clipboard-list';
    if (/lead|quote/i.test(title)) return 'fa-bullseye';
    if (/recurring/i.test(title)) return 'fa-calendar-check';
    if (/pay/i.test(title)) return 'fa-clock';
    if (/customer|client/i.test(title)) return 'fa-users';
    return 'fa-chart-simple';
}

function reportEmptyState(message) {
    return `<div class="empty-state"><div><i class="fas fa-chart-simple"></i><p>${escapeReportHtml(message)}</p></div></div>`;
}

function renderRevenueProfitChart(series) {
    if (!series?.length) return reportEmptyState('No revenue or profit data matches these filters.');
    const width = 680;
    const height = 190;
    const plot = { left: 58, right: 668, top: 10, bottom: 158 };
    const values = series.flatMap(item => [Number(item.revenue || 0), Number(item.profit || 0)]);
    const rawMin = Math.min(0, ...values);
    const rawMax = Math.max(0, ...values);
    const padding = Math.max((rawMax - rawMin) * .08, 1);
    const min = rawMin < 0 ? rawMin - padding : 0;
    const max = rawMax + padding;
    const range = Math.max(max - min, 1);
    const yFor = value => plot.bottom - ((Number(value || 0) - min) / range) * (plot.bottom - plot.top);
    const pointsFor = key => series.map((item, index) => {
        const x = series.length === 1 ? (plot.left + plot.right) / 2 : plot.left + (index / (series.length - 1)) * (plot.right - plot.left);
        const y = yFor(item[key]);
        return { ...item, x, y };
    });
    const revenue = pointsFor('revenue');
    const profit = pointsFor('profit');
    const ticks = Array.from({ length: 5 }, (_, index) => {
        const value = max - (index / 4) * range;
        return { value, y: yFor(value) };
    });
    const labelStep = Math.max(1, Math.ceil(series.length / 6));
    const compact = value => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
    return `
        <div class="report-chart-legend"><span><i style="background:#0B0B0C"></i>Revenue</span><span><i style="background:#9A9A9E"></i>Profit</span></div>
        <div class="line-chart">
            <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Revenue and profit trend. Revenue ranges from ${formatReportMoney(Math.min(...revenue.map(point => point.revenue)))} to ${formatReportMoney(Math.max(...revenue.map(point => point.revenue)))}.">
                ${ticks.map(tick => `<line class="chart-grid-line" x1="${plot.left}" x2="${plot.right}" y1="${tick.y}" y2="${tick.y}"></line><text class="report-chart-tick" x="${plot.left - 8}" y="${tick.y + 4}" text-anchor="end">${escapeReportHtml(compact(tick.value))}</text>`).join('')}
                ${min < 0 ? `<line class="report-zero-line" x1="${plot.left}" x2="${plot.right}" y1="${yFor(0)}" y2="${yFor(0)}"></line>` : ''}
                <polyline class="chart-line" points="${revenue.map(point => `${point.x},${point.y}`).join(' ')}"></polyline>
                <polyline class="chart-line report-profit-line" points="${profit.map(point => `${point.x},${point.y}`).join(' ')}"></polyline>
                ${revenue.map(point => `<circle class="chart-point" cx="${point.x}" cy="${point.y}" r="4" tabindex="0" aria-label="${escapeReportHtml(point.label)} revenue ${formatReportMoney(point.revenue)}"><title>${escapeReportHtml(point.label)} revenue: ${formatReportMoney(point.revenue)}</title></circle>`).join('')}
                ${profit.map(point => `<circle class="chart-point report-profit-point" cx="${point.x}" cy="${point.y}" r="4" tabindex="0" aria-label="${escapeReportHtml(point.label)} profit ${formatReportMoney(point.profit)}"><title>${escapeReportHtml(point.label)} profit: ${formatReportMoney(point.profit)}</title></circle>`).join('')}
            </svg>
        </div>
        <div class="chart-axis-labels">${series.filter((_item, index) => index % labelStep === 0 || index === series.length - 1).map(item => `<span>${escapeReportHtml(item.label)}</span>`).join('')}</div>
        <table class="visually-hidden"><caption>Revenue and profit trend data</caption><thead><tr><th>Period</th><th>Revenue</th><th>Profit</th></tr></thead><tbody>${series.map(item => `<tr><td>${escapeReportHtml(item.label)}</td><td>${formatReportMoney(item.revenue)}</td><td>${formatReportMoney(item.profit)}</td></tr>`).join('')}</tbody></table>
    `;
}

function renderReportBars(items, options = {}) {
    if (!items?.length) return reportEmptyState(options.empty || 'No data matches the current filters.');
    const max = Math.max(...items.map(item => item.value), 1);
    return `<div class="horizontal-bars">${items.slice(0, options.limit || 10).map((item, index) => `
        <button type="button" class="bar-row report-bar-button" onclick="${options.drilldown ? `drilldownReports('${options.drilldown}','${encodeReportValue(item.label)}')` : ''}">
            <span>${escapeReportHtml(item.label)}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${(item.value / max) * 100}%; background:${reportColors[index % reportColors.length]}"></div></div>
            <strong>${options.currency ? formatReportMoney(item.value) : Number(item.value || 0).toLocaleString()}</strong>
        </button>
    `).join('')}</div>`;
}

function renderReportTable(headers, rows, options = {}) {
    if (!rows?.length) return reportEmptyState(options.empty || 'No rows match the current filters.');
    return `
        <div class="report-table-scroll-hint"><i class="fas fa-arrows-left-right"></i> Scroll horizontally to see all columns</div>
        <div class="report-table-wrap">
            <table class="report-table">
                <thead><tr>${headers.map(header => {
                    const activeSort = options.sortable && reportRecordsState.sort === header.key;
                    const ariaSort = activeSort ? (reportRecordsState.direction === 'asc' ? 'ascending' : 'descending') : 'none';
                    const icon = activeSort ? (reportRecordsState.direction === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort';
                    return `<th${options.sortable ? ` aria-sort="${ariaSort}"` : ''}>${options.sortable ? `<button type="button" class="report-sort-button" onclick="sortReportRecords('${header.key}')">${escapeReportHtml(header.label)} <i class="fas ${icon}" aria-hidden="true"></i></button>` : escapeReportHtml(header.label)}</th>`;
                }).join('')}</tr></thead>
                <tbody>
                    ${rows.map(row => {
                        const action = options.rowAction?.(row);
                        const interactive = action ? ` class="report-clickable-row" role="link" tabindex="0" aria-label="View ${escapeReportHtml(row.order || row.invoice || row.customer || row.employee || row.vendor || 'report record')}" onclick="${action}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}"` : '';
                        return `<tr${interactive}>${headers.map(header => `<td>${formatReportCell(row[header.key], header)}</td>`).join('')}</tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function formatReportCell(value, header) {
    if (header.format === 'currency') return formatReportMoney(value);
    if (header.format === 'percent') return formatReportValue(value, 'percent');
    if (header.format === 'date') return value ? formatDisplayDate(value) : '—';
    if (header.badge) return `<span class="health-pill ${escapeReportHtml(String(value).toLowerCase().replace(/\s+/g, '-'))}">${escapeReportHtml(value || 'unknown')}</span>`;
    return escapeReportHtml(value ?? '—');
}

function renderReportKpis(summary, definitions = {}) {
    const cards = [
        ['Revenue', summary.revenue, 'currency', 'fa-dollar-sign', 'financial', 'revenue'],
        ['Collected Payments', summary.collectedPayments, 'currency', 'fa-circle-check', 'financial', 'collectedPayments'],
        ['Gross Profit', summary.grossProfit, 'currency', 'fa-chart-line', 'financial', 'grossProfit'],
        ['Profit Margin', summary.profitMargin, 'percent', 'fa-percent', 'financial', 'profitMargin'],
        ['Total Orders', summary.totalOrders, 'number', 'fa-clipboard-list', 'details', 'totalOrders'],
        ['Completed Orders', summary.completedOrders, 'number', 'fa-check-double', 'completed', 'completedOrders'],
        ['Outstanding Balance', summary.outstandingBalance, 'currency', 'fa-file-invoice-dollar', 'financial', 'outstandingBalance'],
        ['Average Order Value', summary.averageOrderValue, 'currency', 'fa-receipt', 'details', 'averageOrderValue']
    ];
    return `<div class="report-kpi-grid">${cards.map(([label, value, format, icon, target, definitionKey]) => `
        <button type="button" class="report-kpi-card" onclick="drilldownReports('summary','${target}')" title="${escapeReportHtml(definitions[definitionKey] || '')}" aria-label="${escapeReportHtml(label)} ${escapeReportHtml(formatReportValue(value, format))}. ${escapeReportHtml(definitions[definitionKey] || 'Open underlying report.')}">
            <span class="report-kpi-icon"><i class="fas ${icon}"></i></span>
            <span>${label}</span><strong>${formatReportValue(value, format)}</strong>
            <small><i class="fas fa-circle-info" aria-hidden="true"></i> View definition and records <i class="fas fa-arrow-right" aria-hidden="true"></i></small>
        </button>`).join('')}</div>`;
}

function renderReportTabContent() {
    const content = document.getElementById('reportsTabContent');
    if (!content || !reportsSourceData) return;
    const data = reportsSourceData;
    const table = (title, subtitle, headers, rows, options = {}) => reportCard(title, subtitle, renderReportTable(headers, rows, options), options.className || 'wide');
    const paymentHeaders = [{ key: 'date', label: 'Date', format: 'date' }, { key: 'invoice', label: 'Invoice / Milestone' }, { key: 'customer', label: 'Customer' }, { key: 'order', label: 'Order' }, { key: 'status', label: 'Status', badge: true }, { key: 'amount', label: 'Amount', format: 'currency' }];
    const sections = {
        overview: () => `${renderReportKpis(data.summary, data.meta.definitions)}<div class="report-dashboard-grid reports-clean-grid">
            ${reportCard('Revenue and Profit Trend', 'Order-created-date revenue and calculated gross profit', renderRevenueProfitChart(data.charts.revenueProfitTrend), 'wide')}
            ${reportCard('Orders by Status', 'Active qualifying orders', renderReportBars(data.charts.ordersByStatus, { drilldown: 'order-status' }))}
            ${reportCard('Revenue by Service', 'Click a service to inspect its work orders', renderReportBars(data.charts.revenueByService, { currency: true, drilldown: 'service' }))}
            ${reportCard('Payment Collection Status', 'Payment and milestone value by status', renderReportBars(data.charts.paymentStatus, { currency: true, drilldown: 'payment-status' }))}
        </div>`,
        financial: () => `<div class="report-tab-summary"><strong>${formatReportMoney(data.summary.revenue)}</strong><span>active-order revenue</span><strong>${formatReportMoney(data.summary.collectedPayments)}</strong><span>cash collected by received date</span><strong>${formatReportMoney(data.summary.outstandingBalance)}</strong><span>outstanding balance</span></div><div class="report-dashboard-grid reports-clean-grid">
            ${reportCard('Revenue and Profit Trend', 'Revenue uses active orders created in this period', renderRevenueProfitChart(data.charts.revenueProfitTrend), 'wide')}
            ${reportCard('Payment Collection Status', 'Click a status to inspect matching payment and milestone records', renderReportBars(data.charts.paymentStatus, { currency: true, drilldown: 'payment-status' }))}
            ${table('Top Services', 'Revenue, profit, and order count', [{ key: 'label', label: 'Service' }, { key: 'orders', label: 'Orders' }, { key: 'value', label: 'Revenue', format: 'currency' }, { key: 'profit', label: 'Profit', format: 'currency' }], data.tables.topServices, { rowAction: row => `drilldownReports('service','${encodeReportValue(row.label)}')` })}
            ${table('Payment Records', 'Received, completed, pending, failed, and cancelled payment entries', paymentHeaders, data.tables.paymentRecords, { rowAction: row => `showPaymentDetail('${row.paymentId}')` })}
            ${table('Outstanding Invoices', 'Click a row to open payment details', [{ key: 'invoice', label: 'Invoice' }, { key: 'customer', label: 'Customer' }, { key: 'order', label: 'Order' }, { key: 'dueDate', label: 'Due Date', format: 'date' }, { key: 'amount', label: 'Amount', format: 'currency' }, { key: 'status', label: 'Status', badge: true }], data.tables.outstandingInvoices, { rowAction: row => `showPaymentDetail('${row.paymentId}')` })}
        </div>`,
        operations: () => `<div class="report-tab-summary"><strong>${data.summary.totalOrders.toLocaleString()}</strong><span>qualifying active orders</span><strong>${formatReportValue(data.summary.completionRate, 'percent')}</strong><span>completion rate</span></div><div class="report-dashboard-grid reports-clean-grid">${reportCard('Orders by Status', 'Cancelled and lost/no-bid work is excluded from headline reporting', renderReportBars(data.charts.ordersByStatus, { drilldown: 'order-status' }), 'wide')}${table('Recurring Service Performance', 'Recurring service orders grouped by service type', [{ key: 'service', label: 'Service' }, { key: 'orders', label: 'Recurring Orders' }, { key: 'revenue', label: 'Revenue', format: 'currency' }, { key: 'profit', label: 'Profit', format: 'currency' }], data.tables.recurringServices, { rowAction: row => `drilldownReports('service','${encodeReportValue(row.service)}')` })}</div>${renderDetailedRecords()}`,
        relationships: () => `<div class="report-dashboard-grid reports-clean-grid">${table('Top Customers', 'Click a linked customer to inspect qualifying orders', [{ key: 'customer', label: 'Customer' }, { key: 'orders', label: 'Orders' }, { key: 'revenue', label: 'Revenue', format: 'currency' }, { key: 'profit', label: 'Profit', format: 'currency' }], data.tables.topCustomers, { rowAction: row => row.customerId ? `drilldownReports('customer','${encodeReportValue(row.customerId)}')` : '' })}${table('Assigned Employee Performance', 'Click an assigned employee to inspect their work', [{ key: 'employee', label: 'Assigned Employee' }, { key: 'orders', label: 'Orders' }, { key: 'completed', label: 'Completed' }, { key: 'revenue', label: 'Revenue', format: 'currency' }, { key: 'profit', label: 'Profit', format: 'currency' }], data.tables.employeePerformance, { rowAction: row => row.employeeId ? `drilldownReports('employee','${encodeReportValue(row.employeeId)}')` : '' })}${table('Vendor Performance', 'Click an assigned vendor to inspect related report records', [{ key: 'vendor', label: 'Vendor' }, { key: 'orders', label: 'Orders' }, { key: 'revenue', label: 'Revenue', format: 'currency' }, { key: 'cost', label: 'Vendor Cost', format: 'currency' }, { key: 'profit', label: 'Profit', format: 'currency' }], data.tables.vendorPerformance, { rowAction: row => row.vendorId ? `drilldownReports('vendor','${encodeReportValue(row.vendorId)}')` : '' })}</div>`,
        pipeline: () => `<div class="report-tab-summary"><strong>${formatReportValue(data.summary.pipelineConversion, 'percent')}</strong><span>pipeline conversion</span></div>${table('Pipeline by Stage', 'Click a stage to inspect matching report records', [{ key: 'stage', label: 'Stage' }, { key: 'records', label: 'Records' }, { key: 'value', label: 'Pipeline Value', format: 'currency' }], data.tables.pipelineStages, { rowAction: row => `drilldownReports('pipeline-stage','${encodeReportValue(row.stageId)}')` })}`,
        details: () => renderDetailedRecords()
    };
    const activeHasData = reportsActiveTab === 'pipeline' ? data.tables.pipelineStages.length > 0 : data.summary.totalOrders > 0;
    const emptyNotice = !activeHasData
        ? '<div class="reports-empty-inline"><i class="fas fa-inbox"></i><div><strong>No records match these filters.</strong><span>Try a broader date range or reset one or more filters.</span></div></div>'
        : '';
    content.innerHTML = emptyNotice + (sections[reportsActiveTab] || sections.overview)();
}

function populateReportFilters() {
    const options = reportsSourceData?.filterOptions || {};
    const filterValues = {
        reportCustomerFilter: options.customers || [],
        reportEmployeeFilter: options.employees || [],
        reportVendorFilter: options.vendors || [],
        reportServiceFilter: options.services || [],
        reportOrderStatusFilter: options.orderStatuses || [],
        reportPaymentStatusFilter: options.paymentStatuses || [],
        reportPipelineStageFilter: options.pipelineStages || [],
        reportCityFilter: options.cities || [],
        reportStateFilter: options.states || [],
        reportZipFilter: options.zips || []
    };
    Object.entries(filterValues).forEach(([id, values]) => {
        const select = document.getElementById(id);
        if (!select) return;
        const currentValue = select.value;
        const firstOption = select.querySelector('option')?.outerHTML || '<option value="">All</option>';
        select.innerHTML = firstOption + values.map(value => {
            const option = typeof value === 'object' ? value : { id: value, label: value };
            return `<option value="${escapeReportHtml(option.id)}">${escapeReportHtml(option.label)}</option>`;
        }).join('');
        if (Array.from(select.options).some(option => option.value === currentValue)) select.value = currentValue;
    });
}

function renderReportsMeta() {
    if (!reportsSourceData) return;
    const updated = document.getElementById('reportUpdatedAt');
    const range = document.getElementById('reportAppliedRange');
    const quality = document.getElementById('reportDataQuality');
    if (updated) updated.textContent = `Updated ${new Date(reportsSourceData.meta.generatedAt).toLocaleString('en-US', { timeZone: reportsSourceData.meta.timezone })} MST`;
    if (range) range.textContent = `${formatDisplayDate(reportsSourceData.meta.period.start)} – ${formatDisplayDate(reportsSourceData.meta.period.end)}`;
    if (quality) {
        const warnings = [...(reportsSourceData.dataQuality?.warnings || []), ...(reportRecordsState.error ? [reportRecordsState.error] : []), ...(reportsRuntimeWarning ? [reportsRuntimeWarning] : [])];
        quality.hidden = !warnings.length;
        quality.innerHTML = warnings.length ? `<i class="fas fa-triangle-exclamation"></i><div><strong>Data quality notice</strong>${warnings.map(warning => `<span>${escapeReportHtml(warning)}</span>`).join('')}</div>` : '';
    }
    renderReportDefinitions();
}

function renderReportDefinitions() {
    const panel = document.getElementById('reportDefinitionsPanel');
    if (!panel || !reportsSourceData) return;
    const labels = {
        revenue: 'Revenue', collectedPayments: 'Collected payments', grossProfit: 'Gross profit',
        outstandingBalance: 'Outstanding balance', averageOrderValue: 'Average order value', recurringServices: 'Recurring services'
    };
    panel.innerHTML = `<div class="report-definitions-header"><div><span>Data trust</span><h2>How calculations work</h2></div><button type="button" onclick="toggleReportDefinitions(false)" aria-label="Close calculation definitions"><i class="fas fa-xmark"></i></button></div><div class="report-definition-grid">${Object.entries(reportsSourceData.meta.definitions || {}).map(([key, definition]) => `<article><strong>${escapeReportHtml(labels[key] || key)}</strong><p>${escapeReportHtml(definition)}</p></article>`).join('')}</div><div class="report-date-basis"><i class="fas fa-calendar-check"></i><div><strong>Date basis</strong><span>Order and revenue metrics use order creation date. Collected payments use payment or milestone received date. Pipeline metrics use pipeline creation date.</span></div></div>`;
}

function toggleReportDefinitions(force) {
    const panel = document.getElementById('reportDefinitionsPanel');
    const button = document.getElementById('reportDefinitionsButton');
    if (!panel || !button) return;
    const open = typeof force === 'boolean' ? force : panel.hidden;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) panel.querySelector('button')?.focus();
    else button.focus();
}

function renderDetailedRecords() {
    const headers = [
        { key: 'date', label: 'Date', format: 'date' }, { key: 'order', label: 'Order' }, { key: 'customer', label: 'Customer' },
        { key: 'service', label: 'Service' }, { key: 'employee', label: 'Assigned Employee' }, { key: 'vendor', label: 'Vendor' },
        { key: 'status', label: 'Order Status', badge: true }, { key: 'revenue', label: 'Revenue', format: 'currency' },
        { key: 'cost', label: 'Cost', format: 'currency' }, { key: 'profit', label: 'Profit', format: 'currency' }, { key: 'paymentStatus', label: 'Payment Status' }
    ];
    const body = reportRecordsState.error
        ? reportEmptyState(reportRecordsState.error)
        : renderReportTable(headers, reportRecordsState.rows, { sortable: true, rowAction: row => `showOrderDetail('${row.id}', false, false)` });
    const first = reportRecordsState.total ? ((reportRecordsState.page - 1) * reportRecordsState.pageSize) + 1 : 0;
    const last = Math.min(reportRecordsState.total, reportRecordsState.page * reportRecordsState.pageSize);
    return reportCard('Detailed Records', `${reportRecordsState.total.toLocaleString()} matching work orders`, `${body}<div class="report-pagination"><label>Rows <select onchange="changeReportPageSize(this.value)" aria-label="Rows per page">${[10, 25, 50, 100].map(size => `<option value="${size}" ${size === reportRecordsState.pageSize ? 'selected' : ''}>${size}</option>`).join('')}</select></label><span>${first.toLocaleString()}–${last.toLocaleString()} of ${reportRecordsState.total.toLocaleString()}</span><button type="button" class="btn-secondary" onclick="changeReportRecordsPage(-1)" ${reportRecordsState.page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${reportRecordsState.page} of ${reportRecordsState.pages}</span><button type="button" class="btn-secondary" onclick="changeReportRecordsPage(1)" ${reportRecordsState.page >= reportRecordsState.pages ? 'disabled' : ''}>Next</button></div>`, 'full');
}

function setReportTab(tab, focusTab = false) {
    if (!reportTabs.has(tab)) return;
    reportsActiveTab = tab;
    document.querySelectorAll('#reportsTabs [data-report-tab]').forEach(button => {
        const active = button.dataset.reportTab === tab;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
        button.tabIndex = active ? 0 : -1;
        if (active) {
            document.getElementById('reportsTabContent')?.setAttribute('aria-labelledby', button.id);
            if (focusTab) button.focus();
        }
    });
    renderReportTabContent();
}

async function changeReportRecordsPage(delta) {
    const nextPage = Math.min(reportRecordsState.pages, Math.max(1, reportRecordsState.page + delta));
    if (nextPage === reportRecordsState.page) return;
    reportRecordsState.page = nextPage;
    try {
        const result = await window.APIService.getReportRecords({ ...reportsAppliedFilters, page: nextPage, pageSize: reportRecordsState.pageSize, sort: reportRecordsState.sort, direction: reportRecordsState.direction });
        reportRecordsState = { ...reportRecordsState, ...result.pagination, rows: result.rows || [], error: '' };
        renderReportTabContent();
    } catch (error) {
        reportRecordsState.error = error?.message || 'Detailed records could not be loaded.';
        renderReportTabContent();
    }
}

async function changeReportPageSize(value) {
    reportRecordsState.pageSize = Math.min(100, Math.max(10, Number(value) || 25));
    reportRecordsState.page = 1;
    try {
        const result = await window.APIService.getReportRecords({ ...reportsAppliedFilters, page: 1, pageSize: reportRecordsState.pageSize, sort: reportRecordsState.sort, direction: reportRecordsState.direction });
        reportRecordsState = { ...reportRecordsState, ...result.pagination, rows: result.rows || [], error: '' };
    } catch (error) {
        reportRecordsState.error = error?.message || 'Detailed records could not be loaded.';
    }
    renderReportTabContent();
}

async function sortReportRecords(key) {
    reportRecordsState.direction = reportRecordsState.sort === key && reportRecordsState.direction === 'asc' ? 'desc' : 'asc';
    reportRecordsState.sort = key;
    reportRecordsState.page = 1;
    try {
        const result = await window.APIService.getReportRecords({ ...reportsAppliedFilters, page: 1, pageSize: reportRecordsState.pageSize, sort: key, direction: reportRecordsState.direction });
        reportRecordsState = { ...reportRecordsState, ...result.pagination, rows: result.rows || [], error: '' };
    } catch (error) {
        reportRecordsState.error = error?.message || 'Detailed records could not be sorted.';
    }
    renderReportsMeta();
    renderReportTabContent();
}

function drilldownReports(type, encodedValue) {
    const value = decodeURIComponent(encodedValue || '');
    if (type === 'order-status') {
        document.getElementById('reportOrderStatusFilter').value = value;
        reportRecordsState.page = 1;
        applyReportFilters().then(() => setReportTab('details'));
        return;
    }
    if (type === 'service') {
        document.getElementById('reportServiceFilter').value = value;
        reportRecordsState.page = 1;
        applyReportFilters().then(() => setReportTab('details'));
        return;
    }
    if (type === 'payment-status') {
        document.getElementById('reportPaymentStatusFilter').value = value;
        applyReportFilters().then(() => setReportTab('financial'));
        return;
    }
    const directFilterMap = { customer: 'reportCustomerFilter', employee: 'reportEmployeeFilter', vendor: 'reportVendorFilter', 'pipeline-stage': 'reportPipelineStageFilter' };
    if (directFilterMap[type]) {
        document.getElementById(directFilterMap[type]).value = value;
        reportRecordsState.page = 1;
        applyReportFilters().then(() => setReportTab(type === 'pipeline-stage' ? 'pipeline' : 'details'));
        return;
    }
    if (type === 'summary' && value === 'completed') {
        document.getElementById('reportOrderStatusFilter').value = 'completed';
        applyReportFilters().then(() => setReportTab('details'));
        return;
    }
    setReportTab(reportTabs.has(value) ? value : 'details');
}

function reportDateValue(date) {
    return formatDisplayDateInput(date);
}

function applyReportDatePreset(preset) {
    const now = nowInMDT();
    const start = new Date(now);
    const end = new Date(now);
    document.querySelectorAll('#reportDatePresets [data-preset]').forEach(button => {
        const active = button.dataset.preset === preset;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (preset === 'custom') {
        document.getElementById('reportStartDate')?.focus();
        markReportFiltersDirty();
        return;
    }
    if (preset === 'today') start.setHours(0, 0, 0, 0);
    if (preset === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    if (preset === 'month') start.setDate(1);
    if (preset === 'last-month') {
        start.setMonth(start.getMonth() - 1, 1);
        end.setDate(0);
    }
    if (preset === 'quarter') start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
    if (preset === 'ytd') start.setMonth(0, 1);
    if (preset === 'last-30') start.setDate(start.getDate() - 29);
    document.getElementById('reportStartDate').value = reportDateValue(start);
    document.getElementById('reportEndDate').value = reportDateValue(end);
    markReportFiltersDirty();
}

function toggleReportAdvancedFilters(force) {
    const panel = document.getElementById('reportAdvancedFilters');
    const button = document.getElementById('reportAdvancedToggle');
    if (!panel || !button) return;
    const open = typeof force === 'boolean' ? force : panel.hidden;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) panel.querySelector('select')?.focus();
}

async function applyReportFilters() {
    reportRecordsState.page = 1;
    return generateReports(getReportFilters());
}

async function refreshReports() {
    window.APIService?.clearCache?.();
    return generateReports(Object.keys(reportsAppliedFilters).length ? reportsAppliedFilters : getReportFilters());
}

function resetReportFilters() {
    document.querySelectorAll('#reports .report-filter-grid select').forEach(select => { select.value = ''; });
    applyReportDatePreset('last-30');
    setReportTab('overview');
    reportRecordsState.page = 1;
    applyReportFilters();
}

function toggleReportExportMenu(event) {
    event?.stopPropagation();
    const menu = document.getElementById('reportExportMenu');
    const button = document.getElementById('reportExportButton');
    if (!menu || !button) return;
    const open = menu.hidden;
    menu.hidden = !open;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) menu.querySelector('[role="menuitem"]')?.focus();
}

function closeReportExportMenu(restoreFocus = false) {
    const menu = document.getElementById('reportExportMenu');
    const button = document.getElementById('reportExportButton');
    if (menu) menu.hidden = true;
    if (button) {
        button.setAttribute('aria-expanded', 'false');
        if (restoreFocus) button.focus();
    }
}

async function exportReports(format) {
    if (!reportsSourceData) {
        if (window.showToast) showToast('Load reports before exporting.', 'warning');
        return;
    }
    if (reportFilterDifferences().length) {
        if (window.showToast) showToast('Apply filter changes before exporting.', 'warning');
        return;
    }
    const button = document.getElementById('reportExportButton');
    const original = button?.innerHTML;
    closeReportExportMenu();
    if (button) {
        button.disabled = true;
        button.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Preparing ${format.toUpperCase()}…`;
    }
    try {
        const response = await fetch(window.APIService.getReportExportUrl(format, reportsAppliedFilters, format === 'pdf' ? 'summary' : 'details'), { credentials: 'include' });
        if (response.status === 401) window.APIService.handleUnauthorized?.();
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.message || `Export failed with status ${response.status}`);
        }
        const blob = await response.blob();
        const disposition = response.headers.get('content-disposition') || '';
        const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `smplfix-report.${format}`;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        if (window.showToast) showToast(`${format.toUpperCase()} report downloaded.`, 'success');
    } catch (error) {
        if (window.showToast) showToast(error?.message || 'Report export failed.', 'error');
    } finally {
        if (button) {
            button.innerHTML = original;
            button.disabled = reportFilterDifferences().length > 0;
            button.focus();
        }
    }
}

function initializeReportsWorkspace() {
    if (reportsInitialized) return;
    reportsInitialized = true;
    applyReportDatePreset('last-30');
    document.querySelectorAll('#reportDatePresets [data-preset]').forEach(button => button.addEventListener('click', () => applyReportDatePreset(button.dataset.preset)));
    document.querySelectorAll('#reports .report-filter-grid input, #reports .report-filter-grid select').forEach(input => input.addEventListener('change', markReportFiltersDirty));
    const tabButtons = Array.from(document.querySelectorAll('#reportsTabs [data-report-tab]'));
    tabButtons.forEach((button, index) => {
        button.addEventListener('click', () => setReportTab(button.dataset.reportTab));
        button.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            let nextIndex = index;
            if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabButtons.length;
            if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabButtons.length) % tabButtons.length;
            if (event.key === 'Home') nextIndex = 0;
            if (event.key === 'End') nextIndex = tabButtons.length - 1;
            setReportTab(tabButtons[nextIndex].dataset.reportTab, true);
        });
    });
    document.addEventListener('click', event => {
        if (!event.target.closest('.report-export-menu')) closeReportExportMenu();
    });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        if (!document.getElementById('reportExportMenu')?.hidden) closeReportExportMenu(true);
        else if (!document.getElementById('reportDefinitionsPanel')?.hidden) toggleReportDefinitions(false);
    });
    markReportFiltersDirty();
}

// Load reports whenever the section is activated, including direct #reports URLs.
function loadReportsSection() {
    initializeReportsWorkspace();
    if (!reportsSourceData && !reportsLoading) applyReportFilters();
    else renderReportsDashboard();
}

document.addEventListener('DOMContentLoaded', () => {
    initializeReportsWorkspace();
    if (window.location.hash === '#reports') {
        Promise.resolve(window.AuthReady).then(() => window.setTimeout(() => {
            window.dashboard?.showSection?.('reports');
            loadReportsSection();
        }, 0)).catch(() => {});
    }
});
window.addEventListener('hashchange', () => {
    if (window.location.hash === '#reports') loadReportsSection();
});

// Global functions
window.generateReports = generateReports;
window.applyReportFilters = applyReportFilters;
window.refreshReports = refreshReports;
window.resetReportFilters = resetReportFilters;
window.setReportTab = setReportTab;
window.changeReportRecordsPage = changeReportRecordsPage;
window.changeReportPageSize = changeReportPageSize;
window.sortReportRecords = sortReportRecords;
window.drilldownReports = drilldownReports;
window.exportReports = exportReports;
window.toggleReportExportMenu = toggleReportExportMenu;
window.toggleReportDefinitions = toggleReportDefinitions;
window.toggleReportAdvancedFilters = toggleReportAdvancedFilters;
window.clearReportFilter = clearReportFilter;

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
    renderNotesManager('payments', '', {}, 'paymentNotes');
    
    // Set default payment date to today
    const today = todayDateInput();
    document.getElementById('paymentDate').value = today;
    
    loadPaymentData();
    const paymentModal = document.getElementById('paymentModal');
    paymentModal.style.display = '';
    paymentModal.classList.add('show');
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
        renderNotesManager('payments', payment._id, payment, 'paymentNotes');
        
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
            if (document.getElementById('paymentNotes')?.value.trim()) {
                await addNoteEntry('payments', currentPaymentId, 'paymentNotes');
            }
            showToast('Payment updated.', 'success');
        } else {
            await window.APIService.createPayment(paymentData);
            showToast('Payment recorded.', 'success');
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
    if (!confirm('Delete this payment? This action cannot be undone.')) {
        return;
    }
    
    try {
        await window.APIService.deletePayment(paymentId);
        showToast('Payment deleted.', 'success');
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
        allPayments = await window.APIService.getPayments();
        initializePaymentFilters();
        updatePaymentFilterOptions(allPayments);
        filterPayments();
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
                <td colspan="8" class="payments-empty-state">
                    <i class="fas fa-credit-card"></i>
                    <h3>No Payments Found</h3>
                    <p>Payments will be automatically created when orders are created</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = payments.map(payment => {
        const paymentStatus = payment.status || 'pending';
        const paymentStatusClass = paymentStatus === 'bidding' ? 'status-neutral-payment' : `status-${paymentStatus}`;
        return `
        <tr onclick="showPaymentDetail('${payment._id}')">
            <td>
                ${payment.order ? `<strong class="payment-order-id">${payment.order.orderId || payment.order}</strong>` : '<span class="table-muted">-</span>'}
            </td>
            <td onclick="event.stopPropagation();">
                <span class="payment-invoice-link" onclick="editInvoiceNumber('${payment._id}', '${payment.invoiceNumber || ''}')" title="Click to edit invoice number">
                    ${payment.invoiceNumber || '<span class="table-muted">-</span>'}
                </span>
            </td>
            <td><span class="payment-customer-name">${payment.customer?.name || 'N/A'}</span></td>
            <td><strong class="payment-amount ${Number(payment.amount || 0) < 0 ? 'negative' : ''}">$${Number(payment.amount || 0).toLocaleString()}</strong></td>
            <td><span class="method-badge ${payment.paymentMethod || 'pending'}">${payment.paymentMethod ? payment.paymentMethod.replace('-', ' ') : 'Not Set'}</span></td>
            <td onclick="event.stopPropagation();">
                <select class="payment-status-select ${paymentStatusClass}" onchange="quickUpdatePaymentStatus('${payment._id}', this.value, this)">
                    <option value="bidding" ${payment.status === 'bidding' ? 'selected' : ''}>Bidding</option>
                    <option value="pending" ${payment.status === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="received" ${payment.status === 'received' ? 'selected' : ''}>Received</option>
                    <option value="completed" ${payment.status === 'completed' ? 'selected' : ''}>Completed</option>
                    <option value="failed" ${payment.status === 'failed' ? 'selected' : ''}>Failed</option>
                    <option value="refunded" ${payment.status === 'refunded' ? 'selected' : ''}>Refunded</option>
                    <option value="cancelled" ${payment.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                </select>
            </td>
            <td>${payment.paymentDate ? formatDisplayDate(payment.paymentDate) : 'Not Paid'}</td>
            <td onclick="event.stopPropagation();">
                <div class="payment-row-actions">
                    <button class="btn-action" onclick="showPaymentDetail('${payment._id}')" title="View" aria-label="View payment">
                        <i class="fas fa-eye" aria-hidden="true"></i>
                    </button>
                    <button class="btn-action delete" onclick="deletePayment('${payment._id}')" title="Delete" aria-label="Delete payment">
                        <i class="fas fa-trash" aria-hidden="true"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
    }).join('');
}

let allPayments = [];

function initializePaymentFilters() {
    if (window.__paymentFiltersInitialized) return;
    window.__paymentFiltersInitialized = true;

    const searchInput = document.getElementById('paymentSearchInput');
    const statusFilter = document.getElementById('paymentStatusFilter');
    const methodFilter = document.getElementById('paymentMethodFilter');
    const dateFilter = document.getElementById('paymentDateFilter');

    if (searchInput) {
        searchInput.addEventListener('input', filterPayments);
    }

    if (statusFilter) {
        statusFilter.addEventListener('change', filterPayments);
    }

    if (methodFilter) {
        methodFilter.addEventListener('change', filterPayments);
    }

    if (dateFilter) {
        dateFilter.addEventListener('change', filterPayments);
    }
}

function updatePaymentFilterOptions(payments = []) {
    updateSelectOptions('paymentStatusFilter', payments, payment => [payment.status], 'All Status', [
        ['bidding', 'Bidding'],
        ['pending', 'Pending'],
        ['received', 'Received'],
        ['completed', 'Completed'],
        ['failed', 'Failed'],
        ['refunded', 'Refunded'],
        ['cancelled', 'Cancelled']
    ]);

    updateSelectOptions('paymentMethodFilter', payments, payment => [payment.paymentMethod], 'All Methods', [
        ['cash', 'Cash'],
        ['credit-card', 'Credit Card'],
        ['debit-card', 'Debit Card'],
        ['bank-transfer', 'Bank Transfer'],
        ['check', 'Check'],
        ['online', 'Online']
    ]);
}

function filterPayments() {
    const searchTerm = normalizeSearchText(document.getElementById('paymentSearchInput')?.value);
    const statusFilter = normalizeFilterValue(document.getElementById('paymentStatusFilter')?.value || 'all');
    const methodFilter = normalizeFilterValue(document.getElementById('paymentMethodFilter')?.value || 'all');
    const dateFilter = normalizeFilterValue(document.getElementById('paymentDateFilter')?.value || 'all');

    let filtered = allPayments;

    if (searchTerm) {
        filtered = filtered.filter(payment => buildSearchText([
            payment._id,
            payment.id,
            payment.invoiceNumber,
            payment.transactionId,
            payment.referenceNumber,
            payment.customer?.name,
            payment.customer?.email,
            payment.order?.orderId || payment.order,
            payment.order?.service,
            payment.amount,
            payment.status,
            payment.paymentMethod,
            getLatestNoteText(payment)
        ]).includes(searchTerm));
    }

    if (statusFilter !== 'all') {
        filtered = filtered.filter(payment => normalizeFilterValue(payment.status) === statusFilter);
    }

    if (methodFilter !== 'all') {
        filtered = filtered.filter(payment => normalizeFilterValue(payment.paymentMethod) === methodFilter);
    }

    if (dateFilter !== 'all') {
        filtered = filtered.filter(payment => isPaymentInDateFilter(payment, dateFilter));
    }

    renderPaymentsTable(filtered);
}

function updatePaymentStats(payments) {
    const totalCount = document.getElementById('totalPaymentsCount');
    const completedCount = document.getElementById('completedPaymentsCount');
    const pendingCount = document.getElementById('pendingPaymentsCount');
    const failedCount = document.getElementById('failedPaymentsCount');
    
    if (totalCount) totalCount.textContent = payments.length;
    if (completedCount) {
        const completed = payments.filter(p => p.status === 'received' || p.status === 'completed').length;
        completedCount.textContent = completed;
    }
    if (pendingCount) {
        const pending = payments.filter(p => p.status === 'pending').length;
        pendingCount.textContent = pending;
    }
    if (failedCount) {
        const failed = payments.filter(p => p.status === 'failed').length;
        failedCount.textContent = failed;
    }
}

function isPaymentInDateFilter(payment, filter) {
    const value = payment.paymentDate || payment.dueDate || payment.createdAt;
    if (!value) return false;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;

    const now = nowInMDT();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    if (filter === 'today') {
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        return date >= start && date < end;
    }

    if (filter === 'week') {
        const day = start.getDay();
        start.setDate(start.getDate() - day);
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        return date >= start && date < end;
    }

    if (filter === 'month') {
        start.setDate(1);
        const end = new Date(start);
        end.setMonth(end.getMonth() + 1);
        return date >= start && date < end;
    }

    if (filter === 'year') {
        start.setMonth(0, 1);
        const end = new Date(start);
        end.setFullYear(end.getFullYear() + 1);
        return date >= start && date < end;
    }

    return true;
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
async function quickUpdatePaymentStatus(paymentId, newStatus, selectEl = null) {
    if (selectEl) {
        const statusClass = newStatus === 'bidding' ? 'status-neutral-payment' : `status-${newStatus}`;
        selectEl.className = `payment-status-select ${statusClass}`;
    }

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
        showToast(`Payment status updated to ${newStatus}.`, 'success');
        
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
                <button type="button" class="invoice-modal-close" onclick="this.closest('.invoice-edit-modal-overlay').remove()" aria-label="Close invoice editor">
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
        
        window.AppLogger?.debug('Current payment data:', payment);
        window.AppLogger?.debug('New invoice number:', trimmedNumber ? 'INV-' + trimmedNumber : '(empty)');
        
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
            notes: ''
        };
        
        window.AppLogger?.debug('Sending update data:', updateData);
        
        // Save to backend
        const result = await window.APIService.updatePayment(paymentId, updateData);
        
        window.AppLogger?.debug('Update result:', result);
        
        // Close modal
        if (modal) modal.remove();
        
        // Show success message
        showToast('Invoice number updated.', 'success');
        
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

// Payment Detail View
function formatPaymentCurrency(value) {
    const amount = Number(value || 0);
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2
    }).format(amount);
}

function formatPaymentDate(value, fallback = '-') {
    if (!value) return fallback;
    const c = tz();
    if (c) return c.formatDateShortMDT(value) || fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Phoenix',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    }).format(date);
}

function formatPaymentDateTime(value, fallback = '-') {
    if (!value) return fallback;
    const c = tz();
    if (c) {
        return c.formatDateMDT(value, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        }) || fallback;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Phoenix',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    }).format(date);
}

function formatPaymentLabel(value) {
    if (!value) return 'Not Set';
    return value
        .split('-')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function escapePaymentHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const NOTE_ENTITY_LABELS = {
    orders: 'order',
    customers: 'customer',
    vendors: 'vendor',
    payments: 'payment',
    'pipeline-records': 'pipeline record',
    projects: 'project'
};

function getCurrentUserIdForNotes() {
    const user = window.AuthSession?.user;
    return user?.id || user?._id || null;
}

function getCurrentUserEmailForNotes() {
    return window.AuthSession?.user?.email || null;
}

function getCurrentUserDisplayNameForNotes() {
    const user = window.AuthSession?.user;
    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
    return fullName || user?.email || null;
}

function getNoteAuthorDisplayName(note, currentUserId, currentUserEmail) {
    const isCurrentUser = (
        (note.createdBy && currentUserId && String(note.createdBy) === String(currentUserId)) ||
        (note.createdByEmail && currentUserEmail && String(note.createdByEmail) === String(currentUserEmail))
    );
    return isCurrentUser ? (getCurrentUserDisplayNameForNotes() || note.createdByName || 'Unknown User') : (note.createdByName || 'Unknown User');
}

function formatArizonaNoteDate(value, includeAt = false) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Phoenix',
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZoneName: 'short'
    }).formatToParts(date).reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});
    const dateText = `${parts.month}/${parts.day}/${parts.year}`;
    const timeText = `${parts.hour}:${parts.minute} ${parts.timeZoneName || 'MST'}`;
    return includeAt ? `${dateText} at ${timeText}` : `${dateText} ${timeText}`;
}

function normalizeNotesHistory(record = {}) {
    const history = Array.isArray(record.notesHistory) ? record.notesHistory.slice() : [];
    if (!history.length && String(record.notes || '').trim()) {
        history.push({
            _id: '',
            text: record.notes,
            createdByName: 'Legacy Note',
            createdAt: record.updatedAt || record.createdAt || new Date().toISOString(),
            edits: [],
            legacy: true
        });
    }
    return history.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function getLatestNoteText(record = {}) {
    const notes = normalizeNotesHistory(record);
    return notes.length ? notes[0].text : '';
}

function renderNotesManager(entity, recordId, record, textareaId) {
    const textarea = document.getElementById(textareaId);
    if (!textarea) return;

    textarea.value = '';
    textarea.placeholder = recordId ? 'Write a new note...' : 'Write the first note...';

    const wrapperId = `${textareaId}History`;
    let wrapper = document.getElementById(wrapperId);
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.id = wrapperId;
        wrapper.className = 'notes-history';
        textarea.insertAdjacentElement('afterend', wrapper);
    }

    const notes = normalizeNotesHistory(record);
    const currentUserId = getCurrentUserIdForNotes();
    const currentUserEmail = getCurrentUserEmailForNotes();
    const noteItems = notes.length ? notes.map(note => {
        const noteId = note._id || '';
        const canManage = noteId && (
            (note.createdBy && currentUserId && String(note.createdBy) === String(currentUserId)) ||
            (note.createdByEmail && currentUserEmail && String(note.createdByEmail) === String(currentUserEmail))
        );
        const latestEdit = Array.isArray(note.edits) && note.edits.length ? note.edits[note.edits.length - 1] : null;
        const audit = latestEdit
            ? `<div class="note-audit">(${escapePaymentHtml(latestEdit.editedByName || 'Unknown User')}) edited this note on ${escapePaymentHtml(formatArizonaNoteDate(latestEdit.editedAt, true))}</div>`
            : '';
        return `
            <article class="note-entry" data-note-id="${escapePaymentHtml(noteId)}">
                <div class="note-entry-meta">
                    <strong>${escapePaymentHtml(getNoteAuthorDisplayName(note, currentUserId, currentUserEmail))}</strong>
                    <span>${escapePaymentHtml(formatArizonaNoteDate(note.createdAt))}</span>
                </div>
                <p>${escapePaymentHtml(note.text || '')}</p>
                ${audit}
                ${canManage ? `
                    <div class="note-entry-actions">
                        <button type="button" class="note-action-btn" onclick="editNoteEntry('${entity}', '${recordId}', '${noteId}', '${textareaId}')">
                            <i class="fas fa-pen"></i> Edit
                        </button>
                        <button type="button" class="note-action-btn danger" onclick="deleteNoteEntry('${entity}', '${recordId}', '${noteId}', '${textareaId}')">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                ` : ''}
            </article>
        `;
    }).join('') : '<div class="notes-empty">No notes yet</div>';

    wrapper.innerHTML = `
        <div class="notes-compose-row">
            <button type="button" class="btn-add-note" onclick="addNoteEntry('${entity}', '${recordId}', '${textareaId}')" ${recordId ? '' : 'disabled'}>
                <i class="fas fa-plus"></i> Add Note
            </button>
        </div>
        ${noteItems}
    `;
}

async function addNoteEntry(entity, recordId, textareaId) {
    const textarea = document.getElementById(textareaId);
    const text = textarea?.value.trim();
    if (!recordId || !text) {
        showToast('Enter a note before saving it.', 'warning');
        return null;
    }

    try {
        const result = await window.APIService.addNote(entity, recordId, text);
        textarea.value = '';
        renderNotesManager(entity, recordId, result, textareaId);
        showToast('Note added.', 'success');
        return result;
    } catch (error) {
        console.warn('Note save failed:', error);
        const message = /Cannot POST|Not Found|404/i.test(error.message || '')
            ? 'Saved the record, but the note history API is not available yet. Restart the backend and try adding the note again.'
            : `Saved the record, but the note could not be added: ${error.message}`;
        showToast(message, 'warning');
        return null;
    }
}

function closeNoteEditModal(modal) {
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 120);
}

function openNoteEditModal(currentText) {
    return new Promise((resolve) => {
        const existing = document.querySelector('.note-edit-modal-overlay');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.className = 'note-edit-modal-overlay show';
        modal.innerHTML = `
            <div class="note-edit-modal" role="dialog" aria-modal="true" aria-labelledby="noteEditTitle">
                <div class="note-edit-header">
                    <div>
                        <h3 id="noteEditTitle">Edit Note</h3>
                    </div>
                    <button type="button" class="note-edit-close" aria-label="Close note editor">
                        <i class="fas fa-times" aria-hidden="true"></i>
                    </button>
                </div>
                <div class="note-edit-body">
                    <textarea id="noteEditText" rows="6" autocomplete="off"></textarea>
                    <div class="note-edit-error" role="alert"></div>
                </div>
                <div class="note-edit-footer">
                    <button type="button" class="note-edit-cancel">Cancel</button>
                    <button type="button" class="note-edit-save">
                        <i class="fas fa-save" aria-hidden="true"></i>
                        Save Note
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const textarea = modal.querySelector('#noteEditText');
        const error = modal.querySelector('.note-edit-error');
        const saveBtn = modal.querySelector('.note-edit-save');
        const cancelBtn = modal.querySelector('.note-edit-cancel');
        const closeBtn = modal.querySelector('.note-edit-close');
        let resolved = false;

        const finish = (value) => {
            if (resolved) return;
            resolved = true;
            document.removeEventListener('keydown', handleKeydown);
            closeNoteEditModal(modal);
            resolve(value);
        };

        const save = () => {
            const trimmed = textarea.value.trim();
            if (!trimmed) {
                error.textContent = 'Note text cannot be empty.';
                textarea.focus();
                return;
            }
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Saving...';
            finish(trimmed);
        };

        const handleKeydown = (event) => {
            if (event.key === 'Escape') {
                finish(null);
            }
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                save();
            }
        };

        textarea.value = currentText || '';
        textarea.addEventListener('input', () => {
            error.textContent = '';
        });
        saveBtn.addEventListener('click', save);
        cancelBtn.addEventListener('click', () => finish(null));
        closeBtn.addEventListener('click', () => finish(null));
        modal.addEventListener('click', (event) => {
            if (event.target === modal) finish(null);
        });
        document.addEventListener('keydown', handleKeydown);

        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }, 0);
    });
}

async function editNoteEntry(entity, recordId, noteId, textareaId) {
    const entry = document.querySelector(`#${textareaId}History .note-entry[data-note-id="${CSS.escape(noteId)}"] p`);
    const currentText = entry ? entry.textContent : '';
    const text = await openNoteEditModal(currentText);
    if (text === null) return;
    const trimmed = text.trim();
    if (!trimmed) {
        showToast('Note text cannot be empty.', 'warning');
        return;
    }
    try {
        const result = await window.APIService.updateNote(entity, recordId, noteId, trimmed);
        renderNotesManager(entity, recordId, result, textareaId);
        showToast('Note updated.', 'success');
    } catch (error) {
        showToast(error.message || 'Failed to update note.', 'error');
    }
}

async function deleteNoteEntry(entity, recordId, noteId, textareaId) {
    if (!confirm('Delete this note?')) return;
    try {
        const result = await window.APIService.deleteNote(entity, recordId, noteId);
        renderNotesManager(entity, recordId, result, textareaId);
        showToast('Note deleted.', 'success');
    } catch (error) {
        showToast(error.message || 'You can only delete your own notes.', 'error');
    }
}

window.renderNotesManager = renderNotesManager;
window.getLatestNoteText = getLatestNoteText;

function closePaymentDetailOnEscape(event) {
    if (event.key === 'Escape') {
        closePaymentDetail();
    }
}

let currentPaymentDetailData = null;
let paymentMilestoneKeyCounter = 0;

function createPaymentMilestoneClientKey() {
    paymentMilestoneKeyCounter += 1;
    return `milestone-${Date.now()}-${paymentMilestoneKeyCounter}`;
}

function ensurePaymentMilestoneClientKeys(payment) {
    if (!payment) return;
    payment.milestones = Array.isArray(payment.milestones) ? payment.milestones : [];
    payment.milestones = payment.milestones.map((milestone) => ({
        ...milestone,
        clientKey: milestone.clientKey || milestone._id || createPaymentMilestoneClientKey()
    }));
}

function calculatePaymentMilestoneSummary(payment) {
    const milestones = Array.isArray(payment?.milestones) ? payment.milestones : [];
    const totalAmount = Number(payment?.amount || 0);
    const receivedAmount = milestones
        .filter(milestone => milestone.status === 'received' || milestone.status === 'completed')
        .reduce((sum, milestone) => sum + Number(milestone.amount || 0), 0);
    const remainingAmount = Math.max(totalAmount - receivedAmount, 0);
    const progress = totalAmount > 0 ? Math.min((receivedAmount / totalAmount) * 100, 100) : 0;

    return {
        milestones,
        totalAmount,
        receivedAmount,
        remainingAmount,
        progress
    };
}

function renderPaymentMilestoneRows(payment) {
    const container = document.getElementById('paymentMilestoneList');
    if (!container) return;

    ensurePaymentMilestoneClientKeys(payment);
    const milestones = Array.isArray(payment?.milestones) ? payment.milestones : [];
    if (!milestones.length) {
        container.innerHTML = `
            <div class="payment-milestone-empty">
                <i class="fas fa-flag-checkered"></i>
                <div>
                    <strong>No milestones yet</strong>
                    <p>Split this payment into milestone amounts for partial collections.</p>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = milestones.map((milestone, index) => `
        <div class="payment-milestone-row status-${escapePaymentHtml(milestone.status || 'pending')}" data-client-key="${escapePaymentHtml(milestone.clientKey)}">
            <div class="payment-milestone-row-head">
                <div class="payment-milestone-row-title">
                    <span class="payment-milestone-step">Milestone ${index + 1}</span>
                    <span class="payment-milestone-status-chip status-${escapePaymentHtml(milestone.status || 'pending')}">${escapePaymentHtml(formatPaymentLabel(milestone.status || 'pending'))}</span>
                </div>
                <button type="button" class="payment-milestone-remove" onclick="removePaymentMilestone('${escapePaymentHtml(milestone.clientKey)}')" title="Remove milestone">
                    <i class="fas fa-trash"></i>
                    <span>Delete</span>
                </button>
            </div>
            <div class="payment-milestone-row-top">
                <div class="payment-milestone-title-wrap">
                    <label class="payment-milestone-label">Milestone Title</label>
                    <input type="text" class="payment-milestone-input" data-field="title" value="${escapePaymentHtml(milestone.title || '')}" placeholder="Deposit, Phase 1, Final Payment">
                </div>
                <div>
                    <label class="payment-milestone-label">Amount</label>
                    <input type="number" class="payment-milestone-input" data-field="amount" min="0" step="0.01" value="${Number(milestone.amount || 0)}" placeholder="0.00">
                </div>
                <div>
                    <label class="payment-milestone-label">Status</label>
                    <select class="payment-milestone-select" data-field="status">
                        <option value="pending" ${milestone.status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="received" ${milestone.status === 'received' ? 'selected' : ''}>Received</option>
                        <option value="completed" ${milestone.status === 'completed' ? 'selected' : ''}>Completed</option>
                        <option value="failed" ${milestone.status === 'failed' ? 'selected' : ''}>Failed</option>
                        <option value="cancelled" ${milestone.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>
                </div>
            </div>
            <div class="payment-milestone-row-bottom">
                <div>
                    <label class="payment-milestone-label">Due Date</label>
                    <input type="date" class="payment-milestone-input" data-field="dueDate" value="${milestone.dueDate ? String(milestone.dueDate).split('T')[0] : ''}">
                </div>
                <div>
                    <label class="payment-milestone-label">Received Date</label>
                    <input type="date" class="payment-milestone-input" data-field="receivedDate" value="${milestone.receivedDate ? String(milestone.receivedDate).split('T')[0] : ''}">
                </div>
                <div class="payment-milestone-notes-wrap">
                    <label class="payment-milestone-label">Notes</label>
                    <textarea class="payment-milestone-textarea" data-field="notes" rows="2" placeholder="Optional note for this milestone">${escapePaymentHtml(milestone.notes || '')}</textarea>
                </div>
            </div>
        </div>
    `).join('');
}

function syncPaymentMilestoneDraftFromDom() {
    if (!currentPaymentDetailData) return;

    const rows = document.querySelectorAll('#paymentMilestoneList .payment-milestone-row');
    const milestoneMap = new Map((currentPaymentDetailData.milestones || []).map((milestone) => [milestone.clientKey, milestone]));
    currentPaymentDetailData.milestones = Array.from(rows).map((row, index) => {
        const clientKey = row.dataset.clientKey;
        const existingMilestone = milestoneMap.get(clientKey) || {};
        const getValue = (field) => row.querySelector(`[data-field="${field}"]`)?.value || '';
        const status = getValue('status') || 'pending';
        const receivedDate = getValue('receivedDate');

        return {
            _id: existingMilestone._id,
            clientKey,
            title: getValue('title').trim() || `Milestone ${index + 1}`,
            amount: Number(getValue('amount') || 0),
            status,
            dueDate: getValue('dueDate') || null,
            receivedDate: receivedDate || ((status === 'received' || status === 'completed') ? todayDateInput() : null),
            notes: getValue('notes').trim()
        };
    });
}

function refreshPaymentMilestoneSummary() {
    if (!currentPaymentDetailData) return;

    syncPaymentMilestoneDraftFromDom();
    const summary = calculatePaymentMilestoneSummary(currentPaymentDetailData);
    const receivedEl = document.getElementById('paymentReceivedAmount');
    const remainingEl = document.getElementById('paymentRemainingAmount');
    const progressEl = document.getElementById('paymentMilestoneProgress');
    const progressBarEl = document.getElementById('paymentMilestoneProgressBar');
    const countEl = document.getElementById('paymentMilestoneCount');

    if (receivedEl) receivedEl.textContent = formatPaymentCurrency(summary.receivedAmount);
    if (remainingEl) remainingEl.textContent = formatPaymentCurrency(summary.remainingAmount);
    if (progressEl) progressEl.textContent = `${Math.round(summary.progress)}% Collected`;
    if (progressBarEl) progressBarEl.style.width = `${summary.progress}%`;
    if (countEl) countEl.textContent = `${summary.milestones.length} milestone${summary.milestones.length === 1 ? '' : 's'}`;
}

function bindPaymentMilestoneInputs() {
    document.querySelectorAll('#paymentMilestoneList [data-field]').forEach((field) => {
        field.addEventListener('input', refreshPaymentMilestoneSummary);
        field.addEventListener('change', refreshPaymentMilestoneSummary);
    });
}

function rerenderPaymentMilestones() {
    if (!currentPaymentDetailData) return;
    ensurePaymentMilestoneClientKeys(currentPaymentDetailData);
    renderPaymentMilestoneRows(currentPaymentDetailData);
    bindPaymentMilestoneInputs();
    refreshPaymentMilestoneSummary();
}

function addPaymentMilestone() {
    if (!currentPaymentDetailData) return;
    syncPaymentMilestoneDraftFromDom();
    currentPaymentDetailData.milestones = currentPaymentDetailData.milestones || [];
    currentPaymentDetailData.milestones.push({
        clientKey: createPaymentMilestoneClientKey(),
        title: `Milestone ${currentPaymentDetailData.milestones.length + 1}`,
        amount: 0,
        dueDate: null,
        receivedDate: null,
        status: 'pending',
        notes: ''
    });
    rerenderPaymentMilestones();
}

function removePaymentMilestone(clientKey) {
    if (!currentPaymentDetailData) return;
    syncPaymentMilestoneDraftFromDom();
    currentPaymentDetailData.milestones = (currentPaymentDetailData.milestones || []).filter(
        (milestone) => milestone.clientKey !== clientKey
    );
    rerenderPaymentMilestones();
}

async function savePaymentMilestones() {
    if (!currentPaymentDetailData) return;

    syncPaymentMilestoneDraftFromDom();
        const milestones = (currentPaymentDetailData.milestones || []).map(({ clientKey, ...milestone }) => milestone);
    const milestoneTotal = milestones.reduce((sum, milestone) => sum + Number(milestone.amount || 0), 0);
    const paymentAmount = Number(currentPaymentDetailData.amount || 0);

    if (milestones.some(milestone => !milestone.title.trim())) {
        showToast('Each milestone needs a title.', 'error');
        return;
    }

    if (milestones.some(milestone => Number(milestone.amount || 0) < 0)) {
        showToast('Milestone amounts must be 0 or greater.', 'error');
        return;
    }

    if (milestoneTotal - paymentAmount > 0.009) {
        showToast('Milestone total cannot be more than the payment amount.', 'error');
        return;
    }

    const saveButton = document.getElementById('savePaymentMilestonesBtn');
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    }

    try {
        await window.APIService.updatePayment(currentPaymentDetailData._id, {
            milestones
        });
        showToast('Payment milestones updated.', 'success');
        await showPaymentDetail(currentPaymentDetailData._id);
        await refreshPayments();
        if (window.dashboard && window.dashboard.renderDashboard) {
            await window.dashboard.renderDashboard();
        }
    } catch (error) {
        showToast('Failed to save milestones: ' + error.message, 'error');
    } finally {
        const refreshedButton = document.getElementById('savePaymentMilestonesBtn');
        if (refreshedButton) {
            refreshedButton.disabled = false;
            refreshedButton.innerHTML = '<i class="fas fa-save"></i> Save Milestones';
        }
    }
}

async function showPaymentDetail(paymentId) {
    try {
        const payment = await window.APIService.getPayment(paymentId);
        currentPaymentDetailData = {
            ...payment,
            milestones: Array.isArray(payment.milestones) ? payment.milestones.map(milestone => ({ ...milestone })) : []
        };
        ensurePaymentMilestoneClientKeys(currentPaymentDetailData);

        let modal = document.getElementById('paymentDetailModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'paymentDetailModal';
            modal.className = 'payment-detail-modal';
            document.body.appendChild(modal);
        }

        const statusIcons = {
            bidding: 'fa-gavel',
            pending: 'fa-hourglass-half',
            received: 'fa-circle-check',
            completed: 'fa-check-double',
            failed: 'fa-circle-xmark',
            refunded: 'fa-rotate-left',
            cancelled: 'fa-ban'
        };

        const statusText = formatPaymentLabel(payment.status || 'pending');
        const methodText = formatPaymentLabel(payment.paymentMethod);
        const amountText = formatPaymentCurrency(payment.amount);
        const dueDateText = formatPaymentDate(payment.dueDate);
        const paymentDateText = formatPaymentDate(payment.paymentDate, 'Not Paid Yet');
        const createdAtText = formatPaymentDateTime(payment.createdAt);
        const updatedAtText = formatPaymentDateTime(payment.updatedAt);
        const milestoneSummary = calculatePaymentMilestoneSummary(currentPaymentDetailData);
        const processedByName = payment.processedBy
            ? `${payment.processedBy.firstName || ''} ${payment.processedBy.lastName || ''}`.trim()
            : '';
        const paymentStateClass = payment.status || 'pending';
        const statusIconClass = statusIcons[payment.status] || 'fa-circle-info';
        const orderStage = payment.order?.pipelineStage ? formatPaymentLabel(payment.order.pipelineStage) : 'Not Linked';

        const summaryStats = [
            {
                label: 'Method',
                value: escapePaymentHtml(methodText),
                icon: 'fa-wallet'
            },
            {
                label: 'Collected',
                value: escapePaymentHtml(formatPaymentCurrency(milestoneSummary.receivedAmount)),
                icon: 'fa-money-bill-wave'
            },
            {
                label: 'Remaining',
                value: escapePaymentHtml(formatPaymentCurrency(milestoneSummary.remainingAmount)),
                icon: 'fa-hourglass-half'
            }
        ];

        const overviewItems = [
            ['Payment ID', payment.paymentId || '-'],
            ['Invoice Number', payment.invoiceNumber || '-'],
            ['Transaction ID', payment.transactionId || '-'],
            ['Receipt Number', payment.receiptNumber || '-'],
            ['Created', createdAtText],
            ['Last Updated', updatedAtText]
        ];

        const relatedItems = [
            ['Customer', payment.customer?.name || 'N/A'],
            ['Email', payment.customer?.email || '-'],
            ['Order ID', payment.order?.orderId || '-'],
            ['Service', payment.order?.service || '-'],
            ['Payment Date', paymentDateText],
            ['Processed By', processedByName || '-']
        ];

        modal.innerHTML = `
            <div class="payment-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="paymentDetailTitle">
                <div class="payment-detail-content payment-state-${paymentStateClass}">
                    <div class="payment-detail-header">
                        <div class="payment-detail-header-copy">
                            <div class="payment-detail-kicker">Payment Details</div>
                            <h2 id="paymentDetailTitle">${escapePaymentHtml(payment.paymentId || 'Payment Record')}</h2>
                            <p>${escapePaymentHtml(payment.customer?.name || 'Customer unavailable')} ${payment.order?.orderId ? `• ${escapePaymentHtml(payment.order.orderId)}` : ''}</p>
                        </div>
                        <div class="payment-detail-header-actions">
                            <span class="payment-status-display ${paymentStateClass}">
                                <i class="fas ${statusIconClass}"></i>
                                ${escapePaymentHtml(statusText)}
                            </span>
                            <button type="button" class="payment-detail-close" onclick="closePaymentDetail()" aria-label="Close payment details">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>

                    <div class="payment-detail-body">
                        <section class="payment-hero">
                            <div class="payment-hero-main">
                                <span class="payment-hero-label">Amount</span>
                                <div class="payment-amount-highlight">${escapePaymentHtml(amountText)}</div>
                                <div class="payment-hero-meta">
                                    <span><i class="fas fa-calendar-check"></i> Paid: ${escapePaymentHtml(paymentDateText)}</span>
                                    <span><i class="fas fa-calendar"></i> Due: ${escapePaymentHtml(dueDateText)}</span>
                                </div>
                            </div>
                            <div class="payment-hero-stats">
                                ${summaryStats.map(stat => `
                                    <div class="payment-stat-card">
                                        <span class="payment-stat-icon"><i class="fas ${stat.icon}"></i></span>
                                        <span class="payment-stat-label">${stat.label}</span>
                                        <strong class="payment-stat-value">${stat.value}</strong>
                                    </div>
                                `).join('')}
                            </div>
                        </section>

                        <div class="payment-info-grid">
                            <section class="payment-info-card">
                                <div class="payment-card-header">
                                    <h3>Overview</h3>
                                    <span class="payment-card-chip">Financial</span>
                                </div>
                                ${overviewItems.map(([label, value]) => `
                                    <div class="payment-info-item">
                                        <span class="payment-info-label">${label}</span>
                                        <span class="payment-info-value">${escapePaymentHtml(value)}</span>
                                    </div>
                                `).join('')}
                            </section>

                            <section class="payment-info-card">
                                <div class="payment-card-header">
                                    <h3>Customer & Order</h3>
                                    <span class="payment-card-chip">Linked Data</span>
                                </div>
                                ${relatedItems.map(([label, value]) => `
                                    <div class="payment-info-item">
                                        <span class="payment-info-label">${label}</span>
                                        <span class="payment-info-value">${escapePaymentHtml(value)}</span>
                                    </div>
                                `).join('')}
                            </section>
                        </div>

                        ${payment.description ? `
                            <section class="payment-rich-card payment-rich-card-wide">
                                <div class="payment-card-header">
                                    <h3>Description</h3>
                                    <span class="payment-card-chip">Context</span>
                                </div>
                                <p class="payment-rich-text">${escapePaymentHtml(payment.description)}</p>
                            </section>
                        ` : ''}

                        ${getLatestNoteText(payment) ? `
                            <section class="payment-rich-card payment-rich-card-wide payment-notes-section">
                                <div class="payment-card-header">
                                    <h3>Notes</h3>
                                    <span class="payment-card-chip">Internal</span>
                                </div>
                                <p class="payment-rich-text">${escapePaymentHtml(getLatestNoteText(payment))}</p>
                            </section>
                        ` : ''}

                        ${payment.order?.employee ? `
                            <section class="payment-rich-card payment-employee-section">
                                <div class="payment-card-header">
                                    <div>
                                        <h3>Employee Assignment</h3>
                                        <span class="payment-card-subtext">Employee assigned to this order and payment details</span>
                                    </div>
                                    <span class="payment-card-chip">Employee</span>
                                </div>

                                <div class="payment-employee-info">
                                    <div class="payment-employee-info-item">
                                        <span class="payment-employee-info-label">Name</span>
                                        <span class="payment-employee-info-value">${escapePaymentHtml(payment.order.employee.name || 'N/A')}</span>
                                    </div>
                                    <div class="payment-employee-info-item">
                                        <span class="payment-employee-info-label">Email</span>
                                        <span class="payment-employee-info-value">${escapePaymentHtml(payment.order.employee.email || 'N/A')}</span>
                                    </div>
                                    <div class="payment-employee-info-item">
                                        <span class="payment-employee-info-label">Phone</span>
                                        <span class="payment-employee-info-value">${escapePaymentHtml(payment.order.employee.phone || 'N/A')}</span>
                                    </div>
                                </div>

                                <div class="payment-card-header" style="margin-top: 18px;">
                                    <h3>Employee Payment</h3>
                                    <span class="payment-employee-status-badge ${payment.employeePaymentStatus || 'pending'}">
                                        <i class="fas ${payment.employeePaymentStatus === 'paid' ? 'fa-check-circle' : payment.employeePaymentStatus === 'cancelled' ? 'fa-ban' : 'fa-clock'}"></i>
                                        ${formatPaymentLabel(payment.employeePaymentStatus || 'pending')}
                                    </span>
                                </div>

                                <div class="payment-employee-payment-form">
                                    <div class="payment-employee-form-group">
                                        <label>Amount</label>
                                        <input type="number" id="employeePaymentAmount" value="${payment.employeePaymentAmount || 0}" min="0" step="0.01">
                                    </div>
                                    <div class="payment-employee-form-group">
                                        <label>Status</label>
                                        <select id="employeePaymentStatus">
                                            <option value="pending" ${payment.employeePaymentStatus === 'pending' || !payment.employeePaymentStatus ? 'selected' : ''}>Pending</option>
                                            <option value="paid" ${payment.employeePaymentStatus === 'paid' ? 'selected' : ''}>Paid</option>
                                            <option value="cancelled" ${payment.employeePaymentStatus === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                                        </select>
                                    </div>
                                    <div class="payment-employee-form-group">
                                        <label>Payment Date</label>
                                        <input type="date" id="employeePaymentDate" value="${payment.employeePaymentDate ? formatDisplayDateInput(payment.employeePaymentDate) : ''}">
                                    </div>
                                    <div class="payment-employee-form-group">
                                        <label>Payment Method</label>
                                        <select id="employeePaymentMethod">
                                            <option value="">Select Method</option>
                                            <option value="cash" ${payment.employeePaymentMethod === 'cash' ? 'selected' : ''}>Cash</option>
                                            <option value="bank-transfer" ${payment.employeePaymentMethod === 'bank-transfer' ? 'selected' : ''}>Bank Transfer</option>
                                            <option value="check" ${payment.employeePaymentMethod === 'check' ? 'selected' : ''}>Check</option>
                                            <option value="online" ${payment.employeePaymentMethod === 'online' ? 'selected' : ''}>Online</option>
                                        </select>
                                    </div>
                                    <div class="payment-employee-form-group" style="grid-column: 1 / -1;">
                                        <label>Notes</label>
                                        <textarea id="employeePaymentNotes">${escapePaymentHtml(payment.employeePaymentNotes || '')}</textarea>
                                    </div>
                                </div>

                                <div class="payment-milestone-actions">
                                    <button class="btn btn-primary" type="button" onclick="saveEmployeePayment()">
                                        <i class="fas fa-save"></i> Save Employee Payment
                                    </button>
                                </div>
                            </section>
                        ` : ''}

                        ${payment.order?.vendor ? `
                            <section class="payment-rich-card payment-vendor-section">
                                <div class="payment-card-header">
                                    <div>
                                        <h3>Vendor Assignment</h3>
                                        <span class="payment-card-subtext">Vendor assigned to this order and payment details</span>
                                    </div>
                                    <span class="payment-card-chip">Vendor</span>
                                </div>

                                <div class="payment-vendor-info">
                                    <div class="payment-vendor-info-item">
                                        <span class="payment-vendor-info-label">Name</span>
                                        <span class="payment-vendor-info-value">${escapePaymentHtml(payment.order.vendor.name || 'N/A')}</span>
                                    </div>
                                    <div class="payment-vendor-info-item">
                                        <span class="payment-vendor-info-label">Email</span>
                                        <span class="payment-vendor-info-value">${escapePaymentHtml(payment.order.vendor.email || 'N/A')}</span>
                                    </div>
                                    <div class="payment-vendor-info-item">
                                        <span class="payment-vendor-info-label">Phone</span>
                                        <span class="payment-vendor-info-value">${escapePaymentHtml(payment.order.vendor.phone || 'N/A')}</span>
                                    </div>
                                </div>

                                <div class="payment-card-header" style="margin-top: 18px;">
                                    <h3>Vendor Payment</h3>
                                    <span class="payment-vendor-status-badge ${payment.vendorPaymentStatus || 'pending'}">
                                        <i class="fas ${payment.vendorPaymentStatus === 'paid' ? 'fa-check-circle' : payment.vendorPaymentStatus === 'cancelled' ? 'fa-ban' : 'fa-clock'}"></i>
                                        ${formatPaymentLabel(payment.vendorPaymentStatus || 'pending')}
                                    </span>
                                </div>

                                <div class="payment-vendor-payment-form">
                                    <div class="payment-vendor-form-group">
                                        <label>Amount</label>
                                        <input type="number" id="vendorPaymentAmount" value="${payment.vendorPaymentAmount || 0}" min="0" step="0.01">
                                    </div>
                                    <div class="payment-vendor-form-group">
                                        <label>Status</label>
                                        <select id="vendorPaymentStatus">
                                            <option value="pending" ${payment.vendorPaymentStatus === 'pending' || !payment.vendorPaymentStatus ? 'selected' : ''}>Pending</option>
                                            <option value="paid" ${payment.vendorPaymentStatus === 'paid' ? 'selected' : ''}>Paid</option>
                                            <option value="cancelled" ${payment.vendorPaymentStatus === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                                        </select>
                                    </div>
                                    <div class="payment-vendor-form-group">
                                        <label>Payment Date</label>
                                        <input type="date" id="vendorPaymentDate" value="${payment.vendorPaymentDate ? formatDisplayDateInput(payment.vendorPaymentDate) : ''}">
                                    </div>
                                    <div class="payment-vendor-form-group">
                                        <label>Payment Method</label>
                                        <select id="vendorPaymentMethod">
                                            <option value="">Select Method</option>
                                            <option value="cash" ${payment.vendorPaymentMethod === 'cash' ? 'selected' : ''}>Cash</option>
                                            <option value="bank-transfer" ${payment.vendorPaymentMethod === 'bank-transfer' ? 'selected' : ''}>Bank Transfer</option>
                                            <option value="check" ${payment.vendorPaymentMethod === 'check' ? 'selected' : ''}>Check</option>
                                            <option value="online" ${payment.vendorPaymentMethod === 'online' ? 'selected' : ''}>Online</option>
                                        </select>
                                    </div>
                                    <div class="payment-vendor-form-group" style="grid-column: 1 / -1;">
                                        <label>Notes</label>
                                        <textarea id="vendorPaymentNotes">${escapePaymentHtml(payment.vendorPaymentNotes || '')}</textarea>
                                    </div>
                                </div>

                                <div class="payment-milestone-actions">
                                    <button class="btn btn-primary" type="button" onclick="saveVendorPayment()">
                                        <i class="fas fa-save"></i> Save Vendor Payment
                                    </button>
                                </div>
                            </section>
                        ` : ''}

                        <section class="payment-rich-card payment-milestone-section">
                            <div class="payment-card-header">
                                <div>
                                    <h3>Payment Milestones</h3>
                                    <span class="payment-card-subtext">Create milestones for partial client payments and update each one separately.</span>
                                </div>
                                <span class="payment-card-chip" id="paymentMilestoneCount">${milestoneSummary.milestones.length} milestone${milestoneSummary.milestones.length === 1 ? '' : 's'}</span>
                            </div>

                            <div class="payment-milestone-summary">
                                <div class="payment-milestone-summary-card">
                                    <span>Total Payment</span>
                                    <strong>${escapePaymentHtml(formatPaymentCurrency(payment.amount))}</strong>
                                </div>
                                <div class="payment-milestone-summary-card">
                                    <span>Received</span>
                                    <strong id="paymentReceivedAmount">${escapePaymentHtml(formatPaymentCurrency(milestoneSummary.receivedAmount))}</strong>
                                </div>
                                <div class="payment-milestone-summary-card">
                                    <span>Remaining</span>
                                    <strong id="paymentRemainingAmount">${escapePaymentHtml(formatPaymentCurrency(milestoneSummary.remainingAmount))}</strong>
                                </div>
                            </div>

                            <div class="payment-milestone-progress">
                                <div class="payment-milestone-progress-head">
                                    <span>Collection Progress</span>
                                    <strong id="paymentMilestoneProgress">${Math.round(milestoneSummary.progress)}% Collected</strong>
                                </div>
                                <div class="payment-milestone-progress-track">
                                    <div class="payment-milestone-progress-bar" id="paymentMilestoneProgressBar" style="width: ${milestoneSummary.progress}%"></div>
                                </div>
                            </div>

                            <div class="payment-milestone-actions">
                                <button class="btn btn-secondary" type="button" onclick="addPaymentMilestone()">
                                    <i class="fas fa-plus"></i> Add Milestone
                                </button>
                                <button class="btn btn-primary" type="button" id="savePaymentMilestonesBtn" onclick="savePaymentMilestones()">
                                    <i class="fas fa-save"></i> Save Milestones
                                </button>
                            </div>

                            <div id="paymentMilestoneList"></div>
                        </section>
                    </div>

                    <div class="payment-detail-footer">
                        <button class="btn btn-secondary" type="button" onclick="closePaymentDetail()">
                            <i class="fas fa-times"></i> Close
                        </button>
                    </div>
                </div>
            </div>
        `;

        modal.onclick = (event) => {
            if (event.target === modal) {
                closePaymentDetail();
            }
        };

        document.body.classList.add('payment-detail-open');
        document.removeEventListener('keydown', closePaymentDetailOnEscape);
        document.addEventListener('keydown', closePaymentDetailOnEscape);
        modal.classList.add('show');
        rerenderPaymentMilestones();
    } catch (error) {
        console.error('Failed to load payment details:', error);
        showToast('Failed to load payment details: ' + error.message, 'error');
    }
}

function closePaymentDetail() {
    const modal = document.getElementById('paymentDetailModal');
    if (modal) {
        modal.classList.remove('show');
    }
    currentPaymentDetailData = null;
    document.body.classList.remove('payment-detail-open');
    document.removeEventListener('keydown', closePaymentDetailOnEscape);
}

window.showPaymentDetail = showPaymentDetail;
window.closePaymentDetail = closePaymentDetail;
window.addPaymentMilestone = addPaymentMilestone;
window.removePaymentMilestone = removePaymentMilestone;
window.savePaymentMilestones = savePaymentMilestones;

async function saveEmployeePayment() {
    try {
        const employeePaymentData = {
            employeePaymentAmount: parseFloat(document.getElementById('employeePaymentAmount').value) || 0,
            employeePaymentStatus: document.getElementById('employeePaymentStatus').value,
            employeePaymentDate: document.getElementById('employeePaymentDate').value || null,
            employeePaymentMethod: document.getElementById('employeePaymentMethod').value || null,
            employeePaymentNotes: document.getElementById('employeePaymentNotes').value || ''
        };

        window.AppLogger?.debug('Saving employee payment:', employeePaymentData);
        window.AppLogger?.debug('Payment ID:', currentPaymentDetailData._id);

        // Show loading state
        const saveBtn = document.querySelector('.payment-employee-section .btn-primary');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        }

        const result = await window.APIService.updatePayment(currentPaymentDetailData._id, employeePaymentData);
        window.AppLogger?.debug('Save successful:', result);

        showToast('Employee payment saved.', 'success');
        
        // Refresh the modal with updated data
        await showPaymentDetail(currentPaymentDetailData._id);
        await refreshPayments();
    } catch (error) {
        console.error('Error saving employee payment:', error);
        showToast('Error: ' + error.message, 'error');
        
        // Re-enable button on error
        const saveBtn = document.querySelector('.payment-employee-section .btn-primary');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Employee Payment';
        }
    }
}

window.saveEmployeePayment = saveEmployeePayment;

async function saveVendorPayment() {
    try {
        const vendorPaymentData = {
            vendorPaymentAmount: parseFloat(document.getElementById('vendorPaymentAmount').value) || 0,
            vendorPaymentStatus: document.getElementById('vendorPaymentStatus').value,
            vendorPaymentDate: document.getElementById('vendorPaymentDate').value || null,
            vendorPaymentMethod: document.getElementById('vendorPaymentMethod').value || null,
            vendorPaymentNotes: document.getElementById('vendorPaymentNotes').value || ''
        };

        window.AppLogger?.debug('Saving vendor payment:', vendorPaymentData);
        window.AppLogger?.debug('Payment ID:', currentPaymentDetailData._id);

        // Show loading state
        const saveBtn = document.querySelector('.payment-vendor-section .btn-primary');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        }

        const result = await window.APIService.updatePayment(currentPaymentDetailData._id, vendorPaymentData);
        window.AppLogger?.debug('Save successful:', result);

        showToast('Vendor payment saved.', 'success');
        
        // Refresh the modal with updated data
        await showPaymentDetail(currentPaymentDetailData._id);
        await refreshPayments();
    } catch (error) {
        console.error('Error saving vendor payment:', error);
        showToast('Error: ' + error.message, 'error');
        
        // Re-enable button on error
        const saveBtn = document.querySelector('.payment-vendor-section .btn-primary');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Vendor Payment';
        }
    }
}

window.saveVendorPayment = saveVendorPayment;

// Employee Management Functions
let currentEmployeeId = null;
let currentDetailEmployeeId = null;

function showAddEmployeeModal() {
    currentEmployeeId = null;
    window.currentEmployeeDocuments = [];
    if (window.uploadedFiles) window.uploadedFiles.employee = [];
    document.getElementById('employeeModalTitle').textContent = 'Add New Employee';
    document.getElementById('employeeForm').reset();
    
    // Set default hire date to today
    const today = todayDateInput();
    document.getElementById('employeeHireDate').value = today;
    
    const employeeModal = document.getElementById('employeeModal');
    employeeModal.style.display = '';
    employeeModal.classList.add('show');
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
        docsPreview.replaceChildren();
        
        // Store original documents for comparison
        window.currentEmployeeDocuments = employee.documents || [];
        window.updateDocumentPreview?.('employee', 'employeeDocsPreview');
        
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
        const pendingFiles = [...(window.uploadedFiles?.employee || [])];
        let savedEmployee;
        if (currentEmployeeId) {
            savedEmployee = await window.APIService.updateEmployee(currentEmployeeId, employeeData);
            showToast('Employee updated.', 'success');
        } else {
            savedEmployee = await window.APIService.createEmployee(employeeData);
            showToast('Employee created.', 'success');
        }
        const employeeId = currentEmployeeId || savedEmployee?._id;
        if (pendingFiles.length) {
            await window.uploadEntityAttachments('employee', employeeId, pendingFiles);
            showToast(`${pendingFiles.length} employee document${pendingFiles.length === 1 ? '' : 's'} attached.`, 'success');
        }
        
        // Clear uploaded files and stored documents
        if (window.uploadedFiles) {
            window.uploadedFiles.employee = [];
        }
        window.currentEmployeeDocuments = null;
        
        closeEmployeeModal();
        await refreshEmployees();
        if (currentDetailEmployeeId && document.getElementById('employee-detail')?.classList.contains('active')) {
            await showEmployeeDetail(currentDetailEmployeeId);
        }
    } catch (error) {
        showToast('Failed to save employee: ' + error.message, 'error');
    }
}

async function deleteEmployee(employeeId) {
    if (!confirm('Delete this employee? This action cannot be undone.')) {
        return false;
    }
    
    try {
        await window.APIService.deleteEmployee(employeeId);
        showToast('Employee deleted.', 'success');
        await refreshEmployees();
        return true;
    } catch (error) {
        showToast('Failed to delete employee: ' + error.message, 'error');
        return false;
    }
}

function viewEmployee(employeeId) {
    window.AppLogger?.debug('viewEmployee called with ID:', employeeId);
    showEmployeeDetail(employeeId);
}

async function showEmployeeDetail(employeeId) {
    try {
        window.AppLogger?.debug('Loading employee details for:', employeeId);
        const employee = await window.APIService.getEmployee(employeeId);
        currentDetailEmployeeId = employee._id || employeeId;
        window.AppLogger?.debug('Employee data loaded:', employee);
        
        document.getElementById('employeeDetailName').textContent = employee.name || 'Employee';
        document.getElementById('employeeDetailSummary').textContent = `${formatOrderFilterLabel(employee.role || 'team member')} / ${formatOrderFilterLabel(employee.status || 'status unavailable')}`;
        document.getElementById('detailEmployeeEmail').textContent = employee.email || '-';
        document.getElementById('detailEmployeePhone').textContent = employee.phone || '-';
        document.getElementById('detailEmployeeRole').textContent = employee.role ? formatOrderFilterLabel(employee.role) : '-';
        document.getElementById('detailEmployeeDepartment').textContent = employee.department || '-';
        const employeeStatus = String(employee.status || 'offline');
        document.getElementById('detailEmployeeStatus').innerHTML = `<span class="employee-status-badge ${escapePaymentHtml(employeeStatus)}">${escapePaymentHtml(formatOrderFilterLabel(employeeStatus))}</span>`;
        document.getElementById('detailEmployeeHireDate').textContent = employee.hireDate ? formatDisplayDate(employee.hireDate) : '-';
        document.getElementById('detailEmployeeAddress').textContent = employee.address || '-';
        document.getElementById('detailEmployeeSkills').textContent = employee.skills && employee.skills.length > 0 ? employee.skills.join(', ') : '-';
        
        // Load performance stats
        window.AppLogger?.debug('Loading employee stats...');
        const stats = await window.APIService.getEmployeeStats(employeeId);
        window.AppLogger?.debug('Stats loaded:', stats);
        window.AppLogger?.debug('Stats breakdown:', {
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
            window.AppLogger?.debug('No orders assigned to this employee yet');
        }
        
        const docsList = document.getElementById('employeeDocumentsList');
        if (false && employee.documents && employee.documents.length > 0) {
            docsList.innerHTML = employee.documents.map(doc => `
                <div class="document-item">
                    <div class="document-info">
                        <div class="document-icon">
                            <i class="fas fa-file-${getDocIcon(doc.name)}"></i>
                        </div>
                        <div class="document-details">
                            <div class="document-name">${doc.name}</div>
                            <div class="document-meta">${formatFileSize(doc.size)} • ${formatDisplayDate(doc.uploadedAt)}</div>
                        </div>
                    </div>
                    <div class="document-actions">
                            <button class="btn-icon" onclick="downloadDocument('${doc.url}')" title="Download" aria-label="Download document">
                                <i class="fas fa-download" aria-hidden="true"></i>
                        </button>
                            <button class="btn-icon" onclick="viewDocument('${doc.url}')" title="View" aria-label="View document">
                                <i class="fas fa-eye" aria-hidden="true"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            docsList.innerHTML = '<p class="no-documents">No documents uploaded</p>';
        }
        window.renderAttachmentList(docsList, employee.documents, {
            entityType: 'employee', entityId: employee._id,
            onChanged: () => showEmployeeDetail(employee._id)
        });
        
        window.AppLogger?.debug('Showing employee-detail section');
        showSection('employee-detail');
    } catch (error) {
        console.error('Failed to load employee details:', error);
        showToast('Failed to load employee details: ' + error.message, 'error');
    }
}

function backToEmployees() {
    currentDetailEmployeeId = null;
    showSection('employees');
}

function editCurrentDetailEmployee() {
    if (currentDetailEmployeeId) {
        editEmployee(currentDetailEmployeeId);
    }
}

async function deleteCurrentDetailEmployee() {
    if (!currentDetailEmployeeId) return;

    const deleted = await deleteEmployee(currentDetailEmployeeId);
    if (deleted) {
        backToEmployees();
    }
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
                <td colspan="7" class="employees-empty-state">
                    <i class="fas fa-user-tie"></i>
                    <h3>No Employees Found</h3>
                    <p>Start by adding your first employee</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = employees.map(employee => {
        const employeeId = `#${employee._id.substring(0, 8).toUpperCase()}`;
        
        return `
        <tr onclick="viewEmployee('${employee._id}')">
            <td>
                <div class="employee-identity">
                    <div class="employee-info">
                        <div class="employee-name">${employee.name}</div>
                        <div class="employee-id">${employeeId}</div>
                    </div>
                </div>
            </td>
            <td><a href="mailto:${employee.email}" class="customer-email" onclick="event.stopPropagation()">${employee.email}</a></td>
            <td><span class="customer-phone">${employee.phone || 'N/A'}</span></td>
            <td><span class="employee-role-badge">${employee.role.replace('-', ' ')}</span></td>
            <td><span class="employee-department">${employee.department || 'N/A'}</span></td>
            <td><span class="employee-status-badge ${employee.status}">${employee.status.replace('-', ' ')}</span></td>
            <td><span class="employee-date-cell">${employee.hireDate ? formatDisplayDate(employee.hireDate) : 'N/A'}</span></td>
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
        initializeEmployeeFilters();
        updateEmployeeFilterOptions(allEmployees);
        filterEmployees();
    } catch (error) {
        console.error('Failed to load employees:', error);
        renderEmployeesTable([]);
    } finally {
        const tableContainer = document.querySelector('.employees-table-container');
        if (tableContainer) setTableLoading(tableContainer, false);
    }
}

function initializeEmployeeFilters() {
    if (window.__employeeFiltersInitialized) return;
    window.__employeeFiltersInitialized = true;

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

function updateEmployeeFilterOptions(employees = []) {
    updateSelectOptions('employeeRoleFilter', employees, employee => [employee.role], 'All Roles', [
        ['electrician', 'Electrician'],
        ['plumber', 'Plumber'],
        ['carpenter', 'Carpenter'],
        ['hvac-technician', 'HVAC Technician'],
        ['project-manager', 'Project Manager'],
        ['supervisor', 'Supervisor'],
        ['general-worker', 'General Worker']
    ]);

    updateSelectOptions('employeeStatusFilter', employees, employee => [employee.status], 'All Status', [
        ['available', 'Available'],
        ['busy', 'Busy'],
        ['offline', 'Offline'],
        ['on-leave', 'On Leave']
    ]);
}

function filterEmployees() {
    const searchTerm = normalizeSearchText(document.getElementById('employeeSearchInput')?.value);
    const roleFilter = normalizeFilterValue(document.getElementById('employeeRoleFilter')?.value || 'all');
    const statusFilter = normalizeFilterValue(document.getElementById('employeeStatusFilter')?.value || 'all');
    
    let filtered = allEmployees;
    
    if (searchTerm) {
        filtered = filtered.filter(employee => buildSearchText([
            employee.name,
            employee.email,
            employee.phone,
            employee.role,
            employee.department,
            employee.status,
            employee.skills
        ]).includes(searchTerm));
    }
    
    if (roleFilter !== 'all') {
        filtered = filtered.filter(employee => normalizeFilterValue(employee.role) === roleFilter);
    }
    
    if (statusFilter !== 'all') {
        filtered = filtered.filter(employee => normalizeFilterValue(employee.status) === statusFilter);
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
window.editCurrentDetailEmployee = editCurrentDetailEmployee;
window.deleteCurrentDetailEmployee = deleteCurrentDetailEmployee;

async function archiveExistingAttachment(entityType, entityId, attachment, previewType, previewId) {
    if (!attachment?.documentId) {
        showToast('This legacy document must be migrated before it can be archived.', 'warning');
        return false;
    }
    try {
        await window.archiveEntityAttachment(entityType, entityId, attachment.documentId);
        attachment.status = 'archived';
        window.APIService?.clearCache?.();
        window.updateDocumentPreview?.(previewType, previewId);
        showToast('Document archived. The stored file was retained and can be restored from details.', 'success');
        return true;
    } catch (error) {
        showToast('Failed to archive document: ' + error.message, 'error');
        return false;
    }
}

// Function to remove existing employee document
window.removeExistingEmployeeDoc = async function(index) {
    if (confirm('Are you sure you want to remove this document?')) {
        const attachment = window.currentEmployeeDocuments?.[index];
        await archiveExistingAttachment('employee', currentEmployeeId, attachment, 'employee', 'employeeDocsPreview');
    }
};

// Vendor Management Functions
let currentVendorId = null;
let currentDetailVendorId = null;
let vendorEmailCounter = 1;
let vendorPhoneCounter = 1;
let optimisticVendorSaveCounter = 0;
const optimisticVendorSaves = new Map();

const VENDOR_COMPLIANCE_FIELDS = [
    { key: 'legalBusinessName', id: 'vendorLegalBusinessName', label: 'Full Legal Business Name', type: 'text' },
    { key: 'businessEntityType', id: 'vendorBusinessEntityType', label: 'Business Entity Type', type: 'text' },
    { key: 'primaryOwnerName', id: 'vendorPrimaryOwnerName', label: 'Primary Owner / Operator', type: 'text' },
    { key: 'businessAddress', id: 'vendorBusinessAddress', label: 'Business Address', type: 'text' },
    { key: 'einTaxId', id: 'vendorEinTaxId', label: 'EIN / Tax ID Number', type: 'text' },
    { key: 'contractorLicenseNumber', id: 'vendorContractorLicenseNumber', label: 'Contractor License Number', type: 'text' },
    { key: 'rocLicenseNumber', id: 'vendorRocLicenseNumber', label: 'ROC License Number', type: 'text' },
    { key: 'rocLicenseTypeClassification', id: 'vendorRocLicenseTypeClassification', label: 'ROC License Type / Classification', type: 'text' },
    { key: 'rocLicenseExpirationDate', id: 'vendorRocLicenseExpirationDate', label: 'ROC License Expiration Date', type: 'date' },
    { key: 'insuranceExpirationDate', id: 'vendorInsuranceExpirationDate', label: 'Insurance Expiration Date', type: 'date' }
];

const VENDOR_COMPLIANCE_DOCUMENT_FIELDS = [
    { key: 'huttasContract', inputId: 'vendorHuttasContractFile', previewId: 'vendorHuttasContractPreview', label: 'smplfix Contract with Sub (Signed and Dated)' },
    { key: 'w9', inputId: 'vendorW9File', previewId: 'vendorW9Preview', label: 'W-9 on File (Signed and Dated)' },
    { key: 'certificateOfInsurance', inputId: 'vendorCertificateOfInsuranceFile', previewId: 'vendorCertificateOfInsurancePreview', label: 'Certificate of Insurance on File' },
    { key: 'workersCompInsurance', inputId: 'vendorWorkersCompInsuranceFile', previewId: 'vendorWorkersCompInsurancePreview', label: 'Workers Comp Insurance on File' },
    { key: 'huttasAdditionalInsured', inputId: 'vendorHuttasAdditionalInsuredFile', previewId: 'vendorHuttasAdditionalInsuredPreview', label: 'smplfix Listed as Additional Insured on GL Policy' }
];

let vendorComplianceFiles = {};

function setVendorComplianceFields(vendor = {}) {
    VENDOR_COMPLIANCE_FIELDS.forEach((field) => {
        const el = document.getElementById(field.id);
        if (!el) return;
        if (field.type === 'checkbox') {
            el.checked = Boolean(vendor[field.key]);
        } else if (field.type === 'date') {
            el.value = formatDisplayDateInput(vendor[field.key]);
        } else {
            el.value = vendor[field.key] || '';
            if (field.key === 'einTaxId') {
                el.value = '';
                el.placeholder = vendor.einTaxIdMasked || 'Enter EIN or Tax ID';
            }
        }
    });
}

function getVendorComplianceData() {
    return VENDOR_COMPLIANCE_FIELDS.reduce((data, field) => {
        const el = document.getElementById(field.id);
        if (!el) return data;
        if (field.type === 'checkbox') {
            data[field.key] = el.checked;
        } else if (field.type === 'date') {
            data[field.key] = el.value || null;
        } else {
            data[field.key] = el.value.trim();
        }
        return data;
    }, {});
}

function getVendorComplianceDocuments(documents = []) {
    return VENDOR_COMPLIANCE_DOCUMENT_FIELDS.reduce((map, field) => {
        map[field.key] = (documents || [])
            .filter(doc => doc.complianceDocumentType === field.key && doc.status !== 'archived')
            .at(-1) || null;
        return map;
    }, {});
}

function updateVendorCompliancePreview(field, existingDocument = null) {
    const preview = document.getElementById(field.previewId);
    if (!preview) return;

    const file = vendorComplianceFiles[field.key];
    if (file) {
        preview.innerHTML = `
            <span><i class="fas fa-file-${getFileIcon(file.name)}"></i> ${escapePaymentHtml(file.name)}</span>
            <button type="button" onclick="clearVendorComplianceFile('${field.key}')">Remove</button>
        `;
        preview.classList.add('has-file');
        return;
    }

    if (existingDocument) {
        preview.innerHTML = `
            <span><i class="fas fa-file-${getDocIcon(existingDocument.name)}"></i> ${escapePaymentHtml(existingDocument.name)}</span>
            <button type="button" onclick="clearExistingVendorComplianceDocument('${field.key}')">Remove</button>
        `;
        preview.classList.add('has-file');
        return;
    }

    preview.textContent = 'No file attached';
    preview.classList.remove('has-file');
}

function setVendorComplianceDocumentPreviews(vendor = {}) {
    vendorComplianceFiles = {};
    window.currentVendorDocuments = Array.isArray(vendor.documents) ? vendor.documents : [];
    const complianceDocs = getVendorComplianceDocuments(window.currentVendorDocuments);

    VENDOR_COMPLIANCE_DOCUMENT_FIELDS.forEach((field) => {
        const input = document.getElementById(field.inputId);
        if (input) input.value = '';
        updateVendorCompliancePreview(field, complianceDocs[field.key]);
    });
}

function initializeVendorComplianceUploads() {
    VENDOR_COMPLIANCE_DOCUMENT_FIELDS.forEach((field) => {
        const input = document.getElementById(field.inputId);
        if (!input || input.dataset.boundComplianceUpload === 'true') return;
        const dropZone = input.closest('.vendor-compliance-upload');
        input.dataset.boundComplianceUpload = 'true';
        input.addEventListener('change', () => {
            const file = input.files?.[0] || null;
            if (file) {
                if (window.MAX_UPLOAD_BYTES && file.size > window.MAX_UPLOAD_BYTES) {
                    showToast(`${file.name} is too large. Maximum file size is ${window.MAX_UPLOAD_LABEL || '50MB'}.`, 'error');
                    input.value = '';
                    return;
                }
                vendorComplianceFiles[field.key] = file;
            }
            input.value = '';
            const existingDocs = getVendorComplianceDocuments(window.currentVendorDocuments || []);
            updateVendorCompliancePreview(field, existingDocs[field.key]);
        });
        if (dropZone) {
            ['dragenter', 'dragover'].forEach(eventName => {
                dropZone.addEventListener(eventName, (event) => {
                    event.preventDefault();
                    dropZone.classList.add('is-dragging');
                });
            });
            ['dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, (event) => {
                    event.preventDefault();
                    dropZone.classList.remove('is-dragging');
                });
            });
            dropZone.addEventListener('drop', (event) => {
                const file = event.dataTransfer?.files?.[0] || null;
                if (!file) return;
                if (window.MAX_UPLOAD_BYTES && file.size > window.MAX_UPLOAD_BYTES) {
                    showToast(`${file.name} is too large. Maximum file size is ${window.MAX_UPLOAD_LABEL || '50MB'}.`, 'error');
                    return;
                }
                vendorComplianceFiles[field.key] = file;
                const existingDocs = getVendorComplianceDocuments(window.currentVendorDocuments || []);
                updateVendorCompliancePreview(field, existingDocs[field.key]);
            });
        }
    });
}

function clearVendorComplianceFile(key) {
    delete vendorComplianceFiles[key];
    const field = VENDOR_COMPLIANCE_DOCUMENT_FIELDS.find(item => item.key === key);
    if (!field) return;
    const existingDocs = getVendorComplianceDocuments(window.currentVendorDocuments || []);
    updateVendorCompliancePreview(field, existingDocs[key]);
}

async function clearExistingVendorComplianceDocument(key) {
    const existing = (window.currentVendorDocuments || []).find(doc => doc.complianceDocumentType === key && doc.status !== 'archived');
    if (existing?.documentId && currentVendorId) {
        try {
            await window.archiveEntityAttachment('vendor', currentVendorId, existing.documentId, 'Archived from vendor compliance editor');
            existing.status = 'archived';
            window.APIService?.clearCache?.();
            showToast('Compliance document archived; the stored file was retained.', 'success');
        } catch (error) {
            showToast('Failed to archive compliance document: ' + error.message, 'error');
            return;
        }
    }
    const field = VENDOR_COMPLIANCE_DOCUMENT_FIELDS.find(item => item.key === key);
    if (field) updateVendorCompliancePreview(field, null);
}

function formatVendorComplianceValue(field, value) {
    if (field.type === 'checkbox') {
        return value ? '<span class="vendor-compliance-status complete">Yes</span>' : '<span class="vendor-compliance-status missing">No</span>';
    }
    if (field.type === 'date') {
        return escapePaymentHtml(formatDisplayDate(value));
    }
    return escapePaymentHtml(value || '-');
}

function renderVendorComplianceDetails(vendor = {}) {
    const container = document.getElementById('detailVendorComplianceFields');
    if (!container) return;
    const complianceDocs = getVendorComplianceDocuments(vendor.documents || []);

    const fieldItems = VENDOR_COMPLIANCE_FIELDS.map((field) => `
        <div class="info-item ${field.key === 'businessAddress' ? 'full-width' : ''}">
            <span class="display-label">${escapePaymentHtml(field.label)}:</span>
            <span>${field.key === 'einTaxId'
                ? `<span class="tax-id-row"><span>${escapePaymentHtml(vendor.einTaxIdMasked || '-')}</span>${vendor.einTaxIdMasked ? `<button type="button" class="reveal-tax-id" onclick="revealVendorTaxId('${vendor._id}')">Reveal</button>` : ''}</span>`
                : formatVendorComplianceValue(field, vendor[field.key])}</span>
        </div>
    `).join('');

    const documentItems = VENDOR_COMPLIANCE_DOCUMENT_FIELDS.map((field) => {
        const doc = complianceDocs[field.key];
        return `
            <div class="info-item">
                <span class="display-label">${escapePaymentHtml(field.label)}:</span>
                <span>${doc ? `<button type="button" class="vendor-compliance-document-link" data-compliance-key="${field.key}">${escapePaymentHtml(doc.name)}</button>` : '<span class="vendor-compliance-status missing">Missing</span>'}</span>
            </div>
        `;
    }).join('');

    container.innerHTML = fieldItems + documentItems;
    container.querySelectorAll('[data-compliance-key]').forEach((button) => {
        button.addEventListener('click', async () => {
            const doc = complianceDocs[button.dataset.complianceKey];
            if (!doc) return;
            try {
                await window.openEntityAttachment('vendor', vendor._id, doc, false);
            } catch (error) {
                showToast(error.message, 'error');
            }
        });
    });
}

function getVendorCategorySelection() {
    const categorySelect = document.getElementById('vendorCategory');
    const customCategoryInput = document.getElementById('vendorCategoryCustom');
    let category = categorySelect?.value || '';
    let categoryLabel = categorySelect?.selectedOptions?.[0]?.textContent || category;
    const customCategory = customCategoryInput?.value.trim() || '';

    if (category === '__add_new__') {
        if (!customCategory) {
            return { error: 'Please enter a category name', input: customCategoryInput };
        }
        category = customCategory.toLowerCase().replace(/\s+/g, '-');
        categoryLabel = customCategory;
        if (!categorySelect.querySelector(`[value="${escapeCssSelectorValue(category)}"]`)) {
            const newOption = document.createElement('option');
            newOption.value = category;
            newOption.textContent = customCategory;
            categorySelect.insertBefore(newOption, categorySelect.querySelector('[value="__add_new__"]'));
        }
    }

    return { category, categoryLabel };
}

function escapeCssSelectorValue(value) {
    if (window.CSS?.escape) return CSS.escape(value);
    return String(value || '').replace(/["\\]/g, '\\$&');
}

function collectVendorContactFields() {
    const emails = [];
    const primaryEmail = document.getElementById('vendorEmail')?.value.trim();
    if (primaryEmail) {
        emails.push({ label: 'Primary', address: primaryEmail, isPrimary: true });
    }

    document.querySelectorAll('#vendorEmailsContainer .email-group').forEach((group) => {
        const emailIndex = group.getAttribute('data-vendor-email-index');
        const emailAddress = document.getElementById(`vendorEmail_${emailIndex}`)?.value.trim();
        if (emailAddress) {
            emails.push({
                label: `Email ${emails.length + 1}`,
                address: emailAddress,
                isPrimary: false
            });
        }
    });

    const phones = [];
    const primaryPhone = document.getElementById('vendorPhone')?.value.trim();
    if (primaryPhone) {
        phones.push({ label: 'Primary', number: primaryPhone, isPrimary: true });
    }

    document.querySelectorAll('#vendorPhonesContainer .phone-group').forEach((group) => {
        const phoneIndex = group.getAttribute('data-vendor-phone-index');
        const phoneNumber = document.getElementById(`vendorPhone_${phoneIndex}`)?.value.trim();
        if (phoneNumber) {
            phones.push({
                label: `Phone ${phones.length + 1}`,
                number: phoneNumber,
                isPrimary: false
            });
        }
    });

    return { emails, phones };
}

function buildVendorDraftFromForm() {
    const categoryResult = getVendorCategorySelection();
    if (categoryResult.error) return categoryResult;
    const { emails, phones } = collectVendorContactFields();
    const vendorData = {
        name: document.getElementById('vendorName').value.trim(),
        email: document.getElementById('vendorEmail').value.trim(),
        phone: document.getElementById('vendorPhone').value.trim(),
        address: document.getElementById('vendorAddress').value,
        category: categoryResult.category,
        rating: parseInt(document.getElementById('vendorRating').value, 10),
        isActive: document.getElementById('vendorStatus').value === 'true',
        notes: document.getElementById('vendorNotes').value,
        emails,
        phones,
        customFields: getVendorCustomFields(),
        ...getVendorComplianceData()
    };

    return {
        vendorId: currentVendorId,
        clientId: currentVendorId || `vendor-save-${Date.now()}-${++optimisticVendorSaveCounter}`,
        isEdit: Boolean(currentVendorId),
        vendorData,
        categoryLabel: categoryResult.categoryLabel,
        generalFiles: [...(window.uploadedFiles?.vendor || [])],
        complianceFiles: { ...vendorComplianceFiles },
        existingDocuments: [...(window.currentVendorDocuments || [])],
        customCategory: document.getElementById('vendorCategoryCustom')?.value || '',
        existingVendor: currentVendorId ? (allVendors || window.vendorsData || []).find(v => v._id === currentVendorId) || null : null
    };
}

function getOptimisticVendorDisplayVendor(snapshot) {
    return {
        ...(snapshot.existingVendor || {}),
        ...snapshot.vendorData,
        _id: snapshot.vendorId || snapshot.clientId,
        __optimisticClientId: snapshot.clientId,
        __optimisticVendorSave: true,
        __optimisticProgress: 0,
        __optimisticStatus: 'Saving',
        category: snapshot.vendorData.category || snapshot.categoryLabel || 'pending',
        createdAt: snapshot.existingVendor?.createdAt || new Date().toISOString()
    };
}

function getOptimisticVendorList(baseVendors = []) {
    const vendorMap = new Map((baseVendors || []).map(vendor => [vendor._id, vendor]));
    const createRows = [];

    optimisticVendorSaves.forEach((pending) => {
        const optimisticVendor = {
            ...getOptimisticVendorDisplayVendor(pending.snapshot),
            __optimisticProgress: pending.progress,
            __optimisticStatus: pending.status || 'Saving'
        };

        if (pending.snapshot.isEdit && pending.snapshot.vendorId) {
            const existing = vendorMap.get(pending.snapshot.vendorId);
            vendorMap.set(pending.snapshot.vendorId, { ...(existing || {}), ...optimisticVendor });
        } else {
            createRows.push(optimisticVendor);
        }
    });

    return [...createRows, ...vendorMap.values()];
}

function vendorMatchesCurrentFilters(vendor) {
    const searchTerm = normalizeSearchText(document.getElementById('vendorSearchInput')?.value);
    const categoryFilter = normalizeFilterValue(document.getElementById('vendorCategoryFilter')?.value || 'all');
    const statusFilter = document.getElementById('vendorStatusFilter')?.value || 'all';

    if (searchTerm && !buildSearchText([
        vendor.name,
        vendor.email,
        vendor.emails,
        vendor.phone,
        vendor.phones,
        vendor.category,
        vendor.status,
        vendor.address,
        getLatestNoteText(vendor)
    ]).includes(searchTerm)) {
        return false;
    }

    if (categoryFilter !== 'all' && normalizeFilterValue(vendor.category) !== categoryFilter) {
        return false;
    }

    if (statusFilter !== 'all') {
        if (statusFilter === 'true' || statusFilter === 'false') {
            const isActive = statusFilter === 'true';
            if (getVendorActiveState(vendor) !== isActive) return false;
        } else if ((vendor.onboardingStatus || 'approved') !== statusFilter) {
            return false;
        }
    }

    return true;
}

function renderVendorsWithCurrentFilters() {
    const sourceVendors = Array.isArray(allVendors) && allVendors.length ? allVendors : (window.vendorsData || []);
    const filtered = sourceVendors.filter(vendorMatchesCurrentFilters);
    renderVendorsTable(filtered);
}

function setOptimisticVendorProgress(clientId, progress, status = 'Saving') {
    const pending = optimisticVendorSaves.get(clientId);
    if (!pending) return;
    pending.progress = Math.max(0, Math.min(100, Math.round(progress)));
    pending.status = status;
    renderVendorsWithCurrentFilters();
}

function upsertVendorInLocalLists(vendor) {
    if (!vendor || !vendor._id) return;
    const upsert = (vendors = []) => {
        const index = vendors.findIndex(item => item._id === vendor._id);
        if (index >= 0) {
            vendors[index] = vendor;
            return vendors;
        }
        return [vendor, ...vendors];
    };

    allVendors = upsert([...(allVendors || [])]);
    window.vendorsData = upsert([...(window.vendorsData || [])]);
}

function restoreVendorModalFromSnapshot(snapshot) {
    if (!snapshot) return;
    currentVendorId = snapshot.vendorId || null;
    vendorEmailCounter = 1;
    vendorPhoneCounter = 1;

    initializeVendorComplianceUploads();
    document.getElementById('vendorModalTitle').textContent = snapshot.isEdit ? 'Edit Vendor' : 'Add New Vendor';
    document.getElementById('vendorForm').reset();
    document.getElementById('vendorInviteForm')?.reset();

    const data = snapshot.vendorData || {};
    document.getElementById('vendorName').value = data.name || '';
    document.getElementById('vendorEmail').value = data.email || '';
    document.getElementById('vendorPhone').value = data.phone || '';
    document.getElementById('vendorAddress').value = data.address || '';
    document.getElementById('vendorRating').value = data.rating || 5;
    document.getElementById('vendorStatus').value = String(data.isActive !== false);
    document.getElementById('vendorNotes').value = data.notes || '';

    const categorySelect = document.getElementById('vendorCategory');
    const customInput = document.getElementById('vendorCategoryCustom');
    updateVendorCategoryOptions();
    if (data.category && !categorySelect.querySelector(`[value="${escapeCssSelectorValue(data.category)}"]`)) {
        const addNewOption = categorySelect.querySelector('[value="__add_new__"]');
        const option = document.createElement('option');
        option.value = data.category;
        option.textContent = snapshot.categoryLabel || data.category;
        categorySelect.insertBefore(option, addNewOption);
    }
    categorySelect.value = data.category || '';
    if (customInput) {
        customInput.style.display = 'none';
        customInput.required = false;
        customInput.value = snapshot.customCategory || '';
    }

    setVendorComplianceFields(data);

    const emailContainer = document.getElementById('vendorEmailsContainer');
    const phoneContainer = document.getElementById('vendorPhonesContainer');
    emailContainer.innerHTML = '';
    phoneContainer.innerHTML = '';

    (data.emails || []).slice(1).forEach((email, offset) => {
        const index = offset + 1;
        const emailGroup = document.createElement('div');
        emailGroup.className = 'email-group vendor-extra-field-row';
        emailGroup.setAttribute('data-vendor-email-index', index);
        emailGroup.innerHTML = `
            <div class="form-group">
                <label for="vendorEmail_${index}">Email ${index + 1}</label>
                <input type="email" id="vendorEmail_${index}" class="vendor-email-field" value="${escapePaymentHtml(email.address || '')}">
            </div>
            <button type="button" class="btn-remove-email vendor-remove-row-btn" onclick="removeVendorEmail(${index})" title="Remove email" aria-label="Remove email">
                <i class="fas fa-times" aria-hidden="true"></i>
            </button>
        `;
        emailContainer.appendChild(emailGroup);
        vendorEmailCounter = index + 1;
    });

    (data.phones || []).slice(1).forEach((phone, offset) => {
        const index = offset + 1;
        const phoneGroup = document.createElement('div');
        phoneGroup.className = 'phone-group vendor-extra-field-row';
        phoneGroup.setAttribute('data-vendor-phone-index', index);
        phoneGroup.innerHTML = `
            <div class="form-group">
                <label for="vendorPhone_${index}">Phone ${index + 1}</label>
                <input type="tel" id="vendorPhone_${index}" class="vendor-phone-field" value="${escapePaymentHtml(phone.number || '')}">
            </div>
            <button type="button" class="btn-remove-phone vendor-remove-row-btn" onclick="removeVendorPhone(${index})" title="Remove phone" aria-label="Remove phone">
                <i class="fas fa-times" aria-hidden="true"></i>
            </button>
        `;
        phoneContainer.appendChild(phoneGroup);
        vendorPhoneCounter = index + 1;
    });

    loadVendorCustomFields(data.customFields || []);
    if (window.uploadedFiles) window.uploadedFiles.vendor = [...(snapshot.generalFiles || [])];
    updatePreview('vendor', 'vendorDocsPreview');
    const docsPreview = document.getElementById('vendorDocsPreview');
    const existingGeneralDocuments = (snapshot.existingDocuments || []).filter(doc => !doc.complianceDocumentType);
    if (docsPreview && existingGeneralDocuments.length > 0) {
        docsPreview.insertAdjacentHTML('afterbegin', existingGeneralDocuments.map((doc) => {
            const docIndex = (snapshot.existingDocuments || []).indexOf(doc);
            return `
                <div class="existing-doc-item" data-doc-index="${docIndex}" style="display: flex; align-items: center; justify-content: space-between; padding: 8px; background: #f3f4f6; border-radius: 6px; margin-top: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-file-pdf" style="color: #ef4444;"></i>
                        <span style="font-size: 14px;">${escapePaymentHtml(doc.name || 'Document')}</span>
                    </div>
                        <button type="button" class="btn-remove-doc" onclick="removeExistingVendorDoc(${docIndex})" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;" aria-label="Remove document">
                            <i class="fas fa-trash" aria-hidden="true"></i>
                    </button>
                </div>
            `;
        }).join(''));
    }
    window.currentVendorDocuments = [...(snapshot.existingDocuments || [])];
    vendorComplianceFiles = { ...(snapshot.complianceFiles || {}) };
    setVendorComplianceDocumentPreviews({ documents: window.currentVendorDocuments });
    vendorComplianceFiles = { ...(snapshot.complianceFiles || {}) };
    VENDOR_COMPLIANCE_DOCUMENT_FIELDS.forEach((field) => {
        const existingDocs = getVendorComplianceDocuments(window.currentVendorDocuments || []);
        updateVendorCompliancePreview(field, existingDocs[field.key]);
    });

    document.body.classList.add('vendor-modal-open');
    document.getElementById('vendorModal').style.display = '';
    document.getElementById('vendorModal').classList.add('show');
}

function finishOptimisticVendorSave(clientId, savedVendor) {
    const pending = optimisticVendorSaves.get(clientId);
    if (!pending) return;
    setOptimisticVendorProgress(clientId, 100, 'Saved');
    optimisticVendorSaves.delete(clientId);
    upsertVendorInLocalLists(savedVendor);
    renderVendorsWithCurrentFilters();
}

function failOptimisticVendorSave(clientId, error) {
    const pending = optimisticVendorSaves.get(clientId);
    if (!pending) return;
    optimisticVendorSaves.delete(clientId);
    renderVendorsWithCurrentFilters();
    restoreVendorModalFromSnapshot(pending.snapshot);
    showToast('Failed to save vendor: ' + (error?.message || 'Unknown error'), 'error');
}

async function runOptimisticVendorSave(snapshot) {
    const clientId = snapshot.clientId;
    const vendorData = { ...snapshot.vendorData };
    const generalFiles = [...(snapshot.generalFiles || [])];
    const complianceFiles = { ...(snapshot.complianceFiles || {}) };
    const generalUploadCount = generalFiles.length;
    const complianceUploadCount = Object.values(complianceFiles).filter(Boolean).length;
    const totalUploadCount = generalUploadCount + complianceUploadCount;
    setOptimisticVendorProgress(clientId, 20, snapshot.isEdit ? 'Updating' : 'Creating');
    let savedVendor = snapshot.isEdit
        ? await window.APIService.updateVendor(snapshot.vendorId, vendorData)
        : await window.APIService.createVendor(vendorData);
    const vendorId = snapshot.vendorId || savedVendor?._id;

    if (generalUploadCount) {
        await window.uploadEntityAttachments('vendor', vendorId, generalFiles, {}, (percent) => {
            setOptimisticVendorProgress(clientId, 20 + Math.round(percent * 0.35), `Uploading ${percent}%`);
        });
    }

    let completedCompliance = 0;
    for (const field of VENDOR_COMPLIANCE_DOCUMENT_FIELDS) {
        const file = complianceFiles[field.key];
        if (!file) continue;
        await window.uploadEntityAttachments('vendor', vendorId, [file], {
            complianceDocumentType: field.key,
            complianceDocumentLabel: field.label
        });
        completedCompliance++;
        setOptimisticVendorProgress(clientId, 55 + Math.round((completedCompliance / Math.max(1, complianceUploadCount)) * 30), 'Saving compliance');
    }

    if (totalUploadCount) {
        savedVendor = await window.APIService.getVendor(vendorId);
        const complianceDocs = getVendorComplianceDocuments(savedVendor.documents || []);
        savedVendor = await window.APIService.updateVendor(vendorId, {
            huttasContractSigned: Boolean(complianceDocs.huttasContract),
            huttasContractSignedDate: null,
            w9OnFile: Boolean(complianceDocs.w9),
            w9Date: null,
            certificateOfInsuranceOnFile: Boolean(complianceDocs.certificateOfInsurance),
            workersCompInsuranceOnFile: Boolean(complianceDocs.workersCompInsurance),
            huttasAdditionalInsured: Boolean(complianceDocs.huttasAdditionalInsured)
        });
    }

    setOptimisticVendorProgress(clientId, 92, 'Saving notes');
    if (snapshot.isEdit && vendorData.notes?.trim()) {
        try {
            await window.APIService.addNote('vendors', snapshot.vendorId, vendorData.notes.trim());
        } catch (noteError) {
            console.warn('Vendor saved, but note save failed:', noteError);
            showToast('Vendor saved, but the note could not be added: ' + noteError.message, 'warning');
        }
    }

    setOptimisticVendorProgress(clientId, 98, 'Finalizing');
    finishOptimisticVendorSave(clientId, savedVendor);
    showToast(snapshot.isEdit ? 'Vendor updated.' : 'Vendor created.', 'success');
}

function addVendorEmail() {
    const container = document.getElementById('vendorEmailsContainer');
    const newEmailGroup = document.createElement('div');
    newEmailGroup.className = 'email-group vendor-extra-field-row';
    newEmailGroup.setAttribute('data-vendor-email-index', vendorEmailCounter);
    
    newEmailGroup.innerHTML = `
        <div class="form-group">
            <label for="vendorEmail_${vendorEmailCounter}">Email ${vendorEmailCounter + 1}</label>
            <input type="email" id="vendorEmail_${vendorEmailCounter}" class="vendor-email-field">
        </div>
        <button type="button" class="btn-remove-email vendor-remove-row-btn" onclick="removeVendorEmail(${vendorEmailCounter})" title="Remove email" aria-label="Remove email">
            <i class="fas fa-times" aria-hidden="true"></i>
        </button>
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
    newPhoneGroup.className = 'phone-group vendor-extra-field-row';
    newPhoneGroup.setAttribute('data-vendor-phone-index', vendorPhoneCounter);
    
    newPhoneGroup.innerHTML = `
        <div class="form-group">
            <label for="vendorPhone_${vendorPhoneCounter}">Phone ${vendorPhoneCounter + 1}</label>
            <input type="tel" id="vendorPhone_${vendorPhoneCounter}" class="vendor-phone-field">
        </div>
        <button type="button" class="btn-remove-phone vendor-remove-row-btn" onclick="removeVendorPhone(${vendorPhoneCounter})" title="Remove phone" aria-label="Remove phone">
            <i class="fas fa-times" aria-hidden="true"></i>
        </button>
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
    initializeVendorComplianceUploads();
    document.getElementById('vendorModalTitle').textContent = 'Add New Vendor';
    document.getElementById('vendorForm').reset();
    document.getElementById('vendorInviteForm')?.reset();
    document.getElementById('vendorEntryModeSwitch').hidden = false;
    window.setVendorEntryMode?.('manual', true);
    setVendorComplianceFields({});
    setVendorComplianceDocumentPreviews({ documents: [] });
    renderNotesManager('vendors', '', {}, 'vendorNotes');
    
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
    
    const vendorModal = document.getElementById('vendorModal');
    vendorModal.style.display = '';
    document.body.classList.add('vendor-modal-open');
    vendorModal.classList.add('show');
    requestAnimationFrame(() => document.getElementById('vendorName')?.focus());
}

async function editVendor(vendorId) {
    try {
        currentVendorId = vendorId;
        const vendor = await window.APIService.getVendor(vendorId);
        window.prepareVendorEditMode?.();
        
        document.getElementById('vendorModalTitle').textContent = 'Edit Vendor';
        
        // Populate basic fields
        document.getElementById('vendorName').value = vendor.name || '';
        document.getElementById('vendorEmail').value = vendor.email || '';
        document.getElementById('vendorPhone').value = vendor.phone || '';
        document.getElementById('vendorAddress').value = vendor.address || '';
        document.getElementById('vendorCategory').value = vendor.category || '';
        document.getElementById('vendorRating').value = vendor.rating || 5;
        document.getElementById('vendorStatus').value = vendor.isActive.toString();
        setVendorComplianceFields(vendor);
        renderNotesManager('vendors', vendor._id, vendor, 'vendorNotes');
        
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
                    emailGroup.className = 'email-group vendor-extra-field-row';
                    emailGroup.setAttribute('data-vendor-email-index', index);
                    
                    emailGroup.innerHTML = `
                        <div class="form-group">
                            <label for="vendorEmail_${index}">Email ${index + 1}</label>
                            <input type="email" id="vendorEmail_${index}" class="vendor-email-field" value="${email.address || ''}">
                        </div>
                        <button type="button" class="btn-remove-email vendor-remove-row-btn" onclick="removeVendorEmail(${index})" title="Remove email" aria-label="Remove email">
                            <i class="fas fa-times" aria-hidden="true"></i>
                        </button>
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
                    phoneGroup.className = 'phone-group vendor-extra-field-row';
                    phoneGroup.setAttribute('data-vendor-phone-index', index);
                    
                    phoneGroup.innerHTML = `
                        <div class="form-group">
                            <label for="vendorPhone_${index}">Phone ${index + 1}</label>
                            <input type="tel" id="vendorPhone_${index}" class="vendor-phone-field" value="${phone.number || ''}">
                        </div>
                        <button type="button" class="btn-remove-phone vendor-remove-row-btn" onclick="removeVendorPhone(${index})" title="Remove phone" aria-label="Remove phone">
                            <i class="fas fa-times" aria-hidden="true"></i>
                        </button>
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
        docsPreview.replaceChildren();
        
        // Store original documents for comparison
        window.currentVendorDocuments = vendor.documents || [];
        window.updateDocumentPreview?.('vendor', 'vendorDocsPreview');
        initializeVendorComplianceUploads();
        setVendorComplianceDocumentPreviews(vendor);
        
        document.body.classList.add('vendor-modal-open');
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
    const snapshot = buildVendorDraftFromForm();
    if (snapshot.error) {
        showToast(snapshot.error, 'error');
        snapshot.input?.focus();
        return;
    }

    setButtonLoading(saveBtn, true);
    closeVendorModal();
    setButtonLoading(saveBtn, false);

    optimisticVendorSaves.set(snapshot.clientId, {
        snapshot,
        progress: 0,
        status: snapshot.isEdit ? 'Updating' : 'Creating'
    });
    renderVendorsWithCurrentFilters();

    if (!vendorMatchesCurrentFilters(getOptimisticVendorDisplayVendor(snapshot))) {
        showToast('Vendor is saving in the background and may be hidden by the current filters.', 'info');
    }

    runOptimisticVendorSave(snapshot).catch((error) => {
        console.error('Save vendor error:', error);
        failOptimisticVendorSave(snapshot.clientId, error);
    });
}

async function deleteVendor(vendorId) {
    if (!confirm('Delete this vendor? This action cannot be undone.')) {
        return;
    }
    
    try {
        await window.APIService.deleteVendor(vendorId);
        showToast('Vendor deleted.', 'success');
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
    document.body.classList.remove('vendor-modal-open');
    
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
    vendorComplianceFiles = {};
    VENDOR_COMPLIANCE_DOCUMENT_FIELDS.forEach((field) => {
        const input = document.getElementById(field.inputId);
        if (input) input.value = '';
        updateVendorCompliancePreview(field, null);
    });
    
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
        allVendors = vendors;
        renderVendorsWithCurrentFilters();
    } catch (error) {
        console.error('Failed to refresh vendors:', error);
    }
}

function renderVendorsTable(vendors) {
    const tbody = document.getElementById('vendorsTableBody');
    const visibleVendors = getOptimisticVendorList(vendors || [])
        .filter(vendor => !vendor.__optimisticVendorSave || vendorMatchesCurrentFilters(vendor));
    
    // Store vendors globally for detail view
    window.vendorsData = vendors || [];
    
    // Update stats
    updateVendorStats((allVendors && allVendors.length ? allVendors : vendors) || []);
    
    if (!visibleVendors || visibleVendors.length === 0) {
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
    const sortedVendors = [...visibleVendors].sort((a, b) => {
        if (a.__optimisticVendorSave && !b.__optimisticVendorSave) return -1;
        if (!a.__optimisticVendorSave && b.__optimisticVendorSave) return 1;
        const dateA = new Date(a.createdAt || 0);
        const dateB = new Date(b.createdAt || 0);
        return dateB - dateA; // Newest first
    });
    
    tbody.innerHTML = sortedVendors.map(vendor => {
        const isPending = Boolean(vendor.__optimisticVendorSave);
        const vendorId = isPending && !vendor.__optimisticClientId?.startsWith(vendor._id || '')
            ? 'Pending'
            : `#${String(vendor._id || '').substring(0, 8).toUpperCase()}`;
        const ratingText = `${Number(vendor.rating || 0)}/5`;
        const categoryClass = normalizeFilterValue(vendor.category || 'uncategorized');
        const progress = Math.max(0, Math.min(100, Number(vendor.__optimisticProgress || 0)));
        const onboardingStatus = vendor.onboardingStatus || 'approved';
        const statusCell = isPending
            ? `<div class="vendor-saving-status">
                    <span>${escapePaymentHtml(vendor.__optimisticStatus || 'Saving')} ${progress}%</span>
                    <div class="vendor-save-progress" aria-hidden="true"><span style="width: ${progress}%"></span></div>
               </div>`
            : onboardingStatus !== 'approved'
                ? `<span class="onboarding-status-badge ${escapePaymentHtml(onboardingStatus)}">${escapePaymentHtml(onboardingStatus.replace(/_/g, ' '))}</span>`
                : `<span class="vendor-status-badge ${vendor.isActive ? 'active' : 'inactive'}">${vendor.isActive ? 'Active' : 'Inactive'}</span>`;
        const actionsCell = isPending
            ? `<div class="vendor-actions vendor-actions-disabled"><span class="vendor-saving-action">Saving...</span></div>`
            : `<div class="vendor-actions">
                    <button class="action-btn edit" onclick="editVendor('${vendor._id}')" title="Edit" aria-label="Edit vendor">
                        <i class="fas fa-edit" aria-hidden="true"></i>
                    </button>
                    <button class="action-btn delete" onclick="deleteVendor('${vendor._id}')" title="Delete" aria-label="Delete vendor">
                        <i class="fas fa-trash" aria-hidden="true"></i>
                    </button>
                </div>`;
        
        return `
        <tr class="${isPending ? 'vendor-row-saving' : ''}" ${isPending ? '' : `onclick="showVendorDetail('${vendor._id}')"`}>
            <td>
                <div class="vendor-identity">
                    <div class="vendor-info">
                        <div class="vendor-name">${escapePaymentHtml(vendor.name || 'Unnamed Vendor')}</div>
                        <div class="vendor-id">${escapePaymentHtml(vendorId)}</div>
                    </div>
                </div>
            </td>
            <td>${vendor.email ? `<a href="mailto:${escapePaymentHtml(vendor.email)}" class="customer-email" onclick="event.stopPropagation()">${escapePaymentHtml(vendor.email)}</a>` : '<span class="table-muted">N/A</span>'}</td>
            <td><span class="customer-phone">${escapePaymentHtml(vendor.phone || 'N/A')}</span></td>
            <td><span class="vendor-category-badge ${categoryClass}">${escapePaymentHtml(vendor.category || 'Uncategorized')}</span></td>
            <td><div class="vendor-rating">${ratingText}</div></td>
            <td>${statusCell}</td>
            <td onclick="event.stopPropagation()">
                ${actionsCell}
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
        initializeVendorFilters();
        updateVendorFilterOptions(allVendors);
        filterVendors();
        window.refreshVendorInvitations?.();
    } catch (error) {
        console.error('Failed to load vendors:', error);
        renderVendorsTable([]);
    } finally {
        const tableContainer = document.querySelector('.vendors-table-container');
        if (tableContainer) setTableLoading(tableContainer, false);
    }
}

function initializeVendorFilters() {
    if (window.__vendorFiltersInitialized) return;
    window.__vendorFiltersInitialized = true;

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

function getVendorActiveState(vendor) {
    if (vendor.isActive !== undefined) return Boolean(vendor.isActive);
    return normalizeFilterValue(vendor.status || 'active') !== 'inactive';
}

function updateVendorFilterOptions(vendors = []) {
    updateSelectOptions('vendorCategoryFilter', vendors, vendor => [vendor.category], 'All Categories', [
        ['electrical', 'Electrical'],
        ['plumbing', 'Plumbing'],
        ['civil', 'Civil'],
        ['carpentry', 'Carpentry'],
        ['hvac', 'HVAC'],
        ['painting', 'Painting'],
        ['cleaning', 'Cleaning']
    ]);
}

function filterVendors() {
    const searchTerm = normalizeSearchText(document.getElementById('vendorSearchInput')?.value);
    const categoryFilter = normalizeFilterValue(document.getElementById('vendorCategoryFilter')?.value || 'all');
    const statusFilter = document.getElementById('vendorStatusFilter')?.value || 'all';
    
    let filtered = allVendors;
    
    // Apply search filter
    if (searchTerm) {
        filtered = filtered.filter(vendor => buildSearchText([
            vendor.name,
            vendor.email,
            vendor.emails,
            vendor.phone,
            vendor.phones,
            vendor.category,
            vendor.status,
            vendor.address,
            getLatestNoteText(vendor)
        ]).includes(searchTerm));
    }
    
    // Apply category filter
    if (categoryFilter !== 'all') {
        filtered = filtered.filter(vendor => normalizeFilterValue(vendor.category) === categoryFilter);
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
        if (statusFilter === 'true' || statusFilter === 'false') {
            const isActive = statusFilter === 'true';
            filtered = filtered.filter(vendor => getVendorActiveState(vendor) === isActive);
        } else {
            filtered = filtered.filter(vendor => (vendor.onboardingStatus || 'approved') === statusFilter);
        }
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
window.clearVendorComplianceFile = clearVendorComplianceFile;
window.clearExistingVendorComplianceDocument = clearExistingVendorComplianceDocument;

// Function to remove existing vendor document
window.removeExistingVendorDoc = async function(index) {
    if (confirm('Are you sure you want to remove this document?')) {
        const attachment = window.currentVendorDocuments?.[index];
        await archiveExistingAttachment('vendor', currentVendorId, attachment, 'vendor', 'vendorDocsPreview');
    }
};

// Customer Management Functions
let currentCustomerId = null;
let currentDetailCustomerId = null;
let addressCounter = 1;
let emailCounter = 1;
let phoneCounter = 1;

function appendCustomerRepeatField(type, index, label, value = '') {
    const config = {
        email: { container: 'emailsContainer', group: 'email-group', data: 'emailIndex', prefix: 'customerEmailField_', input: 'input', inputType: 'email', inputClass: 'customer-email-field', remove: 'removeEmailAddress', icon: 'fa-envelope' },
        phone: { container: 'phonesContainer', group: 'phone-group', data: 'phoneIndex', prefix: 'customerPhoneField_', input: 'input', inputType: 'tel', inputClass: 'customer-phone-field', remove: 'removePhoneNumber', icon: 'fa-phone' },
        address: { container: 'addressesContainer', group: 'address-group', data: 'addressIndex', prefix: 'customerAddressField_', input: 'textarea', inputClass: 'customer-address-field', remove: 'removePhysicalAddress', icon: 'fa-location-dot' }
    }[type];
    if (!config) return;

    const container = document.getElementById(config.container);
    if (!container) return;

    const group = document.createElement('div');
    group.className = `${config.group} smpl-repeat-item`;
    group.dataset[config.data] = String(index);

    const heading = document.createElement('div');
    heading.className = 'smpl-repeat-item-heading';
    const fieldLabel = document.createElement('label');
    fieldLabel.htmlFor = `${config.prefix}${index}`;
    fieldLabel.innerHTML = `<i class="fas ${config.icon}" aria-hidden="true"></i> ${label}`;
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = `smpl-remove-field btn-remove-${type}`;
    removeButton.setAttribute('aria-label', `Remove ${label.toLowerCase()}`);
    removeButton.innerHTML = '<i class="fas fa-trash" aria-hidden="true"></i><span>Remove</span>';
    removeButton.addEventListener('click', () => window[config.remove]?.(index));
    heading.append(fieldLabel, removeButton);

    const control = document.createElement(config.input);
    control.id = `${config.prefix}${index}`;
    control.className = config.inputClass;
    if (config.inputType) control.type = config.inputType;
    if (type === 'address') control.rows = 2;
    control.value = value || '';
    group.append(heading, control);
    container.appendChild(group);
}

function addEmailAddress() {
    appendCustomerRepeatField('email', emailCounter, `Email ${emailCounter + 1}`);
    emailCounter++;
}

function removeEmailAddress(index) {
    const emailGroup = document.querySelector(`[data-email-index="${index}"]`);
    if (emailGroup) {
        emailGroup.remove();
    }
}

function addPhoneNumber() {
    appendCustomerRepeatField('phone', phoneCounter, `Phone ${phoneCounter + 1}`);
    phoneCounter++;
}

function removePhoneNumber(index) {
    const phoneGroup = document.querySelector(`[data-phone-index="${index}"]`);
    if (phoneGroup) {
        phoneGroup.remove();
    }
}

function addPhysicalAddress() {
    const currentIndex = addressCounter;
    const addressNumber = document.querySelectorAll('#addressesContainer .address-group').length + 2;
    appendCustomerRepeatField('address', currentIndex, `Address ${addressNumber}`);
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
    window.existingCustomerDocs = [];
    if (window.uploadedFiles) window.uploadedFiles.customer = [];
    addressCounter = 1;
    emailCounter = 1;
    phoneCounter = 1;
    document.getElementById('customerModalTitle').textContent = 'Add New Customer';
    document.getElementById('customerModalEyebrow').textContent = 'Customer record';
    document.getElementById('customerModalDescription').textContent = 'Create a complete customer profile for orders, communication, and service history.';
    document.getElementById('customerModalSubmit').innerHTML = '<i class="fas fa-plus" aria-hidden="true"></i> Create customer';
    document.getElementById('customerForm').reset();
    renderNotesManager('customers', '', {}, 'customerNotes');
    
    // Clear the containers
    const addressContainer = document.getElementById('addressesContainer');
    const emailContainer = document.getElementById('emailsContainer');
    const phoneContainer = document.getElementById('phonesContainer');
    addressContainer.innerHTML = '';
    emailContainer.innerHTML = '';
    phoneContainer.innerHTML = '';
    
    // Clear custom fields
    clearCustomerCustomFields();
    
    const customerModal = document.getElementById('customerModal');
    customerModal.style.display = '';
    customerModal.setAttribute('aria-hidden', 'false');
    customerModal.classList.add('show');
}

async function editCustomer(customerId) {
    try {
        currentCustomerId = customerId;
        const customer = await window.APIService.getCustomer(customerId);
        
        document.getElementById('customerModalTitle').textContent = 'Edit Customer';
        document.getElementById('customerModalEyebrow').textContent = 'Customer record';
        document.getElementById('customerModalDescription').textContent = 'Update contact details, service locations, documents, and account information.';
        document.getElementById('customerModalSubmit').innerHTML = '<i class="fas fa-check" aria-hidden="true"></i> Save changes';
        
        // Populate basic fields
        document.getElementById('customerNameField').value = customer.name || '';
        document.getElementById('customerType').value = customer.customerType || 'one-time';
        document.getElementById('customerStatus').value = customer.status || 'active';
        renderNotesManager('customers', customer._id, customer, 'customerNotes');
        
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
                appendCustomerRepeatField('address', currentIndex, `Address ${i + 1}`, addr.address || '');
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
                appendCustomerRepeatField('email', emailCounter, `Email ${i + 1}`, email.address || '');
                emailCounter++;
            }
        }
        
        // Populate additional phones (skip first one as it's already in primary field)
        if (customer.phones && customer.phones.length > 1) {
            for (let i = 1; i < customer.phones.length; i++) {
                const phone = customer.phones[i];
                appendCustomerRepeatField('phone', phoneCounter, `Phone ${i + 1}`, phone.number || '');
                phoneCounter++;
            }
        }
        
        // Load custom fields
        loadCustomerCustomFields(customer.customFields || []);
        
        // Clear and populate documents
        if (window.uploadedFiles) {
            window.uploadedFiles.customer = [];
        }
        const preview = document.getElementById('customerDocsPreview');
        if (preview) preview.replaceChildren();
        window.existingCustomerDocs = Array.isArray(customer.documents) ? customer.documents : [];
        window.updateDocumentPreview?.('customer', 'customerDocsPreview');
        
        document.getElementById('customerModal').setAttribute('aria-hidden', 'false');
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
    
    window.AppLogger?.debug('=== SAVING CUSTOMER ===');
    window.AppLogger?.debug('Custom fields being saved:', customerData.customFields);
    
    // For backward compatibility, set primary address fields
    if (addresses.length > 0) {
        customerData.address = addresses[0].address;
        customerData.city = addresses[0].city;
        customerData.state = addresses[0].state;
        customerData.zipCode = addresses[0].zipCode;
    }
    
    try {
        const pendingFiles = [...(window.uploadedFiles?.customer || [])];
        let savedCustomer;
        if (currentCustomerId) {
            updateLoadingMessage('Updating customer...');
            savedCustomer = await window.APIService.updateCustomer(currentCustomerId, customerData);
            if (document.getElementById('customerNotes')?.value.trim()) {
                await addNoteEntry('customers', currentCustomerId, 'customerNotes');
            }
            showToast('Customer updated.', 'success');
        } else {
            updateLoadingMessage('Creating customer...');
            savedCustomer = await window.APIService.createCustomer(customerData);
            showToast('Customer created.', 'success');
        }
        const customerId = currentCustomerId || savedCustomer?._id;
        if (pendingFiles.length) {
            updateLoadingMessage('Attaching customer documents...');
            await window.uploadEntityAttachments('customer', customerId, pendingFiles);
            showToast(`${pendingFiles.length} customer document${pendingFiles.length === 1 ? '' : 's'} attached.`, 'success');
        }
        
        // Clear uploaded files
        if (window.uploadedFiles) {
            window.uploadedFiles.customer = [];
        }
        
        closeCustomerModal();
        await refreshCustomers();
        if (currentDetailCustomerId && document.getElementById('customer-profile')?.classList.contains('active')) {
            await showCustomerProfile(currentDetailCustomerId);
        }
    } catch (error) {
        showToast('Failed to save customer: ' + error.message, 'error');
    } finally {
        setButtonLoading(saveBtn, false);
        hideLoading();
    }
}

async function deleteCustomer(customerId) {
    if (!confirm('Delete this customer? This action cannot be undone.')) {
        return false;
    }
    
    try {
        await window.APIService.deleteCustomer(customerId);
        showToast('Customer deleted.', 'success');
        await refreshCustomers();
        return true;
    } catch (error) {
        showToast('Failed to delete customer: ' + error.message, 'error');
        return false;
    }
}

function viewCustomer(customerId) {
    showCustomerProfile(customerId);
}

async function showCustomerProfile(customerId) {
    try {
        const profileData = await window.APIService.getCustomerProfile(customerId);
        currentDetailCustomerId = profileData.customer._id || customerId;
        
        // Hide customers section, show profile section
        document.getElementById('customers').classList.remove('active');
        document.getElementById('customer-profile').classList.add('active');
        
        // Update menu
        document.querySelectorAll('.menu-item').forEach(mi => mi.classList.remove('active'));
        
        // Populate customer info
        const customerName = String(profileData.customer.name || 'Customer').trim();
        document.getElementById('customerProfileName').textContent = customerName;
        const customerTypeLabel = profileData.customer.customerType === 'hoa'
            ? 'HOA'
            : formatOrderFilterLabel(profileData.customer.customerType || 'customer');
        const customerStatusLabel = formatOrderFilterLabel(profileData.customer.status || 'status unavailable');
        document.getElementById('customerProfileSummary').textContent = `${customerTypeLabel} account / ${customerStatusLabel}`;
        
        // Display all emails
        const emailElement = document.getElementById('customerProfileEmail');
        if (profileData.customer.emails && profileData.customer.emails.length > 0) {
            emailElement.innerHTML = profileData.customer.emails.map((email, index) => 
                `<span class="customer-profile-value-line"><strong>${escapePaymentHtml(email.label || 'Email ' + (index + 1))}</strong>${escapePaymentHtml(email.address || '-')}</span>`
            ).join('');
        } else {
            emailElement.textContent = profileData.customer.email || '-';
        }
        
        // Display all phones
        const phoneElement = document.getElementById('profilePhone');
        if (profileData.customer.phones && profileData.customer.phones.length > 0) {
            phoneElement.innerHTML = profileData.customer.phones.map((phone, index) => 
                `<span class="customer-profile-value-line"><strong>${escapePaymentHtml(phone.label || 'Phone ' + (index + 1))}</strong>${escapePaymentHtml(phone.number || '-')}</span>`
            ).join('');
        } else {
            phoneElement.textContent = profileData.customer.phone || '-';
        }
        
        // Display all addresses
        const addressElement = document.getElementById('profileAddress');
        if (profileData.customer.addresses && profileData.customer.addresses.length > 0) {
            addressElement.innerHTML = profileData.customer.addresses.map((addr, index) => 
                `<span class="customer-profile-value-line"><strong>${escapePaymentHtml(addr.label || 'Address ' + (index + 1))}</strong>${escapePaymentHtml(addr.address || '-')}</span>`
            ).join('');
        } else {
            addressElement.textContent = profileData.customer.address || '-';
        }
        
        document.getElementById('profileType').textContent = profileData.customer.customerType === 'hoa'
            ? 'HOA'
            : formatFilterLabel(profileData.customer.customerType || '-');
        document.getElementById('profileStatus').textContent = profileData.customer.status || '-';
        renderNotesManager('customers', profileData.customer._id, profileData.customer, 'profileCustomerNoteComposer');
        
        // Display custom fields
        window.AppLogger?.debug('Customer custom fields:', profileData.customer.customFields);
        const customFieldsContainer = document.getElementById('profileCustomFields');
        window.AppLogger?.debug('Custom fields container found:', customFieldsContainer);
        if (profileData.customer.customFields && profileData.customer.customFields.length > 0) {
            window.AppLogger?.debug('Displaying', profileData.customer.customFields.length, 'custom fields');
            customFieldsContainer.innerHTML = profileData.customer.customFields.map(field => 
                `<div class="info-item">
                    <span class="display-label">${escapePaymentHtml(field.name || 'Custom field')}</span>
                    <span>${escapePaymentHtml(field.value || '-')}</span>
                </div>`
            ).join('');
            customFieldsContainer.hidden = false;
        } else {
            window.AppLogger?.debug('No custom fields to display');
            customFieldsContainer.hidden = true;
        }
        
        // Populate stats
        document.getElementById('profileTotalOrders').textContent = profileData.stats.totalOrders;
        document.getElementById('profileCompletedOrders').textContent = profileData.stats.completedOrders;
        document.getElementById('profileActiveOrders').textContent = profileData.stats.activeOrders;
        document.getElementById('profileTotalSpent').textContent = `$${profileData.stats.totalSpent.toLocaleString()}`;
        
        // Populate orders table
        const ordersBody = document.getElementById('profileOrdersBody');
        if (profileData.orders.length === 0) {
            ordersBody.innerHTML = '<tr class="profile-orders-empty"><td colspan="6">No orders found</td></tr>';
        } else {
            ordersBody.innerHTML = profileData.orders.map(order => {
                const statusDisplay = order.workflowStatus ? formatOrderFilterLabel(order.workflowStatus) : (order.pipelineStage || (order.status || 'new').replace('-', ' '));
                const statusClass = getOrderStatusBadgeClass(order);
                return `
                <tr>
                    <td><strong>${order.workOrderNumber || '-'}</strong></td>
                    <td>${order.orderId}</td>
                    <td>${order.service}</td>
                    <td><div class="order-status-stack"><span class="order-status-badge ${statusClass}">${statusDisplay}</span>${order.workflowStatus ? `<small>${formatOrderFilterLabel(order.status || 'new')}</small>` : ''}</div></td>
                    <td>${order.pricingStatus === 'unquoted' ? 'Unquoted' : `$${Number(order.amount || 0).toLocaleString()}`}</td>
                    <td>${formatDisplayDate(order.createdAt)}</td>
                </tr>
            `;
            }).join('');
        }
        
        // Populate documents
        const docsList = document.getElementById('customerDocumentsList');
        if (false && profileData.customer.documents && profileData.customer.documents.length > 0) {
            docsList.innerHTML = profileData.customer.documents.map(doc => `
                <div class="document-item">
                    <div class="document-info">
                        <div class="document-icon">
                            <i class="fas fa-file-${getDocIcon(doc.name)}"></i>
                        </div>
                        <div class="document-details">
                            <div class="document-name">${doc.name}</div>
                            <div class="document-meta">${formatFileSize(doc.size)} • ${formatDisplayDate(doc.uploadedAt)}</div>
                        </div>
                    </div>
                    <div class="document-actions">
                            <button class="btn-icon" onclick="downloadDocument('${doc.url}')" title="Download" aria-label="Download document">
                                <i class="fas fa-download" aria-hidden="true"></i>
                        </button>
                            <button class="btn-icon" onclick="viewDocument('${doc.url}')" title="View" aria-label="View document">
                                <i class="fas fa-eye" aria-hidden="true"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            docsList.innerHTML = '<p class="no-documents">No documents uploaded</p>';
        }
        window.renderAttachmentList(docsList, profileData.customer.documents, {
            entityType: 'customer', entityId: profileData.customer._id,
            onChanged: () => showCustomerProfile(profileData.customer._id)
        });
    } catch (error) {
        console.error('Failed to load customer profile:', error);
        showToast('Failed to load customer profile: ' + error.message, 'error');
    }
}

function backToCustomers() {
    currentDetailCustomerId = null;
    document.getElementById('customer-profile').classList.remove('active');
    document.getElementById('customers').classList.add('active');
    
    // Update menu
    document.querySelectorAll('.menu-item').forEach(mi => mi.classList.remove('active'));
    document.querySelector('[data-section="customers"]').parentElement.classList.add('active');
}

function editCurrentDetailCustomer() {
    if (currentDetailCustomerId) {
        editCustomer(currentDetailCustomerId);
    }
}

async function deleteCurrentDetailCustomer() {
    if (!currentDetailCustomerId) return;

    const deleted = await deleteCustomer(currentDetailCustomerId);
    if (deleted) {
        backToCustomers();
    }
}

function closeCustomerModal() {
    document.getElementById('customerModal').classList.remove('show');
    document.getElementById('customerModal').setAttribute('aria-hidden', 'true');
    
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
    window.existingCustomerDocs = [];
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
                <td colspan="7" class="customers-empty-state">
                    <i class="fas fa-users"></i>
                    <h3>No Customers Found</h3>
                    <p>Start by adding your first customer</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = customers.map(customer => {
        const customerId = `#${customer._id.substring(0, 8).toUpperCase()}`;
        
        return `
        <tr onclick="viewCustomer('${customer._id}')">
            <td>
                <div class="customer-identity">
                    <div class="customer-info">
                        <div class="customer-name">${customer.name}</div>
                        <div class="customer-id">${customerId}</div>
                    </div>
                </div>
            </td>
            <td><a href="mailto:${customer.email}" class="customer-email" onclick="event.stopPropagation()">${customer.email}</a></td>
            <td><span class="customer-phone">${customer.phone || 'N/A'}</span></td>
            <td>${customer.city || 'N/A'}</td>
            <td><span class="customer-type-badge ${customer.customerType}">${customer.customerType === 'hoa' ? 'HOA' : formatFilterLabel(customer.customerType)}</span></td>
            <td><span class="customer-status-badge ${customer.status}">${customer.status}</span></td>
            <td><span class="customer-orders-count">${customer.totalOrders || 0}</span></td>
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
                const orderCustomer = order.customer || {};
                const customerId = order.customerId || orderCustomer._id || order.customer;
                const customerEmail = orderCustomer.email;
                const customerName = orderCustomer.name || (typeof order.customer === 'string' ? order.customer : '');

                return String(customerId || '') === String(customer._id || '') ||
                    (!!customerEmail && !!customer.email && String(customerEmail).toLowerCase() === String(customer.email).toLowerCase()) ||
                    (!!customerName && !!customer.name && String(customerName).toLowerCase() === String(customer.name).toLowerCase());
            }).length;
        });
        
        initializeCustomerFilters();
        updateCustomerFilterOptions(allCustomers);
        filterCustomers();
    } catch (error) {
        console.error('Failed to load customers:', error);
        renderCustomersTable([]);
    } finally {
        const tableContainer = document.querySelector('.customers-table-container');
        if (tableContainer) setTableLoading(tableContainer, false);
    }
}

function initializeCustomerFilters() {
    if (window.__customerFiltersInitialized) return;
    window.__customerFiltersInitialized = true;

    const searchInput = document.getElementById('customersToolbarSearchInput');
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

function updateCustomerFilterOptions(customers = []) {
    updateSelectOptions('customerTypeFilter', customers, customer => [customer.customerType], 'All Types', [
        ['recurring', 'Recurring'],
        ['one-time', 'One-time'],
        ['residential', 'Residential'],
        ['commercial', 'Commercial'],
        ['government', 'Government'],
        ['hoa', 'HOA']
    ]);

    updateSelectOptions('customerStatusFilter', customers, customer => [customer.status], 'All Status', [
        ['active', 'Active'],
        ['inactive', 'Inactive']
    ]);
}

function filterCustomers() {
    const searchTerm = normalizeSearchText(document.getElementById('customersToolbarSearchInput')?.value);
    const typeFilter = normalizeFilterValue(document.getElementById('customerTypeFilter')?.value || 'all');
    const statusFilter = normalizeFilterValue(document.getElementById('customerStatusFilter')?.value || 'all');
    
    let filtered = allCustomers;
    
    // Apply search filter
    if (searchTerm) {
        filtered = filtered.filter(customer => buildSearchText([
            customer.name,
            customer.email,
            customer.emails,
            customer.phone,
            customer.phones,
            customer.address,
            customer.addresses,
            customer.customerType,
            customer.status,
            getLatestNoteText(customer)
        ]).includes(searchTerm));
    }
    
    // Apply type filter
    if (typeFilter !== 'all') {
        filtered = filtered.filter(customer => normalizeFilterValue(customer.customerType) === typeFilter);
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
        filtered = filtered.filter(customer => normalizeFilterValue(customer.status) === statusFilter);
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
window.editCurrentDetailCustomer = editCurrentDetailCustomer;
window.deleteCurrentDetailCustomer = deleteCurrentDetailCustomer;
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

window.removeExistingOrderDoc = async function(index) {
    if (confirm('Are you sure you want to remove this document?')) {
        const attachment = window.existingOrderDocs?.[index];
        await archiveExistingAttachment('order', currentOrderId, attachment, 'order', 'orderDocsPreview');
    }
};

window.removeExistingCustomerDoc = async function(index) {
    if (confirm('Are you sure you want to remove this document?')) {
        const attachment = window.existingCustomerDocs?.[index];
        await archiveExistingAttachment('customer', currentCustomerId, attachment, 'customer', 'customerDocsPreview');
    }
};

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
    const revenueTotal = document.getElementById('filteredOrdersRevenue');
    const costTotal = document.getElementById('filteredOrdersCost');
    const profitTotal = document.getElementById('filteredOrdersProfit');
    const formatMoney = (value) => `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    
    if (totalCount) totalCount.textContent = orders.length;
    if (activeCount) {
        const activeOrders = orders.filter(o => ['new', 'in-progress'].includes(o.status)).length;
        activeCount.textContent = activeOrders;
    }
    const revenue = orders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
    const cost = orders.reduce((sum, order) => sum + Number(order.vendorCost || 0), 0);
    const profit = revenue - cost;

    if (revenueTotal) revenueTotal.textContent = formatMoney(revenue);
    if (costTotal) costTotal.textContent = formatMoney(cost);
    if (profitTotal) profitTotal.textContent = formatMoney(profit);
}

// Order search and filter functionality
let allOrders = [];
let serviceSuggestionActiveIndex = -1;
let serviceSuggestionsInitialized = false;

function getPreviousOrderServices() {
    const sources = [
        ...(Array.isArray(allOrders) ? allOrders : []),
        ...(Array.isArray(window.dashboard?.data?.orders) ? window.dashboard.data.orders : [])
    ];
    const services = new Map();

    sources.forEach(order => {
        const label = String(order?.service || '').trim();
        if (!label) return;
        const key = label.toLowerCase();
        const existing = services.get(key);
        services.set(key, {
            label: existing?.label || label,
            count: (existing?.count || 0) + 1
        });
    });

    return [...services.values()]
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
        .slice(0, 16);
}

function renderServiceSuggestions(query = '') {
    const input = document.getElementById('service');
    const panel = document.getElementById('serviceSuggestions');
    if (!input || !panel) return;

    const normalizedQuery = String(query || '').trim().toLowerCase();
    const matches = getPreviousOrderServices()
        .filter(item => !normalizedQuery || item.label.toLowerCase().includes(normalizedQuery))
        .slice(0, 8);

    serviceSuggestionActiveIndex = -1;
    if (!matches.length) {
        panel.classList.remove('show');
        panel.innerHTML = '';
        input.setAttribute('aria-expanded', 'false');
        return;
    }

    panel.innerHTML = matches.map((item, index) => `
        <button type="button" class="service-suggestion-option" role="option" data-index="${index}" data-service="${escapePaymentHtml(item.label)}">
            <span>${escapePaymentHtml(item.label)}</span>
            <small>${item.count.toLocaleString()} order${item.count === 1 ? '' : 's'}</small>
        </button>
    `).join('');
    panel.classList.add('show');
    input.setAttribute('aria-expanded', 'true');
}

function closeServiceSuggestions() {
    const panel = document.getElementById('serviceSuggestions');
    const input = document.getElementById('service');
    if (panel) {
        panel.classList.remove('show');
        panel.innerHTML = '';
    }
    if (input) input.setAttribute('aria-expanded', 'false');
    serviceSuggestionActiveIndex = -1;
}

function chooseServiceSuggestion(button) {
    const input = document.getElementById('service');
    if (!input || !button) return;
    input.value = button.dataset.service || button.textContent.trim();
    input.focus();
    closeServiceSuggestions();
}

function setActiveServiceSuggestion(nextIndex) {
    const options = [...document.querySelectorAll('#serviceSuggestions .service-suggestion-option')];
    if (!options.length) return;
    serviceSuggestionActiveIndex = (nextIndex + options.length) % options.length;
    options.forEach((option, index) => option.classList.toggle('active', index === serviceSuggestionActiveIndex));
    options[serviceSuggestionActiveIndex].scrollIntoView({ block: 'nearest' });
}

function initializeServiceSuggestions() {
    const input = document.getElementById('service');
    const panel = document.getElementById('serviceSuggestions');
    if (!input || !panel || serviceSuggestionsInitialized) return;
    serviceSuggestionsInitialized = true;

    input.addEventListener('focus', () => renderServiceSuggestions(input.value));
    input.addEventListener('input', () => renderServiceSuggestions(input.value));
    input.addEventListener('keydown', event => {
        const panelOpen = panel.classList.contains('show');
        if (!panelOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            renderServiceSuggestions(input.value);
            event.preventDefault();
            return;
        }
        if (!panelOpen) return;
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveServiceSuggestion(serviceSuggestionActiveIndex + 1);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveServiceSuggestion(serviceSuggestionActiveIndex - 1);
        } else if (event.key === 'Enter' && serviceSuggestionActiveIndex >= 0) {
            event.preventDefault();
            chooseServiceSuggestion(panel.querySelectorAll('.service-suggestion-option')[serviceSuggestionActiveIndex]);
        } else if (event.key === 'Escape') {
            closeServiceSuggestions();
        }
    });

    panel.addEventListener('mousedown', event => {
        const button = event.target.closest('.service-suggestion-option');
        if (!button) return;
        event.preventDefault();
        chooseServiceSuggestion(button);
    });

    document.addEventListener('mousedown', event => {
        if (event.target.closest('.service-suggestion-field')) return;
        closeServiceSuggestions();
    });
}

function workflowDeliveryBadge(label, state) {
    const status = state?.status || 'pending';
    const classes = status === 'sent' || status === 'skipped' ? 'success' : status === 'permanently_failed' ? 'error' : status === 'retry_scheduled' ? 'warning' : 'info';
    const text = status.replaceAll('_', ' ');
    return `<span class="workflow-badge ${classes}"><i class="fas ${status === 'sent' ? 'fa-check-circle' : status === 'permanently_failed' ? 'fa-exclamation-circle' : 'fa-clock'}"></i>${escapePaymentHtml(label)}: ${escapePaymentHtml(text)}</span>`;
}

function renderWorkflowCenter(intakes) {
    const list = document.getElementById('workflowRequestList');
    if (!list) return;
    const rows = Array.isArray(intakes) ? intakes : [];
    const reviewCount = rows.filter(item => item.completionStatus !== 'completed' || item.requiresReview || item.orderId?.missingData?.serviceCategory || item.orderId?.missingData?.serviceAddress).length;
    const emailIssueCount = rows.filter(item => ['retry_scheduled', 'permanently_failed'].includes(item.customerConfirmation?.status) || ['retry_scheduled', 'permanently_failed'].includes(item.operationsAlert?.status)).length;
    document.getElementById('workflowTotalCount').textContent = rows.length.toLocaleString();
    document.getElementById('workflowReviewCount').textContent = reviewCount.toLocaleString();
    document.getElementById('workflowEmailIssueCount').textContent = emailIssueCount.toLocaleString();
    const navBadge = document.getElementById('workflowNavBadge');
    if (navBadge) {
        navBadge.textContent = rows.length.toLocaleString();
        navBadge.hidden = rows.length === 0;
    }

    if (!rows.length) {
        list.innerHTML = '<div class="workflow-empty"><i class="fas fa-inbox"></i><p>No website requests have been received.</p></div>';
        return;
    }

    list.innerHTML = rows.map(item => {
        const customer = item.normalizedCustomer || {};
        const linkedOrderId = String(item.orderId?._id || item.orderId || '').trim();
        const received = item.receivedAt ? (tz() ? tz().formatDateTimeMDT?.(item.receivedAt) || tz().formatDateMDT(item.receivedAt) : new Date(item.receivedAt).toLocaleString()) : '-';
        const candidates = Array.isArray(item.matchingCustomerIds) ? item.matchingCustomerIds : [];
        const select = item.customerMatchReason === 'multiple_email_matches'
            ? `<select id="workflowCustomer-${item._id}" aria-label="Select matching customer"><option value="">Select matching customer</option>${candidates.map(candidate => `<option value="${escapePaymentHtml(candidate._id)}">${escapePaymentHtml(candidate.name)} · ${escapePaymentHtml(candidate.phone || 'No phone')}</option>`).join('')}</select>`
            : '';
        const reviewLabel = item.customerMatchReason === 'multiple_email_matches' ? 'Multiple email matches' : item.customerMatchReason === 'email_match_phone_mismatch' ? 'Phone differs from customer' : item.customerId ? 'Customer linked' : 'New customer';
        const customerFailed = item.customerConfirmation?.status === 'permanently_failed';
        const operationsFailed = item.operationsAlert?.status === 'permanently_failed';
        const completionDone = item.completionStatus === 'completed';
        const missingBadges = [
            item.orderId?.missingData?.serviceAddress ? '<span class="workflow-badge warning"><i class="fas fa-map-marker-alt"></i> Missing service address</span>' : '',
            item.orderId?.missingData?.serviceCategory ? '<span class="workflow-badge warning"><i class="fas fa-tools"></i> Missing category</span>' : ''
        ].filter(Boolean).join('');
        const stageTwoBlockers = [!completionDone ? 'Waiting for customer details' : '', item.requiresReview ? 'Resolve customer review' : '', item.orderId?.missingData?.serviceAddress ? 'Add service address' : '', item.orderId?.missingData?.serviceCategory ? 'Add service category' : ''].filter(Boolean);
        const blockerMessage = !linkedOrderId ? 'This intake is not linked to an Order' : stageTwoBlockers.join(' · ');
        const primaryAction = stageTwoBlockers.length || !linkedOrderId
            ? `<button type="button" class="btn-primary" ${linkedOrderId ? `data-workflow-order="${escapePaymentHtml(linkedOrderId)}"` : 'disabled'} title="${escapePaymentHtml(blockerMessage)}"><i class="fas fa-clipboard-check"></i> ${linkedOrderId ? 'Complete Missing Information' : 'Order unavailable'}</button>`
            : `<button type="button" class="btn-primary" data-stage-two="${escapePaymentHtml(linkedOrderId)}"><i class="fas fa-arrow-right"></i> Start Quote Collection</button>`;
        return `<article class="workflow-request-card" data-workflow-state="${completionDone ? 'completed' : 'waiting'}">
            <div class="workflow-card-head">
                <div><span class="workflow-reference">${escapePaymentHtml(item.requestReference)}</span><h3>${escapePaymentHtml(customer.name || 'Customer')}</h3></div>
                <time class="workflow-received" datetime="${escapePaymentHtml(item.receivedAt || '')}">${escapePaymentHtml(received)}</time>
            </div>
            <div class="workflow-intake-layout">
                <div class="workflow-intake-main">
                    <div class="workflow-contact"><span><i class="fas fa-envelope"></i> ${escapePaymentHtml(customer.email || '-')}</span><span><i class="fas fa-phone"></i> ${escapePaymentHtml(customer.phone || '-')}</span></div>
                    <details class="workflow-details-disclosure">
                        <summary>Customer service details</summary>
                        <div class="workflow-details">${escapePaymentHtml(item.formSnapshot?.serviceDetails || 'No service details provided.')}</div>
                    </details>
                    <div class="workflow-intake-checklist">
                        <h4>Intake checklist</h4>
                        <span class="workflow-intake-check ${item.orderId?.missingData?.serviceCategory ? 'is-missing' : ''}"><i class="fas ${item.orderId?.missingData?.serviceCategory ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i>${item.orderId?.missingData?.serviceCategory ? 'Service category is required' : 'Service category completed'}</span>
                        <span class="workflow-intake-check ${item.orderId?.missingData?.serviceAddress ? 'is-missing' : ''}"><i class="fas ${item.orderId?.missingData?.serviceAddress ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i>${item.orderId?.missingData?.serviceAddress ? 'Service address is required' : 'Service address completed'}</span>
                        <span class="workflow-intake-check ${item.requiresReview ? 'is-missing' : ''}"><i class="fas ${item.requiresReview ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i>${item.requiresReview ? 'Customer match needs review' : 'Customer match resolved'}</span>
                    </div>
                </div>
                <aside class="workflow-intake-health">
                    <h4>Intake health</h4>
                    <div class="workflow-badges">
                        <span class="workflow-badge ${item.requiresReview ? 'warning' : 'success'}"><i class="fas fa-user-check"></i> ${escapePaymentHtml(reviewLabel)}</span>
                        ${workflowDeliveryBadge('Customer email', item.customerConfirmation)}
                        ${workflowDeliveryBadge('Operations email', item.operationsAlert)}
                        <span class="workflow-badge ${completionDone ? 'success' : 'info'}"><i class="fas ${completionDone ? 'fa-check-circle' : 'fa-clipboard-list'}"></i> Completion link: ${completionDone ? 'completed' : item.customerConfirmation?.status === 'sent' ? 'delivered' : 'pending'}</span>
                    </div>
                    ${stageTwoBlockers.length || !linkedOrderId ? `<div class="workflow-stage-blocker"><i class="fas fa-lock"></i><span>Stage 2 blocked: ${escapePaymentHtml(blockerMessage)}</span></div>` : '<div class="workflow-stage-blocker is-ready"><i class="fas fa-check-circle"></i><span>Ready to start vendor quote collection.</span></div>'}
                </aside>
            </div>
            <div class="workflow-card-actions">
                ${primaryAction}
                ${linkedOrderId && !stageTwoBlockers.length ? `<button type="button" class="btn-secondary" data-workflow-order="${escapePaymentHtml(linkedOrderId)}"><i class="fas fa-external-link-alt"></i> Review Order</button>` : ''}
                ${select}
                ${item.requiresReview ? `<button type="button" class="btn-secondary" data-intake-review="${item._id}" data-review-reason="${escapePaymentHtml(item.customerMatchReason || '')}"><i class="fas fa-check"></i> Resolve Customer Match</button>` : ''}
                ${customerFailed ? `<button type="button" class="btn-secondary" data-intake-email="${item._id}" data-email-type="website_customer_confirmation">Retry Customer Email</button>` : ''}
                ${operationsFailed ? `<button type="button" class="btn-secondary" data-intake-email="${item._id}" data-email-type="website_operations_alert">Retry Operations Email</button>` : ''}
                ${!completionDone ? `<button type="button" class="btn-secondary" data-intake-resend="${item._id}"><i class="fas fa-paper-plane"></i> Resend Completion Link</button>` : ''}
            </div>
        </article>`;
    }).join('');
    list.onclick = event => {
        const button = event.target.closest('button');
        if (!button) return;
        if (button.dataset.workflowOrder) openWorkflowOrder(button.dataset.workflowOrder);
        else if (button.dataset.stageTwo) startWorkflowQuoteCollection(button.dataset.stageTwo);
        else if (button.dataset.intakeReview) resolveIntakeReview(button.dataset.intakeReview, button.dataset.reviewReason || '');
        else if (button.dataset.intakeEmail) retryIntakeEmail(button.dataset.intakeEmail, button.dataset.emailType);
        else if (button.dataset.intakeResend) resendIntakeCompletion(button.dataset.intakeResend);
    };
}

async function loadWorkflowCenter() {
    const list = document.getElementById('workflowRequestList');
    if (list) list.innerHTML = '<div class="workflow-empty"><i class="fas fa-spinner fa-spin"></i><p>Loading website requests…</p></div>';
    try {
        const intakes = await window.APIService.getWebsiteIntakes();
        renderWorkflowCenter(intakes);
    } catch (error) {
        if (list) list.innerHTML = `<div class="workflow-empty"><i class="fas fa-exclamation-circle"></i><p>${escapePaymentHtml(error.message || 'Unable to load website requests')}</p></div>`;
    }
}

async function resolveIntakeReview(intakeId, reason) {
    const select = document.getElementById(`workflowCustomer-${intakeId}`);
    const customerId = select?.value || '';
    if (reason === 'multiple_email_matches' && !customerId) {
        showToast('Select the matching customer first.', 'error');
        return;
    }
    try {
        await window.APIService.resolveWebsiteIntakeReview(intakeId, customerId);
        window.APIService.clearCache?.();
        showToast('Customer review resolved.', 'success');
        await loadWorkflowCenter();
    } catch (error) {
        showToast(error.message || 'Unable to resolve review', 'error');
    }
}

async function retryIntakeEmail(intakeId, type) {
    try {
        await window.APIService.retryWebsiteIntakeEmail(intakeId, type);
        window.APIService.clearCache?.();
        showToast('Email queued for retry.', 'success');
        await loadWorkflowCenter();
    } catch (error) {
        showToast(error.message || 'Unable to retry email', 'error');
    }
}

async function openWorkflowOrder(orderId) {
    if (!orderId) return;
    return showOrderDetail(orderId, false, false, true);
}

async function resendIntakeCompletion(intakeId) {
    try {
        await window.APIService.resendWebsiteIntakeCompletion(intakeId);
        window.APIService.clearCache?.();
        showToast('A new secure completion link was queued for the customer.', 'success');
        await loadWorkflowCenter();
    } catch (error) {
        showToast(error.message || 'Unable to resend completion link', 'error');
    }
}

window.loadWorkflowCenter = loadWorkflowCenter;
window.resolveIntakeReview = resolveIntakeReview;
window.retryIntakeEmail = retryIntakeEmail;
window.resendIntakeCompletion = resendIntakeCompletion;
window.openWorkflowOrder = openWorkflowOrder;

async function loadOrdersSection() {
    try {
        window.AppLogger?.debug('loadOrdersSection called');
        if (window.ordersLoading) return; // Prevent duplicate calls
        window.ordersLoading = true;
        
        // Show loading state
        const tableContainer = document.querySelector('.orders-table-container');
        if (tableContainer) setTableLoading(tableContainer, true);
        
        allOrders = await window.APIService.getOrders();
        window.AppLogger?.debug('Orders loaded:', allOrders.length);
        initializeOrderFilters();
        updateOrderStatusFilterOptions(allOrders);
        filterOrdersImmediate();
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
    if (window.__orderFiltersInitialized) return;
    window.__orderFiltersInitialized = true;

    const searchInput = document.getElementById('orderSearchInput');
    const statusFilter = document.getElementById('orderStatusFilter');
    const priorityFilter = document.getElementById('orderPriorityFilter');
    const typeFilter = document.getElementById('orderTypeFilter');
    const dateFilter = document.getElementById('orderDateFilter');
    const startDateFilter = document.getElementById('orderStartDateFilter');
    const endDateFilter = document.getElementById('orderEndDateFilter');

    if (searchInput) {
        searchInput.addEventListener('input', filterOrdersDebounced);
    }

    if (statusFilter) {
        statusFilter.addEventListener('change', filterOrdersImmediate);
    }

    if (priorityFilter) {
        priorityFilter.addEventListener('change', filterOrdersImmediate);
    }

    if (typeFilter) {
        typeFilter.addEventListener('change', filterOrdersImmediate);
    }

    if (dateFilter) {
        dateFilter.addEventListener('change', () => {
            syncOrderCustomDateRangeVisibility();
            filterOrdersImmediate();
        });
    }

    if (startDateFilter) {
        startDateFilter.addEventListener('change', filterOrdersImmediate);
    }

    if (endDateFilter) {
        endDateFilter.addEventListener('change', filterOrdersImmediate);
    }

    syncOrderCustomDateRangeVisibility();
}

let orderFilterDebounceTimer = null;

function filterOrdersDebounced() {
    clearTimeout(orderFilterDebounceTimer);
    orderFilterDebounceTimer = setTimeout(filterOrdersImmediate, 280);
}

function syncOrderCustomDateRangeVisibility() {
    const dateFilter = document.getElementById('orderDateFilter')?.value || 'all';
    const customRange = document.getElementById('orderCustomDateRange');
    if (customRange) customRange.hidden = dateFilter !== 'custom';
}

function getOrderDateFilterRange() {
    const selected = document.getElementById('orderDateFilter')?.value || 'all';
    if (selected === 'all') return null;

    const config = tz();
    const today = config ? config.todayInputMDT() : new Date().toISOString().split('T')[0];
    const toStart = (dateString) => {
        if (!dateString) return null;
        if (config) return config.dateInputToMDT(dateString).getTime();
        const d = new Date(`${dateString}T00:00:00`);
        return Number.isNaN(d.getTime()) ? null : d.getTime();
    };
    const toEnd = (dateString) => {
        if (!dateString) return null;
        if (config) return config.endOfDayMDT(dateString).getTime();
        const d = new Date(`${dateString}T23:59:59.999`);
        return Number.isNaN(d.getTime()) ? null : d.getTime();
    };
    const addDays = (dateString, days) => {
        if (config) return config.addDaysToDateString(dateString, days);
        const d = new Date(`${dateString}T00:00:00`);
        d.setDate(d.getDate() + days);
        return d.toISOString().split('T')[0];
    };
    const monthString = (year, monthIndex) => `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;

    if (selected === 'today') {
        return { start: toStart(today), end: toEnd(today) };
    }

    if (selected === 'this-week') {
        const current = config ? config.dateInputToMDT(today) : new Date(`${today}T00:00:00`);
        const day = current.getDay();
        const weekStart = addDays(today, -day);
        const weekEnd = addDays(weekStart, 6);
        return { start: toStart(weekStart), end: toEnd(weekEnd) };
    }

    if (selected === 'this-month' || selected === 'last-month') {
        const current = config ? config.toMDT(config.dateInputToMDT(today)) : new Date(`${today}T00:00:00`);
        let year = current.getFullYear();
        let month = current.getMonth();
        if (selected === 'last-month') {
            month -= 1;
            if (month < 0) {
                month = 11;
                year -= 1;
            }
        }
        const start = monthString(year, month);
        const nextMonth = month === 11 ? monthString(year + 1, 0) : monthString(year, month + 1);
        const end = addDays(nextMonth, -1);
        return { start: toStart(start), end: toEnd(end) };
    }

    if (selected === 'custom') {
        const startDate = document.getElementById('orderStartDateFilter')?.value;
        const endDate = document.getElementById('orderEndDateFilter')?.value;
        if (!startDate && !endDate) return null;
        return {
            start: startDate ? toStart(startDate) : null,
            end: endDate ? toEnd(endDate) : null
        };
    }

    return null;
}

function normalizeOrderFilterValue(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[_\s]+/g, '-');
}

function normalizeOrderBadgeClass(value) {
    return normalizeOrderFilterValue(value)
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function getOrderStatusBadgeClass(order) {
    const visibleStatus = getOrderVisibleStatus(order);
    const normalizedStatus = normalizeOrderBadgeClass(visibleStatus || 'new');
    const aliases = getOrderStatusFilterValues(order)
        .map(normalizeOrderBadgeClass)
        .filter(value => value && value !== normalizedStatus);

    return [order?.pipelineStage ? 'pipeline' : '', normalizedStatus, ...aliases]
        .filter(Boolean)
        .join(' ');
}

function getOrderFilterDate(order) {
    const dateValue = order.startDate || order.createdAt || order.endDate;
    const timestamp = dateValue ? new Date(dateValue).getTime() : NaN;
    return Number.isNaN(timestamp) ? null : timestamp;
}

function getOrderSearchText(order) {
    const customer = order.customer || {};
    const vendor = order.vendor || {};
    const employee = order.employee || {};
    const visibleStatus = getOrderVisibleStatus(order);

    return [
        order.orderId,
        order.workOrderNumber,
        order._id,
        order.id,
        customer.name || customer,
        customer.email,
        customer.phone,
        customer.address,
        order.service,
        vendor.name || vendor,
        employee.name || employee,
        order.priority,
        order.orderType,
        order.status,
        order.workflowStatus,
        order.requestReference,
        order.pipelineStage,
        visibleStatus,
        order.description,
        getLatestNoteText(order)
    ]
        .filter(value => value !== undefined && value !== null)
        .join(' ')
        .toLowerCase();
}

function formatOrderFilterLabel(value) {
    return String(value || '')
        .trim()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
}

function getOrderVisibleStatus(order) {
    return order.pipelineStage || order.workflowStatus || order.status || '';
}

function getOrderStatusFilterValues(order) {
    const visibleStatus = getOrderVisibleStatus(order);
    const normalizedValues = [visibleStatus]
        .map(normalizeOrderFilterValue)
        .filter(Boolean);
    const valueSet = new Set(normalizedValues);

    normalizedValues.forEach(value => {
        if (value === 'work-order-received' || value === 'created') {
            valueSet.add('new');
        }

        if (value === 'complete' || value === 'done' || value === 'finished' || value === 'closed' || value === 'paid' || value.includes('completed')) {
            valueSet.add('completed');
        }

        if (value.includes('progress') || value.includes('working') || value === 'scheduled') {
            valueSet.add('in-progress');
        }

        if (value.includes('cancel') || value === 'lost' || value === 'no-bid') {
            valueSet.add('cancelled');
        }

        if (value.includes('delay') || value.includes('overdue')) {
            valueSet.add('delayed');
        }
    });

    return [...valueSet];
}

function updateOrderStatusFilterOptions(orders = []) {
    const statusFilter = document.getElementById('orderStatusFilter');
    if (!statusFilter) return;

    const selectedValue = statusFilter.value || 'all';
    const knownStatuses = [
        ['new', 'New'],
        ['in-progress', 'In Progress'],
        ['completed', 'Completed'],
        ['cancelled', 'Cancelled'],
        ['delayed', 'Delayed']
    ];
    const statusMap = new Map(knownStatuses);

    orders.forEach(order => {
        const value = getOrderVisibleStatus(order);
        const normalized = normalizeOrderFilterValue(value);
        if (!normalized || normalized === 'all' || statusMap.has(normalized)) return;
        statusMap.set(normalized, formatOrderFilterLabel(value));
    });

    statusFilter.replaceChildren();

    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'All Status';
    statusFilter.appendChild(allOption);

    statusMap.forEach((label, value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        statusFilter.appendChild(option);
    });

    const normalizedSelected = normalizeOrderFilterValue(selectedValue);
    statusFilter.value = statusMap.has(normalizedSelected) ? normalizedSelected : 'all';
}

function filterOrdersImmediate() {
    const searchTerm = (document.getElementById('orderSearchInput')?.value || '').trim().toLowerCase();
    const statusFilter = normalizeOrderFilterValue(document.getElementById('orderStatusFilter')?.value || 'all');
    const priorityFilter = normalizeOrderFilterValue(document.getElementById('orderPriorityFilter')?.value || 'all');
    const typeFilter = normalizeOrderFilterValue(document.getElementById('orderTypeFilter')?.value || 'all');
    const dateRange = getOrderDateFilterRange();
    
    const filtered = allOrders.filter(order => {
        if (searchTerm && !getOrderSearchText(order).includes(searchTerm)) return false;

        if (statusFilter !== 'all') {
            if (!getOrderStatusFilterValues(order).includes(statusFilter)) return false;
        }

        if (priorityFilter !== 'all' && normalizeOrderFilterValue(order.priority || 'medium') !== priorityFilter) return false;
        if (typeFilter !== 'all' && normalizeOrderFilterValue(order.orderType || 'one-time') !== typeFilter) return false;

        if (dateRange) {
            const orderDate = getOrderFilterDate(order);
            if (orderDate === null) return false;
            if (dateRange.start !== null && orderDate < dateRange.start) return false;
            if (dateRange.end !== null && orderDate > dateRange.end) return false;
        }

        return true;
    });
    
    window.dashboard.renderOrdersTable(filtered);
}

window.filterOrders = filterOrdersDebounced;

// Profile and settings functions
let profileSnapshot = null;
let profilePendingAvatar;
let profileReturnFocus = null;

const PROFILE_ROLE_LABELS = Object.freeze({
    admin: 'Administrator',
    manager: 'Manager',
    account_rep: 'Account representative',
    pending: 'Pending access'
});

function profileAvatarFallback(firstName = 'A') {
    const initial = String(firstName).trim().charAt(0).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'A';
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' rx='80' fill='%230B0B0C'/%3E%3Ctext x='80' y='84' dominant-baseline='middle' text-anchor='middle' font-family='Arial,sans-serif' font-size='72' font-weight='700' fill='white'%3E${initial}%3C/text%3E%3C/svg%3E`;
}

function setProfileState(targetId, message = '', tone = '') {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.textContent = message;
    target.dataset.tone = tone;
}

function populateProfileForm(user) {
    if (!user) return;
    document.getElementById('firstName').value = user.firstName || '';
    document.getElementById('lastName').value = user.lastName || '';
    document.getElementById('profileEmail').value = user.email || '';
    document.getElementById('phone').value = user.phone || '';
    document.getElementById('department').value = user.department || '';
    document.getElementById('profileRoleLabel').textContent = PROFILE_ROLE_LABELS[user.role] || 'Workspace member';
    document.getElementById('profileAvatar').src = user.avatar || profileAvatarFallback(user.firstName);
    document.getElementById('profileAvatarRemove').disabled = !user.avatar;
    document.getElementById('profileEmailPassword').value = '';
    document.getElementById('profileEmailPasswordGroup').hidden = true;
    profilePendingAvatar = undefined;
    profileSnapshot = {
        email: String(user.email || '').trim().toLowerCase(),
        avatar: user.avatar || ''
    };
}

function syncProfileSession(user) {
    window.AuthSession.user = { ...(window.AuthSession.user || {}), ...user };
    updateUserInfo({ user: window.AuthSession.user });
}

function updateEmailConfirmationVisibility() {
    const email = document.getElementById('profileEmail');
    const group = document.getElementById('profileEmailPasswordGroup');
    const password = document.getElementById('profileEmailPassword');
    if (!email || !group || !password) return;
    const changed = Boolean(profileSnapshot) && email.value.trim().toLowerCase() !== profileSnapshot.email;
    group.hidden = !changed;
    password.required = changed;
    if (!changed) password.value = '';
}

function initializeProfileModal() {
    const modal = document.getElementById('profileModal');
    if (!modal || modal.dataset.initialized === 'true') return;
    modal.dataset.initialized = 'true';
    document.getElementById('profileEmail')?.addEventListener('input', updateEmailConfirmationVisibility);
    document.getElementById('firstName')?.addEventListener('input', event => {
        if (profilePendingAvatar === '') document.getElementById('profileAvatar').src = profileAvatarFallback(event.target.value);
    });
    document.getElementById('profileAvatarInput')?.addEventListener('change', handleProfileAvatarSelection);
    modal.addEventListener('click', event => {
        if (event.target === modal && modal.dataset.busy !== 'true') closeProfileModal();
    });
    modal.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modal.dataset.busy !== 'true') {
            event.preventDefault();
            closeProfileModal();
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]):not([type="hidden"]), [tabindex]:not([tabindex="-1"])')]
            .filter(element => !element.closest('[hidden]'));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
}

async function showProfile() {
    const modal = document.getElementById('profileModal');
    if (!modal) return;
    initializeProfileModal();
    profileReturnFocus = document.activeElement;
    document.body.classList.add('profile-modal-open');
    modal.classList.add('show');
    modal.setAttribute('aria-busy', 'true');
    setProfileState('profileSaveState', 'Loading…');
    document.getElementById('profilePasswordForm')?.reset();

    const cachedUser = SessionManager.getUserInfo()?.user || window.AuthSession.user;
    if (cachedUser) populateProfileForm(cachedUser);

    try {
        const response = await window.APIService.getProfile();
        populateProfileForm(response.user);
        syncProfileSession(response.user);
        setProfileState('profileSaveState');
        requestAnimationFrame(() => document.getElementById('firstName')?.focus());
    } catch (error) {
        console.error('Profile load error:', error);
        setProfileState('profileSaveState', 'Could not refresh account data', 'error');
        showToast(`Could not load your profile: ${error.message}`, 'error');
    } finally {
        modal.removeAttribute('aria-busy');
    }
}

function closeProfileModal() {
    const modal = document.getElementById('profileModal');
    if (!modal) return;
    modal.classList.remove('show');
    document.body.classList.remove('profile-modal-open');
    modal.removeAttribute('aria-busy');
    modal.dataset.busy = 'false';
    document.getElementById('profileForm')?.reset();
    document.getElementById('profilePasswordForm')?.reset();
    profileSnapshot = null;
    profilePendingAvatar = undefined;
    if (profileReturnFocus?.isConnected) profileReturnFocus.focus();
}

async function saveProfile(event) {
    event?.preventDefault();
    const form = document.getElementById('profileForm');
    const modal = document.getElementById('profileModal');
    const button = document.getElementById('profileSaveButton');
    if (!form?.reportValidity() || !profileSnapshot || modal?.dataset.busy === 'true') return;

    const payload = {
        firstName: document.getElementById('firstName').value.trim(),
        lastName: document.getElementById('lastName').value.trim(),
        email: document.getElementById('profileEmail').value.trim().toLowerCase(),
        phone: document.getElementById('phone').value.trim(),
        department: document.getElementById('department').value.trim()
    };
    if (payload.email !== profileSnapshot.email) {
        payload.currentPassword = document.getElementById('profileEmailPassword').value;
    }
    if (profilePendingAvatar !== undefined) payload.avatar = profilePendingAvatar;

    modal.dataset.busy = 'true';
    button.disabled = true;
    setProfileState('profileSaveState', 'Saving…');
    try {
        const response = await window.APIService.updateProfile(payload);
        populateProfileForm(response.user);
        syncProfileSession(response.user);
        setProfileState('profileSaveState', 'Saved', 'success');
        showToast('Profile saved successfully.', 'success');
    } catch (error) {
        console.error('Profile update error:', error);
        setProfileState('profileSaveState', error.message, 'error');
        showToast(`Profile was not saved: ${error.message}`, 'error');
    } finally {
        modal.dataset.busy = 'false';
        button.disabled = false;
    }
}

async function changeProfilePassword(event) {
    event?.preventDefault();
    const form = document.getElementById('profilePasswordForm');
    const button = document.getElementById('profilePasswordButton');
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    if (!form?.reportValidity()) return;
    if (newPassword !== confirmPassword) {
        document.getElementById('confirmPassword').setCustomValidity('Passwords do not match');
        form.reportValidity();
        document.getElementById('confirmPassword').setCustomValidity('');
        return;
    }

    button.disabled = true;
    setProfileState('profilePasswordState', 'Updating…');
    try {
        await window.APIService.changePassword(currentPassword, newPassword);
        setProfileState('profilePasswordState', 'Password updated', 'success');
        window.APIService.clearSession();
        window.location.replace('/pages/login.html?passwordChanged=1');
    } catch (error) {
        setProfileState('profilePasswordState', error.message, 'error');
        showToast(`Password was not changed: ${error.message}`, 'error');
        button.disabled = false;
    }
}

function uploadAvatar() {
    const input = document.getElementById('profileAvatarInput');
    if (!input) return;
    input.value = '';
    input.click();
}

function removeProfileAvatar() {
    profilePendingAvatar = '';
    document.getElementById('profileAvatar').src = profileAvatarFallback(document.getElementById('firstName').value);
    document.getElementById('profileAvatarRemove').disabled = true;
    setProfileState('profileSaveState', 'Photo will be removed when you save');
}

function resizeProfileAvatar(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('The selected image could not be read'));
        reader.onload = () => {
            const image = new Image();
            image.onerror = () => reject(new Error('The selected image is not valid'));
            image.onload = () => {
                const size = Math.min(image.naturalWidth, image.naturalHeight);
                const canvas = document.createElement('canvas');
                canvas.width = 320;
                canvas.height = 320;
                const context = canvas.getContext('2d');
                context.drawImage(
                    image,
                    (image.naturalWidth - size) / 2,
                    (image.naturalHeight - size) / 2,
                    size,
                    size,
                    0,
                    0,
                    320,
                    320
                );
                resolve(canvas.toDataURL('image/jpeg', 0.86));
            };
            image.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

async function handleProfileAvatarSelection(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        showToast('Choose a PNG, JPEG, or WebP image.', 'error');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showToast('Choose an image smaller than 5 MB.', 'error');
        return;
    }
    try {
        const avatar = await resizeProfileAvatar(file);
        if (Math.ceil((avatar.split(',')[1]?.length || 0) * 0.75) > 512 * 1024) {
            throw new Error('The resized profile photo is too large');
        }
        profilePendingAvatar = avatar;
        document.getElementById('profileAvatar').src = avatar;
        document.getElementById('profileAvatarRemove').disabled = false;
        setProfileState('profileSaveState', 'Photo ready to save');
    } catch (error) {
        showToast(error.message, 'error');
    }
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
    window.AppLogger?.debug('Loading pipeline section...');
    
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
        window.AppLogger?.debug('Calling loadDataFromDB from pipeline script...');
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
        currentDetailVendorId = vendorId;
        const vendor = await window.APIService.getVendor(vendorId);
        window.renderVendorOnboardingReview?.(vendor);
        window.AppLogger?.debug('Vendor data received:', vendor);
        window.AppLogger?.debug('Vendor notes:', vendor.notes);
        window.AppLogger?.debug('Vendor notes type:', typeof vendor.notes);
        
        document.getElementById('vendorDetailName').textContent = vendor.name || 'Vendor';
        document.getElementById('vendorDetailSummary').textContent = `${formatOrderFilterLabel(vendor.category || 'service provider')} / ${vendor.isActive ? 'Active' : 'Inactive'}`;
        
        // Display all emails
        const emailElement = document.getElementById('detailVendorEmail');
        window.AppLogger?.debug('Full vendor object:', vendor);
        window.AppLogger?.debug('Vendor emails array:', vendor.emails);
        window.AppLogger?.debug('Vendor email field:', vendor.email);
        
        // Build emails array from both sources
        let emailsToDisplay = [];
        
        if (vendor.emails && Array.isArray(vendor.emails) && vendor.emails.length > 0) {
            emailsToDisplay = vendor.emails;
        } else if (vendor.email) {
            // Fallback: create array from single email field
            emailsToDisplay = [{ label: 'Primary', address: vendor.email, isPrimary: true }];
        }
        
        if (emailsToDisplay.length > 0) {
            window.AppLogger?.debug('Displaying emails:', emailsToDisplay);
            emailElement.innerHTML = emailsToDisplay.map((email, index) => 
                `<span class="record-detail-value-line"><strong>${escapePaymentHtml(email.label || 'Email ' + (index + 1))}</strong>${escapePaymentHtml(email.address || '-')}</span>`
            ).join('');
        } else {
            window.AppLogger?.debug('No email data found');
            emailElement.textContent = '-';
        }
        
        // Display all phones
        const phoneElement = document.getElementById('detailVendorPhone');
        window.AppLogger?.debug('Vendor phones array:', vendor.phones);
        window.AppLogger?.debug('Vendor phone field:', vendor.phone);
        
        // Build phones array from both sources
        let phonesToDisplay = [];
        
        if (vendor.phones && Array.isArray(vendor.phones) && vendor.phones.length > 0) {
            phonesToDisplay = vendor.phones;
        } else if (vendor.phone) {
            // Fallback: create array from single phone field
            phonesToDisplay = [{ label: 'Primary', number: vendor.phone, isPrimary: true }];
        }
        
        if (phonesToDisplay.length > 0) {
            window.AppLogger?.debug('Displaying phones:', phonesToDisplay);
            phoneElement.innerHTML = phonesToDisplay.map((phone, index) => 
                `<span class="record-detail-value-line"><strong>${escapePaymentHtml(phone.label || 'Phone ' + (index + 1))}</strong>${escapePaymentHtml(phone.number || '-')}</span>`
            ).join('');
        } else {
            window.AppLogger?.debug('No phone data found');
            phoneElement.textContent = '-';
        }
        
        document.getElementById('detailVendorCategory').textContent = vendor.category || '-';
        document.getElementById('detailVendorRating').textContent = `${Number(vendor.rating || 0)}/5`;
        document.getElementById('detailVendorAddress').textContent = vendor.address || '-';
        document.getElementById('detailVendorStatus').innerHTML = vendor.isActive
            ? '<span class="record-status-badge active">Active</span>'
            : '<span class="record-status-badge inactive">Inactive</span>';
        renderVendorComplianceDetails(vendor);
        
        renderNotesManager('vendors', vendor._id, vendor, 'vendorDetailNoteComposer');
        
        // Display custom fields
        window.AppLogger?.debug('Vendor custom fields:', vendor.customFields);
        const customFieldsContainer = document.getElementById('detailVendorCustomFields');
        window.AppLogger?.debug('Custom fields container found:', customFieldsContainer);
        if (vendor.customFields && vendor.customFields.length > 0) {
            window.AppLogger?.debug('Displaying', vendor.customFields.length, 'custom fields');
            customFieldsContainer.innerHTML = vendor.customFields.map(field => 
                `<div class="info-item">
                    <span class="display-label">${escapePaymentHtml(field.name || 'Custom field')}</span>
                    <span>${escapePaymentHtml(field.value || '-')}</span>
                </div>`
            ).join('');
            customFieldsContainer.hidden = false;
        } else {
            window.AppLogger?.debug('No custom fields to display');
            customFieldsContainer.hidden = true;
        }
        
        const docsList = document.getElementById('vendorDocumentsList');
        const generalVendorDocuments = (vendor.documents || []).filter(doc => !doc.complianceDocumentType);
        if (false && generalVendorDocuments.length > 0) {
            docsList.innerHTML = generalVendorDocuments.map(doc => `
                <div class="document-item">
                    <div class="document-info">
                        <div class="document-icon">
                            <i class="fas fa-file-${getDocIcon(doc.name)}"></i>
                        </div>
                        <div class="document-details">
                            <div class="document-name">${doc.name}</div>
                            <div class="document-meta">${formatFileSize(doc.size)} • ${formatDisplayDate(doc.uploadedAt)}</div>
                        </div>
                    </div>
                    <div class="document-actions">
                            <button class="btn-icon" onclick="downloadDocument('${doc.url}')" title="Download" aria-label="Download document">
                                <i class="fas fa-download" aria-hidden="true"></i>
                        </button>
                            <button class="btn-icon" onclick="viewDocument('${doc.url}')" title="View" aria-label="View document">
                                <i class="fas fa-eye" aria-hidden="true"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            docsList.innerHTML = '<p class="no-documents">No documents uploaded</p>';
        }
        window.renderAttachmentList(docsList, vendor.documents, {
            entityType: 'vendor', entityId: vendor._id,
            onChanged: () => showVendorDetail(vendor._id)
        });
        
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
                            <span><i class="fas fa-calendar"></i> ${(order.scheduleDate || order.startDate) ? formatDisplayDate(order.scheduleDate || order.startDate) : 'N/A'}</span>
                        </div>
                    </div>
                    <button class="btn-icon" onclick="viewOrder('${order._id}')" title="View Order" aria-label="View order">
                        <i class="fas fa-eye" aria-hidden="true"></i>
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
    currentDetailVendorId = null;
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

function resolveDocumentUrl(url) {
    if (!url) return '#';
    if (/^https?:\/\//i.test(url)) {
        return url;
    }

    const baseURL = window.location.hostname === 'localhost' 
        ? 'http://localhost:10000'
        : window.location.origin;

    if (url.startsWith('/uploads/')) {
        return `${baseURL}${url}`;
    }

    if (url.includes('/uploads/')) {
        const filename = url.split('/uploads/')[1];
        return `${baseURL}/uploads/${filename}`;
    }

    return `${baseURL}${url.startsWith('/') ? '' : '/'}${url}`;
}

function downloadDocument(url) {
    const downloadUrl = resolveDocumentUrl(url);
    const filename = decodeURIComponent(downloadUrl.split('/').pop() || 'document');
    
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
    window.open(resolveDocumentUrl(url), '_blank');
}

window.showVendorDetail = showVendorDetail;
window.backToVendors = backToVendors;
window.editCurrentDetailVendor = function() {
    if (currentDetailVendorId) {
        editVendor(currentDetailVendorId);
    }
};
window.deleteCurrentDetailVendor = function() {
    if (currentDetailVendorId) {
        deleteVendor(currentDetailVendorId);
    }
};
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

window.openOrdersSection = function() {
    if (window.dashboard && typeof window.dashboard.showSection === 'function') {
        window.dashboard.showSection('orders');
    } else {
        window.showSection('orders');
    }

    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
    const ordersLink = document.querySelector('[data-section="orders"]');
    if (ordersLink?.parentElement) {
        ordersLink.parentElement.classList.add('active');
    }

    if (typeof loadOrdersSection === 'function') {
        loadOrdersSection();
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
                <td colspan="6" class="users-empty-state">
                    <i class="fas fa-users-cog"></i>
                    <h3>No Users Found</h3>
                    <p>No users have signed up yet</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = users.map(user => {
        const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown';
        const userId = `#${user._id.substring(0, 8).toUpperCase()}`;
        const signupDate = formatDisplayDate(user.createdAt);
        const isPending = user.role === 'pending';
        const requestedRoleName = user.requestedRole ? user.requestedRole.replace('_', ' ') : 'Not specified';
        
        return `
        <tr>
            <td>
                <div class="user-identity">
                    <div class="user-details">
                        <div class="user-name">${fullName}</div>
                        <div class="user-id">${userId}</div>
                    </div>
                </div>
            </td>
            <td><span class="user-email">${user.email}</span></td>
            <td>
                <span class="role-badge ${user.role}">${user.role.replace('_', ' ')}</span>
                ${isPending && user.requestedRole ? `<span class="requested-role">Wants: ${requestedRoleName}</span>` : ''}
            </td>
            <td><span class="user-date-cell">${signupDate}</span></td>
            <td>
                <span class="status-badge ${isPending ? 'pending' : 'active'}">
                    <i class="fas fa-${isPending ? 'clock' : 'check-circle'}"></i>
                    ${isPending ? 'Pending' : 'Active'}
                </span>
            </td>
            <td>
                <div class="user-actions ${isPending ? 'is-pending' : 'is-active'}">
                    ${isPending ? `
                        ${user.requestedRole ? `
                            <button class="btn-assign-role approve" onclick="approveUserRole('${user._id}', '${user.requestedRole}')" title="Approve requested role">
                                <i class="fas fa-check"></i> Approve
                            </button>
                        ` : ''}
                        <select class="role-select" id="role-${user._id}">
                            <option value="">Or assign...</option>
                            <option value="admin">Admin</option>
                            <option value="manager">Manager</option>
                            <option value="account_rep">Account Rep</option>
                        </select>
                        <button class="btn-assign-role" onclick="assignUserRole('${user._id}')" title="Assign selected role">
                            <i class="fas fa-user-check"></i> Assign
                        </button>
                    ` : `
                        <select class="role-select" id="role-${user._id}" onchange="changeUserRole('${user._id}')">
                            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                            <option value="manager" ${user.role === 'manager' ? 'selected' : ''}>Manager</option>
                            <option value="account_rep" ${user.role === 'account_rep' ? 'selected' : ''}>Account Rep</option>
                        </select>
                    `}
                    <button class="action-btn delete" onclick="deleteUser('${user._id}')" title="Delete User" aria-label="Delete user">
                        <i class="fas fa-trash" aria-hidden="true"></i>
                    </button>
                </div>
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
        showToast('Role assigned. The user must sign out and sign in to see changes.', 'success');
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
        showToast('Role updated. The user must sign out and sign in to see changes.', 'success');
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
        showToast('User approved. They can now sign in with their requested role.', 'success');
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
                showToast('User deleted.', 'success');
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
    const modal = document.getElementById('addUserModal');
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    resetNewUserPasswordVisibility();
    window.setTimeout(() => document.getElementById('newUserFirstName')?.focus(), 120);
}

function closeAddUserModal() {
    const modal = document.getElementById('addUserModal');
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
}

function resetNewUserPasswordVisibility() {
    const passwordInput = document.getElementById('newUserPassword');
    const toggleButton = document.getElementById('newUserPasswordToggle');
    if (!passwordInput || !toggleButton) return;

    passwordInput.type = 'password';
    toggleButton.setAttribute('aria-label', 'Show password');
    toggleButton.setAttribute('aria-pressed', 'false');
    toggleButton.innerHTML = '<i class="far fa-eye" aria-hidden="true"></i>';
}

function toggleNewUserPassword() {
    const passwordInput = document.getElementById('newUserPassword');
    const toggleButton = document.getElementById('newUserPasswordToggle');
    if (!passwordInput || !toggleButton) return;

    const shouldShow = passwordInput.type === 'password';
    passwordInput.type = shouldShow ? 'text' : 'password';
    toggleButton.setAttribute('aria-label', shouldShow ? 'Hide password' : 'Show password');
    toggleButton.setAttribute('aria-pressed', String(shouldShow));
    toggleButton.innerHTML = `<i class="far ${shouldShow ? 'fa-eye-slash' : 'fa-eye'}" aria-hidden="true"></i>`;
}

async function saveNewUser() {
    const form = document.getElementById('addUserForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const saveBtn = document.getElementById('createUserButton');
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
    
    const userData = {
        firstName: document.getElementById('newUserFirstName').value.trim(),
        lastName: document.getElementById('newUserLastName').value.trim(),
        email: document.getElementById('newUserEmail').value.trim().toLowerCase(),
        password: document.getElementById('newUserPassword').value,
        role: document.getElementById('newUserRole').value
    };
    
    try {
        await window.APIService.createUser(userData);
        
        const sendEmail = document.getElementById('sendEmailCheckbox').checked;
        if (sendEmail) {
            showToast('User created. Login credentials were sent by email.', 'success');
        } else {
            showToast('User created.', 'success');
        }
        
        closeAddUserModal();
        await loadUsersSection();
    } catch (error) {
        showToast('Failed to create user: ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-user-plus"></i> Create User';
    }
}

window.showAddUserModal = showAddUserModal;
window.closeAddUserModal = closeAddUserModal;
window.saveNewUser = saveNewUser;
window.toggleNewUserPassword = toggleNewUserPassword;
window.forceRefreshDashboard = forceRefreshDashboard;


// Copy Order ID to Clipboard
function copyOrderId(orderId) {
    navigator.clipboard.writeText(orderId).then(() => {
        showToast('Order ID copied.', 'success');
    }).catch(err => {
        console.error('Failed to copy:', err);
        showToast('Failed to copy Order ID', 'error');
    });
}

window.copyOrderId = copyOrderId;

async function applyRevenueOverviewFilter() {
    if (!window.dashboard) return;
    window.dashboard.renderRevenueOverviewFromStats(window.dashboard.data?.revenueTimeline || []);
}

window.applyRevenueOverviewFilter = applyRevenueOverviewFilter;

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
    const orderType = document.getElementById('orderType')?.value;
    const recurringFields = document.getElementById('recurringFields');
    const recurringFrequency = document.getElementById('recurringFrequency');
    const endDateGroup = document.getElementById('endDateGroup');
    const endDateInput = document.getElementById('endDate');

    if (!recurringFields) return;

    if (orderType === 'recurring') {
        recurringFields.style.display = 'grid';
        if (recurringFrequency) recurringFrequency.required = true;
        if (endDateGroup) endDateGroup.style.display = 'none';
        if (endDateInput) endDateInput.required = false;
    } else {
        recurringFields.style.display = 'none';
        if (recurringFrequency) {
            recurringFrequency.required = false;
            recurringFrequency.value = 'weekly';
        }
        document.getElementById('recurringEndDate').value = '';
        document.getElementById('recurringNotes').value = '';
        document.getElementById('recurringCustomDays').value = '';
        if (document.getElementById('customDaysGroup')) {
            document.getElementById('customDaysGroup').style.display = 'none';
        }
        if (endDateGroup) endDateGroup.style.display = 'block';
        if (endDateInput) endDateInput.required = false;
    }
}

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
window.showProfile = showProfile;
window.closeProfileModal = closeProfileModal;
window.saveProfile = saveProfile;
window.uploadAvatar = uploadAvatar;
window.removeProfileAvatar = removeProfileAvatar;
window.changeProfilePassword = changeProfilePassword;
window.showSettings = showSettings;

let workflowStatusRefreshTimer = null;
window.addEventListener('order:status-changed', event => {
    const sync = event.detail || {};
    document.querySelectorAll(`[data-order-id="${CSS.escape(String(sync.orderId || ''))}"]`).forEach(element => {
        element.dataset.workflowStatus = sync.workflowStatus || '';
        element.dataset.orderStatus = sync.orderStatus || '';
        element.dataset.pipelineStage = sync.pipelineStage || '';
    });

    clearTimeout(workflowStatusRefreshTimer);
    workflowStatusRefreshTimer = setTimeout(async () => {
        window.APIService?.clearCache?.();
        const activeId = document.querySelector('.content-section.active')?.id || '';
        if (activeId === 'workflow-overview' || activeId === 'workflow-center') await window.loadWorkflowCenter?.();
        else if (activeId === 'orders') await loadOrdersSection();
        else if (activeId === 'pipeline') await loadPipelineSection();
        else if (activeId === 'calendar') await window.loadCalendarSection?.();
        else if (activeId === 'payments') await loadPaymentsSection();
        else if (activeId === 'reports') await loadReportsSection();
        else if (activeId === 'incoming-quotes') await window.loadIncomingQuotes?.();
        else if (activeId === 'outgoing-quotes') await window.loadOutgoingQuotes?.();
        else if (activeId === 'customer-approvals') await window.loadCustomerApprovals?.();
        else if (activeId === 'scheduling') await window.loadScheduling?.();
        else if (activeId === 'closeout') await window.loadCloseout?.();

        if (window.dashboard?.renderDashboard && activeId !== 'dashboard') {
            window.dashboard.forceFreshDashboardStats = true;
        }
    }, 150);
});
