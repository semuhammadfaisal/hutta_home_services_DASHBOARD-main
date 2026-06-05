// API Service for Hutta Home Services
class APIService {
    /** Normalize list endpoints that return { data, pagination } or a raw array. */
    unwrapListPayload(payload) {
        if (!payload) return [];
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload.data)) return payload.data;
        return [];
    }

    constructor() {
        // Use relative API path when on production, localhost for development
        this.baseURL = window.location.hostname === 'localhost' 
            ? 'http://localhost:10000/api'
            : `${window.location.origin}/api`;
        this.token = this.getToken();
        this.demoMode = false; // Disable demo mode - using real backend
        this.requestCache = new Map();
        this.pendingRequests = new Map();
        window.AppLogger?.debug('APIService initialized - Demo Mode:', this.demoMode);
        window.AppLogger?.debug('API Base URL:', this.baseURL);
    }

    getToken() {
        const session = localStorage.getItem('huttaSession') || sessionStorage.getItem('huttaSession');
        if (session) {
            try {
                const sessionData = JSON.parse(session);
                return sessionData.token;
            } catch (error) {
                console.error('Error parsing session:', error);
                return null;
            }
        }
        return null;
    }

    async request(endpoint, options = {}) {
        // Demo mode - return mock data
        if (this.demoMode) {
            window.AppLogger?.debug('Using demo mode for:', endpoint);
            return this.getMockResponse(endpoint, options);
        }
        
        // Request deduplication - prevent duplicate simultaneous requests
        const cacheKey = `${options.method || 'GET'}:${endpoint}`;
        if (this.pendingRequests.has(cacheKey)) {
            return this.pendingRequests.get(cacheKey);
        }
        
        // Check cache for GET requests (2 minute TTL)
        if (!options.method || options.method === 'GET') {
            const cached = this.requestCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < 2 * 60 * 1000) {
                return cached.data;
            }
        }
        
        window.AppLogger?.debug('Making request to:', `${this.baseURL}${endpoint}`);
        
        const url = `${this.baseURL}${endpoint}`;
        const token = this.getToken();
        
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        const requestPromise = (async () => {
            try {
                const response = await fetch(url, config);
                
                // Handle non-JSON responses
                const contentType = response.headers.get('content-type');
                let data;
                
                if (contentType && contentType.includes('application/json')) {
                    data = await response.json();
                } else {
                    const text = await response.text();
                    console.error('Non-JSON response:', text);
                    data = { message: text || 'Server returned non-JSON response' };
                }
                
                if (!response.ok) {
                    console.error('API Error Response:', {
                        status: response.status,
                        statusText: response.statusText,
                        data: data
                    });
                    
                    // Extract detailed error message
                    let errorMessage = 'Server error';
                    if (data.message) {
                        errorMessage = data.message;
                    } else if (data.error) {
                        errorMessage = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
                    } else if (data.errors) {
                        errorMessage = Array.isArray(data.errors) ? data.errors.join(', ') : JSON.stringify(data.errors);
                    } else {
                        errorMessage = `HTTP error! status: ${response.status}`;
                    }
                    
                    throw new Error(errorMessage);
                }
                
                // Cache successful GET requests
                if (!options.method || options.method === 'GET') {
                    this.requestCache.set(cacheKey, { data, timestamp: Date.now() });
                } else {
                    // Clear cache on mutations
                    this.clearCache();
                }
                
                return data;
            } catch (error) {
                console.error('API Error:', error);
                
                // Provide more specific error messages
                if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                    throw new Error('Network error: Unable to connect to server. Please check if the server is running.');
                }
                
                // If it's already a formatted error, re-throw it
                if (error.message && !error.message.includes('Failed to fetch')) {
                    throw error;
                }
                
                throw new Error('An unexpected error occurred. Please try again.');
            } finally {
                this.pendingRequests.delete(cacheKey);
            }
        })();
        
        this.pendingRequests.set(cacheKey, requestPromise);
        return requestPromise;
    }

    clearCache() {
        this.requestCache.clear();
        sessionStorage.removeItem('dashboardCache');
    }

    getMockResponse(endpoint, options) {
        window.AppLogger?.debug('getMockResponse called for:', endpoint);
        return new Promise((resolve) => {
            setTimeout(() => {
                if (endpoint === '/auth/login') {
                    window.AppLogger?.debug('Returning mock login response');
                    resolve({
                        token: 'demo-token-' + Date.now(),
                        user: { email: 'admin@hutta.com', name: 'Admin User' }
                    });
                } else if (endpoint.startsWith('/orders')) {
                    resolve({ data: [], pagination: { page: 1, limit: 5000, total: 0, pages: 1 } });
                } else {
                    window.AppLogger?.debug('Returning generic mock response');
                    resolve({ success: true, data: [] });
                }
            }, 500);
        });
    }

    // Authentication
    async signup(userData) {
        return this.request('/auth/signup', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
    }

    async forgotPassword(email) {
        return this.request('/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
    }

    async resetPassword(token, password) {
        return this.request('/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ token, password })
        });
    }

    async login(email, password) {
        const response = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        
        if (response.token) {
            this.token = response.token;
            const sessionData = {
                token: response.token,
                user: response.user,
                loginTime: new Date().toISOString(),
                isAuthenticated: true
            };
            
            localStorage.setItem('huttaSession', JSON.stringify(sessionData));
        }
        
        return response;
    }

    async getOrder(id) {
        return this.request(`/orders/${id}`);
    }

    async deleteOrder(id) {
        return this.request(`/orders/${id}`, {
            method: 'DELETE'
        });
    }

    // Update profile
    async updateProfile(profileData) {
        return this.request('/auth/profile', {
            method: 'PUT',
            body: JSON.stringify(profileData)
        });
    }

    // Orders
    async getOrders() {
        const raw = await this.request('/orders?limit=5000');
        return this.unwrapListPayload(raw);
    }

    async getOrdersFresh() {
        const cacheKey = 'GET:/orders?limit=5000';
        this.requestCache.delete(cacheKey);
        this.requestCache.delete('GET:/orders');
        const raw = await this.request('/orders?limit=5000');
        return this.unwrapListPayload(raw);
    }

    async getPaymentsCollected() {
        // Always fresh - bypass cache
        const cacheKey = 'GET:/pipeline-records/kpi/payments-collected';
        this.requestCache.delete(cacheKey);
        return this.request('/pipeline-records/kpi/payments-collected');
    }

    async createOrder(orderData) {
        return this.request('/orders', {
            method: 'POST',
            body: JSON.stringify(orderData)
        });
    }

    async updateOrder(id, orderData) {
        return this.request(`/orders/${id}`, {
            method: 'PUT',
            body: JSON.stringify(orderData)
        });
    }

    async getOrderStats() {
        return this.request('/orders/stats');
    }

    async getDashboardStats(filters = {}) {
        const params = new URLSearchParams();
        if (filters.topStartDate) params.append('topStartDate', filters.topStartDate);
        if (filters.topEndDate) params.append('topEndDate', filters.topEndDate);
        if (filters.refresh) params.append('refresh', '1');
        const query = params.toString();
        try {
            return await this.request(`/dashboard/stats${query ? `?${query}` : ''}`);
        } catch (error) {
            if (!/not found|404/i.test(error.message || '')) {
                throw error;
            }

            console.warn('Dashboard stats endpoint not available; using legacy dashboard data fallback.');
            return this.getLegacyDashboardStats(filters);
        }
    }

    async getLegacyDashboardStats(filters = {}) {
        const [statsApi, vendors, employees, kpi, orders, payments] = await Promise.all([
            this.getOrderStats().catch(() => ({})),
            this.getVendors().catch(() => []),
            this.getEmployees().catch(() => []),
            this.getPaymentsCollected().catch(() => ({ paymentsCollected: 0 })),
            this.getOrdersFresh().catch(() => []),
            this.getPayments().catch(() => [])
        ]);

        const totalRevenue = Number(statsApi.totalRevenue || 0);
        const paymentsCollected = Number(kpi.paymentsCollected || 0);
        const vendorCategories = (vendors || []).reduce((acc, vendor) => {
            const key = vendor.category || 'uncategorized';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});

        const employeeLeaderboard = (employees || []).map(employee => {
            const employeeOrders = (orders || []).filter(order =>
                order.employee &&
                (order.employee._id === employee._id || order.employee === employee._id)
            );
            return {
                id: employee._id,
                name: employee.name,
                revenue: employeeOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0),
                orderCount: employeeOrders.length
            };
        }).filter(employee => employee.revenue > 0)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);

        const filteredTopOrders = (orders || []).filter(order => {
            if (!filters.topStartDate && !filters.topEndDate) return true;
            const date = new Date(order.createdAt || order.startDate);
            if (Number.isNaN(date.getTime())) return false;
            const start = filters.topStartDate ? new Date(`${filters.topStartDate}T00:00:00`) : null;
            const end = filters.topEndDate ? new Date(`${filters.topEndDate}T23:59:59.999`) : null;
            return (!start || date >= start) && (!end || date <= end);
        });

        const customerMap = new Map();
        filteredTopOrders.forEach(order => {
            const customer = order.customer || {};
            const key = order.customerId || customer.email || customer.name || 'unknown';
            const current = customerMap.get(String(key)) || {
                name: customer.name || 'Customer',
                email: customer.email || '',
                totalRevenue: 0,
                totalOrders: 0
            };
            current.totalRevenue += Number(order.amount || 0);
            current.totalOrders += 1;
            customerMap.set(String(key), current);
        });

        const revenueByDate = new Map();
        const statusMap = new Map();
        const profitByMonth = new Map();
        const serviceCategoryMap = new Map();
        const normalizeOrderOverviewText = (value) => String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
        const getOrderOverviewStatus = (order = {}) => {
            const status = normalizeOrderOverviewText(order.status);
            const stage = normalizeOrderOverviewText(order.pipelineStage);
            const combined = `${status} ${stage}`;
            if (/(cancel|lost)/.test(combined)) return 'cancelled';
            if (status === 'delayed' || /delayed|on-hold|hold/.test(stage)) return 'delayed';
            if (status === 'completed' || /completed|complete|paid|closed|done/.test(stage)) return 'completed';
            if (status === 'in-progress' || /in-progress|work|active|scheduled|assigned|dispatch/.test(stage)) return 'inProgress';
            if (status === 'new' || /new|lead|request|intake/.test(stage)) return 'newOrders';
            return null;
        };
        const ordersOverview = {
            version: 'real-orders-v2',
            newOrders: 0,
            inProgress: 0,
            completed: 0,
            delayed: 0,
            cancelled: 0,
            highPriority: 0
        };
        (orders || []).forEach(order => {
            const date = new Date(order.createdAt || order.startDate);
            const status = order.status || 'unknown';
            statusMap.set(status, (statusMap.get(status) || 0) + 1);
            const overviewBucket = getOrderOverviewStatus(order);
            if (overviewBucket) ordersOverview[overviewBucket] += 1;
            if (['high', 'urgent'].includes(normalizeOrderOverviewText(order.priority))) {
                ordersOverview.highPriority += 1;
            }
            const serviceLabel = String(order.service || '').trim() || 'Uncategorized';
            const serviceKey = serviceLabel.toLowerCase();
            const serviceCategory = serviceCategoryMap.get(serviceKey) || {
                key: serviceKey,
                label: serviceLabel,
                orders: 0,
                revenue: 0
            };
            serviceCategory.orders += 1;
            serviceCategory.revenue += Number(order.amount || 0);
            serviceCategoryMap.set(serviceKey, serviceCategory);
            if (!Number.isNaN(date.getTime())) {
                const key = date.toISOString().slice(0, 10);
                const monthKey = key.slice(0, 7);
                const current = revenueByDate.get(key) || { date: key, amount: 0, orders: 0 };
                const monthly = profitByMonth.get(monthKey) || { month: monthKey, revenue: 0, cost: 0, profit: 0 };
                const revenue = Number(order.amount || 0);
                const cost = Number(order.vendorCost || 0);
                current.amount += revenue;
                current.orders += 1;
                monthly.revenue += revenue;
                monthly.cost += cost;
                monthly.profit += revenue - cost;
                revenueByDate.set(key, current);
                profitByMonth.set(monthKey, monthly);
            }
        });

        const customerTypeMap = new Map();
        const customers = await this.getCustomers().catch(() => []);
        (customers || []).forEach(customer => {
            const type = customer.customerType || 'unknown';
            customerTypeMap.set(type, (customerTypeMap.get(type) || 0) + 1);
        });
        const topCustomer = [...customerMap.values()]
            .filter(customer => customer.totalRevenue > 0)
            .sort((a, b) => b.totalRevenue - a.totalRevenue)
            .slice(0, 1)[0] || null;
        const topEmployee = employeeLeaderboard[0] || null;
        const topVendorMap = new Map();
        (orders || []).forEach(order => {
            if (!order.vendor) return;
            const vendorId = typeof order.vendor === 'object' ? order.vendor._id : order.vendor;
            const key = String(vendorId || order.vendor?.name || 'unknown');
            const current = topVendorMap.get(key) || {
                id: vendorId,
                name: typeof order.vendor === 'object' ? order.vendor.name : 'Vendor',
                category: typeof order.vendor === 'object' ? order.vendor.category : '',
                revenue: 0,
                cost: 0,
                orderCount: 0
            };
            current.revenue += Number(order.amount || 0);
            current.cost += Number(order.vendorCost || 0);
            current.orderCount += 1;
            topVendorMap.set(key, current);
        });
        const serviceCategoryOverview = [...serviceCategoryMap.values()].sort((a, b) => {
            if (b.revenue !== a.revenue) return b.revenue - a.revenue;
            if (b.orders !== a.orders) return b.orders - a.orders;
            return a.label.localeCompare(b.label);
        });
        const mostRequestedService = [...serviceCategoryOverview].sort((a, b) => {
            if (b.orders !== a.orders) return b.orders - a.orders;
            if (b.revenue !== a.revenue) return b.revenue - a.revenue;
            return a.label.localeCompare(b.label);
        })[0] || null;
        const highestRevenueOrder = [...(orders || [])].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0];
        const highestRevenueJob = highestRevenueOrder ? {
            id: highestRevenueOrder._id,
            orderId: highestRevenueOrder.orderId,
            customerName: highestRevenueOrder.customer?.name || 'Customer',
            service: highestRevenueOrder.service || 'Service',
            revenue: Number(highestRevenueOrder.amount || 0),
            cost: Number(highestRevenueOrder.vendorCost || 0),
            profit: Number(highestRevenueOrder.profit ?? (Number(highestRevenueOrder.amount || 0) - Number(highestRevenueOrder.vendorCost || 0))),
            status: highestRevenueOrder.pipelineStage || highestRevenueOrder.status || 'unknown'
        } : null;

        return {
            totalOrders: statsApi.totalOrders ?? orders.length,
            totalCustomers: statsApi.totalCustomers ?? 0,
            totalVendors: vendors.length,
            totalEmployees: employees.length,
            totalRevenue,
            paymentsCollected,
            pendingPayments: Math.max(totalRevenue - paymentsCollected, 0),
            monthlyGrowth: { orders: 0, revenue: 0 },
            workflow: {
                newRequests: orders.filter(order => order.status === 'new').length,
                workOrders: orders.filter(order => order.status === 'in-progress').length,
                activeWork: orders.filter(order => ['in-progress', 'delayed'].includes(order.status)).length,
                completedWork: orders.filter(order => order.status === 'completed').length
            },
            vendorCategories,
            employeeLeaderboard,
            recentActivity: [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5),
            topCustomers: [...customerMap.values()]
                .filter(customer => customer.totalRevenue > 0)
                .sort((a, b) => b.totalRevenue - a.totalRevenue)
                .slice(0, 10),
            orderStatusBreakdown: [...statusMap.entries()].map(([status, count]) => ({ status, count })),
            ordersOverview,
            monthlyProfitTimeline: [...profitByMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-6),
            customerTypeBreakdown: [...customerTypeMap.entries()].map(([type, count]) => ({ type, count })),
            serviceCategoryOverview,
            topPerformance: {
                topCustomer,
                topVendor: [...topVendorMap.values()].sort((a, b) => {
                    if (b.revenue !== a.revenue) return b.revenue - a.revenue;
                    return b.orderCount - a.orderCount;
                })[0] || null,
                topEmployee,
                mostRequestedService,
                highestRevenueJob
            },
            revenueTimeline: [...revenueByDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
            financialOverview: {
                totalRevenue,
                totalCost: orders.reduce((sum, order) => sum + Number(order.vendorCost || 0), 0),
                totalProfit: orders.reduce((sum, order) => sum + Number(order.profit || 0), 0),
                ytdRevenue: totalRevenue,
                monthRevenue: statsApi.monthlyRevenue || 0,
                monthSales: 0
            }
        };
    }

    // Customers
    async getCustomers() {
        const raw = await this.request('/customers?limit=5000');
        return this.unwrapListPayload(raw);
    }

    async getCustomer(id) {
        return this.request(`/customers/${id}`);
    }

    async createCustomer(customerData) {
        window.AppLogger?.debug('Creating customer with data:', customerData);
        window.AppLogger?.debug('Documents:', customerData.documents);
        return this.request('/customers', {
            method: 'POST',
            body: JSON.stringify(customerData)
        });
    }

    async updateCustomer(id, customerData) {
        return this.request(`/customers/${id}`, {
            method: 'PUT',
            body: JSON.stringify(customerData)
        });
    }

    async deleteCustomer(id) {
        return this.request(`/customers/${id}`, {
            method: 'DELETE'
        });
    }

    async getCustomerProfile(id) {
        return this.request(`/customers/${id}/profile`);
    }

    // Vendors
    async getVendors() {
        return this.request('/vendors');
    }

    async getVendor(id) {
        return this.request(`/vendors/${id}`);
    }

    async createVendor(vendorData) {
        window.AppLogger?.debug('Creating vendor with data:', vendorData);
        window.AppLogger?.debug('Documents before stringify:', vendorData.documents);
        const body = JSON.stringify(vendorData);
        window.AppLogger?.debug('Body after stringify:', body);
        return this.request('/vendors', {
            method: 'POST',
            body: body
        });
    }

    async updateVendor(id, vendorData) {
        return this.request(`/vendors/${id}`, {
            method: 'PUT',
            body: JSON.stringify(vendorData)
        });
    }

    async deleteVendor(id) {
        return this.request(`/vendors/${id}`, {
            method: 'DELETE'
        });
    }

    // Projects
    async getProjects() {
        return this.request('/projects');
    }

    async getProject(id) {
        return this.request(`/projects/${id}`);
    }

    async createProject(projectData) {
        return this.request('/projects', {
            method: 'POST',
            body: JSON.stringify(projectData)
        });
    }

    async updateProject(id, projectData) {
        return this.request(`/projects/${id}`, {
            method: 'PUT',
            body: JSON.stringify(projectData)
        });
    }

    async deleteProject(id) {
        return this.request(`/projects/${id}`, {
            method: 'DELETE'
        });
    }

    // Payments
    async getPayments() {
        const raw = await this.request('/payments?limit=5000');
        return this.unwrapListPayload(raw);
    }

    async getPayment(id) {
        return this.request(`/payments/${id}`);
    }

    async createPayment(paymentData) {
        return this.request('/payments', {
            method: 'POST',
            body: JSON.stringify(paymentData)
        });
    }

    async updatePayment(id, paymentData) {
        return this.request(`/payments/${id}`, {
            method: 'PUT',
            body: JSON.stringify(paymentData)
        });
    }

    async deletePayment(id) {
        return this.request(`/payments/${id}`, {
            method: 'DELETE'
        });
    }

    // Reports
    async getAnalyticsReport(filters = {}) {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value) params.append(key, value);
        });
        return this.request(`/reports/analytics?${params}`);
    }

    async getFinancialReport(startDate, endDate) {
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        return this.request(`/reports/financial?${params}`);
    }

    async getOrdersReport(startDate, endDate) {
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        return this.request(`/reports/orders?${params}`);
    }

    async getCustomersReport() {
        return this.request('/reports/customers');
    }

    async getProjectsReport() {
        return this.request('/reports/projects');
    }

    // Settings
    async getSettings() {
        return this.request('/settings');
    }

    async updateSettings(settingsData) {
        return this.request('/settings', {
            method: 'PUT',
            body: JSON.stringify(settingsData)
        });
    }

    async resetSettings() {
        return this.request('/settings/reset', {
            method: 'POST'
        });
    }

    // Notifications
    async getNotifications() {
        return this.request('/notifications');
    }

    async getUnreadCount() {
        return this.request('/notifications/unread-count');
    }

    async markAsRead(notificationId) {
        return this.request(`/notifications/${notificationId}/read`, {
            method: 'PUT'
        });
    }

    async markAllAsRead() {
        return this.request('/notifications/mark-all-read', {
            method: 'PUT'
        });
    }

    // Employees
    async getEmployees() {
        return this.request('/employees');
    }

    async getEmployee(id) {
        return this.request(`/employees/${id}`);
    }

    async createEmployee(employeeData) {
        return this.request('/employees', {
            method: 'POST',
            body: JSON.stringify(employeeData)
        });
    }

    async updateEmployee(id, employeeData) {
        return this.request(`/employees/${id}`, {
            method: 'PUT',
            body: JSON.stringify(employeeData)
        });
    }

    async deleteEmployee(id) {
        return this.request(`/employees/${id}`, {
            method: 'DELETE'
        });
    }

    async getEmployeeStats(id) {
        return this.request(`/employees/${id}/stats`);
    }

    // Users (Admin only)
    async getUsers() {
        const raw = await this.request('/users?limit=2000');
        return this.unwrapListPayload(raw);
    }

    async createUser(userData) {
        return this.request('/users', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
    }

    async assignUserRole(userId, role) {
        return this.request(`/users/${userId}/role`, {
            method: 'PATCH',
            body: JSON.stringify({ role })
        });
    }

    async deleteUser(userId) {
        return this.request(`/users/${userId}`, {
            method: 'DELETE'
        });
    }
}

// Create global instance
window.APIService = new APIService();
