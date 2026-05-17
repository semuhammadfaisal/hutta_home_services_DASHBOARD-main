// Calendar — Mountain Time (America/Denver)
function getCalendarTimezone() {
    return (window.TimezoneConfig && window.TimezoneConfig.TIMEZONE) || 'America/Denver';
}

function getYmdInMDT(date) {
    if (window.TimezoneConfig && window.TimezoneConfig.getYmdInMDT) {
        return window.TimezoneConfig.getYmdInMDT(date);
    }
    const d = new Date(date);
    return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
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

function getEventsForDate(year, month, day) {
    const events = [];
    const orders = Array.isArray(cachedOrders) ? cachedOrders : [];
    const projects = Array.isArray(cachedProjects) ? cachedProjects : [];
    
    orders.forEach(order => {
        const isRecurring = order.orderType === 'recurring';
        if (isRecurring) return;

        if (order.startDate) {
            const startYmd = getYmdInMDT(order.startDate);
            if (sameYmd(startYmd, year, month, day)) {
                events.push({
                    type: 'order',
                    title: order.orderId || order.service || 'Order',
                    id: order._id,
                    isEndDate: false
                });
            }
        }

        if (order.endDate) {
            const endYmd = getYmdInMDT(order.endDate);
            if (sameYmd(endYmd, year, month, day)) {
                const startYmd = order.startDate ? getYmdInMDT(order.startDate) : null;
                if (!sameYmd(startYmd, year, month, day)) {
                    events.push({
                        type: 'order',
                        title: order.orderId || order.service || 'Order',
                        id: order._id,
                        isEndDate: true
                    });
                }
            }
        }
    });
    
    projects.forEach(project => {
        if (project.startDate) {
            const startYmd = getYmdInMDT(project.startDate);
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
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
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
                const selectedDate = new Date(year, month, day);
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
    alert('Add Event functionality coming soon!');
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
                    <div class="value">${new Date(data.startDate).toLocaleDateString('en-US', { timeZone: getCalendarTimezone() })}</div>
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
                    <label>Start Date</label>
                    <div class="value">${new Date(data.startDate).toLocaleDateString('en-US', { timeZone: getCalendarTimezone() })}</div>
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
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;
    
    console.log('Opening order modal with date:', formattedDate);
    
    if (typeof window.showAddOrderModal === 'function') {
        window.showAddOrderModal();
        
        setTimeout(() => {
            const startDateInput = document.getElementById('startDate');
            const endDateInput = document.getElementById('endDate');
            
            if (startDateInput) {
                startDateInput.value = formattedDate;
                console.log('Start date set to:', formattedDate);
            }
            
            if (endDateInput) {
                endDateInput.value = formattedDate;
                console.log('End date set to:', formattedDate);
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
    const targetDate = new Date(year, month, day);
    targetDate.setHours(0, 0, 0, 0);
    
    recurringCachedOrders.forEach(order => {
        if (order.startDate && order.recurringFrequency) {
            const startDate = new Date(order.startDate);
            startDate.setHours(0, 0, 0, 0);
            const endDate = order.recurringEndDate ? new Date(order.recurringEndDate) : null;
            if (endDate) endDate.setHours(23, 59, 59, 999);
            
            if (targetDate < startDate) return;
            if (endDate && targetDate > endDate) return;
            
            if (isRecurringMatch(startDate, targetDate, order.recurringFrequency, order.recurringCustomDays)) {
                events.push({
                    type: 'recurring-order',
                    title: order.orderId || order.service || 'Recurring Order',
                    id: order._id,
                    frequency: order.recurringFrequency,
                    order: order,
                    occurrenceDate: targetDate
                });
            }
        }
    });
    
    return events;
}

function isRecurringMatch(startDate, targetDate, frequency, customDays) {
    const start = new Date(startDate);
    const target = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    
    if (start.getTime() === target.getTime()) return true;
    if (target < start) return false;
    
    const daysDiff = Math.floor((target - start) / (1000 * 60 * 60 * 24));
    
    switch (frequency) {
        case 'custom':
            if (!customDays || customDays < 1) return false;
            return daysDiff % customDays === 0;
            
        case 'weekly':
            return daysDiff % 7 === 0 && start.getDay() === target.getDay();
            
        case 'bi-weekly':
            return daysDiff % 14 === 0 && start.getDay() === target.getDay();
            
        case 'monthly':
            const monthsDiff = (target.getFullYear() - start.getFullYear()) * 12 + (target.getMonth() - start.getMonth());
            if (monthsDiff < 0) return false;
            
            const startDay = start.getDate();
            const targetDay = target.getDate();
            
            const lastDayOfTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
            
            if (startDay > lastDayOfTargetMonth) {
                return targetDay === lastDayOfTargetMonth;
            }
            
            return targetDay === startDay;
            
        case 'yearly':
            const yearsDiff = target.getFullYear() - start.getFullYear();
            if (yearsDiff < 0) return false;
            
            return start.getMonth() === target.getMonth() && start.getDate() === target.getDate();
            
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
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
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
                <label>Start Date</label>
                <div class="value">${new Date(data.startDate).toLocaleDateString('en-US', { timeZone: getCalendarTimezone() })}</div>
            </div>
            ${data.recurringEndDate ? `
            <div class="detail-item">
                <label>End Date</label>
                <div class="value">${new Date(data.recurringEndDate).toLocaleDateString('en-US', { timeZone: getCalendarTimezone() })}</div>
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
