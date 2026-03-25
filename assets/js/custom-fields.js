// Custom Fields Management for Vendors and Customers

let vendorCustomFieldCounter = 0;
let customerCustomFieldCounter = 0;

// Add custom field for vendor
function addVendorCustomField(name = '', value = '') {
    const container = document.getElementById('vendorCustomFieldsContainer');
    const fieldId = `vendorCustomField_${vendorCustomFieldCounter++}`;
    
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'custom-field-group';
    fieldDiv.id = fieldId;
    fieldDiv.innerHTML = `
        <div class="form-row" style="align-items: flex-end; gap: 10px;">
            <div class="form-group" style="flex: 1;">
                <label>Field Name</label>
                <input type="text" class="custom-field-name" placeholder="e.g., License Number" value="${name}">
            </div>
            <div class="form-group" style="flex: 1;">
                <label>Field Value</label>
                <input type="text" class="custom-field-value" placeholder="Enter value" value="${value}">
            </div>
            <button type="button" class="btn-remove-field" onclick="removeCustomField('${fieldId}')" title="Remove field">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    container.appendChild(fieldDiv);
}

// Add custom field for customer
function addCustomerCustomField(name = '', value = '') {
    const container = document.getElementById('customerCustomFieldsContainer');
    const fieldId = `customerCustomField_${customerCustomFieldCounter++}`;
    
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'custom-field-group';
    fieldDiv.id = fieldId;
    fieldDiv.innerHTML = `
        <div class="form-row" style="align-items: flex-end; gap: 10px;">
            <div class="form-group" style="flex: 1;">
                <label>Field Name</label>
                <input type="text" class="custom-field-name" placeholder="e.g., Account Number" value="${name}">
            </div>
            <div class="form-group" style="flex: 1;">
                <label>Field Value</label>
                <input type="text" class="custom-field-value" placeholder="Enter value" value="${value}">
            </div>
            <button type="button" class="btn-remove-field" onclick="removeCustomField('${fieldId}')" title="Remove field">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    container.appendChild(fieldDiv);
}

// Remove custom field
function removeCustomField(fieldId) {
    const field = document.getElementById(fieldId);
    if (field) {
        field.remove();
    }
}

// Get all vendor custom fields
function getVendorCustomFields() {
    const container = document.getElementById('vendorCustomFieldsContainer');
    const fields = [];
    
    container.querySelectorAll('.custom-field-group').forEach(group => {
        const name = group.querySelector('.custom-field-name').value.trim();
        const value = group.querySelector('.custom-field-value').value.trim();
        
        if (name) {
            fields.push({ name, value });
        }
    });
    
    return fields;
}

// Get all customer custom fields
function getCustomerCustomFields() {
    const container = document.getElementById('customerCustomFieldsContainer');
    const fields = [];
    
    container.querySelectorAll('.custom-field-group').forEach(group => {
        const name = group.querySelector('.custom-field-name').value.trim();
        const value = group.querySelector('.custom-field-value').value.trim();
        
        if (name) {
            fields.push({ name, value });
        }
    });
    
    return fields;
}

// Clear vendor custom fields
function clearVendorCustomFields() {
    const container = document.getElementById('vendorCustomFieldsContainer');
    container.innerHTML = '';
    vendorCustomFieldCounter = 0;
}

// Clear customer custom fields
function clearCustomerCustomFields() {
    const container = document.getElementById('customerCustomFieldsContainer');
    container.innerHTML = '';
    customerCustomFieldCounter = 0;
}

// Load vendor custom fields (for edit mode)
function loadVendorCustomFields(customFields) {
    clearVendorCustomFields();
    if (customFields && customFields.length > 0) {
        customFields.forEach(field => {
            addVendorCustomField(field.name, field.value);
        });
    }
}

// Load customer custom fields (for edit mode)
function loadCustomerCustomFields(customFields) {
    clearCustomerCustomFields();
    if (customFields && customFields.length > 0) {
        customFields.forEach(field => {
            addCustomerCustomField(field.name, field.value);
        });
    }
}
