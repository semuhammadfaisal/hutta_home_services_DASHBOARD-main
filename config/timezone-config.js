// Timezone Configuration for Hutta Home Services
// MDT (Mountain Daylight Time) = UTC-6

const TIMEZONE = 'America/Denver'; // MDT/MST timezone
const TIMEZONE_OFFSET = -6; // MDT offset in hours

// Convert UTC date to MDT
function toMDT(date) {
    if (!date) return null;
    const d = new Date(date);
    return new Date(d.toLocaleString('en-US', { timeZone: TIMEZONE }));
}

// Format date in MDT timezone
function formatDateMDT(date, options = {}) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleString('en-US', { 
        timeZone: TIMEZONE,
        ...options
    });
}

// Format date only (no time) in MDT
function formatDateOnlyMDT(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { 
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

// Format time only in MDT
function formatTimeMDT(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleTimeString('en-US', { 
        timeZone: TIMEZONE,
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Get current date/time in MDT
function nowMDT() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }));
}

// Convert date input (YYYY-MM-DD) to MDT midnight
function dateInputToMDT(dateString) {
    if (!dateString) return null;
    // Parse as local date in MDT timezone
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, 6, 0, 0)); // Add 6 hours for MDT offset
    return date;
}

// Format date for input field (YYYY-MM-DD) in MDT
function formatForInput(date) {
    if (!date) return '';
    const d = toMDT(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Export for browser
if (typeof window !== 'undefined') {
    window.TimezoneConfig = {
        TIMEZONE,
        TIMEZONE_OFFSET,
        toMDT,
        formatDateMDT,
        formatDateOnlyMDT,
        formatTimeMDT,
        nowMDT,
        dateInputToMDT,
        formatForInput
    };
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TIMEZONE,
        TIMEZONE_OFFSET,
        toMDT,
        formatDateMDT,
        formatDateOnlyMDT,
        formatTimeMDT,
        nowMDT,
        dateInputToMDT,
        formatForInput
    };
}
