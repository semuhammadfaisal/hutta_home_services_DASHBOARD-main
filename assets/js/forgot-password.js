document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('forgotPasswordForm');
    const resetBtn = document.getElementById('resetBtn');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        
        showLoading(true);
        hideMessages();
        
        try {
            await window.APIService.forgotPassword(email);
            showSuccess('Password reset link sent! Check your email.');
            form.reset();
        } catch (error) {
            showError(error.message || 'Failed to send reset link');
        } finally {
            showLoading(false);
        }
    });

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

    function showSuccess(message) {
        document.getElementById('successText').textContent = message;
        successMessage.style.display = 'flex';
    }

    function hideMessages() {
        errorMessage.style.display = 'none';
        successMessage.style.display = 'none';
    }
});
