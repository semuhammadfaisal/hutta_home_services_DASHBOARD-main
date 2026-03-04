// API Service for Hutta Home Services
class APIService {
    constructor() {
        // Use relative API path when on production, localhost for development
        this.baseURL = window.location.hostname === 'localhost' 
            ? 'http://localhost:10000/api'
            : `${window.location.origin}/api`;
        this.token = this.getToken();
        this.demoMode = false; // Disable demo mode - using real backend
        this.requestCache = new Map();
        this.pendingRequests = new Map();
        console.log('APIService initialized - Demo Mode:', this.demoMode);
        console.log('API Base URL:', this.baseURL);
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
            console.log('Using demo mode for:', endpoint);
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
        
        console.log('Making request to:', `${this.baseURL}${endpoint}`);
        
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
                    
                    const errorMessage = data.message || data.error || `HTTP error! status: ${response.status}`;
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
        console.log('getMockResponse called for:', endpoint);
        return new Promise((resolve) => {
            setTimeout(() => {
                if (endpoint === '/auth/login') {
                    console.log('Returning mock login response');
                    resolve({
                        token: 'demo-token-' + Date.now(),
                        user: { email: 'admin@hutta.com', name: 'Admin User' }
                    });
                } else {
                    console.log('Returning generic mock response');
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
        return this.request('/orders');
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

    // Customers
    async getCustomers() {
        return this.request('/customers');
    }

    async getCustomer(id) {
        return this.request(`/customers/${id}`);
    }

    async createCustomer(customerData) {
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
        console.log('Creating vendor with data:', vendorData);
        console.log('Documents before stringify:', vendorData.documents);
        const body = JSON.stringify(vendorData);
        console.log('Body after stringify:', body);
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
        return this.request('/payments');
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
}

// Create global instance
window.APIService = new APIService();