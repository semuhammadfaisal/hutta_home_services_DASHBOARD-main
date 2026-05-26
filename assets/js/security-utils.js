// Security Utilities
// Input sanitization and validation functions

/**
 * Sanitize user input to prevent XSS attacks
 * @param {string} input - Raw user input
 * @returns {string} - Sanitized input
 */
function sanitizeInput(input) {
    if (typeof input !== 'string') {
        return input;
    }
    
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
}

/**
 * Sanitize HTML content more aggressively
 * @param {string} html - Raw HTML content
 * @returns {string} - Sanitized HTML
 */
function sanitizeHTML(html) {
    if (typeof html !== 'string') {
        return html;
    }
    
    // Remove script tags and event handlers
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
        .replace(/on\w+\s*=\s*[^\s>]*/gi, '')
        .replace(/javascript:/gi, '');
}

/**
 * Validate email format
 * @param {string} email - Email address
 * @returns {boolean} - True if valid
 */
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate phone number format
 * @param {string} phone - Phone number
 * @returns {boolean} - True if valid
 */
function validatePhone(phone) {
    const phoneRegex = /^[\d\s\-\(\)\+]+$/;
    return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
}

/**
 * Format phone number consistently
 * @param {string} phone - Raw phone number
 * @returns {string} - Formatted phone number
 */
function formatPhone(phone) {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
        return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
    }
    return phone;
}

/**
 * Validate password strength
 * Requirements: 8+ chars, uppercase, lowercase, number, special char
 * @param {string} password - Password to validate
 * @returns {object} - {valid: boolean, message: string}
 */
function validatePassword(password) {
    if (!password || password.length < 8) {
        return {
            valid: false,
            message: 'Password must be at least 8 characters long'
        };
    }
    
    if (!/[a-z]/.test(password)) {
        return {
            valid: false,
            message: 'Password must contain at least one lowercase letter'
        };
    }
    
    if (!/[A-Z]/.test(password)) {
        return {
            valid: false,
            message: 'Password must contain at least one uppercase letter'
        };
    }
    
    if (!/\d/.test(password)) {
        return {
            valid: false,
            message: 'Password must contain at least one number'
        };
    }
    
    if (!/[@$!%*?&#]/.test(password)) {
        return {
            valid: false,
            message: 'Password must contain at least one special character (@$!%*?&#)'
        };
    }
    
    return {
        valid: true,
        message: 'Password is strong'
    };
}

/**
 * Validate date range
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @returns {object} - {valid: boolean, message: string}
 */
function validateDateRange(startDate, endDate) {
    if (!startDate || !endDate) {
        return { valid: true, message: '' };
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (end < start) {
        return {
            valid: false,
            message: 'End date must be after start date'
        };
    }
    
    return { valid: true, message: '' };
}

/**
 * Sanitize object properties recursively
 * @param {object} obj - Object to sanitize
 * @returns {object} - Sanitized object
 */
function sanitizeObject(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }
    
    const sanitized = Array.isArray(obj) ? [] : {};
    
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const value = obj[key];
            
            if (typeof value === 'string') {
                sanitized[key] = sanitizeInput(value);
            } else if (typeof value === 'object' && value !== null) {
                sanitized[key] = sanitizeObject(value);
            } else {
                sanitized[key] = value;
            }
        }
    }
    
    return sanitized;
}

/**
 * Check for duplicate detection
 * @param {string} name - Name to check
 * @param {array} existingItems - Array of existing items
 * @param {string} nameField - Field name to check (default: 'name')
 * @returns {array} - Array of similar items
 */
function findSimilarItems(name, existingItems, nameField = 'name') {
    if (!name || !existingItems || !Array.isArray(existingItems)) {
        return [];
    }
    
    const searchTerm = name.toLowerCase().trim();
    
    return existingItems.filter(item => {
        const itemName = item[nameField]?.toLowerCase().trim() || '';
        return itemName.includes(searchTerm) || searchTerm.includes(itemName);
    });
}

/**
 * Escape special characters for regex
 * @param {string} string - String to escape
 * @returns {string} - Escaped string
 */
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate numeric input
 * @param {string|number} value - Value to validate
 * @param {object} options - {min, max, allowNegative}
 * @returns {object} - {valid: boolean, message: string}
 */
function validateNumeric(value, options = {}) {
    const num = parseFloat(value);
    
    if (isNaN(num)) {
        return {
            valid: false,
            message: 'Value must be a number'
        };
    }
    
    if (options.allowNegative === false && num < 0) {
        return {
            valid: false,
            message: 'Value cannot be negative'
        };
    }
    
    if (options.min !== undefined && num < options.min) {
        return {
            valid: false,
            message: `Value must be at least ${options.min}`
        };
    }
    
    if (options.max !== undefined && num > options.max) {
        return {
            valid: false,
            message: `Value cannot exceed ${options.max}`
        };
    }
    
    return { valid: true, message: '' };
}

let accessibilityLabelCounter = 0;

function isLabelableField(element) {
    if (!element || !element.matches) return false;
    if (!element.matches('input, select, textarea')) return false;
    return !(element.matches('input[type="hidden"]') || element.disabled);
}

function ensureFieldId(field) {
    if (!field.id) {
        field.id = `a11yField_${++accessibilityLabelCounter}`;
    }
    return field.id;
}

function getAutocompleteValue(field) {
    const type = (field.getAttribute('type') || '').toLowerCase();
    const fieldName = `${field.id || ''} ${field.name || ''}`.toLowerCase();

    if (type === 'search' || fieldName.includes('search') || fieldName.includes('filter')) return 'off';
    if (type === 'email' || fieldName.includes('email')) return 'email';
    if (type === 'tel' || fieldName.includes('phone')) return 'tel';
    if (fieldName.includes('firstname') || fieldName.includes('first-name')) return 'given-name';
    if (fieldName.includes('lastname') || fieldName.includes('last-name')) return 'family-name';
    if (fieldName.includes('name')) return 'name';
    if (fieldName.includes('address')) return 'street-address';
    if (fieldName.includes('website') || type === 'url') return 'url';
    if (type === 'password') return fieldName.includes('new') || fieldName.includes('confirm') ? 'new-password' : 'current-password';

    return 'off';
}

function normalizeAutocomplete(root = document) {
    const selector = 'input:not([type="hidden"]), select, textarea';
    const fields = root.matches?.(selector) ? [root] : Array.from(root.querySelectorAll?.(selector) || []);

    fields.forEach(field => {
        if (!field.hasAttribute('autocomplete')) {
            field.setAttribute('autocomplete', getAutocompleteValue(field));
        }
    });
}

function findNearbyLabelField(label) {
    const controlSelector = 'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])';
    const nextField = label.nextElementSibling?.matches?.(controlSelector)
        ? label.nextElementSibling
        : label.nextElementSibling?.querySelector?.(controlSelector);

    if (nextField) return nextField;

    const parent = label.closest('.form-group, .payment-employee-form-group, .payment-vendor-form-group, .setting-item, .report-filter-grid label');
    const fields = parent ? Array.from(parent.querySelectorAll(controlSelector)) : [];

    return fields.find(field => label.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING) || fields[0] || null;
}

function replaceDisplayLabel(label) {
    const span = document.createElement('span');
    const computed = window.getComputedStyle(label);
    const copiedStyleProperties = [
        'display',
        'color',
        'fontSize',
        'fontWeight',
        'textTransform',
        'letterSpacing',
        'lineHeight',
        'margin',
        'marginBottom'
    ];

    Array.from(label.attributes).forEach(attribute => {
        if (attribute.name !== 'for') {
            span.setAttribute(attribute.name, attribute.value);
        }
    });

    span.classList.add('display-label');
    span.dataset.displayLabel = 'true';
    span.innerHTML = label.innerHTML;

    copiedStyleProperties.forEach(property => {
        span.style[property] = computed[property];
    });

    label.replaceWith(span);
}

function normalizeFormLabels(root = document) {
    const labels = root.matches?.('label') ? [root] : Array.from(root.querySelectorAll?.('label') || []);

    labels.forEach(label => {
        if (label.dataset.labelNormalized === 'true') {
            if (label.htmlFor && isLabelableField(document.getElementById(label.htmlFor))) return;
            if (!label.htmlFor && isLabelableField(label.control)) return;
            delete label.dataset.labelNormalized;
        }

        if (isLabelableField(label.control)) {
            label.dataset.labelNormalized = 'true';
            return;
        }

        const referencedField = label.htmlFor ? document.getElementById(label.htmlFor) : null;
        if (isLabelableField(referencedField)) {
            label.dataset.labelNormalized = 'true';
            return;
        }

        const nearbyField = findNearbyLabelField(label);
        if (nearbyField) {
            label.htmlFor = ensureFieldId(nearbyField);
            label.dataset.labelNormalized = 'true';
            return;
        }

        replaceDisplayLabel(label);
    });
}

function normalizeFormAccessibility(root = document) {
    normalizeAutocomplete(root);
    normalizeFormLabels(root);
}

// Export functions to window object
window.SecurityUtils = {
    sanitizeInput,
    sanitizeHTML,
    sanitizeObject,
    validateEmail,
    validatePhone,
    formatPhone,
    validatePassword,
    validateDateRange,
    validateNumeric,
    findSimilarItems,
    escapeRegex,
    normalizeFormLabels,
    normalizeAutocomplete,
    normalizeFormAccessibility
};

// Add password strength indicator to password fields
document.addEventListener('DOMContentLoaded', function() {
    const passwordFields = document.querySelectorAll('input[type="password"]');
    
    passwordFields.forEach(field => {
        // Skip if it's a login password field
        if (field.id === 'password' || field.id === 'currentPassword') {
            return;
        }
        
        field.addEventListener('input', function() {
            const result = validatePassword(this.value);
            
            // Remove existing indicator
            let indicator = this.parentElement.querySelector('.password-strength-indicator');
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.className = 'password-strength-indicator';
                this.parentElement.appendChild(indicator);
            }
            
            if (this.value.length === 0) {
                indicator.textContent = '';
                indicator.className = 'password-strength-indicator';
                return;
            }
            
            indicator.textContent = result.message;
            indicator.className = 'password-strength-indicator ' + (result.valid ? 'strong' : 'weak');
        });
    });

    normalizeFormAccessibility();

    let labelNormalizeQueued = false;
    const observer = new MutationObserver(() => {
        if (labelNormalizeQueued) return;
        labelNormalizeQueued = true;

        requestAnimationFrame(() => {
            labelNormalizeQueued = false;
            normalizeFormAccessibility();
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['autocomplete', 'disabled', 'for', 'id', 'type']
    });
});

window.AppLogger?.debug('Security utilities loaded');
