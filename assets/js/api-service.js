// API Service for smplfix
window.AuthSession = window.AuthSession || { user: null, csrfToken: null, expiresAt: null };
window.AuthSession.lastUserActivityAt = Date.now();
['pointerdown', 'keydown', 'touchstart'].forEach(eventName => {
    window.addEventListener(eventName, () => { window.AuthSession.lastUserActivityAt = Date.now(); }, { capture: true, passive: true });
});

class APIService {
    /** Normalize list endpoints that return { data, pagination } or a raw array. */
    unwrapListPayload(payload) {
        if (!payload) return [];
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload.data)) return payload.data;
        return [];
    }

    constructor() {
        localStorage.removeItem('huttaSession');
        sessionStorage.removeItem('huttaSession');
        // Use relative API path when on production, localhost for development
        this.baseURL = window.location.hostname === 'localhost' 
            ? 'http://localhost:10000/api'
            : `${window.location.origin}/api`;
        this.demoMode = false; // Disable demo mode - using real backend
        this.requestCache = new Map();
        this.pendingRequests = new Map();
        window.AppLogger?.debug('APIService initialized - Demo Mode:', this.demoMode);
        window.AppLogger?.debug('API Base URL:', this.baseURL);
    }

    getToken() {
        return null;
    }

    setSession(payload) {
        localStorage.removeItem('huttaSession');
        sessionStorage.removeItem('huttaSession');
        window.AuthSession.user = payload?.user || null;
        window.AuthSession.csrfToken = payload?.csrfToken || null;
        window.AuthSession.expiresAt = payload?.expiresAt || null;
        return window.AuthSession;
    }

    clearSession() {
        this.setSession(null);
        localStorage.removeItem('huttaSession');
        sessionStorage.removeItem('huttaSession');
        sessionStorage.removeItem('dashboardCache');
        this.clearCache();
    }

    handleUnauthorized() {
        this.clearSession();
        window.dispatchEvent(new CustomEvent('hutta:session-expired'));
        if (!window.location.pathname.endsWith('/login.html') && !window.location.pathname.endsWith('/agent-invitation.html')) {
            window.location.replace('/pages/login.html');
        }
    }

    async request(endpoint, options = {}) {
        const scopedLists = new Set(['/workflow-center/overview', '/workflow-center/requests', '/incoming-quotes/orders', '/incoming-quotes/eligible-orders', '/outgoing-quotes/orders', '/outgoing-quotes/approvals', '/scheduling/orders', '/closeout/orders']);
        if ((!options.method || options.method === 'GET') && scopedLists.has(endpoint.split('?')[0])) {
            const query = new URLSearchParams(endpoint.split('?')[1] || '');
            if (!query.has('workspace')) query.set('workspace', window.ServiceRequestsActive ? 'service-requests' : 'workflow-center');
            endpoint = `${endpoint.split('?')[0]}?${query}`;
        }
        // Demo mode - return mock data
        if (this.demoMode) {
            window.AppLogger?.debug('Using demo mode for:', endpoint);
            return this.getMockResponse(endpoint, options);
        }
        
        // Request deduplication - prevent duplicate simultaneous requests
        const cacheKey = `${options.method || 'GET'}:${endpoint}`;
        const cacheableGet = (!options.method || options.method === 'GET') && !endpoint.startsWith('/auth/');
        if (this.pendingRequests.has(cacheKey)) {
            return this.pendingRequests.get(cacheKey);
        }
        
        // Check cache for GET requests (2 minute TTL)
        if (cacheableGet) {
            const cached = this.requestCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < 2 * 60 * 1000) {
                return cached.data;
            }
        }
        
        window.AppLogger?.debug('Making request to:', `${this.baseURL}${endpoint}`);
        
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            credentials: 'include',
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        const method = String(config.method || 'GET').toUpperCase();
        if (Date.now() - window.AuthSession.lastUserActivityAt < 60 * 1000) {
            config.headers['X-Session-Activity'] = 'active';
        }
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && window.AuthSession.csrfToken) {
            config.headers['X-CSRF-Token'] = window.AuthSession.csrfToken;
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
                    if (response.status === 401) this.handleUnauthorized();
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
                    
                    const requestError = new Error(errorMessage);
                    requestError.data = data;
                    requestError.status = response.status;
                    throw requestError;
                }
                
                // Cache successful GET requests
                if (cacheableGet) {
                    this.requestCache.set(cacheKey, { data, timestamp: Date.now() });
                } else {
                    // Clear cache on mutations
                    this.clearCache();
                }
                if (data?.sync) {
                    window.dispatchEvent(new CustomEvent('order:status-changed', { detail: data.sync }));
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

    async refreshMutationSession(expectedUserId) {
        const session = await this.getSession();
        const actualUserId = session.user?.id || session.user?.userId;
        if (expectedUserId && String(actualUserId) !== String(expectedUserId)) {
            this.clearCache();
            const error = new Error('Your signed-in account changed in another tab. Refresh this portal before submitting.');
            error.status = 409;
            throw error;
        }
        if (!session.csrfToken) throw new Error('Could not verify your session. Please sign in again.');
    }

    async requestForm(endpoint, formData, method = 'POST', extraHeaders = {}) {
        const expectedUserId = window.AuthSession.user?.id || window.AuthSession.user?.userId;
        // Cookie sessions are shared between tabs; in-memory CSRF tokens are not.
        // Refresh before upload, and retry only a rejection from the CSRF boundary.
        await this.refreshMutationSession(expectedUserId);
        for (let attempt = 0; attempt < 2; attempt += 1) {
        const headers = { ...extraHeaders };
        if (Date.now() - window.AuthSession.lastUserActivityAt < 60 * 1000) {
            headers['X-Session-Activity'] = 'active';
        }
        if (window.AuthSession.csrfToken) headers['X-CSRF-Token'] = window.AuthSession.csrfToken;
        const response = await fetch(`${this.baseURL}${endpoint}`, {
            method,
            credentials: 'include',
            headers,
            body: formData
        });
        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
            ? await response.json()
            : { message: await response.text() };
        if (!response.ok) {
            if (response.status === 403 && data.code === 'CSRF_INVALID' && attempt === 0) {
                await this.refreshMutationSession(expectedUserId);
                continue;
            }
            if (response.status === 401) this.handleUnauthorized();
            const error = new Error(data.message || data.error || `HTTP error! status: ${response.status}`);
            error.status = response.status;
            error.data = data;
            throw error;
        }
        this.clearCache();
        if (data?.sync) {
            window.dispatchEvent(new CustomEvent('order:status-changed', { detail: data.sync }));
        }
        return data;
        }
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
                        user: { email: 'admin@smplfix.com', name: 'Admin User' }
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

    async login(email, password, returnTo = '') {
        const response = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password, returnTo })
        });
        
        this.setSession(response);
        return response;
    }

    async getSession() {
        const response = await this.request('/auth/session', { cache: 'no-store' });
        this.setSession(response);
        return response;
    }

    async getProfile() {
        return this.request('/auth/profile');
    }

    async signupVendor(payload) { return this.request('/auth/vendor-signup', { method: 'POST', body: JSON.stringify(payload || {}) }); }
    async getVendorPortal() { return this.request('/vendor-portal/me'); }
    async getVendorLeads() { return this.request('/vendor-portal/leads'); }
    async respondToVendorLead(invitationId, payload) { return this.request(`/vendor-portal/leads/${encodeURIComponent(invitationId)}/respond`, { method: 'POST', body: JSON.stringify(payload || {}) }); }
    async getVendorEstimateDraft(invitationId) { return this.request(`/vendor-portal/leads/${encodeURIComponent(invitationId)}/estimate-draft`); }
    async parseVendorEstimate(invitationId, formData) { return this.requestForm(`/vendor-portal/leads/${encodeURIComponent(invitationId)}/estimate-draft/parse`, formData); }
    async saveVendorEstimateDraft(invitationId, payload) { return this.request(`/vendor-portal/leads/${encodeURIComponent(invitationId)}/estimate-draft`, { method: 'PUT', body: JSON.stringify(payload || {}) }); }
    async submitVendorEstimateDraft(invitationId) { return this.request(`/vendor-portal/leads/${encodeURIComponent(invitationId)}/estimate-draft/submit`, { method: 'POST', body: JSON.stringify({ confirmed: true }) }); }
    async getVendorAssignments() { return this.request('/vendor-portal/assignments'); }
    async getVendorAssignment(assignmentId) { return this.request(`/vendor-portal/assignments/${encodeURIComponent(assignmentId)}`); }
    async respondToVendorSchedule(assignmentId, payload) { return this.request(`/vendor-portal/assignments/${encodeURIComponent(assignmentId)}/schedule-response`, { method: 'POST', body: JSON.stringify(payload || {}) }); }
    async updateVendorAssignmentStatus(assignmentId, status, note = '') { return this.request(`/vendor-portal/assignments/${encodeURIComponent(assignmentId)}/status`, { method: 'PATCH', body: JSON.stringify({ status, note }) }); }
    async sendVendorAssignmentMessage(assignmentId, body) { return this.request(`/vendor-portal/assignments/${encodeURIComponent(assignmentId)}/messages`, { method: 'POST', body: JSON.stringify({ body }) }); }
    async submitVendorAssignmentCompletion(assignmentId, formData) { return this.requestForm(`/vendor-portal/assignments/${encodeURIComponent(assignmentId)}/completion`, formData); }
    async getVendorInvoices() { return this.request('/vendor-portal/invoices'); }
    async submitVendorInvoice(assignmentId, formData) { return this.requestForm(`/vendor-portal/assignments/${encodeURIComponent(assignmentId)}/invoices`, formData); }
    async getVendorPerformance() { return this.request('/vendor-portal/performance'); }
    async updateVendorProfile(payload) { return this.request('/vendor-portal/profile', { method: 'PATCH', body: JSON.stringify(payload || {}) }); }
    async updateVendorCompliance(payload) { return this.request('/vendor-portal/compliance', { method: 'PATCH', body: JSON.stringify(payload || {}) }); }
    async uploadVendorComplianceDocument(type, formData) { return this.requestForm(`/vendor-portal/documents/${encodeURIComponent(type)}`, formData); }
    async startVendorStripeOnboarding() { return this.request('/vendor-portal/stripe-connect/onboarding', { method: 'POST', body: '{}' }); }
    async refreshVendorStripeStatus() { return this.request('/vendor-portal/stripe-connect/refresh', { method: 'POST', body: '{}' }); }
    async verifyVendorRoc() { return this.request('/vendor-portal/roc-verification', { method: 'POST', body: '{}' }); }

    // Residential Client Portal (server-scoped; never uses internal CRM routes)
    async getResidentialHome() { return this.request('/residential/me'); }
    async getResidentialProperties() { return this.request('/residential/properties'); }
    async addResidentialProperty(payload) { return this.request('/residential/properties', { method: 'POST', body: JSON.stringify(payload) }); }
    async getResidentialProperty(propertyId) { return this.request(`/residential/properties/${encodeURIComponent(propertyId)}`); }
    async getResidentialOrders(params = '') { return this.request(`/residential/orders${params ? `?${params}` : ''}`); }
    async getResidentialOrder(orderId) { return this.request(`/residential/orders/${encodeURIComponent(orderId)}`); }
    async getResidentialEstimates(params = '') { return this.request(`/residential/estimates${params ? `?${params}` : ''}`); }
    async getResidentialEstimate(quoteId) { return this.request(`/residential/estimates/${encodeURIComponent(quoteId)}`); }
    async decideResidentialEstimate(quoteId, payload) {
        return this.request(`/residential/estimates/${encodeURIComponent(quoteId)}/decision`, {
            method: 'POST', body: JSON.stringify(payload || {})
        });
    }
    async getResidentialSchedules(params = '') { return this.request(`/residential/schedules${params ? `?${params}` : ''}`); }
    async getResidentialInvoices(params = '') { return this.request(`/residential/invoices${params ? `?${params}` : ''}`); }
    async getResidentialActivity(limit = 50) { return this.request(`/residential/activity?limit=${encodeURIComponent(limit)}`); }
    async getResidentialBilling(propertyId) { return this.request(`/residential/billing?propertyId=${encodeURIComponent(propertyId)}`); }
    async createResidentialCardSetupSession(propertyId) {
        return this.request('/residential/billing/setup-session', { method: 'POST', body: JSON.stringify({ propertyId }) });
    }
    async createResidentialBillingPortalSession(propertyId) {
        return this.request('/residential/billing/portal-session', { method: 'POST', body: JSON.stringify({ propertyId }) });
    }
    async getResidentialAutopilot(propertyId) { return this.request(`/residential/features/properties/${encodeURIComponent(propertyId)}/autopilot`); }
    async updateResidentialAutopilot(propertyId, payload) { return this.request(`/residential/features/properties/${encodeURIComponent(propertyId)}/autopilot`, { method: 'PUT', body: JSON.stringify(payload || {}) }); }
    async getResidentialMaintenance(propertyId) { return this.request(`/residential/features/properties/${encodeURIComponent(propertyId)}/maintenance`); }
    async getResidentialSeasonalRecommendations(propertyId) { return this.request(`/residential/features/properties/${encodeURIComponent(propertyId)}/seasonal-recommendations`); }
    async getResidentialPassport(propertyId) { return this.request(`/residential/features/properties/${encodeURIComponent(propertyId)}/passport`); }
    async addResidentialPassportEntry(propertyId, payload) { return this.request(`/residential/features/properties/${encodeURIComponent(propertyId)}/passport/entries`, { method: 'POST', body: JSON.stringify(payload || {}) }); }
    async uploadResidentialPassportDocument(propertyId, formData) { return this.requestForm(`/residential/features/properties/${encodeURIComponent(propertyId)}/passport/documents`, formData); }
    async getResidentialUtilities(propertyId) { return this.request(`/residential/features/properties/${encodeURIComponent(propertyId)}/utilities`); }
    async addResidentialUtility(propertyId, payload) { return this.request(`/residential/features/properties/${encodeURIComponent(propertyId)}/utilities`, { method: 'POST', body: JSON.stringify(payload || {}) }); }
    async getResidentialMessages(orderId) { return this.request(`/residential/features/orders/${encodeURIComponent(orderId)}/messages`); }
    async sendResidentialMessage(orderId, body) { return this.request(`/residential/features/orders/${encodeURIComponent(orderId)}/messages`, { method: 'POST', body: JSON.stringify({ body }) }); }
    async getResidentialNotifications() { return this.request('/residential/features/notifications'); }
    async readResidentialNotification(notificationId) { return this.request(`/residential/features/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'PATCH', body: '{}' }); }
    async getResidentialAccount() { return this.request('/residential/features/account'); }
    async updateResidentialAccount(payload) { return this.request('/residential/features/account', { method: 'PUT', body: JSON.stringify(payload || {}) }); }
    async getResidentialReferrals() { return this.request('/residential/features/referrals'); }
    async getAgentProfile() { return this.request('/agent/me'); }
    async getAgentPortfolio() { return this.request('/agent/portfolio'); }
    async getAgentClients() { return this.request('/agent/clients'); }
    async getAgentProperties() { return this.request('/agent/properties'); }
    async getAgentTransactions() { return this.request('/agent/transactions'); }
    async getAgentTransactionHistory() { return this.request('/agent/transaction-history'); }
    async getAgentTransaction(transactionId) { return this.request(`/agent/transactions/${encodeURIComponent(transactionId)}`); }
    async getAgentTransactionOrders(transactionId) { return this.request(`/agent/transactions/${encodeURIComponent(transactionId)}/orders`); }
    async getAgentOrders() { return this.request('/agent/orders'); }
    async getAgentActivity(limit = 30) { return this.request(`/agent/activity?limit=${encodeURIComponent(limit)}`); }
    async getAgentReferrals() { return this.request('/agent/referrals'); }
    async getAgentNotifications() { return this.request('/agent/notifications'); }
    async readAgentNotification(notificationId) { return this.request(`/agent/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'PATCH', body: '{}' }); }
    async acceptAgentInvitation(token) { return this.request('/agent/invitations/accept', { method: 'POST', body: JSON.stringify({ token }) }); }
    async getAgentRequestGuidance(transactionId, serviceCategory) { return this.request(`/agent/transactions/${encodeURIComponent(transactionId)}/request-guidance?serviceCategory=${encodeURIComponent(serviceCategory)}`); }
    async createAgentRequest(transactionId, formData, idempotencyKey) { return this.requestForm(`/agent/transactions/${encodeURIComponent(transactionId)}/requests`, formData, 'POST', { 'Idempotency-Key': idempotencyKey }); }
    async getAgentTransactionPackage(transactionId) { return this.request(`/agent/transactions/${encodeURIComponent(transactionId)}/package`); }
    async getAgentMessages(orderId) { return this.request(`/agent/orders/${encodeURIComponent(orderId)}/messages`); }
    async sendAgentMessage(orderId, body) { return this.request(`/agent/orders/${encodeURIComponent(orderId)}/messages`, { method: 'POST', body: JSON.stringify({ body }) }); }
    async getAgentClientInvitations() { return this.request('/agent/client-invitations'); }
    async getAgentClientInvitationProperties() { return this.request('/agent/client-invitation-properties'); }
    async createAgentClientInvitation(payload) { return this.request('/agent/client-invitations', { method: 'POST', body: JSON.stringify(payload || {}) }); }
    async resendAgentClientInvitation(invitationId) { return this.request(`/agent/client-invitations/${encodeURIComponent(invitationId)}/resend`, { method: 'POST', body: '{}' }); }
    async revokeAgentClientInvitation(invitationId, reason) { return this.request(`/agent/client-invitations/${encodeURIComponent(invitationId)}/revoke`, { method: 'POST', body: JSON.stringify({ reason }) }); }
    async previewAgentClientInvitation(token) { return this.request('/residential/agent-invitations/preview', { headers: { 'X-Invitation-Token': token } }); }
    async acceptAgentClientInvitation(token, payload) { return this.request('/residential/agent-invitations/accept', { method: 'POST', body: JSON.stringify({ ...(payload || {}), token }) }); }
    async getResidentialAgentAccess() { return this.request('/residential/agent-invitations/access'); }
    async revokeResidentialAgentAccess(transactionId, reason) { return this.request(`/residential/agent-invitations/transactions/${encodeURIComponent(transactionId)}/revoke`, { method: 'POST', body: JSON.stringify({ reason }) }); }
    async createResidentialInviteAccount(payload) {
        const response = await this.request('/auth/residential-invite-signup', { method: 'POST', body: JSON.stringify(payload || {}) });
        this.setSession(response);
        return response;
    }
    async createResidentialRequest(formData, idempotencyKey, emergency = false) {
        return this.requestForm(
            emergency ? '/residential/emergency-requests' : '/residential/requests',
            formData,
            'POST',
            { 'Idempotency-Key': idempotencyKey }
        );
    }
    async bookResidentialOrderAgain(orderId, payload, idempotencyKey) {
        return this.request(`/residential/orders/${encodeURIComponent(orderId)}/book-again`, {
            method: 'POST',
            headers: { 'Idempotency-Key': idempotencyKey },
            body: JSON.stringify(payload || {})
        });
    }
    async requestResidentialCancellation(orderId, reason) {
        return this.request(`/residential/orders/${encodeURIComponent(orderId)}/cancel-request`, {
            method: 'POST', body: JSON.stringify({ reason })
        });
    }
    async requestResidentialReschedule(orderId, payload) {
        return this.request(`/residential/orders/${encodeURIComponent(orderId)}/reschedule-request`, {
            method: 'POST', body: JSON.stringify(payload || {})
        });
    }

    async logout() {
        try {
            await this.request('/auth/logout', { method: 'POST' });
        } finally {
            this.clearSession();
        }
    }

    async changePassword(currentPassword, newPassword) {
        return this.request('/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword, newPassword })
        });
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

    async getWebsiteIntakes() {
        this.requestCache.delete('GET:/intakes?limit=500');
        return this.request('/intakes?limit=500');
    }

    async resolveWebsiteIntakeReview(intakeId, customerId) {
        return this.request(`/intakes/${intakeId}/resolve-review`, {
            method: 'PUT',
            body: JSON.stringify(customerId ? { customerId } : {})
        });
    }

    async retryWebsiteIntakeEmail(intakeId, type) {
        return this.request(`/intakes/${intakeId}/retry-email`, {
            method: 'POST',
            body: JSON.stringify({ type })
        });
    }

    async getIncomingQuoteOrders() {
        this.requestCache.delete('GET:/incoming-quotes/orders');
        return this.request('/incoming-quotes/orders');
    }

    async getIncomingQuoteEligibleOrders() {
        this.requestCache.delete('GET:/incoming-quotes/eligible-orders');
        return this.request('/incoming-quotes/eligible-orders');
    }

    async getIncomingQuoteVendors() {
        this.requestCache.delete('GET:/incoming-quotes/vendor-options');
        return this.request('/incoming-quotes/vendor-options');
    }

    async getIncomingQuoteWorkspace(orderId) {
        this.requestCache.delete(`GET:/incoming-quotes/orders/${orderId}`);
        return this.request(`/incoming-quotes/orders/${orderId}`);
    }

    async startIncomingQuotes(orderId) {
        return this.request(`/incoming-quotes/orders/${orderId}/start`, { method: 'POST', body: '{}' });
    }

    async createIncomingQuote(orderId, payload) {
        return this.request(`/incoming-quotes/orders/${orderId}/quotes`, { method: 'POST', body: JSON.stringify(payload) });
    }

    async updateIncomingQuote(quoteId, payload) {
        return this.request(`/incoming-quotes/quotes/${quoteId}`, { method: 'PATCH', body: JSON.stringify(payload) });
    }

    async submitIncomingQuote(quoteId, payload = {}) {
        return this.request(`/incoming-quotes/quotes/${quoteId}/submit`, { method: 'POST', body: JSON.stringify(payload) });
    }

    async sendIncomingQuoteInvitation(orderId, payload) {
        return this.request(`/incoming-quotes/orders/${orderId}/invitations`, { method: 'POST', body: JSON.stringify(payload) });
    }
    async getServiceRequestQueue() { return this.request('/workflow-center/requests'); }
    async reviewResidentialRequest(orderId, payload) { return this.request(`/incoming-quotes/orders/${encodeURIComponent(orderId)}/residential-review`, { method: 'POST', body: JSON.stringify(payload) }); }

    async getIncomingLeadCandidates(orderId) {
        return this.request(`/incoming-quotes/orders/${encodeURIComponent(orderId)}/eligible-vendors`);
    }

    async distributeIncomingLead(orderId, payload, idempotencyKey) {
        return this.request(`/incoming-quotes/orders/${encodeURIComponent(orderId)}/leads/distribute`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(payload) });
    }

    async selectIncomingQuote(quoteId, complianceAcknowledged) {
        return this.request(`/incoming-quotes/quotes/${quoteId}/select`, { method: 'POST', body: JSON.stringify({ complianceAcknowledged }) });
    }

    async requestIncomingQuoteRevision(quoteId, payload) {
        return this.request(`/incoming-quotes/quotes/${quoteId}/request-revision`, { method: 'POST', body: JSON.stringify(payload) });
    }

    async createStaffIncomingQuoteRevision(quoteId) {
        return this.request(`/incoming-quotes/quotes/${quoteId}/revise-staff`, { method: 'POST', body: '{}' });
    }

    async resendIncomingQuoteInvitation(invitationId) {
        return this.request(`/incoming-quotes/invitations/${invitationId}/resend`, { method: 'POST', body: '{}' });
    }

    async rotateIncomingQuoteInvitation(invitationId) {
        return this.request(`/incoming-quotes/invitations/${invitationId}/rotate`, { method: 'POST', body: '{}' });
    }

    async revokeIncomingQuoteInvitation(invitationId) {
        return this.request(`/incoming-quotes/invitations/${invitationId}/revoke`, { method: 'POST', body: '{}' });
    }

    async retryIncomingQuoteEmail(messageId) {
        return this.request(`/incoming-quotes/outbox/${messageId}/retry`, { method: 'POST', body: '{}' });
    }

    async getOutgoingQuoteOrders() {
        this.requestCache.delete('GET:/outgoing-quotes/orders');
        return this.request('/outgoing-quotes/orders');
    }

    async getOutgoingQuoteWorkspace(orderId) {
        this.requestCache.delete(`GET:/outgoing-quotes/orders/${orderId}`);
        return this.request(`/outgoing-quotes/orders/${orderId}`);
    }

    async convertOutgoingQuote(orderId) { return this.request(`/outgoing-quotes/orders/${orderId}/convert`, { method: 'POST', body: '{}' }); }
    async updateOutgoingQuote(quoteId, payload) { return this.request(`/outgoing-quotes/${quoteId}`, { method: 'PATCH', body: JSON.stringify(payload) }); }
    async sendOutgoingQuote(quoteId) { return this.request(`/outgoing-quotes/${quoteId}/send`, { method: 'POST', body: '{}' }); }
    async reviseOutgoingQuote(quoteId) { return this.request(`/outgoing-quotes/${quoteId}/revise`, { method: 'POST', body: '{}' }); }
    async voidOutgoingQuote(quoteId, reason) { return this.request(`/outgoing-quotes/${quoteId}/void`, { method: 'POST', body: JSON.stringify({ reason }) }); }
    async resendOutgoingQuote(quoteId) { return this.request(`/outgoing-quotes/${quoteId}/resend`, { method: 'POST', body: '{}' }); }
    async retryOutgoingQuoteEmail(messageId) { return this.request(`/outgoing-quotes/outbox/${messageId}/retry`, { method: 'POST', body: '{}' }); }
    async getOutgoingQuoteSettings() { return this.request('/outgoing-quotes/settings'); }
    async updateOutgoingQuoteSettings(payload) { return this.request('/outgoing-quotes/settings', { method: 'PUT', body: JSON.stringify(payload) }); }
    async getCustomerApprovals() {
        this.requestCache.delete('GET:/outgoing-quotes/approvals');
        return this.request('/outgoing-quotes/approvals');
    }
    async getCustomerApproval(orderId) {
        this.requestCache.delete(`GET:/outgoing-quotes/approvals/${orderId}`);
        return this.request(`/outgoing-quotes/approvals/${orderId}`);
    }
    async retryCustomerApprovalEmail(messageId) { return this.request(`/outgoing-quotes/approvals/outbox/${messageId}/retry`, { method: 'POST', body: '{}' }); }
    async getSchedulingOrders() { this.requestCache.delete('GET:/scheduling/orders'); return this.request('/scheduling/orders'); }
    async getSchedulingWorkspace(orderId) { this.requestCache.delete(`GET:/scheduling/orders/${orderId}`); return this.request(`/scheduling/orders/${orderId}`); }
    async sendScheduleProposal(orderId, payload) { return this.request(`/scheduling/orders/${orderId}/proposals`, { method: 'POST', body: JSON.stringify(payload) }); }
    async revokeSchedule(scheduleId) { return this.request(`/scheduling/${scheduleId}/revoke`, { method: 'POST', body: '{}' }); }
    async retryScheduleEmail(id) { return this.request(`/scheduling/outbox/${id}/retry`, { method: 'POST', body: '{}' }); }

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

    async addOrderVendorAssignment(orderId, assignment) {
        return this.request(`/orders/${orderId}/vendor-assignments`, {
            method: 'POST',
            body: JSON.stringify(assignment)
        });
    }

    async updateOrderVendorAssignment(orderId, assignmentId, assignment) {
        return this.request(`/orders/${orderId}/vendor-assignments/${assignmentId}`, {
            method: 'PATCH',
            body: JSON.stringify(assignment)
        });
    }

    async removeOrderVendorAssignment(orderId, assignmentId) {
        return this.request(`/orders/${orderId}/vendor-assignments/${assignmentId}`, {
            method: 'DELETE'
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

    async addNote(entity, id, text) {
        return this.request(`/notes/${entity}/${id}`, {
            method: 'POST',
            body: JSON.stringify({ text })
        });
    }

    async updateNote(entity, id, noteId, text) {
        return this.request(`/notes/${entity}/${id}/${noteId}`, {
            method: 'PUT',
            body: JSON.stringify({ text })
        });
    }

    async deleteNote(entity, id, noteId) {
        return this.request(`/notes/${entity}/${id}/${noteId}`, {
            method: 'DELETE'
        });
    }

    // Reports
    buildReportParams(filters = {}) {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') params.append(key, value);
        });
        return params;
    }

    async getAnalyticsReport(filters = {}) {
        const params = this.buildReportParams(filters);
        return this.request(`/reports/analytics?${params}`);
    }

    async getReportRecords(filters = {}) {
        const params = this.buildReportParams(filters);
        return this.request(`/reports/records?${params}`);
    }

    getReportExportUrl(format, filters = {}, section = format === 'pdf' ? 'summary' : 'details') {
        const params = this.buildReportParams({ ...filters, format, section });
        return `${this.baseURL}/reports/export?${params}`;
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

    async resendWebsiteIntakeCompletion(intakeId) {
        return this.request(`/intakes/${intakeId}/resend-completion`, { method: 'POST' });
    }

    // Unified Workflow Center
    async getWorkflowOverview(params = {}) {
        const query = new URLSearchParams();
        if (params.attention) query.set('attention', params.attention);
        if (params.attentionLimit) query.set('attentionLimit', params.attentionLimit);
        if (params.activityLimit) query.set('activityLimit', params.activityLimit);
        query.set('workspace', params.workspace || (window.ServiceRequestsActive ? 'service-requests' : 'workflow-center'));
        const path = `/workflow-center/overview${query.size ? `?${query}` : ''}`;
        this.requestCache.delete(`GET:${path}`);
        this.requestCache.delete(`GET:${path}${path.includes('?') ? '&' : '?'}workspace=${window.ServiceRequestsActive ? 'service-requests' : 'workflow-center'}`);
        return this.request(path);
    }

    async getWorkflowJourney(orderId) {
        if (!String(orderId || '').trim()) {
            throw new Error('Order ID is required to load the workflow journey');
        }
        return this.request(`/workflow-center/orders/${encodeURIComponent(orderId)}/journey`);
    }

    async reconcileWorkflowOrder(orderId) {
        if (!String(orderId || '').trim()) throw new Error('Order ID is required to reconcile workflow status');
        return this.request(`/workflow-center/reconcile/${encodeURIComponent(orderId)}`, { method: 'POST' });
    }

    // Stage 6 — Completion and Closeout
    async getCloseoutOrders() {
        return this.request('/closeout/orders');
    }

    async getCloseoutOrder(orderId) {
        return this.request(`/closeout/orders/${encodeURIComponent(orderId)}`);
    }

    async createCompletionLink(orderId) {
        return this.request(`/closeout/orders/${encodeURIComponent(orderId)}/completion-link`, { method: 'POST' });
    }

    async resendCompletionLink(orderId) {
        return this.request(`/closeout/orders/${encodeURIComponent(orderId)}/completion-link/resend`, { method: 'POST' });
    }

    async rotateCompletionLink(orderId) {
        return this.request(`/closeout/orders/${encodeURIComponent(orderId)}/completion-link/rotate`, { method: 'POST' });
    }

    async revokeCompletionLink(orderId) {
        return this.request(`/closeout/orders/${encodeURIComponent(orderId)}/completion-link/revoke`, { method: 'POST' });
    }

    async completeCloseoutOrder(orderId, formData) {
        return this.requestForm(`/closeout/orders/${encodeURIComponent(orderId)}/complete`, formData);
    }

    async resolveCloseoutIssue(decisionId, resolutionNote) {
        return this.request(`/closeout/satisfaction/${encodeURIComponent(decisionId)}/resolve`, {
            method: 'POST',
            body: JSON.stringify({ resolutionNote })
        });
    }

    async resendCustomerCloseoutLink(orderId) {
        return this.request(`/closeout/orders/${encodeURIComponent(orderId)}/closeout-link/resend`, { method: 'POST' });
    }

    async rotateCustomerCloseoutLink(orderId) {
        return this.request(`/closeout/orders/${encodeURIComponent(orderId)}/closeout-link/rotate`, { method: 'POST' });
    }

    async verifyPaymentProof(proofId) {
        return this.request(`/closeout/payment-proofs/${encodeURIComponent(proofId)}/verify`, { method: 'POST' });
    }

    async rejectPaymentProof(proofId, rejectionReason) {
        return this.request(`/closeout/payment-proofs/${encodeURIComponent(proofId)}/reject`, {
            method: 'POST',
            body: JSON.stringify({ rejectionReason })
        });
    }

    async getCloseoutSettings() {
        return this.request('/closeout/settings');
    }

    async updateCloseoutSettings(settings) {
        return this.request('/closeout/settings', { method: 'PUT', body: JSON.stringify(settings) });
    }

    async retryCloseoutEmail(messageId) {
        return this.request(`/closeout/outbox/${encodeURIComponent(messageId)}/retry`, { method: 'POST' });
    }

    // Commercial client portal (server-scoped; never uses CRM endpoints)
    commercialQuery(filters = {}) {
        const params = new URLSearchParams();
        if (filters.organizationId) params.set('organizationId', filters.organizationId);
        if (filters.portfolioId) params.set('portfolioId', filters.portfolioId);
        if (filters.propertyId) params.set('propertyId', filters.propertyId);
        if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
        if (filters.dateTo) params.set('dateTo', filters.dateTo);
        const query = params.toString();
        return query ? `?${query}` : '';
    }

    async getCommercialMe() { return this.request('/commercial/me'); }
    async getCommercialDashboard(filters = {}) { return this.request(`/commercial/dashboard${this.commercialQuery(filters)}`); }
    async getCommercialPortfolios(organizationId) { return this.request(`/commercial/organizations/${encodeURIComponent(organizationId)}/portfolios`); }
    async getCommercialProperties(organizationId) { return this.request(`/commercial/organizations/${encodeURIComponent(organizationId)}/properties`); }
    async getCommercialProperty(organizationId, propertyId) { return this.request(`/commercial/organizations/${encodeURIComponent(organizationId)}/properties/${encodeURIComponent(propertyId)}`); }
    async getCommercialPropertyOrders(organizationId, propertyId) { return this.request(`/commercial/organizations/${encodeURIComponent(organizationId)}/properties/${encodeURIComponent(propertyId)}/orders?limit=100`); }
    async getCommercialOrders(filters = {}) { return this.request(`/commercial/orders${this.commercialQuery(filters)}`); }
    async getCommercialInvoices(filters = {}) { return this.request(`/commercial/invoices${this.commercialQuery(filters)}`); }
    async getCommercialReports(filters = {}) { return this.request(`/commercial/reports${this.commercialQuery(filters)}`); }
    async getCommercialActivity(filters = {}) { return this.request(`/commercial/activity${this.commercialQuery(filters)}`); }
    async getCommercialDocuments(filters = {}) { return this.request(`/commercial/documents${this.commercialQuery(filters)}`); }
    async getCommercialPreferences(organizationId) { return this.request(`/commercial/organizations/${encodeURIComponent(organizationId)}/preferences`); }
    async updateCommercialPreferences(organizationId, payload) { return this.request(`/commercial/organizations/${encodeURIComponent(organizationId)}/preferences`, { method: 'PATCH', body: JSON.stringify(payload) }); }
    async updateCommercialAccount(payload) { return this.request('/commercial/account', { method: 'PATCH', body: JSON.stringify(payload) }); }
    async getCommercialUsers(organizationId) { return this.request(`/commercial/organizations/${encodeURIComponent(organizationId)}/users`); }
    async getCommercialWarrantyClaims(filters = {}) { return this.request(`/commercial/warranty-claims${this.commercialQuery(filters)}`); }
    async getCommercialNotifications() { return this.request('/commercial/notifications'); }
    async createCommercialRequest(organizationId, payload, idempotencyKey) { return this.request(`/commercial/organizations/${encodeURIComponent(organizationId)}/requests`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(payload) }); }
    async decideCommercialEstimate(orderId, quoteId, payload) { return this.request(`/commercial/orders/${encodeURIComponent(orderId)}/estimates/${encodeURIComponent(quoteId)}/decision`, { method: 'POST', body: JSON.stringify(payload) }); }
    async getCommercialInvitations(organizationId) { return this.request(`/commercial/organizations/${encodeURIComponent(organizationId)}/invitations`); }
    async createCommercialInvitation(organizationId, payload) { return this.request(`/commercial/organizations/${encodeURIComponent(organizationId)}/invitations`, { method: 'POST', body: JSON.stringify(payload) }); }
    async revokeCommercialInvitation(organizationId, invitationId, reason) { return this.request(`/commercial/organizations/${encodeURIComponent(organizationId)}/invitations/${encodeURIComponent(invitationId)}/revoke`, { method: 'POST', body: JSON.stringify({ reason }) }); }
    async updateCommercialUserAccess(organizationId, userId, payload) { return this.request(`/commercial/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(userId)}/access`, { method: 'PATCH', body: JSON.stringify(payload) }); }
    async acceptCommercialInvitation(token) { return this.request('/commercial/invitations/accept', { method: 'POST', body: JSON.stringify({ token }) }); }

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
        const assignment = role === 'commercial' && window.chooseCommercialOrganization ? await window.chooseCommercialOrganization() : {};
        if (assignment === null) throw new Error('Commercial approval cancelled');
        return this.request(`/users/${userId}/role`, {
            method: 'PATCH',
            body: JSON.stringify({ role, ...assignment })
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
window.AuthReady = /(?:admin-dashboard|residential-portal|agent-portal|commercial-portal)/.test(window.location.pathname)
    ? window.APIService.getSession()
    : Promise.resolve(null);
