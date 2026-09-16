// Signup System Manager
class SignupManager {
    constructor() {
        this.portalNames = { crm: 'Internal / CRM', residential: 'Residential Client Portal', real_estate_agent: 'Real Estate Agent Portal', commercial: 'Commercial Client Portal', vendor: 'Vendor Portal' };
        this.initializeEventListeners();
        const portal = new URLSearchParams(window.location.search).get('portal');
        if (this.portalNames[portal]) document.getElementById('signupPortal').value = portal;
        this.updatePortal();
    }

    updatePortal() {
        const portal = document.getElementById('signupPortal').value;
        const crm = portal === 'crm';
        document.getElementById('crmRoleGroup').hidden = !crm;
        document.getElementById('requestedRole').required = crm;
        document.getElementById('requestedRole').disabled = !crm;
        const vendorFields = document.getElementById('vendorSignupFields');
        vendorFields.hidden = portal !== 'vendor';
        vendorFields.disabled = portal !== 'vendor';
        document.getElementById('signupPortalHelp').textContent = portal === 'vendor'
            ? 'Enter your company details below. Your full name is the company contact name. Compliance is completed securely after registration.'
            : 'Account access requires staff approval. Property, organization, and transaction access must be authorized separately.';
        document.querySelector('#signupBtn .submit-btn__text').textContent = portal === 'vendor' ? 'Create vendor account' : 'Request account';
        this.updateRocRequirement();
    }

    updateRocRequirement() {
        const required = document.getElementById('signupPortal').value === 'vendor' && document.getElementById('vendorLicensedTrade').checked;
        document.getElementById('vendorRocNumber').required = required;
        document.getElementById('vendorRocRequired').hidden = !required;
    }

    initializeEventListeners() {
        const signupForm = document.getElementById('signupForm');
        const togglePassword = document.getElementById('togglePassword');
        const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');
        const passwordInput = document.getElementById('password');
        const confirmPasswordInput = document.getElementById('confirmPassword');

        signupForm.addEventListener('submit', (e) => this.handleSignup(e));
        document.getElementById('signupPortal').addEventListener('change', () => this.updatePortal());
        document.getElementById('vendorLicensedTrade').addEventListener('change', () => this.updateRocRequirement());

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
        window.renderSignupIcons?.();
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
        const requestedPortal = document.getElementById('signupPortal').value;
        
        const fullName = document.getElementById('fullName').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const requestedRole = requestedPortal === 'crm' ? document.getElementById('requestedRole').value : requestedPortal;
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
            if (requestedPortal === 'vendor') {
                const form = document.getElementById('signupForm');
                if (!form.reportValidity()) { this.showLoading(false); return; }
                const data = new FormData(form);
                const response = await window.APIService.signupVendor({
                    companyName: data.get('companyName'), legalBusinessName: data.get('legalBusinessName'),
                    contactName: fullName, phone: data.get('phone'), email, password,
                    entityType: data.get('entityType'), businessAddress: data.get('businessAddress'),
                    tradeClassifications: String(data.get('trades') || '').split(',').map(value => value.trim()).filter(Boolean),
                    licensedTrade: document.getElementById('vendorLicensedTrade').checked,
                    rocLicenseNumber: data.get('rocLicenseNumber'), rocClassification: data.get('rocClassification'),
                    serviceArea: { basePostalCode: data.get('basePostalCode'), radiusMiles: Number(data.get('radiusMiles')) }
                });
                window.APIService.setSession(response);
                window.location.replace('/pages/vendor-portal.html');
                return;
            }
            const response = await window.APIService.signup({
                name: fullName,
                email: email,
                password: password,
                requestedRole: requestedRole,
                requestedPortal
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
            'account_rep': 'Account Representative',
            residential: 'Residential Client Portal',
            real_estate_agent: 'Real Estate Agent Portal',
            commercial: 'Commercial Client Portal'
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
        window.renderSignupIcons?.();
    }

    showLoading(show) {
        const signupBtn = document.getElementById('signupBtn');
        signupBtn.disabled = show;
        signupBtn.classList.toggle('is-loading', show);
        document.getElementById('signupForm').setAttribute('aria-busy', String(show));
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
