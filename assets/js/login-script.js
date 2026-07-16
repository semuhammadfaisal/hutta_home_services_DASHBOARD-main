// Login System Manager
class LoginManager {
    constructor() {
        this.initializeEventListeners();
        this.checkExistingSession();
    }

    initializeEventListeners() {
        const loginForm = document.getElementById('loginForm');
        const togglePassword = document.getElementById('togglePassword');
        const passwordInput = document.getElementById('password');

        // Form submission - with null check
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
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



    async handleLogin(e) {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        this.showLoading(true);
        this.hideError();
        
        try {
            const response = await window.APIService.login(email, password);
            
            // Check if user has pending role
            if (response.user && response.user.role === 'pending') {
                this.showError('Your account is pending approval. Please contact an administrator.');
                this.showLoading(false);
                return;
            }
            
            this.showSuccess();
            setTimeout(() => {
                const params = new URLSearchParams(window.location.search);
                const returnTo = params.get('returnTo');
                const safeReturnTo = returnTo?.startsWith('/') && !returnTo.startsWith('//')
                    ? returnTo
                    : (window.DASHBOARD_URL || '/pages/admin-dashboard.html');
                window.location.href = safeReturnTo;
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
            loginBtn.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i>&nbsp;Signed in!';
            loginBtn.style.background = '#047857';
            loginBtn.style.boxShadow = '0 2px 4px rgba(4,120,87,.12), 0 8px 24px rgba(4,120,87,.28)';
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
