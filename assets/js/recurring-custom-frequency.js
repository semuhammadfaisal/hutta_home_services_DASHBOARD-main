// Toggle custom days field when frequency changes
function toggleCustomDaysField() {
    const frequency = document.getElementById('recurringFrequency').value;
    const customDaysGroup = document.getElementById('customDaysGroup');
    const customDaysInput = document.getElementById('recurringCustomDays');
    
    if (frequency === 'custom') {
        customDaysGroup.style.display = 'block';
        customDaysInput.required = true;
    } else {
        customDaysGroup.style.display = 'none';
        customDaysInput.required = false;
        customDaysInput.value = '';
    }
}

// Make function globally accessible
window.toggleCustomDaysField = toggleCustomDaysField;
