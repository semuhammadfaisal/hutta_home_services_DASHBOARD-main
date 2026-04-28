// Payment Detail Modal Script

document.addEventListener('DOMContentLoaded', function() {
    
    // Close modal
    const closeBtn = document.querySelector('.payment-detail-close');
    const modal = document.querySelector('.payment-detail-modal');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            modal.classList.remove('show');
        });
    }
    
    // Close on backdrop click
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });
    }
    
    // Update circular progress dynamically
    const progressCircle = document.querySelector('.progress-circle');
    if (progressCircle) {
        const progress = progressCircle.getAttribute('data-progress') || 78;
        progressCircle.style.setProperty('--progress', progress + '%');
    }
    
    // Invoice input auto-save simulation
    const invoiceInput = document.querySelector('.invoice-input');
    if (invoiceInput) {
        invoiceInput.addEventListener('blur', function() {
            console.log('Invoice updated:', this.value);
            // Add your save logic here
        });
    }
    
});

// Function to open modal with payment data
function openPaymentDetail(paymentData) {
    const modal = document.querySelector('.payment-detail-modal');
    
    // Update modal content with payment data
    if (paymentData) {
        // Update stats
        document.querySelector('.stat-orange .value').textContent = '$' + paymentData.totalAmount.toLocaleString();
        document.querySelector('.stat-green .value').textContent = '$' + paymentData.amountPaid.toLocaleString();
        document.querySelector('.stat-blue .value').textContent = '$' + paymentData.remaining.toLocaleString();
        
        // Update progress
        const progress = Math.round((paymentData.amountPaid / paymentData.totalAmount) * 100);
        document.querySelector('.progress-percent').textContent = progress + '%';
        document.querySelector('.progress-circle').style.setProperty('--progress', progress + '%');
        
        // Update info fields
        document.querySelector('.payment-info-row .value').textContent = paymentData.paymentId;
        document.querySelector('.invoice-input').value = paymentData.invoiceNumber;
    }
    
    modal.classList.add('show');
}
