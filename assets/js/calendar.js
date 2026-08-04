// Calendar — Arizona Time (America/Phoenix, MST / GMT-7)
function getCalendarTimezone() {
    return (window.TimezoneConfig && window.TimezoneConfig.TIMEZONE) || 'America/Phoenix';
}

function getYmdInMDT(date) {
    if (window.TimezoneConfig && window.TimezoneConfig.getYmdInMDT) {
        return window.TimezoneConfig.getYmdInMDT(date);
    }
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: getCalendarTimezone(),
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
    }).formatToParts(d);
    const getPart = (type) => parseInt(parts.find(part => part.type === type)?.value, 10);
    return {
        year: getPart('year'),
        month: getPart('month') - 1,
        day: getPart('day')
    };
}

function getTodayYmdMDT() {
    if (window.TimezoneConfig && window.TimezoneConfig.nowYmdMDT) {
        return window.TimezoneConfig.nowYmdMDT();
    }
    return getYmdInMDT(new Date());
}

function initCalendarView() {
    const today = getTodayYmdMDT();
    return { year: today.year, month: today.month };
}

let calendarView = initCalendarView();
let cachedOrders = [];
let cachedProjects = [];

function sameYmd(a, year, month, day) {
    return a && a.year === year && a.month === month && a.day === day;
}

function parseDateOnlyYmd(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/);
    if (!match) return null;
    return {
        year: Number(match[1]),
        month: Number(match[2]) - 1,
        day: Number(match[3])
    };
}

function getCalendarFieldYmd(value) {
    return parseDateOnlyYmd(value) || getYmdInMDT(value);
}

function calendarDateString(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function ymdToOrdinal(ymd) {
    if (!ymd) return null;
    const ordinal = Math.floor(Date.UTC(ymd.year, ymd.month, ymd.day) / 86400000);
    return Number.isNaN(ordinal) ? null : ordinal;
}

function dayOfWeekForYmd(year, month, day) {
    return new Date(Date.UTC(year, month, day)).getUTCDay();
}

function daysInCalendarMonth(year, month) {
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function dateFromYmdMDT(year, month, day) {
    const dateString = calendarDateString(year, month, day);
    return window.TimezoneConfig?.dateInputToMDT
        ? window.TimezoneConfig.dateInputToMDT(dateString)
        : new Date(`${dateString}T00:00:00`);
}

function formatCalendarDate(value) {
    const ymd = getCalendarFieldYmd(value);
    if (!ymd) return 'N/A';
    return new Date(Date.UTC(ymd.year, ymd.month, ymd.day)).toLocaleDateString('en-US', {
        timeZone: 'UTC'
    });
}
function formatCalendarTime(value) {
    if (!value) return '';
    return new Date(value).toLocaleTimeString('en-US', { timeZone: getCalendarTimezone(), hour: 'numeric', minute: '2-digit' });
}

function getEventsForDate(year, month, day) {
    const events = [];
    const orders = Array.isArray(cachedOrders) ? cachedOrders : [];
    const projects = Array.isArray(cachedProjects) ? cachedProjects : [];
    
    orders.forEach(order => {
        const isRecurring = order.orderType === 'recurring';
        if (isRecurring) return;

        const orderScheduleDate = order.scheduledStart || order.scheduleDate || order.startDate;

        if (orderScheduleDate) {
            const startYmd = getCalendarFieldYmd(orderScheduleDate);
            if (sameYmd(startYmd, year, month, day)) {
                events.push({
                    type: 'order',
                    title: `${order.scheduledStart ? `${formatCalendarTime(order.scheduledStart)} ` : ''}${order.orderId || order.service || 'Order'}`,
                    id: order._id,
                    isEndDate: false
                });
            }
        }

        const orderEndDate = order.scheduledEnd || order.endDate;
        if (orderEndDate) {
            const endYmd = getCalendarFieldYmd(orderEndDate);
            if (sameYmd(endYmd, year, month, day)) {
                const startYmd = orderScheduleDate ? getCalendarFieldYmd(orderScheduleDate) : null;
                if (!sameYmd(startYmd, year, month, day)) {
                    events.push({
                        type: 'order',
                        title: `${order.scheduledEnd ? `${formatCalendarTime(order.scheduledEnd)} ` : ''}${order.orderId || order.service || 'Order'}`,
                        id: order._id,
                        isEndDate: true
                    });
                }
            }
        }
    });
    
    projects.forEach(project => {
        if (project.startDate) {
            const startYmd = getCalendarFieldYmd(project.startDate);
            if (sameYmd(startYmd, year, month, day)) {
                events.push({
                    type: 'project',
                    title: project.name || 'Project',
                    id: project._id
                });
            }
        }
    });
    
    return events;
}

async function loadCalendarData() {
    cachedOrders = [];
    cachedProjects = [];

    if (!window.APIService) {
        console.warn('Calendar: APIService not ready');
        return;
    }

    const [ordersResult, projectsResult] = await Promise.allSettled([
        window.APIService.getOrders(),
        window.APIService.getProjects()
    ]);

    if (ordersResult.status === 'fulfilled') {
        cachedOrders = Array.isArray(ordersResult.value) ? ordersResult.value : [];
    } else {
        console.error('Failed to load calendar orders:', ordersResult.reason);
    }

    if (projectsResult.status === 'fulfilled') {
        const raw = projectsResult.value;
        cachedProjects = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
    } else {
        console.error('Failed to load calendar projects:', projectsResult.reason);
    }
}

window.refreshCalendar = renderCalendar;

async function renderCalendar() {
    await loadCalendarData();
    
    const year = calendarView.year;
    const month = calendarView.month;
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    const monthEl = document.getElementById('calendarMonth');
    if (monthEl) {
        monthEl.textContent = `${monthNames[month]} ${year}`;
    }
    
    const firstDay = dayOfWeekForYmd(year, month, 1);
    const daysInMonth = daysInCalendarMonth(year, month);
    const daysInPrevMonth = daysInCalendarMonth(year, month - 1);
    
    const calendarDays = document.getElementById('calendarDays');
    if (!calendarDays) return;
    
    calendarDays.innerHTML = '';
    
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day other-month';
        dayDiv.innerHTML = `<div class="calendar-day-number">${day}</div>`;
        calendarDays.appendChild(dayDiv);
    }
    
    const today = getTodayYmdMDT();
    for (let day = 1; day <= daysInMonth; day++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        
        if (sameYmd(today, year, month, day)) {
            dayDiv.classList.add('today');
        }
        
        dayDiv.style.cursor = 'pointer';
        dayDiv.onclick = (e) => {
            if (e.target === dayDiv || e.target.classList.contains('calendar-day-number')) {
                const selectedDate = dateFromYmdMDT(year, month, day);
                openOrderModalWithDate(selectedDate);
            }
        };
        
        const dayNumber = document.createElement('div');
        dayNumber.className = 'calendar-day-number';
        dayNumber.textContent = day;
        dayDiv.appendChild(dayNumber);
        
        const events = getEventsForDate(year, month, day);
        if (events.length > 0) {
            const eventsContainer = document.createElement('div');
            eventsContainer.className = 'calendar-events';
            
            events.slice(0, 3).forEach(event => {
                const eventDiv = document.createElement('div');
                eventDiv.className = `calendar-event ${event.type}`;
                if (event.isRecurring) {
                    eventDiv.classList.add('recurring');
                }
                if (event.isEndDate) {
                    eventDiv.style.backgroundColor = '#ef4444';
                    eventDiv.style.borderColor = '#dc2626';
                    eventDiv.title = `END: ${event.title}`;
                    eventDiv.textContent = `END: ${event.title}`;
                } else {
                    eventDiv.textContent = event.title;
                    eventDiv.title = event.title;
                }
                eventDiv.style.cursor = 'pointer';
                eventDiv.onclick = (e) => {
                    e.stopPropagation();
                    showEventDetail(event);
                };
                eventsContainer.appendChild(eventDiv);
            });
            
            if (events.length > 3) {
                const moreDiv = document.createElement('div');
                moreDiv.className = 'calendar-event-more';
                moreDiv.textContent = `+${events.length - 3} more`;
                eventsContainer.appendChild(moreDiv);
            }
            
            dayDiv.appendChild(eventsContainer);
        }
        
        calendarDays.appendChild(dayDiv);
    }
    
    const totalCells = calendarDays.children.length;
    const remainingCells = 42 - totalCells;
    for (let day = 1; day <= remainingCells; day++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day other-month';
        dayDiv.innerHTML = `<div class="calendar-day-number">${day}</div>`;
        calendarDays.appendChild(dayDiv);
    }
    
}

function previousMonth() {
    calendarView.month -= 1;
    if (calendarView.month < 0) {
        calendarView.month = 11;
        calendarView.year -= 1;
    }
    renderCalendar();
}

function nextMonth() {
    calendarView.month += 1;
    if (calendarView.month > 11) {
        calendarView.month = 0;
        calendarView.year += 1;
    }
    renderCalendar();
}

function addEvent() {
    alert('Event creation is not available yet.');
}

function loadCalendarSection() {
    if (typeof renderCalendar === 'function') {
        renderCalendar();
    }
}

document.addEventListener('DOMContentLoaded', function() {
    calendarView = initCalendarView();
    if (document.getElementById('calendarDays')) {
        setTimeout(loadCalendarSection, 300);
    }
});

document.addEventListener('click', function(e) {
    if (e.target.closest('a[data-section="calendar"]')) {
        setTimeout(loadCalendarSection, 100);
    }
});

window.renderCalendar = renderCalendar;
window.loadCalendarSection = loadCalendarSection;
window.previousMonth = previousMonth;
window.nextMonth = nextMonth;

async function showEventDetail(event) {
    const panel = document.getElementById('calendarDetailPanel');
    const title = document.getElementById('detailPanelTitle');
    const body = document.getElementById('detailPanelBody');
    
    title.textContent = event.type === 'project' ? 'Project Details' : 'Order Details';
    
    try {
        let data;
        if (event.type === 'project') {
            data = await window.APIService.getProject(event.id);
            body.innerHTML = `
                <div class="detail-badge project">Project</div>
                <div class="detail-item">
                    <label>Name</label>
                    <div class="value">${data.name}</div>
                </div>
                <div class="detail-item">
                    <label>Customer</label>
                    <div class="value">${data.customer?.name || 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <label>Status</label>
                    <div class="value">${data.status}</div>
                </div>
                <div class="detail-item">
                    <label>Budget</label>
                    <div class="value">$${data.budget?.toLocaleString() || '0'}</div>
                </div>
                <div class="detail-item">
                    <label>Start Date</label>
                    <div class="value">${formatCalendarDate(data.startDate)}</div>
                </div>
                <div class="detail-item">
                    <label>Description</label>
                    <div class="value">${data.description || 'No description'}</div>
                </div>
            `;
        } else {
            data = await window.APIService.getOrder(event.id);
            body.innerHTML = `
                <div class="detail-badge order">Order</div>
                <div class="detail-item">
                    <label>Service</label>
                    <div class="value">${data.service}</div>
                </div>
                <div class="detail-item">
                    <label>Customer</label>
                    <div class="value">${data.customer?.name || data.customer}</div>
                </div>
                <div class="detail-item">
                    <label>Status</label>
                    <div class="value">${data.status}</div>
                </div>
                <div class="detail-item">
                    <label>Amount</label>
                    <div class="value">$${data.amount?.toLocaleString() || '0'}</div>
                </div>
                <div class="detail-item">
                    <label>Confirmed Schedule</label>
                    <div class="value">${data.scheduledStart ? `${formatCalendarDate(data.scheduledStart)} ${formatCalendarTime(data.scheduledStart)} — ${formatCalendarDate(data.scheduledEnd)} ${formatCalendarTime(data.scheduledEnd)} Arizona time` : formatCalendarDate(data.scheduleDate || data.startDate)}</div>
                </div>
                <div class="detail-item">
                    <label>Description</label>
                    <div class="value">${data.description || 'No description'}</div>
                </div>
            `;
        }
        
        panel.style.display = 'block';
    } catch (error) {
        console.error('Failed to load event details:', error);
    }
}

function closeDetailPanel() {
    const panel = document.getElementById('calendarDetailPanel');
    if (panel) panel.style.display = 'none';
}

window.closeDetailPanel = closeDetailPanel;

function openOrderModalWithDate(date) {
    const selectedYmd = getYmdInMDT(date);
    if (!selectedYmd) return;
    const formattedDate = calendarDateString(selectedYmd.year, selectedYmd.month, selectedYmd.day);
    
    window.AppLogger?.debug('Opening order modal with date:', formattedDate);
    
    if (typeof window.showAddOrderModal === 'function') {
        window.showAddOrderModal();
        
        setTimeout(() => {
            const scheduleDateInput = document.getElementById('scheduleDate');
            const endDateInput = document.getElementById('endDate');
            
            if (scheduleDateInput) {
                scheduleDateInput.value = formattedDate;
                window.AppLogger?.debug('Schedule date set to:', formattedDate);
            }
            
            if (endDateInput) {
                endDateInput.value = formattedDate;
                window.AppLogger?.debug('End date set to:', formattedDate);
            }
        }, 100);
    } else {
        console.error('showAddOrderModal function not found');
        alert('Please navigate to the Orders section to create a new order.');
    }
}

window.openOrderModalWithDate = openOrderModalWithDate;


let recurringCachedOrders = [];
const recurringToday = getTodayYmdMDT();
let recurringCurrentMonth = recurringToday.month;
let recurringCurrentYear = recurringToday.year;

async function loadRecurringCalendarData() {
    try {
        const allOrders = await window.APIService.getOrders();
        recurringCachedOrders = allOrders.filter(order => order.orderType === 'recurring');
    } catch (error) {
        console.error('Failed to load recurring calendar data:', error);
        recurringCachedOrders = [];
    }
}

function getRecurringEventsForDate(year, month, day) {
    const events = [];
    const targetYmd = { year, month, day };
    const targetOrdinal = ymdToOrdinal(targetYmd);
    
    recurringCachedOrders.forEach(order => {
        const orderScheduleDate = order.scheduleDate || order.startDate;
        if (orderScheduleDate && order.recurringFrequency) {
            const startYmd = getCalendarFieldYmd(orderScheduleDate);
            const startOrdinal = ymdToOrdinal(startYmd);
            const endYmd = order.recurringEndDate ? getCalendarFieldYmd(order.recurringEndDate) : null;
            const endOrdinal = ymdToOrdinal(endYmd);

            if (startOrdinal === null || targetOrdinal === null) return;
            
            if (targetOrdinal < startOrdinal) return;
            if (endOrdinal !== null && targetOrdinal > endOrdinal) return;
            
            if (isRecurringMatch(startYmd, targetYmd, order.recurringFrequency, order.recurringCustomDays)) {
                events.push({
                    type: 'recurring-order',
                    title: order.orderId || order.service || 'Recurring Order',
                    id: order._id,
                    frequency: order.recurringFrequency,
                    order: order,
                    occurrenceDate: dateFromYmdMDT(year, month, day)
                });
            }
        }
    });
    
    return events;
}

function isRecurringMatch(startDate, targetDate, frequency, customDays) {
    const start = startDate;
    const target = targetDate;
    const startOrdinal = ymdToOrdinal(start);
    const targetOrdinal = ymdToOrdinal(target);
    
    if (startOrdinal === null || targetOrdinal === null) return false;
    if (startOrdinal === targetOrdinal) return true;
    if (targetOrdinal < startOrdinal) return false;
    
    const daysDiff = targetOrdinal - startOrdinal;
    
    switch (frequency) {
        case 'custom':
            if (!customDays || customDays < 1) return false;
            return daysDiff % customDays === 0;
            
        case 'weekly':
            return daysDiff % 7 === 0 && dayOfWeekForYmd(start.year, start.month, start.day) === dayOfWeekForYmd(target.year, target.month, target.day);
            
        case 'bi-weekly':
            return daysDiff % 14 === 0 && dayOfWeekForYmd(start.year, start.month, start.day) === dayOfWeekForYmd(target.year, target.month, target.day);
            
        case 'monthly':
            const monthsDiff = (target.year - start.year) * 12 + (target.month - start.month);
            if (monthsDiff < 0) return false;
            
            const startDay = start.day;
            const targetDay = target.day;
            
            const lastDayOfTargetMonth = daysInCalendarMonth(target.year, target.month);
            
            if (startDay > lastDayOfTargetMonth) {
                return targetDay === lastDayOfTargetMonth;
            }
            
            return targetDay === startDay;
            
        case 'yearly':
            const yearsDiff = target.year - start.year;
            if (yearsDiff < 0) return false;
            
            return start.month === target.month && start.day === target.day;
            
        default:
            return false;
    }
}

async function renderRecurringCalendar() {
    await loadRecurringCalendarData();
    
    const year = recurringCurrentYear;
    const month = recurringCurrentMonth;
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    
    const monthEl = document.getElementById('recurringCalendarMonth');
    if (monthEl) {
        monthEl.textContent = `${monthNames[month]} ${year}`;
    }
    
    const firstDay = dayOfWeekForYmd(year, month, 1);
    const daysInMonth = daysInCalendarMonth(year, month);
    const daysInPrevMonth = daysInCalendarMonth(year, month - 1);
    
    const calendarDays = document.getElementById('recurringCalendarDays');
    if (!calendarDays) return;
    
    calendarDays.innerHTML = '';
    
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day other-month';
        dayDiv.innerHTML = `<div class="calendar-day-number">${day}</div>`;
        calendarDays.appendChild(dayDiv);
    }
    
    const today = getTodayYmdMDT();
    for (let day = 1; day <= daysInMonth; day++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        
        if (sameYmd(today, year, month, day)) {
            dayDiv.classList.add('today');
        }
        
        const dayNumber = document.createElement('div');
        dayNumber.className = 'calendar-day-number';
        dayNumber.textContent = day;
        dayDiv.appendChild(dayNumber);
        
        const events = getRecurringEventsForDate(year, month, day);
        if (events.length > 0) {
            const eventsContainer = document.createElement('div');
            eventsContainer.className = 'calendar-events';
            
            events.slice(0, 3).forEach(event => {
                const eventDiv = document.createElement('div');
                eventDiv.className = 'calendar-event recurring-order';
                eventDiv.textContent = event.title;
                eventDiv.title = `${event.title} (${event.frequency})`;
                eventDiv.style.cursor = 'pointer';
                eventDiv.onclick = (e) => {
                    e.stopPropagation();
                    showRecurringEventDetail(event);
                };
                eventsContainer.appendChild(eventDiv);
            });
            
            if (events.length > 3) {
                const moreDiv = document.createElement('div');
                moreDiv.className = 'calendar-event-more';
                moreDiv.textContent = `+${events.length - 3} more`;
                eventsContainer.appendChild(moreDiv);
            }
            
            dayDiv.appendChild(eventsContainer);
        }
        
        calendarDays.appendChild(dayDiv);
    }
    
    const totalCells = calendarDays.children.length;
    const remainingCells = 42 - totalCells;
    for (let day = 1; day <= remainingCells; day++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day other-month';
        dayDiv.innerHTML = `<div class="calendar-day-number">${day}</div>`;
        calendarDays.appendChild(dayDiv);
    }
}

async function showRecurringEventDetail(event) {
    const panel = document.getElementById('recurringDetailPanel');
    const title = document.getElementById('recurringDetailPanelTitle');
    const body = document.getElementById('recurringDetailPanelBody');
    
    title.textContent = 'Recurring Order Details';
    
    try {
        const data = await window.APIService.getOrder(event.id);
        
        const frequencyLabels = {
            'weekly': 'Weekly',
            'bi-weekly': 'Bi-Weekly',
            'monthly': 'Monthly',
            'yearly': 'Yearly',
            'custom': 'Custom'
        };
        
        let frequencyDisplay;
        if (data.recurringFrequency === 'custom') {
            if (data.recurringCustomDays && data.recurringCustomDays > 0) {
                frequencyDisplay = `Every ${data.recurringCustomDays} day${data.recurringCustomDays > 1 ? 's' : ''}`;
            } else {
                frequencyDisplay = 'Custom (days not specified)';
            }
        } else {
            frequencyDisplay = frequencyLabels[data.recurringFrequency] || data.recurringFrequency;
        }
        
        body.innerHTML = `
            <div class="detail-badge recurring">Recurring Order</div>
            <div class="detail-item">
                <label>Service</label>
                <div class="value">${data.service}</div>
            </div>
            <div class="detail-item">
                <label>Customer</label>
                <div class="value">${data.customer?.name || data.customer}</div>
            </div>
            ${data.customer?.address ? `
            <div class="detail-item">
                <label>Address</label>
                <div class="value">${data.customer.address}</div>
            </div>
            ` : ''}
            <div class="detail-item">
                <label>Frequency</label>
                <div class="value">${frequencyDisplay}</div>
            </div>
            <div class="detail-item">
                <label>Amount</label>
                <div class="value">$${data.amount?.toLocaleString() || '0'}</div>
            </div>
            <div class="detail-item">
                <label>Schedule Date</label>
                <div class="value">${formatCalendarDate(data.scheduleDate || data.startDate)}</div>
            </div>
            ${data.recurringEndDate ? `
            <div class="detail-item">
                <label>End Date</label>
                <div class="value">${formatCalendarDate(data.recurringEndDate)}</div>
            </div>
            ` : ''}
            ${data.recurringNotes ? `
            <div class="detail-item">
                <label>Recurring Notes</label>
                <div class="value">${data.recurringNotes}</div>
            </div>
            ` : ''}
            <div class="detail-item">
                <label>Description</label>
                <div class="value">${data.description || 'No description'}</div>
            </div>
            <div class="detail-actions">
                <button class="btn-secondary" onclick="editOrder('${data._id}')">
                    <i class="fas fa-edit"></i> Edit
                </button>
            </div>
        `;
        
        panel.style.display = 'block';
    } catch (error) {
        console.error('Failed to load recurring event details:', error);
    }
}

window.renderRecurringCalendar = renderRecurringCalendar;
window.showRecurringEventDetail = showRecurringEventDetail;
