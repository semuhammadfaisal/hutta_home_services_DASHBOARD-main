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
            return [];
        }
    }

    async getSyncedOrdersOverview(stats = {}, orders = null) {
        if (stats.ordersOverview?.version === 'real-orders-v2') {
            return stats.ordersOverview;
        }

        try {
            const sourceOrders = Array.isArray(orders) ? orders : await window.APIService.getOrdersFresh();
            return this.buildOrdersOverviewFromOrders(sourceOrders);
        } catch (error) {
            console.warn('Unable to sync orders overview from orders:', error);
            return {};
        }
    }

    renderOrdersOverview(stats = {}, syncedOverview = null, orders = []) {
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
        const total = Number(stats.totalOrders ?? cards.slice(0, 5).reduce((sum, card) => sum + card.value, 0));
        if (totalEl) totalEl.textContent = `${total.toLocaleString()} order${total === 1 ? '' : 's'}`;

        const ordersData = Array.isArray(orders) ? orders : [];
        const activeOrders = cards.find(card => card.key === 'progress')?.value || 0;
        const completedOrders = cards.find(card => card.key === 'completed')?.value || 0;
        const completedRate = total ? Math.round((completedOrders / total) * 100) : 0;
        const priorityCounts = this.buildOrdersPriorityBreakdown(ordersData, overview);
        const weeklySeries = this.buildOrdersWeeklyPerformanceSeries(ordersData);
        const trendSeries = this.buildOrderVolumeDailySeriesForDays(ordersData, 30);
        const recentHighPriority = this.getRecentHighPriorityOrders(ordersData);
        const flowRows = [
            { key: 'new', label: 'New Orders', value: cards.find(card => card.key === 'new')?.value || 0, icon: 'plus-circle' },
            { key: 'progress', label: 'In Progress', value: activeOrders, icon: 'spinner' },
            { key: 'completed', label: 'Completed', value: completedOrders, icon: 'check-circle' }
        ];
        const statusRows = [
            { key: 'completed', label: 'Completed', value: completedOrders, color: '#2fbf71' },
            { key: 'new', label: 'New Orders', value: cards.find(card => card.key === 'new')?.value || 0, color: '#3478f6' },
            { key: 'progress', label: 'In Progress', value: activeOrders, color: '#7c4dff' },
            { key: 'delayed', label: 'Delayed', value: cards.find(card => card.key === 'delayed')?.value || 0, color: '#ff8a2a' },
            { key: 'cancelled', label: 'Cancelled', value: cards.find(card => card.key === 'cancelled')?.value || 0, color: '#ef4444' }
        ];
        const summaryTiles = [
            {
                key: 'total',
                label: 'Total Orders',
                value: total,
                icon: 'shopping-bag',
                delta: this.getOrdersDeltaLabel(ordersData, () => true, 30),
                spark: trendSeries.slice(-10)
            },
            {
                key: 'active',
                label: 'Active Orders',
                value: activeOrders,
                icon: 'layer-group',
                delta: this.getOrdersDeltaLabel(ordersData, order => this.getOrderOverviewStatus(order) === 'inProgress', 7),
                spark: this.buildOrdersStatusSparkline(ordersData, 'inProgress')
            },
            {
                key: 'completed',
                label: 'Completed Rate',
                value: `${completedRate}%`,
                icon: 'check-circle',
                delta: this.getOrdersDeltaLabel(ordersData, order => this.getOrderOverviewStatus(order) === 'completed', 30),
                spark: this.buildOrdersStatusSparkline(ordersData, 'completed')
            },
            {
                key: 'priority',
                label: 'High Priority Orders',
                value: priorityCounts.high,
                icon: 'exclamation-circle',
                delta: this.getOrdersDeltaLabel(ordersData, order => ['high', 'urgent'].includes(this.normalizeOrderOverviewText(order.priority)), 7),
                spark: this.buildOrdersPrioritySparkline(ordersData)
            }
        ];

        container.innerHTML = `
            <div class="orders-overview-metric-row">
                ${summaryTiles.map(tile => this.renderOrdersOverviewMetricTile(tile)).join('')}
            </div>
            <div class="orders-overview-detail-grid">
                <article class="orders-overview-detail-card orders-status-distribution">
                    <div class="orders-detail-head">
                        <h3>Order Status Distribution</h3>
                    </div>
                    ${this.renderOrdersStatusDistribution(statusRows, total)}
                </article>
                <article class="orders-overview-detail-card orders-flow-card">
                    <div class="orders-detail-head">
                        <h3>Order Flow</h3>
                    </div>
                    ${this.renderOrdersFlow(flowRows, completedRate)}
                </article>
                <article class="orders-overview-detail-card orders-trend-card">
                    <div class="orders-detail-head">
                        <h3>Orders Trend <span>Last 30 Days</span></h3>
                    </div>
                    ${this.renderOrdersOverviewTrendCard(trendSeries)}
                </article>
                <article class="orders-overview-detail-card orders-priority-card">
                    <div class="orders-detail-head">
                        <h3>Priority Breakdown</h3>
                    </div>
                    ${this.renderOrdersPriorityBreakdown(priorityCounts)}
                </article>
                <article class="orders-overview-detail-card orders-weekly-card">
                    <div class="orders-detail-head">
                        <h3>Weekly Performance</h3>
                    </div>
                    ${this.renderOrdersWeeklyPerformance(weeklySeries)}
                </article>
                <article class="orders-overview-detail-card orders-recent-priority-card">
                    <div class="orders-detail-head">
                        <h3>Recent High Priority Orders</h3>
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
                ${this.renderOrdersSparkline(tile.spark, tile.key === 'priority' ? '#ff6b1a' : tile.key === 'completed' ? '#2fbf71' : '#3478f6')}
            </article>
        `;
    }

    getOrdersDeltaLabel(orders, predicate, days) {
        const currentEnd = todayDateInput();
        const currentStart = this.addRevenueDays(currentEnd, -(days - 1));
        const previousEnd = this.addRevenueDays(currentStart, -1);
        const previousStart = this.addRevenueDays(previousEnd, -(days - 1));
        const countInRange = (start, end) => orders.filter(order => {
            const dateInput = this.getRevenueOrderDateInput(order);
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

    renderOrdersSparkline(series = [], color = '#3478f6') {
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
            { key: 'high', label: 'High Priority', value: counts.high, color: '#ff4d4f' },
            { key: 'medium', label: 'Medium Priority', value: counts.medium, color: '#ff8a2a' },
            { key: 'low', label: 'Low Priority', value: counts.low, color: '#2fbf71' }
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
            const dateInput = this.getRevenueOrderDateInput(order);
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
            const dateInput = this.getRevenueOrderDateInput(order);
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
                <defs>
                    <linearGradient id="ordersInlineTrendBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#3478f6"/>
                        <stop offset="100%" stop-color="#0056b8"/>
                    </linearGradient>
                </defs>
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
            '#1d6fd4',
            '#0f9f8f',
            '#7c3aed',
            '#b45309',
            '#0369a1',
            '#16a34a',
            '#dc2626',
            '#475569',
            '#c026d3',
            '#0891b2'
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
            ${this.renderMiniLineChart(data, '#1d6fd4', 'Revenue')}
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
            ${this.renderMiniHorizontalBars(data, ['#1d6fd4', '#0f9f8f', '#f59e0b', '#7c3aed', '#64748b'])}
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
            ${this.renderMiniColumnChart(data, '#0f9f8f')}
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
            ${this.renderMiniDonutChart(data, ['#1d6fd4', '#0f9f8f', '#f59e0b'])}
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
                    const fill = row.value >= 0 ? color : '#ef4444';
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
                    <td colspan="12" class="orders-empty-state">
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
            const statusDisplay = order.pipelineStage || order.status.replace('-', ' ');
            const statusClass = order.pipelineStage ? 'pipeline' : order.status;

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
                <td><span class="order-status-badge ${statusClass}">${this.formatStatus(statusDisplay)}</span></td>
                <td><span class="priority-badge ${order.priority || 'medium'}">${order.priority || 'medium'}</span></td>
                <td><span class="order-date-cell">${order.startDate ? this.formatDate(order.startDate) : 'N/A'}</span></td>
                <td><span class="order-date-cell">${(order.scheduleDate || order.startDate) ? this.formatDate(order.scheduleDate || order.startDate) : 'N/A'}</span></td>
                <td><span class="order-amount">$${order.amount?.toLocaleString() || '0'}</span></td>
                <td><span class="order-cost">$${order.vendorCost?.toLocaleString() || '0'}</span></td>
                <td><span class="order-profit">$${((order.amount || 0) - (order.vendorCost || 0)).toLocaleString()}</span></td>
                <td onclick="event.stopPropagation()">
                    <div class="order-actions">
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
            const amountText = `$${amount.toLocaleString(undefined, { minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
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
                <defs>
                    <linearGradient id="revenueOverviewArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#0056b8" stop-opacity="0.22"/>
                        <stop offset="100%" stop-color="#0056b8" stop-opacity="0"/>
                    </linearGradient>
                    <filter id="revenueOverviewShadow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#0056b8" flood-opacity="0.16"/>
                    </filter>
                </defs>
                ${yTicks.map(tick => {
                    const y = pad.top + plotHeight - ((tick / niceMax) * plotHeight);
                    return `
                        <line class="revenue-grid-line" x1="${pad.left}" y1="${y.toFixed(2)}" x2="${width - pad.right}" y2="${y.toFixed(2)}"></line>
                    `;
                }).join('')}
                <path class="revenue-area-path" d="${areaPath}"></path>
                <path class="revenue-line-path" d="${linePath}" filter="url(#revenueOverviewShadow)"></path>
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
    const latestReadId = localStorage.getItem('huttaLatestReadSoftwareUpdate');
    if (!latestReadId) return SOFTWARE_UPDATES.length;

    const latestReadIndex = SOFTWARE_UPDATES.findIndex(update => update.id === latestReadId);
    return latestReadIndex >= 0 ? latestReadIndex : SOFTWARE_UPDATES.length;
}

function isSoftwareUpdateUnread(updateId) {
    const latestReadId = localStorage.getItem('huttaLatestReadSoftwareUpdate');
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
            <button onclick="closeSoftwareUpdatesPanel()" class="close-panel">&times;</button>
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
        localStorage.setItem('huttaLatestReadSoftwareUpdate', SOFTWARE_UPDATES[0].id);
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
    
    // Set current date and time in the header
    updateDashboardDateTime();
    setInterval(updateDashboardDateTime, 60 * 1000);
    
    // Check authentication
    const session = localStorage.getItem('huttaSession') || sessionStorage.getItem('huttaSession');
    
    if (!session) {
        window.AppLogger?.debug('No session, redirecting to login...');
        window.location.href = '/pages/login.html';
        return;
    }
    
    let sessionData;
    try {
        sessionData = JSON.parse(session);
    } catch (error) {
        window.AppLogger?.debug('Invalid session, redirecting to login...');
        localStorage.removeItem('huttaSession');
        sessionStorage.removeItem('huttaSession');
        window.location.href = '/pages/login.html';
        return;
    }
    
    if (!sessionData.isAuthenticated || !sessionData.token) {
        window.AppLogger?.debug('Not authenticated, redirecting to login...');
        window.location.href = '/pages/login.html';
        return;
    }
    
    window.AppLogger?.debug('Session valid, initializing dashboard...');
    
    // Update user info in dashboard
    updateUserInfo(sessionData);
    
    // Create global dashboard instance
    window.dashboard = new DashboardManager();
    
    // Initialize additional features
    addHoverEffects();
    initializeSearch();
    initializeNotifications();
    initializeSoftwareUpdates();
    initializeLogout();
    
    // Apply saved theme on initialization
    applySavedTheme();
    
    window.AppLogger?.debug('Hutta Home Services Admin Dashboard initialized successfully!');
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
                adminAvatar.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%234CAF50'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Inter' font-size='20' fill='white'%3E${firstLetter}%3C/text%3E%3C/svg%3E`;
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
        window.AppLogger?.debug('Showing address selection for existing customer');
        // Hide new customer fields and show address selection
        const customer = orderCustomers.find(c => c._id === selectedValue);
        window.AppLogger?.debug('Found customer:', customer);
        
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
    try {
    currentOrderId = null;
    document.getElementById('orderModalTitle').textContent = 'Add New Order';
    document.getElementById('orderForm').reset();
    
    // Reset customer search and hide address selection
    document.getElementById('customerSearchInput').value = '-- Select Existing Customer --';
    document.getElementById('customerSelect').value = '';
    document.getElementById('newCustomerFields').style.display = 'block';
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
    
    loadVendors();
    loadEmployees();
    loadOrderCustomers();
    initializeServiceSuggestions();
    closeServiceSuggestions();
    const orderModal = document.getElementById('orderModal');
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
        document.getElementById('scheduleDate').value = (order.scheduleDate || order.startDate) ? (order.scheduleDate || order.startDate).split('T')[0] : '';
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
        if (preview && order.documents && order.documents.length > 0) {
            preview.innerHTML = order.documents.map((doc, index) => `
                <div class="doc-item">
                    <i class="fas fa-file-${getFileIcon(doc.name)}"></i>
                    <a href="${doc.url}" target="_blank">${doc.name}</a>
                    <i class="fas fa-times remove-doc" onclick="removeExistingOrderDoc(${index})"></i>
                </div>
            `).join('');
            window.existingOrderDocs = order.documents;
        } else {
            if (preview) preview.innerHTML = '';
            window.existingOrderDocs = [];
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
        // Upload documents if any
        if (window.uploadedFiles && window.uploadedFiles.order && window.uploadedFiles.order.length > 0) {
            window.AppLogger?.debug('Uploading order documents:', window.uploadedFiles.order.length, 'files');
            updateLoadingMessage('Uploading documents...');
            const uploadedDocs = await window.uploadFiles(window.uploadedFiles.order);
            window.AppLogger?.debug('Upload response:', uploadedDocs);
            if (uploadedDocs && uploadedDocs.length > 0) {
                const existingDocs = window.existingOrderDocs || [];
                orderData.documents = [...existingDocs, ...uploadedDocs];
                window.AppLogger?.debug('Documents added to orderData:', orderData.documents);
            } else {
                // Upload failed, keep existing documents
                orderData.documents = window.existingOrderDocs || [];
            }
        } else {
            // No new uploads, preserve existing documents
            orderData.documents = window.existingOrderDocs || [];
        }
        
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
    if (!confirm('Are you sure you want to delete this order?')) {
        return;
    }
    
    try {
        await window.APIService.deleteOrder(orderId);
        showToast('Order deleted successfully!', 'success');
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
    const stage = order?.pipelineStage || '';
    const status = order?.status || '';
    const displayValue = stage || status || '-';
    const classValue = stage ? 'pipeline' : normalizeOrderFilterValue(status || 'new');

    return {
        label: formatOrderFilterLabel(displayValue),
        className: classValue
    };
}

function renderOrderStageBadge(order) {
    const stageDisplay = getOrderStageDisplay(order);
    return `<span class="order-status-badge ${stageDisplay.className}">${stageDisplay.label}</span>`;
}

async function showOrderDetail(orderId, fromPipeline = false, fromRecentActivity = false) {
    try {
        const order = await window.APIService.getOrder(orderId);
        currentDetailOrderId = order._id || order.id || orderId;
        
        // If opened from pipeline, show modal instead of full page
        if (fromPipeline) {
            // Populate modal fields
            document.getElementById('modalOrderDetailTitle').textContent = `Order Details - ${order.orderId || '#' + order._id.substring(0, 8).toUpperCase()}`;
            document.getElementById('modalDetailOrderId').textContent = order.orderId || '#' + order._id.substring(0, 8).toUpperCase();
            document.getElementById('modalDetailOrderStatus').innerHTML = renderOrderStageBadge(order);
            document.getElementById('modalDetailOrderPriority').innerHTML = `<span class="priority-badge ${order.priority || 'medium'}">${order.priority || 'medium'}</span>`;
            document.getElementById('modalDetailOrderRevenue').textContent = order.amount ? `$${order.amount.toLocaleString()}` : '-';
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
            document.getElementById('modalDetailOrderNotes').textContent = order.notes || 'No notes';
            
            // Display documents in modal
            const modalDocsList = document.getElementById('modalOrderDocumentsList');
            if (order.documents && order.documents.length > 0) {
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
                modalDocsList.innerHTML = '<p class="no-documents">No documents uploaded</p>';
            }
            
            // Show modal
            document.getElementById('orderDetailModal').classList.add('show');
            return;
        }
        
        // Store the source for back navigation
        window.orderDetailSource = fromPipeline ? 'pipeline' : fromRecentActivity ? 'dashboard' : 'orders';

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
            } else {
                backButton.innerHTML = '<i class="fas fa-arrow-left"></i> Back to Orders';
                backButton.onclick = backToOrders;
            }
        }
        
        document.getElementById('orderDetailTitle').textContent = `Order ${order.orderId || '#' + order._id.substring(0, 8).toUpperCase()}`;
        const detailOrderId = document.getElementById('detailOrderId');
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
        const detailOrderNotes = document.getElementById('detailOrderNotes');
        
        if (detailOrderId) detailOrderId.textContent = order.orderId || '#' + order._id.substring(0, 8).toUpperCase();
        if (detailOrderStatus) detailOrderStatus.innerHTML = renderOrderStageBadge(order);
        if (detailOrderPriority) detailOrderPriority.innerHTML = `<span class="priority-badge ${order.priority || 'medium'}">${order.priority || 'medium'}</span>`;
        if (detailOrderRevenue) detailOrderRevenue.textContent = '$' + (order.amount?.toLocaleString() || '0');
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
        if (detailOrderNotes) detailOrderNotes.textContent = order.notes || 'No notes';
        
        // Display documents
        const docsList = document.getElementById('orderDocumentsList');
        if (docsList) {
            if (order.documents && order.documents.length > 0) {
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
        }
        
        showSection('order-detail');
    } catch (error) {
        console.error('Failed to load order details:', error);
        showToast('Failed to load order details: ' + error.message, 'error');
    }
}

function backToOrders() {
    currentDetailOrderId = null;
    showSection('orders');
}

function closeOrderDetailModal() {
    document.getElementById('orderDetailModal').classList.remove('show');
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
let reportsInitialized = false;
let reportsSourceData = null;
let reportSortState = { key: '', direction: 'asc' };

const reportColors = ['#2563eb', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9'];

const emptyLiveReportData = {
    kpis: [
        { label: 'Total Revenue', value: 0, format: 'currency', icon: 'fa-dollar-sign', trend: 0, compare: 'No revenue in range' },
        { label: 'Revenue Growth %', value: 0, format: 'percent', icon: 'fa-arrow-trend-up', trend: 0, compare: 'No previous period revenue' },
        { label: 'Outstanding Payments', value: 0, format: 'currency', icon: 'fa-file-invoice-dollar', trend: 0, compare: '0 pending payments' },
        { label: 'Open Work Orders', value: 0, format: 'number', icon: 'fa-briefcase', trend: 0, compare: '0 overdue' },
        { label: 'Average Job Value', value: 0, format: 'currency', icon: 'fa-receipt', trend: 0, compare: '0 jobs in range' },
        { label: 'Quote Conversion Rate', value: 0, format: 'percent', icon: 'fa-bullseye', trend: 0, compare: '0 completed of 0' },
        { label: 'Average Payment Time', value: 0, format: 'days', icon: 'fa-clock', trend: 0, compare: '0 paid payments analyzed' },
        { label: 'Recurring Revenue %', value: 0, format: 'percent', icon: 'fa-rotate', trend: 0, compare: '0 recurring customers' }
    ],
    revenueByService: [],
    monthlyRevenue: [],
    yoyRevenue: [],
    recurringSplit: [],
    aging: [],
    revenueByProperty: [],
    paymentSpeedBands: [],
    topCustomers: [],
    repeatJobFrequency: [],
    avgPayDaysByCustomer: [],
    averageJobValue: 0,
    quoteConversionRate: 0,
    profitByCategory: [],
    operations: { statusCards: [], progress: [], table: [], overdueWorkOrders: [], pendingApprovalJobs: [], timeline: [], heatmap: [] },
    sales: { funnel: [], newLeadsMonthly: [], leadSources: [], reps: [], lostDeals: [] },
    customers: { retention: [], behavior: [], rankings: [], highRiskUnpaid: [] },
    scheduling: { maintenance: [], upcomingMaintenanceByProperty: [], renewals: [], utilization: [], calendar: [], heatmap: [] },
    filterOptions: { customers: [], properties: [], technicians: [], services: [], statuses: [], locations: [] }
};

function formatReportMoney(value) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);
}

function formatReportValue(value, format) {
    if (format === 'currency') return formatReportMoney(value);
    if (format === 'percent') return `${Number(value || 0).toFixed(1).replace('.0', '')}%`;
    if (format === 'days') return `${Number(value || 0).toFixed(1).replace('.0', '')}d`;
    return Number(value || 0).toLocaleString();
}

function getReportFilters() {
    return {
        startDate: document.getElementById('reportStartDate')?.value,
        endDate: document.getElementById('reportEndDate')?.value,
        customer: document.getElementById('reportCustomerFilter')?.value,
        technician: document.getElementById('reportTechnicianFilter')?.value,
        service: document.getElementById('reportServiceFilter')?.value,
        status: document.getElementById('reportStatusFilter')?.value,
        location: document.getElementById('reportLocationFilter')?.value
    };
}

function showReportsSkeleton(show) {
    const skeleton = document.getElementById('reportsSkeleton');
    const dashboard = document.getElementById('reportsDashboard');
    if (!skeleton || !dashboard) return;
    skeleton.innerHTML = show ? Array.from({ length: 8 }, () => '<div class="skeleton-block"></div>').join('') : '';
    skeleton.classList.toggle('active', show);
    dashboard.style.display = show ? 'none' : '';
}

async function generateReports() {
    const filters = getReportFilters();

    showReportsSkeleton(true);
    try {
        reportsSourceData = await window.APIService.getAnalyticsReport(filters);
    } catch (error) {
        console.error('Failed to load live analytics report:', error);
        reportsSourceData = JSON.parse(JSON.stringify(emptyLiveReportData));
        if (window.showToast) {
            showToast('Live report data unavailable. Showing empty report state.', 'error');
        }
    } finally {
        showReportsSkeleton(false);
        renderReportsDashboard();
    }
}

function renderReportsDashboard() {
    if (!reportsSourceData) reportsSourceData = JSON.parse(JSON.stringify(emptyLiveReportData));
    populateReportFilters();
    renderReportTabContent();
    filterReports();
}

function cardShell(title, subtitle, body, className = '') {
    const icon = getReportIcon(title);
    return `
        <section class="analytics-card ${className} report-searchable" data-report-text="${title} ${subtitle}">
            <div class="analytics-card-header">
                <div class="report-title-group">
                    <span class="report-card-icon"><i class="fas ${icon}"></i></span>
                    <div>
                    <h3>${title}</h3>
                    <p>${subtitle}</p>
                    </div>
                </div>
            </div>
            ${body || emptyState('No report data available')}
        </section>
    `;
}

function getReportIcon(title) {
    if (/revenue|average job|recurring/i.test(title)) return 'fa-chart-line';
    if (/work order|approval/i.test(title)) return 'fa-clipboard-list';
    if (/lead|quote/i.test(title)) return 'fa-bullseye';
    if (/maintenance/i.test(title)) return 'fa-calendar-check';
    if (/pay/i.test(title)) return 'fa-clock';
    if (/customer|client/i.test(title)) return 'fa-users';
    return 'fa-chart-simple';
}

function emptyState(message) {
    return `<div class="empty-state"><div><i class="fas fa-chart-simple"></i><p>${message}</p></div></div>`;
}

function renderLineChart(series, type = 'line') {
    if (!series || !series.length) return emptyState('No chart data for this filter set');
    const width = 620;
    const height = 170;
    const max = Math.max(...series.map(item => item.value), 1);
    const min = Math.min(...series.map(item => item.value), 0);
    const range = Math.max(max - min, 1);
    const points = series.map((item, index) => {
        const x = series.length === 1 ? width / 2 : (index / (series.length - 1)) * width;
        const y = height - ((item.value - min) / range) * (height - 22) - 10;
        return { ...item, x, y };
    });
    const line = points.map(point => `${point.x},${point.y}`).join(' ');
    const area = `0,${height} ${line} ${width},${height}`;
    return `
        <div class="${type === 'area' ? 'area-chart' : 'line-chart'}">
            <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img">
                ${[35, 75, 115, 155].map(y => `<line class="chart-grid-line" x1="0" x2="${width}" y1="${y}" y2="${y}"></line>`).join('')}
                ${type === 'area' ? `<polygon class="chart-area" points="${area}"></polygon>` : ''}
                <polyline class="chart-line" points="${line}"></polyline>
                ${points.map(point => `<circle class="chart-point"><title>${point.label}: ${point.value.toLocaleString()}</title></circle>`.replace('<circle class="chart-point"', `<circle class="chart-point" cx="${point.x}" cy="${point.y}" r="4"`)).join('')}
            </svg>
        </div>
        <div class="chart-axis-labels">${series.map(item => `<span>${item.label}</span>`).join('')}</div>
    `;
}

function renderDonutChart(items) {
    if (!items || !items.length) return emptyState('No live data for this report yet');
    const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
    let cursor = 0;
    const segments = items.map((item, index) => {
        const start = cursor;
        cursor += (item.value / total) * 100;
        return `${reportColors[index % reportColors.length]} ${start}% ${cursor}%`;
    }).join(', ');
    return `
        <div class="donut-chart-wrap">
            <div class="donut-chart" style="--segments: ${segments};"></div>
            <div class="donut-legend">
                ${items.map((item, index) => `
                    <div class="legend-item">
                        <span><i class="legend-color" style="background:${reportColors[index % reportColors.length]}"></i>${item.label}</span>
                        <strong>${item.value}${item.value <= 100 ? '%' : ''}</strong>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderHorizontalBars(items, suffix = '') {
    if (!items || !items.length) return emptyState('No live data for this report yet');
    const max = Math.max(...items.map(item => item.value), 1);
    return `<div class="horizontal-bars">${items.map((item, index) => `
        <div class="bar-row">
            <span>${item.label}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${(item.value / max) * 100}%; background:${reportColors[index % reportColors.length]}"></div></div>
            <strong>${typeof item.value === 'number' && item.value > 999 ? formatReportMoney(item.value) : item.value + suffix}</strong>
        </div>
    `).join('')}</div>`;
}

function renderStackedBars(items) {
    if (!items || !items.length) return emptyState('No live data for this report yet');
    return `<div class="stacked-bars">${items.map(item => {
        const paid = Math.max(100 - item.value, 8);
        return `
            <div class="stacked-row">
                <span>${item.label}</span>
                <div class="stacked-track">
                    <div class="stacked-segment" style="width:${item.value}%; background:#2563eb"></div>
                    <div class="stacked-segment" style="width:${paid}%; background:#14b8a6"></div>
                </div>
                <strong>${item.value}%</strong>
            </div>
        `;
    }).join('')}</div>`;
}

function renderTable(headers, rows) {
    if (!rows || !rows.length) return emptyState('No rows match the current filters');
    return `
        <div class="report-table-wrap">
            <table class="report-table">
                <thead><tr>${headers.map((header, index) => `<th data-sort-key="${header.key}" data-column="${index}" onclick="sortReportTable(this)">${header.label} <i class="fas fa-sort"></i></th>`).join('')}</tr></thead>
                <tbody>
                    ${rows.map(row => `<tr>${headers.map(header => `<td>${formatReportCell(row[header.key], header.key)}</td>`).join('')}</tr>`).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function formatReportCell(value, key) {
    if (key === 'status' || key === 'health') return `<span class="health-pill ${value}">${value}</span>`;
    if (typeof value === 'number' && (key === 'revenue' || key === 'profit' || key === 'clv' || key === 'value' || key === 'amount')) return formatReportMoney(value);
    if (typeof value === 'number' && key === 'avgDays') return `${value}d`;
    return value;
}

function renderProgressList(items) {
    if (!items || !items.length) return emptyState('No live data for this report yet');
    return `<div class="progress-list">${items.map(item => `
        <div class="progress-row">
            <div class="progress-meta"><span>${item.label}</span><strong>${item.value}%</strong></div>
            <div class="progress-track"><div class="progress-fill" style="width:${item.value}%"></div></div>
        </div>
    `).join('')}</div>`;
}

function renderStatusCards(items) {
    if (!items || !items.length) return emptyState('No live data for this report yet');
    return `<div class="status-card-grid">${items.map(item => `
        <div class="status-card">
            <span>${item.label}</span>
            <strong>${item.value}</strong>
            <span class="status-pill ${item.status}">${item.status}</span>
        </div>
    `).join('')}</div>`;
}

function renderTimeline(items) {
    if (!items || !items.length) return emptyState('No live activity in this range');
    return `<div class="activity-timeline">${items.map(item => `
        <div class="timeline-item">
            <span class="timeline-dot"></span>
            <div><strong>${item.title}</strong><span>${item.meta}</span></div>
            <time>${item.time}</time>
        </div>
    `).join('')}</div>`;
}

function renderHeatmap(items = []) {
    if (!items || !items.length) return emptyState('No live scheduling density in this range');
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const rows = ['8a', '10a', '12p', '2p', '4p', '6p'];
    const buckets = items.reduce((map, item) => {
        const dayIndex = item.day === 0 ? 6 : item.day - 1;
        const hourIndex = Math.min(rows.length - 1, Math.max(0, Math.floor(((item.hour || 8) - 8) / 2)));
        const key = `${hourIndex}-${dayIndex}`;
        map[key] = (map[key] || 0) + (item.value || 1);
        return map;
    }, {});
    const max = Math.max(...Object.values(buckets), 1);
    return `<div class="heatmap">
        <span></span>${days.map(day => `<span class="heatmap-label">${day}</span>`).join('')}
        ${rows.map((row, rowIndex) => `<span class="heatmap-label">${row}</span>${days.map((day, dayIndex) => {
            const value = buckets[`${rowIndex}-${dayIndex}`] || 0;
            const alpha = value ? .12 + (value / max) * .62 : .06;
            return `<span class="heatmap-cell" style="background:rgba(37,99,235,${alpha})">${value}</span>`;
        }).join('')}`).join('')}
    </div>`;
}

function renderCalendarWidget() {
    const calendar = reportsSourceData?.scheduling?.calendar || [];
    const counts = calendar.reduce((map, item) => {
        map[item.day] = (map[item.day] || 0) + 1;
        return map;
    }, {});
    return `<div class="calendar-widget">${Array.from({ length: 28 }, (_, index) => {
        const day = index + 1;
        const count = counts[day] || 0;
        return `<div class="calendar-day ${count ? 'has-work' : ''}"><strong>${day}</strong>${count ? `${count} visits` : 'Open'}</div>`;
    }).join('')}</div>`;
}

function renderFunnel(items) {
    if (!items || !items.length) return emptyState('No live pipeline data in this range');
    return `<div class="funnel-chart">${items.map(item => `
        <div class="funnel-step" style="width:${item.width}%"><span>${item.label}</span><strong>${item.value}</strong></div>
    `).join('')}</div>`;
}

function renderLeaderboard(items) {
    if (!items || !items.length) return emptyState('No sales rep performance data yet');
    return `<div class="leaderboard">${items.map(item => `
        <div class="leader-card"><span>${item.name}</span><strong>${typeof item.revenue === 'number' ? formatReportMoney(item.revenue) : item.revenue}</strong><small>${item.close} close - ${item.cycle}</small></div>
    `).join('')}</div>`;
}

function renderReportTabContent() {
    const content = document.getElementById('reportsTabContent');
    if (!content) return;
    const data = reportsSourceData || emptyLiveReportData;
    content.innerHTML = `
        <div class="reports-only-summary">
            <div class="reports-section-heading">
                <div>
                    <span>Snapshot</span>
                    <h2>Performance Summary</h2>
                </div>
                <small>Synced from live orders, payments, customers, projects, and pipeline records</small>
            </div>
            <div class="report-metric-strip">
                <div><i class="fas fa-receipt"></i><span>Average Job Value</span><strong>${formatReportMoney(data.averageJobValue)}</strong></div>
                <div><i class="fas fa-bullseye"></i><span>Quote-to-Close Conversion</span><strong>${formatReportValue(data.quoteConversionRate, 'percent')}</strong></div>
            </div>
        </div>
        <div class="reports-section-heading">
            <div>
                <span>Financial</span>
                <h2>Revenue Reports</h2>
            </div>
        </div>
        <div class="report-dashboard-grid reports-clean-grid">
            ${cardShell('Revenue by Service Type', 'Live revenue grouped by service category', renderHorizontalBars(data.revenueByService), 'wide')}
            ${cardShell('Average Job Value', 'Average revenue per work order in the selected range', `<div class="single-report-number">${formatReportMoney(data.averageJobValue)}</div>`)}
            ${cardShell('Month-over-Month Revenue Growth', 'Live monthly revenue trend', renderLineChart(data.monthlyRevenue, 'area'), 'wide')}
            ${cardShell('Year-over-Year Revenue Growth', 'Live revenue grouped by year', renderLineChart(data.yoyRevenue, 'line'))}
            ${cardShell('Repeat Job Frequency per Client', 'Customers ranked by number of jobs', renderTable([
                { key: 'customer', label: 'Client' },
                { key: 'jobs', label: 'Jobs' },
                { key: 'repeatFrequency', label: 'Frequency' },
                { key: 'revenue', label: 'Revenue' }
            ], data.repeatJobFrequency), 'wide')}
            ${cardShell('Revenue per Customer', 'Customer revenue and payment speed', renderTable([
                { key: 'customer', label: 'Customer' },
                { key: 'revenue', label: 'Revenue' },
                { key: 'jobs', label: 'Jobs' },
                { key: 'speed', label: 'Avg Pay Time' },
                { key: 'health', label: 'Health' }
            ], data.topCustomers))}
            ${cardShell('Recurring vs. One-Time Split by Revenue', 'Revenue mix, not order count', renderDonutChart(data.recurringSplit))}
        </div>
        <div class="reports-section-heading">
            <div>
                <span>Operations</span>
                <h2>Work Orders & Approvals</h2>
            </div>
        </div>
        <div class="report-dashboard-grid reports-clean-grid">
            ${cardShell('Clients with Open/Unresolved Work Orders', 'Open work orders and overdue exposure by client', renderTable([
                { key: 'client', label: 'Client' },
                { key: 'open', label: 'Open' },
                { key: 'overdue', label: 'Overdue' },
                { key: 'backlog', label: 'Backlog' },
                { key: 'sla', label: 'SLA' },
                { key: 'status', label: 'Status' }
            ], data.operations.table), 'wide')}
            ${cardShell('Overdue Work Orders', 'Work orders past due and not completed', renderTable([
                { key: 'orderId', label: 'Order' },
                { key: 'customer', label: 'Customer' },
                { key: 'service', label: 'Service' },
                { key: 'dueDate', label: 'Due Date' },
                { key: 'amount', label: 'Amount' },
                { key: 'status', label: 'Status' }
            ], data.operations.overdueWorkOrders))}
            ${cardShell('Jobs Pending Client Approval', 'Open jobs currently waiting on approval', renderTable([
                { key: 'orderId', label: 'Order' },
                { key: 'customer', label: 'Customer' },
                { key: 'service', label: 'Service' },
                { key: 'amount', label: 'Amount' },
                { key: 'status', label: 'Status' }
            ], data.operations.pendingApprovalJobs))}
        </div>
        <div class="reports-section-heading">
            <div>
                <span>Pipeline & Maintenance</span>
                <h2>Sales and Scheduling</h2>
            </div>
        </div>
        <div class="report-dashboard-grid reports-clean-grid">
            ${cardShell('New Leads Added per Month', 'Live pipeline records created by month', renderLineChart(data.sales.newLeadsMonthly, 'area'), 'wide')}
            ${cardShell('Quote-to-Close Conversion Rate', 'Completed jobs divided by total jobs in range', `<div class="single-report-number">${formatReportValue(data.quoteConversionRate, 'percent')}</div>`)}
            ${cardShell('Upcoming Scheduled Maintenance by Property', 'Upcoming project/maintenance schedule', renderTable([
                { key: 'property', label: 'Property' },
                { key: 'customer', label: 'Customer' },
                { key: 'date', label: 'Date' },
                { key: 'progress', label: 'Progress' },
                { key: 'status', label: 'Status' }
            ], data.scheduling.upcomingMaintenanceByProperty), 'wide')}
            ${cardShell('Average Days Each Customer Takes to Pay', 'Completion date to paid date, grouped by customer', renderTable([
                { key: 'customer', label: 'Customer' },
                { key: 'avgDays', label: 'Avg Days' },
                { key: 'paidPayments', label: 'Paid Payments' }
            ], data.avgPayDaysByCustomer), 'wide')}
        </div>
    `;
}

function filterReports() {
    const input = document.getElementById('reportSearchInput');
    if (!input) return;
    const query = input.value.trim().toLowerCase();
    document.querySelectorAll('#reports .report-searchable').forEach(item => {
        const text = (item.dataset.reportText || item.textContent || '').toLowerCase();
        item.style.display = !query || text.includes(query) ? '' : 'none';
    });
}

function sortReportTable(header) {
    const table = header.closest('table');
    const tbody = table?.querySelector('tbody');
    if (!tbody) return;
    const key = header.dataset.sortKey;
    const column = Number(header.dataset.column);
    reportSortState = {
        key,
        direction: reportSortState.key === key && reportSortState.direction === 'asc' ? 'desc' : 'asc'
    };
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort((a, b) => {
        const first = a.children[column]?.textContent.trim() || '';
        const second = b.children[column]?.textContent.trim() || '';
        const firstNumber = Number(first.replace(/[$,%Kdgx\s]/g, ''));
        const secondNumber = Number(second.replace(/[$,%Kdgx\s]/g, ''));
        const result = Number.isFinite(firstNumber) && Number.isFinite(secondNumber) && firstNumber !== secondNumber
            ? firstNumber - secondNumber
            : first.localeCompare(second);
        return reportSortState.direction === 'asc' ? result : -result;
    });
    rows.forEach(row => tbody.appendChild(row));
    if (window.showToast) showToast(`Sorted ${key} ${reportSortState.direction}`, 'info');
}

function populateReportFilters() {
    const options = reportsSourceData?.filterOptions || emptyLiveReportData.filterOptions;
    const filterValues = {
        reportCustomerFilter: options.customers || [],
        reportTechnicianFilter: options.technicians || [],
        reportServiceFilter: options.services || [],
        reportStatusFilter: options.statuses || [],
        reportLocationFilter: options.locations || []
    };
    Object.entries(filterValues).forEach(([id, values]) => {
        const select = document.getElementById(id);
        if (!select) return;
        const currentValue = select.value;
        const firstOption = select.querySelector('option')?.outerHTML || '<option value="">All</option>';
        select.innerHTML = firstOption + values.map(value => `<option value="${value}">${value}</option>`).join('');
        if (values.includes(currentValue)) select.value = currentValue;
        if (!select.dataset.reportListener) {
            select.addEventListener('change', generateReports);
            select.dataset.reportListener = 'true';
        }
    });
}

function exportReports(format) {
    if (window.showToast) showToast(`${format} export prepared for Reports`, 'success');
}

function toggleReportsDarkMode() {
    document.body.classList.toggle('reports-dark-mode');
}

// Load reports when reports section is shown
function loadReportsSection() {
    const endDate = nowInMDT();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 30);

    const startInput = document.getElementById('reportStartDate');
    const endInput = document.getElementById('reportEndDate');
    if (startInput && !startInput.value) startInput.value = formatDisplayDateInput(startDate);
    if (endInput && !endInput.value) endInput.value = todayDateInput();
    [startInput, endInput].forEach(input => {
        if (input && !input.dataset.reportListener) {
            input.addEventListener('change', generateReports);
            input.dataset.reportListener = 'true';
        }
    });

    if (!reportsInitialized) {
        reportsInitialized = true;
        generateReports();
    } else {
        renderReportsDashboard();
    }
}

// Global functions
window.generateReports = generateReports;
window.filterReports = filterReports;
window.sortReportTable = sortReportTable;
window.exportReports = exportReports;
window.toggleReportsDarkMode = toggleReportsDarkMode;

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
    
    tbody.innerHTML = payments.map(payment => `
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
                <select class="payment-status-select status-${payment.status}" onchange="quickUpdatePaymentStatus('${payment._id}', this.value)">
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
                <button class="btn-action" onclick="showPaymentDetail('${payment._id}')" title="View">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn-action delete" onclick="deletePayment('${payment._id}')" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
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
            payment.notes
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
            notes: payment.notes || ''
        };
        
        window.AppLogger?.debug('Sending update data:', updateData);
        
        // Save to backend
        const result = await window.APIService.updatePayment(paymentId, updateData);
        
        window.AppLogger?.debug('Update result:', result);
        
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
        showToast('Payment milestones updated successfully!', 'success');
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

                        ${payment.notes ? `
                            <section class="payment-rich-card payment-rich-card-wide payment-notes-section">
                                <div class="payment-card-header">
                                    <h3>Notes</h3>
                                    <span class="payment-card-chip">Internal</span>
                                </div>
                                <p class="payment-rich-text">${escapePaymentHtml(payment.notes)}</p>
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

        showToast('Employee payment saved successfully', 'success');
        
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

        showToast('Vendor payment saved successfully', 'success');
        
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

function showAddEmployeeModal() {
    currentEmployeeId = null;
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
            } else {
                // Upload failed, keep existing documents
                employeeData.documents = window.currentEmployeeDocuments || [];
            }
        } else {
            // No new uploads, preserve existing documents
            employeeData.documents = window.currentEmployeeDocuments || [];
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
    window.AppLogger?.debug('viewEmployee called with ID:', employeeId);
    showEmployeeDetail(employeeId);
}

async function showEmployeeDetail(employeeId) {
    try {
        window.AppLogger?.debug('Loading employee details for:', employeeId);
        const employee = await window.APIService.getEmployee(employeeId);
        window.AppLogger?.debug('Employee data loaded:', employee);
        
        document.getElementById('employeeDetailName').textContent = employee.name;
        document.getElementById('detailEmployeeEmail').textContent = employee.email || '-';
        document.getElementById('detailEmployeePhone').textContent = employee.phone || '-';
        document.getElementById('detailEmployeeRole').textContent = employee.role.replace('-', ' ') || '-';
        document.getElementById('detailEmployeeDepartment').textContent = employee.department || '-';
        document.getElementById('detailEmployeeStatus').innerHTML = `<span class="employee-status-badge ${employee.status}">${employee.status.replace('-', ' ')}</span>`;
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
        if (employee.documents && employee.documents.length > 0) {
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
        
        window.AppLogger?.debug('Showing employee-detail section');
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
            <td onclick="event.stopPropagation()">
                <div class="employee-actions">
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
    
    const vendorModal = document.getElementById('vendorModal');
    vendorModal.style.display = '';
    vendorModal.classList.add('show');
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
    
    window.AppLogger?.debug('=== SAVING VENDOR ===');
    window.AppLogger?.debug('Custom fields being saved:', vendorData.customFields);
    
    window.AppLogger?.debug('=== SAVING VENDOR ===');
    window.AppLogger?.debug('Emails being saved:', emails);
    window.AppLogger?.debug('Phones being saved:', phones);
    window.AppLogger?.debug('Category being saved:', category);
    window.AppLogger?.debug('Full vendor data:', vendorData);
    
    try {
        // Upload documents if any
        if (window.uploadedFiles && window.uploadedFiles.vendor && window.uploadedFiles.vendor.length > 0) {
            window.AppLogger?.debug('Uploading vendor documents:', window.uploadedFiles.vendor.length, 'files');
            updateLoadingMessage('Uploading documents...');
            const uploadedDocs = await window.uploadFiles(window.uploadedFiles.vendor);
            window.AppLogger?.debug('Upload response:', uploadedDocs);
            if (uploadedDocs && uploadedDocs.length > 0) {
                // Combine existing documents with newly uploaded ones
                const existingDocs = window.currentVendorDocuments || [];
                vendorData.documents = [...existingDocs, ...uploadedDocs];
                window.AppLogger?.debug('Documents added to vendorData:', vendorData.documents);
            } else {
                // Upload failed, keep existing documents
                vendorData.documents = window.currentVendorDocuments || [];
            }
        } else {
            // No new uploads, preserve existing documents
            vendorData.documents = window.currentVendorDocuments || [];
        }
        
        window.AppLogger?.debug('Final vendor data:', vendorData);
        window.AppLogger?.debug('Documents type:', typeof vendorData.documents);
        window.AppLogger?.debug('Documents is array:', Array.isArray(vendorData.documents));
        
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
        const vendorId = `#${vendor._id.substring(0, 8).toUpperCase()}`;
        const ratingText = `${Number(vendor.rating || 0)}/5`;
        
        return `
        <tr onclick="showVendorDetail('${vendor._id}')">
            <td>
                <div class="vendor-identity">
                    <div class="vendor-info">
                        <div class="vendor-name">${vendor.name}</div>
                        <div class="vendor-id">${vendorId}</div>
                    </div>
                </div>
            </td>
            <td><a href="mailto:${vendor.email}" class="customer-email" onclick="event.stopPropagation()">${vendor.email}</a></td>
            <td><span class="customer-phone">${vendor.phone || 'N/A'}</span></td>
            <td><span class="vendor-category-badge ${vendor.category}">${vendor.category}</span></td>
            <td><div class="vendor-rating">${ratingText}</div></td>
            <td><span class="vendor-status-badge ${vendor.isActive ? 'active' : 'inactive'}">${vendor.isActive ? 'Active' : 'Inactive'}</span></td>
            <td onclick="event.stopPropagation()">
                <div class="vendor-actions">
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
        initializeVendorFilters();
        updateVendorFilterOptions(allVendors);
        filterVendors();
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
            vendor.notes
        ]).includes(searchTerm));
    }
    
    // Apply category filter
    if (categoryFilter !== 'all') {
        filtered = filtered.filter(vendor => normalizeFilterValue(vendor.category) === categoryFilter);
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
        const isActive = statusFilter === 'true';
        filtered = filtered.filter(vendor => getVendorActiveState(vendor) === isActive);
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
    
    const customerModal = document.getElementById('customerModal');
    customerModal.style.display = '';
    customerModal.classList.add('show');
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
        
        // Clear and populate documents
        if (window.uploadedFiles) {
            window.uploadedFiles.customer = [];
        }
        const preview = document.getElementById('customerDocsPreview');
        if (preview && customer.documents && customer.documents.length > 0) {
            preview.innerHTML = customer.documents.map((doc, index) => `
                <div class="doc-item">
                    <i class="fas fa-file-${getFileIcon(doc.name)}"></i>
                    <a href="${doc.url}" target="_blank">${doc.name}</a>
                    <i class="fas fa-times remove-doc" onclick="removeExistingCustomerDoc(${index})"></i>
                </div>
            `).join('');
            window.existingCustomerDocs = customer.documents;
        } else {
            if (preview) preview.innerHTML = '';
            window.existingCustomerDocs = [];
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
        // Upload documents if any
        if (window.uploadedFiles && window.uploadedFiles.customer && window.uploadedFiles.customer.length > 0) {
            window.AppLogger?.debug('Uploading customer documents:', window.uploadedFiles.customer.length, 'files');
            updateLoadingMessage('Uploading documents...');
            const uploadedDocs = await window.uploadFiles(window.uploadedFiles.customer);
            window.AppLogger?.debug('Upload response:', uploadedDocs);
            if (uploadedDocs && uploadedDocs.length > 0) {
                const existingDocs = window.existingCustomerDocs || [];
                customerData.documents = [...existingDocs, ...uploadedDocs];
                window.AppLogger?.debug('Documents added to customerData:', customerData.documents);
            } else {
                // Upload failed, keep existing documents
                customerData.documents = window.existingCustomerDocs || [];
            }
        } else {
            // No new uploads, preserve existing documents
            customerData.documents = window.existingCustomerDocs || [];
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
        const profileNotesEl = document.getElementById('profileNotes');
        if (profileNotesEl) {
            const notes = String(profileData.customer.notes || '').trim();
            profileNotesEl.textContent = notes || 'No notes available';
        }
        
        // Display custom fields
        window.AppLogger?.debug('Customer custom fields:', profileData.customer.customFields);
        const customFieldsContainer = document.getElementById('profileCustomFields');
        window.AppLogger?.debug('Custom fields container found:', customFieldsContainer);
        if (profileData.customer.customFields && profileData.customer.customFields.length > 0) {
            window.AppLogger?.debug('Displaying', profileData.customer.customFields.length, 'custom fields');
            customFieldsContainer.innerHTML = profileData.customer.customFields.map(field => 
                `<div class="info-item">
                    <label>${field.name}:</label>
                    <span>${field.value || '-'}</span>
                </div>`
            ).join('');
            customFieldsContainer.style.display = 'grid';
        } else {
            window.AppLogger?.debug('No custom fields to display');
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
                    <td>${formatDisplayDate(order.createdAt)}</td>
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
                            <div class="document-meta">${formatFileSize(doc.size)} • ${formatDisplayDate(doc.uploadedAt)}</div>
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
            <td><span class="customer-type-badge ${customer.customerType}">${customer.customerType}</span></td>
            <td><span class="customer-status-badge ${customer.status}">${customer.status}</span></td>
            <td><span class="customer-orders-count">${customer.totalOrders || 0}</span></td>
            <td onclick="event.stopPropagation()">
                <div class="customer-actions">
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
        ['one-time', 'One-time']
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
            customer.notes
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

window.removeExistingOrderDoc = function(index) {
    if (confirm('Are you sure you want to remove this document?')) {
        if (window.existingOrderDocs) {
            window.existingOrderDocs.splice(index, 1);
            const preview = document.getElementById('orderDocsPreview');
            if (window.existingOrderDocs.length > 0) {
                preview.innerHTML = window.existingOrderDocs.map((doc, idx) => `
                    <div class="doc-item">
                        <i class="fas fa-file-${getFileIcon(doc.name)}"></i>
                        <a href="${doc.url}" target="_blank">${doc.name}</a>
                        <i class="fas fa-times remove-doc" onclick="removeExistingOrderDoc(${idx})"></i>
                    </div>
                `).join('');
            } else {
                preview.innerHTML = '';
            }
        }
    }
};

window.removeExistingCustomerDoc = function(index) {
    if (confirm('Are you sure you want to remove this document?')) {
        if (window.existingCustomerDocs) {
            window.existingCustomerDocs.splice(index, 1);
            const preview = document.getElementById('customerDocsPreview');
            if (window.existingCustomerDocs.length > 0) {
                preview.innerHTML = window.existingCustomerDocs.map((doc, idx) => `
                    <div class="doc-item">
                        <i class="fas fa-file-${getFileIcon(doc.name)}"></i>
                        <a href="${doc.url}" target="_blank">${doc.name}</a>
                        <i class="fas fa-times remove-doc" onclick="removeExistingCustomerDoc(${idx})"></i>
                    </div>
                `).join('');
            } else {
                preview.innerHTML = '';
            }
        }
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

function getOrderFilterDate(order) {
    const dateValue = order.startDate || order.createdAt || order.endDate;
    const timestamp = dateValue ? new Date(dateValue).getTime() : NaN;
    return Number.isNaN(timestamp) ? null : timestamp;
}

function getOrderSearchText(order) {
    const customer = order.customer || {};
    const vendor = order.vendor || {};
    const employee = order.employee || {};
    const visibleStatus = order.pipelineStage || order.status || '';

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
        order.pipelineStage,
        visibleStatus,
        order.description,
        order.notes
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

function getOrderStatusFilterValues(order) {
    const rawValues = [order.status, order.pipelineStage];
    const normalizedValues = rawValues
        .map(normalizeOrderFilterValue)
        .filter(Boolean);
    const valueSet = new Set(normalizedValues);

    normalizedValues.forEach(value => {
        if (value === 'complete' || value === 'done' || value === 'finished' || value === 'closed' || value === 'paid' || value.includes('completed')) {
            valueSet.add('completed');
        }

        if (value.includes('progress') || value.includes('working') || value.includes('work-order') || value === 'scheduled') {
            valueSet.add('in-progress');
        }

        if (value.includes('cancel') || value === 'lost') {
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
        [order.status, order.pipelineStage].forEach(value => {
            const normalized = normalizeOrderFilterValue(value);
            if (!normalized || normalized === 'all' || statusMap.has(normalized)) return;
            statusMap.set(normalized, formatOrderFilterLabel(value));
        });
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
                profileAvatar.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%234CAF50'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Inter' font-size='50' fill='white'%3E${firstLetter}%3C/text%3E%3C/svg%3E`;
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
        const vendor = await window.APIService.getVendor(vendorId);
        window.AppLogger?.debug('Vendor data received:', vendor);
        window.AppLogger?.debug('Vendor notes:', vendor.notes);
        window.AppLogger?.debug('Vendor notes type:', typeof vendor.notes);
        
        document.getElementById('vendorDetailName').textContent = vendor.name;
        
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
                `<div style="margin-bottom: ${index < emailsToDisplay.length - 1 ? '5px' : '0'};"><strong>${email.label || 'Email ' + (index + 1)}:</strong> ${email.address || '-'}</div>`
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
                `<div style="margin-bottom: ${index < phonesToDisplay.length - 1 ? '5px' : '0'};"><strong>${phone.label || 'Phone ' + (index + 1)}:</strong> ${phone.number || '-'}</div>`
            ).join('');
        } else {
            window.AppLogger?.debug('No phone data found');
            phoneElement.textContent = '-';
        }
        
        document.getElementById('detailVendorCategory').textContent = vendor.category || '-';
        document.getElementById('detailVendorRating').textContent = `${Number(vendor.rating || 0)}/5`;
        document.getElementById('detailVendorAddress').textContent = vendor.address || '-';
        document.getElementById('detailVendorStatus').innerHTML = vendor.isActive 
            ? '<span style="color: #22c55e;">Active</span>' 
            : '<span style="color: #ef4444;">Inactive</span>';
        
        // Display notes if available
        const notesElement = document.getElementById('detailVendorNotes');
        if (notesElement) {
            const notesText = String(vendor.notes || '').trim() || 'No notes available';
            window.AppLogger?.debug('Setting notes text to:', notesText);
            notesElement.textContent = notesText;
        }
        
        // Display custom fields
        window.AppLogger?.debug('Vendor custom fields:', vendor.customFields);
        const customFieldsContainer = document.getElementById('detailVendorCustomFields');
        window.AppLogger?.debug('Custom fields container found:', customFieldsContainer);
        if (vendor.customFields && vendor.customFields.length > 0) {
            window.AppLogger?.debug('Displaying', vendor.customFields.length, 'custom fields');
            customFieldsContainer.innerHTML = vendor.customFields.map(field => 
                `<div class="info-item">
                    <label>${field.name}:</label>
                    <span>${field.value || '-'}</span>
                </div>`
            ).join('');
            customFieldsContainer.style.display = 'grid';
        } else {
            window.AppLogger?.debug('No custom fields to display');
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
                            <div class="document-meta">${formatFileSize(doc.size)} • ${formatDisplayDate(doc.uploadedAt)}</div>
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
                            <span><i class="fas fa-calendar"></i> ${(order.scheduleDate || order.startDate) ? formatDisplayDate(order.scheduleDate || order.startDate) : 'N/A'}</span>
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
                <div class="user-actions">
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
                    <button class="action-btn delete" onclick="deleteUser('${user._id}')" title="Delete User">
                        <i class="fas fa-trash"></i>
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
        recurringFields.style.display = 'block';
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
window.showSettings = showSettings;




