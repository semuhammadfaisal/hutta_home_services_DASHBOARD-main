document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('resetPasswordForm');
    const resetBtn = document.getElementById('resetBtn');
    const errorMessage = document.getElementById('errorMessage');
    const togglePassword = document.getElementById('togglePassword');
    const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');

    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (!token) {
        showError('Invalid reset link');
        resetBtn.disabled = true;
        return;
    }

    togglePassword.addEventListener('click', () => togglePasswordVisibility(passwordInput, togglePassword));
    toggleConfirmPassword.addEventListener('click', () => togglePasswordVisibility(confirmPasswordInput, toggleConfirmPassword));

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;
        
        if (password !== confirmPassword) {
            showError('Passwords do not match');
            return;
        }
        
        showLoading(true);
        hideError();
        
        try {
            await window.APIService.resetPassword(token, password);
            resetBtn.innerHTML = '<i class="fas fa-check"></i> Password Reset!';
            resetBtn.style.background = 'var(--success)';
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        } catch (error) {
            showError(error.message || 'Failed to reset password');
        } finally {
            showLoading(false);
        }
    });

    function togglePasswordVisibility(input, button) {
        const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
        input.setAttribute('type', type);
        const icon = button.querySelector('i');
        icon.classList.toggle('fa-eye');
        icon.classList.toggle('fa-eye-slash');
    }

    function showLoading(show) {
        const btnText = resetBtn.querySelector('.btn-text');
        const spinner = resetBtn.querySelector('.btn-spinner');
        
        resetBtn.disabled = show;
        btnText.style.display = show ? 'none' : 'inline-block';
        spinner.style.display = show ? 'inline-block' : 'none';
    }

    function showError(message) {
        document.getElementById('errorText').textContent = message;
        errorMessage.style.display = 'flex';
    }

    function hideError() {
        errorMessage.style.display = 'none';
    }
});
