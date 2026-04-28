// Employee Payment Functions for Payment Detail Modal

// Add this to the showPaymentDetail function after the relatedItems array

const employeeInfo = payment.order?.employee;
const employeeSection = employeeInfo ? `
    <section class="payment-rich-card payment-employee-section">
        <div class="payment-card-header">
            <div>
                <h3>Employee Assignment</h3>
                <span class="payment-card-subtext">Employee assigned to this order and payment details</span>
            </div>
            <span class="payment-card-chip">Employee</span>
        </div>

        <div class="payment-employee-info">
            <div class="payment-employee-info-item">
                <span class="payment-employee-info-label">Name</span>
                <span class="payment-employee-info-value">${escapePaymentHtml(employeeInfo.name || 'N/A')}</span>
            </div>
            <div class="payment-employee-info-item">
                <span class="payment-employee-info-label">Email</span>
                <span class="payment-employee-info-value">${escapePaymentHtml(employeeInfo.email || 'N/A')}</span>
            </div>
            <div class="payment-employee-info-item">
                <span class="payment-employee-info-label">Phone</span>
                <span class="payment-employee-info-value">${escapePaymentHtml(employeeInfo.phone || 'N/A')}</span>
            </div>
        </div>

        <div class="payment-card-header" style="margin-top: 18px;">
            <h3>Employee Payment</h3>
            <span class="payment-employee-status-badge ${payment.employeePaymentStatus || 'pending'}">
                <i class="fas ${payment.employeePaymentStatus === 'paid' ? 'fa-check-circle' : payment.employeePaymentStatus === 'cancelled' ? 'fa-ban' : 'fa-clock'}"></i>
                ${formatPaymentLabel(payment.employeePaymentStatus || 'pending')}
            </span>
        </div>

        <div class="payment-employee-payment-form">
            <div class="payment-employee-form-group">
                <label>Amount</label>
                <input type="number" id="employeePaymentAmount" value="${payment.employeePaymentAmount || 0}" min="0" step="0.01">
            </div>
            <div class="payment-employee-form-group">
                <label>Status</label>
                <select id="employeePaymentStatus">
                    <option value="pending" ${payment.employeePaymentStatus === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="paid" ${payment.employeePaymentStatus === 'paid' ? 'selected' : ''}>Paid</option>
                    <option value="cancelled" ${payment.employeePaymentStatus === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                </select>
            </div>
            <div class="payment-employee-form-group">
                <label>Payment Date</label>
                <input type="date" id="employeePaymentDate" value="${payment.employeePaymentDate ? new Date(payment.employeePaymentDate).toISOString().split('T')[0] : ''}">
            </div>
            <div class="payment-employee-form-group">
                <label>Payment Method</label>
                <select id="employeePaymentMethod">
                    <option value="">Select Method</option>
                    <option value="cash" ${payment.employeePaymentMethod === 'cash' ? 'selected' : ''}>Cash</option>
                    <option value="bank-transfer" ${payment.employeePaymentMethod === 'bank-transfer' ? 'selected' : ''}>Bank Transfer</option>
                    <option value="check" ${payment.employeePaymentMethod === 'check' ? 'selected' : ''}>Check</option>
                    <option value="online" ${payment.employeePaymentMethod === 'online' ? 'selected' : ''}>Online</option>
                </select>
            </div>
            <div class="payment-employee-form-group" style="grid-column: 1 / -1;">
                <label>Notes</label>
                <textarea id="employeePaymentNotes">${payment.employeePaymentNotes || ''}</textarea>
            </div>
        </div>

        <div class="payment-milestone-actions">
            <button class="btn btn-primary" type="button" onclick="saveEmployeePayment()">
                <i class="fas fa-save"></i> Save Employee Payment
            </button>
        </div>
    </section>
` : '';

// Insert this section in the modal.innerHTML before the milestone section
// Replace the milestone section line with:
// ${employeeSection}
// <section class="payment-rich-card payment-milestone-section">


// Add this function to save employee payment
async function saveEmployeePayment() {
    try {
        const employeePaymentData = {
            employeePaymentAmount: parseFloat(document.getElementById('employeePaymentAmount').value) || 0,
            employeePaymentStatus: document.getElementById('employeePaymentStatus').value,
            employeePaymentDate: document.getElementById('employeePaymentDate').value || null,
            employeePaymentMethod: document.getElementById('employeePaymentMethod').value || null,
            employeePaymentNotes: document.getElementById('employeePaymentNotes').value || ''
        };

        const response = await fetch(`${API_BASE_URL}/payments/${currentPaymentDetailData._id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(employeePaymentData)
        });

        if (!response.ok) {
            throw new Error('Failed to save employee payment');
        }

        showToast('Employee payment saved successfully', 'success');
        await showPaymentDetail(currentPaymentDetailData._id);
        await loadPayments();
    } catch (error) {
        console.error('Error saving employee payment:', error);
        showToast('Failed to save employee payment: ' + error.message, 'error');
    }
}

window.saveEmployeePayment = saveEmployeePayment;
