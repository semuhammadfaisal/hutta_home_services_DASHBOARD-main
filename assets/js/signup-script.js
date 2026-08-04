// Signup System Manager
class SignupManager {
    constructor() {
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        const signupForm = document.getElementById('signupForm');
        const togglePassword = document.getElementById('togglePassword');
        const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');
        const passwordInput = document.getElementById('password');
        const confirmPasswordInput = document.getElementById('confirmPassword');

        signupForm.addEventListener('submit', (e) => this.handleSignup(e));

        togglePassword.addEventListener('click', () => {
            this.togglePasswordVisibility(passwordInput, togglePassword);
        });

        toggleConfirmPassword.addEventListener('click', () => {
            this.togglePasswordVisibility(confirmPasswordInput, toggleConfirmPassword);
        });

        passwordInput.addEventListener('input', () => this.validatePassword());
        confirmPasswordInput.addEventListener('input', () => this.validatePasswordMatch());
    }

    togglePasswordVisibility(input, button) {
        const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
        input.setAttribute('type', type);
        button.setAttribute('aria-label', type === 'password' ? 'Show password' : 'Hide password');
        button.setAttribute('aria-pressed', type === 'text' ? 'true' : 'false');
        
        const icon = button.querySelector('i');
        icon.classList.toggle('fa-eye');
        icon.classList.toggle('fa-eye-slash');
    }

    validatePassword() {
        const password = document.getElementById('password').value;
        const minLength = 8;
        
        if (password.length > 0 && password.length < minLength) {
            return false;
        }
        return true;
    }

    validatePasswordMatch() {
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        if (confirmPassword.length > 0 && password !== confirmPassword) {
            return false;
        }
        return true;
    }

    async handleSignup(e) {
        e.preventDefault();
        
        const fullName = document.getElementById('fullName').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const requestedRole = document.getElementById('requestedRole').value;
        const agreeTerms = document.getElementById('agreeTerms').checked;
        
        // Validation
        if (!fullName || !email || !password || !confirmPassword || !requestedRole) {
            this.showError('Please fill in all fields');
            return;
        }

        if (password.length < 8) {
            this.showError('Password must be at least 8 characters long');
            return;
        }

        if (password !== confirmPassword) {
            this.showError('Passwords do not match');
            return;
        }

        if (!agreeTerms) {
            this.showError('Please agree to the Terms & Conditions');
            return;
        }

        this.showLoading(true);
        this.hideError();
        
        try {
            const response = await window.APIService.signup({
                name: fullName,
                email: email,
                password: password,
                requestedRole: requestedRole
            });
            
            // Show success message and redirect to confirmation page
            this.showRoleConfirmation(requestedRole);
        } catch (error) {
            this.showError(error.message || 'Signup failed. Please try again.');
            this.showLoading(false);
        }
    }

    showRoleConfirmation(requestedRole) {
        const roleNames = {
            'admin': 'Administrator',
            'manager': 'Manager',
            'account_rep': 'Account Representative'
        };
        
        const formCard = document.querySelector('.form-card');
        formCard.innerHTML = `
            <div class="signup-success">
                <div class="signup-success__icon"><i class="fas fa-check" aria-hidden="true"></i></div>
                <h1 class="card-title">Account created</h1>
                <p class="card-subtitle">Your registration was submitted.</p>

                <div class="signup-success__panel">
                    <h2><i class="fas fa-circle-info"></i> What happens next?</h2>
                    <p>You requested: <strong>${roleNames[requestedRole]}</strong></p>
                    <p>An administrator will review your account and assign the appropriate access.</p>
                    <p>You will receive an email when your account is approved.</p>
                </div>

                <div class="signup-success__notice">
                    <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
                    <strong> Approval required:</strong> You cannot sign in until an administrator approves your account.
                </div>

                <a href="login.html" class="submit-btn">
                    <i class="fas fa-arrow-left" aria-hidden="true"></i>
                    Go to sign in
                </a>
            </div>
        `;
    }

    showLoading(show) {
        const signupBtn = document.getElementById('signupBtn');
        signupBtn.disabled = show;
        signupBtn.classList.toggle('is-loading', show);
    }

    showError(message) {
        const errorDiv = document.getElementById('errorMessage');
        const errorText = document.getElementById('errorText');
        
        errorText.textContent = message;
        errorDiv.style.display = 'flex';
        
        setTimeout(() => this.hideError(), 5000);
    }

    hideError() {
        const errorDiv = document.getElementById('errorMessage');
        errorDiv.style.display = 'none';
    }

    showSuccess() {
        const signupBtn = document.getElementById('signupBtn');
        signupBtn.innerHTML = '<i class="fas fa-check"></i> Account created';
        signupBtn.classList.add('is-success');
    }
}

document.addEventListener('DOMContentLoaded', function() {
    if (typeof window.APIService === 'undefined') {
        console.error('APIService not loaded');
        return;
    }
    
    new SignupManager();
    window.AppLogger?.debug('Signup system initialized');
});
