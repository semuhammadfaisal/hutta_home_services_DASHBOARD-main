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
    escapeRegex
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
});

console.log('Security utilities loaded');
