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
        const rememberMe = document.getElementById('rememberMe').checked;
        
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
            
            // The APIService.login already stores the session with token
            // Just show success and redirect
            this.showSuccess();
            setTimeout(() => {
                window.location.href = window.DASHBOARD_URL || '/pages/admin-dashboard.html';
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

    handleSuccessfulLogin(email, rememberMe) {
        // Create session data
        const sessionData = {
            email: email,
            loginTime: new Date().toISOString(),
            isAuthenticated: true
        };
        
        // Store session
        if (rememberMe) {
            localStorage.setItem('huttaSession', JSON.stringify(sessionData));
        } else {
            sessionStorage.setItem('huttaSession', JSON.stringify(sessionData));
        }
        
        // Show success and redirect
        this.showSuccess();
        setTimeout(() => {
            window.location.href = '/pages/admin-dashboard.html';
        }, 1000);
    }

    checkExistingSession() {
        // Don't auto-redirect from login page
        return;
    }

    showLoading(show) {
        const loginBtn = document.getElementById('loginBtn');
        if (!loginBtn) return;
        
        const btnText = loginBtn.querySelector('.btn-text');
        const spinner = loginBtn.querySelector('.btn-spinner');
        
        if (show) {
            loginBtn.disabled = true;
            if (btnText) btnText.style.display = 'none';
            if (spinner) spinner.style.display = 'inline-block';
        } else {
            loginBtn.disabled = false;
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
            loginBtn.innerHTML = '<i class="fas fa-check"></i> Login Successful!';
            loginBtn.style.background = 'var(--success)';
        }
    }

    clearSession() {
        localStorage.removeItem('huttaSession');
        sessionStorage.removeItem('huttaSession');
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Session Management for Dashboard
class SessionManager {
    static checkAuthentication() {
        const session = localStorage.getItem('huttaSession') || 
                       sessionStorage.getItem('huttaSession');
        
        if (!session) {
            return null; // Don't redirect, let caller handle it
        }
        
        try {
            const sessionData = JSON.parse(session);
            if (!sessionData.isAuthenticated) {
                return null;
            }
            return sessionData;
        } catch (error) {
            return null;
        }
    }

    static logout() {
        localStorage.removeItem('huttaSession');
        sessionStorage.removeItem('huttaSession');
        window.location.href = '/pages/login.html';
    }

    static getUserInfo() {
        const session = localStorage.getItem('huttaSession') || 
                       sessionStorage.getItem('huttaSession');
        
        if (session) {
            try {
                return JSON.parse(session);
            } catch (error) {
                return null;
            }
        }
        return null;
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
    console.log('Login system initialized');
});

// Export for use in other files
window.SessionManager = SessionManager;