// Login System Manager
class LoginManager {
    constructor() {
        this.portals = {
            crm: {
                destination: '/pages/admin-dashboard.html',
                subtitle: 'Sign in to continue to the SMPLfix CRM.',
                description: 'Manage company operations, orders, vendors, and accounting.',
                button: 'Sign in to CRM'
            },
            residential: {
                destination: '/pages/residential-portal.html',
                subtitle: 'Sign in to manage your properties and service requests.',
                description: 'View jobs, approve estimates, manage invoices, and access property records.',
                button: 'Sign in to Residential Portal'
            },
            real_estate_agent: {
                destination: '/pages/agent-portal.html',
                subtitle: 'Sign in to manage clients, properties, and closing transactions.',
                description: 'Coordinate client properties, service requests, documents, and referrals.',
                button: 'Sign in to Agent Portal'
            },
            commercial: {
                destination: '/pages/commercial-portal.html',
                subtitle: 'Sign in to oversee your locations, work, and billing.',
                description: 'Manage portfolios, properties, open orders, reports, and authorized account users.',
                button: 'Sign in to Commercial Portal'
            },
            vendor: {
                destination: '/pages/vendor-portal.html',
                subtitle: 'Sign in to manage your vendor profile and compliance.',
                description: 'Complete onboarding, maintain compliance, and access your authorized vendor workspace.',
                button: 'Sign in to Vendor Portal'
            }
        };
        this.preferenceKey = 'smplfixPortalPreference';
        this.initializePortalSelection();
        this.initializeEventListeners();
        this.checkExistingSession();
    }

    initializePortalSelection() {
        const select = document.getElementById('portalType');
        if (!select) return;

        const params = new URLSearchParams(window.location.search);
        const requestedPath = params.get('returnTo') || '';
        const requestedPortal = Object.entries(this.portals).find(([, portal]) => requestedPath.startsWith(portal.destination))?.[0];
        let rememberedPortal = '';
        try {
            rememberedPortal = window.localStorage.getItem(this.preferenceKey) || '';
        } catch (_error) {
            // Portal preference is optional; sign-in still works when storage is unavailable.
        }

        const initialPortal = requestedPortal || (this.portals[rememberedPortal] ? rememberedPortal : 'crm');
        select.value = initialPortal;
        this.updatePortalPresentation();
    }

    initializeEventListeners() {
        const loginForm = document.getElementById('loginForm');
        const togglePassword = document.getElementById('togglePassword');
        const passwordInput = document.getElementById('password');
        const portalSelect = document.getElementById('portalType');

        // Form submission - with null check
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        if (portalSelect) {
            portalSelect.addEventListener('change', () => {
                try {
                    window.localStorage.setItem(this.preferenceKey, this.getSelectedPortal());
                } catch (_error) {
                    // Remembering the workspace is a convenience, not an authentication requirement.
                }
                this.updatePortalPresentation();
            });
        }

        // Password toggle - with null checks
        if (togglePassword && passwordInput) {
            togglePassword.addEventListener('click', () => {
                const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                passwordInput.setAttribute('type', type);
                togglePassword.setAttribute('aria-label', type === 'password' ? 'Show password' : 'Hide password');

                const icon = togglePassword.querySelector('i');
                if (icon) {
                    icon.classList.toggle('fa-eye');
                    icon.classList.toggle('fa-eye-slash');
                }
            });
        }
    }

    getSelectedPortal() {
        const value = document.getElementById('portalType')?.value;
        return this.portals[value] ? value : 'crm';
    }

    updatePortalPresentation() {
        const portal = this.portals[this.getSelectedPortal()];
        const subtitle = document.getElementById('loginSubtitle');
        const description = document.getElementById('portalDescription');
        const buttonText = document.querySelector('#loginBtn .submit-btn__text');
        const createAccountLink = document.getElementById('createAccountLink');
        if (subtitle) subtitle.textContent = portal.subtitle;
        if (description) description.textContent = portal.description;
        if (buttonText) buttonText.textContent = portal.button;
        if (createAccountLink) createAccountLink.href = `/pages/signup.html?portal=${encodeURIComponent(this.getSelectedPortal())}`;
    }



    async handleLogin(e) {
        e.preventDefault();

        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');

        if (!emailInput || !passwordInput) {
            this.showError('The login form could not be loaded. Please refresh the page.');
            return;
        }

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            this.showError('Enter your email address and password.');
            return;
        }

        this.showLoading(true);
        this.hideError();
        
        try {
            const params = new URLSearchParams(window.location.search);
            const selectedPortal = this.portals[this.getSelectedPortal()];
            const response = await window.APIService.login(email, password, params.get('returnTo') || selectedPortal.destination);
            
            // Check if user has pending role
            if (response.user && response.user.role === 'pending') {
                this.showError('Your account is pending approval. Please contact an administrator.');
                this.showLoading(false);
                return;
            }

            const verifiedPortal = ['admin', 'manager', 'account_rep'].includes(response.user?.role)
                ? 'crm'
                : response.user?.role;
            if (this.portals[verifiedPortal]) {
                try {
                    window.localStorage.setItem(this.preferenceKey, verifiedPortal);
                } catch (_error) {
                    // Do not interrupt a successful login when preferences cannot be stored.
                }
            }
            
            this.showSuccess();
            setTimeout(() => {
                const destination = typeof response.destination === 'string'
                    && response.destination.startsWith('/')
                    && !response.destination.startsWith('//')
                    ? response.destination
                    : '/pages/login.html';
                const invitationFragment = ['real_estate_agent', 'residential'].includes(response.user?.role)
                    && /^#invitation=[A-Za-z0-9_-]{32,100}$/.test(window.location.hash)
                    ? window.location.hash
                    : '';
                window.location.href = `${destination}${invitationFragment}`;
            }, 1000);
        } catch (error) {
            this.showError(error.message || 'Login failed. Please try again.');
        } finally {
            this.showLoading(false);
        }
    }

    validateCredentials(email, password) {
        // This will be handled by the backend API
        return true;
    }

    checkExistingSession() {
        // Don't auto-redirect from login page
        return;
    }

    showLoading(show) {
        const loginBtn = document.getElementById('loginBtn');
        if (!loginBtn) return;
        
        const btnText = loginBtn.querySelector('.submit-btn__text');
        const spinner = loginBtn.querySelector('.submit-btn__spinner');
        
        if (show) {
            loginBtn.disabled = true;
            loginBtn.classList.add('is-loading');
            if (btnText) btnText.style.display = 'none';
            if (spinner) spinner.style.display = 'inline-block';
        } else {
            loginBtn.disabled = false;
            loginBtn.classList.remove('is-loading');
            if (btnText) btnText.style.display = 'inline-block';
            if (spinner) spinner.style.display = 'none';
            this.updatePortalPresentation();
        }
    }

    showError(message) {
        const errorDiv = document.getElementById('errorMessage');
        const errorText = document.getElementById('errorText');
        
        if (errorText) errorText.textContent = message;
        if (errorDiv) errorDiv.style.display = 'flex';
        
        // Auto-hide after 5 seconds
        setTimeout(() => this.hideError(), 5000);
    }

    hideError() { 
        const errorDiv = document.getElementById('errorMessage');
        if (errorDiv) errorDiv.style.display = 'none';
    }

    showSuccess() {
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) {
            loginBtn.innerHTML = '<span class="submit-btn__success-icon" aria-hidden="true">&#10003;</span><span>Signed in</span>';
            loginBtn.classList.add('is-success');
        }
    }

    clearSession() {
        window.APIService?.clearSession();
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Session Management for Dashboard
class SessionManager {
    static checkAuthentication() {
        return window.AuthSession?.user ? { user: window.AuthSession.user, isAuthenticated: true } : null;
    }

    static async logout() {
        try {
            await window.APIService?.logout();
        } finally {
            window.location.replace('/pages/login.html');
        }
    }

    static getUserInfo() {
        return this.checkAuthentication();
    }
}

// Initialize login manager when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Wait for APIService to be available
    if (typeof window.APIService === 'undefined') {
        console.error('APIService not loaded');
        return;
    }
    
    new LoginManager();
    window.AppLogger?.debug('Login system initialized');
});

// Export for use in other files
window.SessionManager = SessionManager;
