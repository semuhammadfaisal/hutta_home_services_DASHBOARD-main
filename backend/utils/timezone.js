// Backend Timezone Utility for MDT (Mountain Daylight Time)
const TIMEZONE = 'America/Denver';

function toMDT(date) {
    if (!date) return null;
    const d = new Date(date);
    return new Date(d.toLocaleString('en-US', { timeZone: TIMEZONE }));
}

function formatDateMDT(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleString('en-US', { timeZone: TIMEZONE });
}

function nowMDT() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }));
}

module.exports = {
    TIMEZONE,
    toMDT,
    formatDateMDT,
    nowMDT
};
