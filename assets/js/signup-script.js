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
        
        const formSection = document.querySelector('.login-form-section');
        formSection.innerHTML = `
            <div class="login-container" style="text-align: center; padding: 40px 20px;">
                <div style="margin-bottom: 30px;">
                    <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
                        <i class="fas fa-check" style="font-size: 40px; color: white;"></i>
                    </div>
                    <h1 style="color: #111827; margin-bottom: 10px;">Account Created!</h1>
                    <p style="color: #6b7280; font-size: 16px;">Your registration was successful</p>
                </div>
                
                <div style="background: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 30px; text-align: left;">
                    <h3 style="color: #374151; margin-bottom: 16px; font-size: 18px;">
                        <i class="fas fa-info-circle" style="color: #3b82f6;"></i> What's Next?
                    </h3>
                    <div style="color: #6b7280; line-height: 1.8;">
                        <p style="margin-bottom: 12px;">✅ You requested: <strong style="color: #111827;">${roleNames[requestedRole]}</strong></p>
                        <p style="margin-bottom: 12px;">⏳ Your request is pending admin approval</p>
                        <p style="margin-bottom: 12px;">📧 You'll receive an email once approved</p>
                        <p>🔐 After approval, you can login with full access</p>
                    </div>
                </div>
                
                <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 8px; margin-bottom: 30px; text-align: left;">
                    <p style="color: #92400e; margin: 0; font-size: 14px;">
                        <i class="fas fa-exclamation-triangle"></i>
                        <strong>Important:</strong> You cannot login until an administrator approves your account and assigns your role.
                    </p>
                </div>
                
                <a href="login.html" class="login-btn" style="display: inline-block; text-decoration: none; padding: 14px 32px;">
                    <i class="fas fa-arrow-left"></i> Go to Login Page
                </a>
            </div>
        `;
    }

    showLoading(show) {
        const signupBtn = document.getElementById('signupBtn');
        const btnText = signupBtn.querySelector('.btn-text');
        const spinner = signupBtn.querySelector('.btn-spinner');
        
        if (show) {
            signupBtn.disabled = true;
            btnText.style.display = 'none';
            spinner.style.display = 'inline-block';
        } else {
            signupBtn.disabled = false;
            btnText.style.display = 'inline-block';
            spinner.style.display = 'none';
        }
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
        signupBtn.innerHTML = '<i class="fas fa-check"></i> Account Created!';
        signupBtn.style.background = 'var(--success)';
    }
}

document.addEventListener('DOMContentLoaded', function() {
    if (typeof window.APIService === 'undefined') {
        console.error('APIService not loaded');
        return;
    }
    
    new SignupManager();
    console.log('Signup system initialized');
});
