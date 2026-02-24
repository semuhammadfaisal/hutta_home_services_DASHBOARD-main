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
        const agreeTerms = document.getElementById('agreeTerms').checked;
        
        // Validation
        if (!fullName || !email || !password || !confirmPassword) {
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
                password: password
            });
            
            this.showSuccess();
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1500);
        } catch (error) {
            this.showError(error.message || 'Signup failed. Please try again.');
        } finally {
            this.showLoading(false);
        }
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
