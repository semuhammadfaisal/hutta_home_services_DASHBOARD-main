// Automatically add asterisks to required field labels
function addRequiredAsterisks() {
    // Find all required inputs, selects, and textareas
    const requiredFields = document.querySelectorAll('input[required], select[required], textarea[required]');
    
    requiredFields.forEach(field => {
        // Find the associated label
        const label = field.closest('.form-group')?.querySelector('label');
        
        if (label && !label.querySelector('.required')) {
            // Add asterisk if not already present
            const asterisk = document.createElement('span');
            asterisk.className = 'required';
            asterisk.textContent = ' *';
            asterisk.style.color = '#ef4444';
            asterisk.style.fontWeight = '700';
            label.appendChild(asterisk);
        }
    });
}

// Run on page load
document.addEventListener('DOMContentLoaded', addRequiredAsterisks);

// Also run when modals are opened (use MutationObserver)
const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        if (mutation.addedNodes.length) {
            addRequiredAsterisks();
        }
    });
});

// Observe the entire document for changes
observer.observe(document.body, {
    childList: true,
    subtree: true
});
