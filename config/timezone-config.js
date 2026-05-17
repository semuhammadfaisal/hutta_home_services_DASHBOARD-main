// Timezone Configuration for Hutta Home Services
// Uses America/Denver (Mountain Time: MDT/MST with automatic DST)

const MDT_ZONE = 'America/Denver';

function getMDTParts(utcMs) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: MDT_ZONE,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false
    }).formatToParts(new Date(utcMs));
    const get = (type) => parseInt(parts.find((p) => p.type === type).value, 10);
    return {
        year: get('year'),
        month: get('month'),
        day: get('day'),
        hour: get('hour'),
        minute: get('minute'),
        second: get('second')
    };
}

function toMDT(date) {
    if (!date) return null;
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return null;
    const parts = getMDTParts(d.getTime());
    return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function getYmdInMDT(date) {
    if (!date) return null;
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return null;
    const parts = getMDTParts(d.getTime());
    return { year: parts.year, month: parts.month - 1, day: parts.day };
}

function formatDateMDT(date, options = {}) {
    if (!date) return '';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
        timeZone: MDT_ZONE,
        ...options
    });
}

function formatDateOnlyMDT(date, options = {}) {
    if (!date) return '';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', {
        timeZone: MDT_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        ...options
    });
}

function formatDateShortMDT(date, options = {}) {
    if (!date) return '';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', {
        timeZone: MDT_ZONE,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        ...options
    });
}

function formatTimeMDT(date) {
    if (!date) return '';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', {
        timeZone: MDT_ZONE,
        hour: '2-digit',
        minute: '2-digit'
    });
}

function nowMDT() {
    return new Date();
}

function nowYmdMDT() {
    return getYmdInMDT(new Date());
}

function addDaysToDateString(dateString, days) {
    const start = dateInputToMDT(dateString);
    return formatForInput(new Date(start.getTime() + days * 86400000));
}

// Interpret YYYY-MM-DD as midnight in America/Denver
function dateInputToMDT(dateString) {
    if (!dateString) return null;
    const normalized = String(dateString).split('T')[0];
    const [year, month, day] = normalized.split('-').map(Number);
    if (!year || !month || !day) return null;

    const base = Date.UTC(year, month - 1, day, 12, 0, 0);
    for (let offsetHours = -14; offsetHours <= 14; offsetHours++) {
        const candidate = base + offsetHours * 3600000;
        const p = getMDTParts(candidate);
        if (p.year === year && p.month === month && p.day === day && p.hour === 0 && p.minute === 0) {
            return new Date(candidate);
        }
    }
    return new Date(base);
}

function endOfDayMDT(dateInput) {
    const dateString = typeof dateInput === 'string'
        ? dateInput.split('T')[0]
        : formatForInput(dateInput);
    const nextDay = addDaysToDateString(dateString, 1);
    return new Date(dateInputToMDT(nextDay).getTime() - 1);
}

function formatForInput(date) {
    if (!date) return '';
    const d = toMDT(date);
    if (!d || Number.isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function todayInputMDT() {
    const ymd = getYmdInMDT(new Date());
    if (!ymd) return '';
    return `${ymd.year}-${String(ymd.month + 1).padStart(2, '0')}-${String(ymd.day).padStart(2, '0')}`;
}

function startOfMonthMDT(referenceDate) {
    const ref = referenceDate ? toMDT(referenceDate) : nowMDT();
    const dateString = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}-01`;
    return dateInputToMDT(dateString);
}

function isDateInRangeMDT(date, startDate, endDate) {
    if (!date || !startDate || !endDate) return false;
    const value = new Date(date).getTime();
    const start = dateInputToMDT(startDate).getTime();
    const end = endOfDayMDT(endDate).getTime();
    return value >= start && value <= end;
}

const timezoneApi = {
    TIMEZONE: MDT_ZONE,
    getMDTParts,
    getYmdInMDT,
    toMDT,
    formatDateMDT,
    formatDateOnlyMDT,
    formatDateShortMDT,
    formatTimeMDT,
    nowMDT,
    nowYmdMDT,
    dateInputToMDT,
    endOfDayMDT,
    formatForInput,
    todayInputMDT,
    startOfMonthMDT,
    isDateInRangeMDT,
    addDaysToDateString
};

if (typeof window !== 'undefined') {
    window.TimezoneConfig = timezoneApi;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = timezoneApi;
}
