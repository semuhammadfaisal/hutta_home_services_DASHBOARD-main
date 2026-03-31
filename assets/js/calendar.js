let currentDate = new Date();
let cachedOrders = [];
let cachedProjects = [];

function getEventsForDate(year, month, day) {
    const events = [];
    
    cachedOrders.forEach(order => {
        const isRecurring = order.orderType === 'recurring';
        if (isRecurring) return;

        if (order.startDate) {
            const oDate = new Date(order.startDate);
            if (oDate.getFullYear() === year && oDate.getMonth() === month && oDate.getDate() === day) {
                events.push({
                    type: 'order',
                    title: order.orderId || order.service || 'Order',
                    id: order._id,
                    isEndDate: false
                });
            }
        }

        if (order.endDate) {
            const eDate = new Date(order.endDate);
            if (eDate.getFullYear() === year && eDate.getMonth() === month && eDate.getDate() === day) {
                // Avoid duplicate if start === end
                const startDate = order.startDate ? new Date(order.startDate) : null;
                const sameAsStart = startDate && startDate.getFullYear() === year && startDate.getMonth() === month && startDate.getDate() === day;
                if (!sameAsStart) {
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
    
    cachedProjects.forEach(project => {
        if (project.startDate) {
            const pDate = new Date(project.startDate);
            if (pDate.getFullYear() === year && pDate.getMonth() === month && pDate.getDate() === day) {
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
    try {
        [cachedOrders, cachedProjects] = await Promise.all([
            window.APIService.getOrders(),
            window.APIService.getProjects()
        ]);
    } catch (error) {
        console.error('Failed to load calendar data:', error);
        cachedOrders = [];
        cachedProjects = [];
    }
}

window.refreshCalendar = renderCalendar;

async function renderCalendar() {
    await loadCalendarData();
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
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
    
    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day other-month';
        dayDiv.innerHTML = `<div class="calendar-day-number">${day}</div>`;
        calendarDays.appendChild(dayDiv);
    }
    
    // Current month days
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        
        if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
            dayDiv.classList.add('today');
        }
        
        // Make day clickable to add order
        dayDiv.style.cursor = 'pointer';
        dayDiv.onclick = (e) => {
            // Only trigger if clicking on the day itself, not on events
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
    
    // Next month days
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
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
}

function nextMonth() {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
}

function addEvent() {
    alert('Add Event functionality coming soon!');
}

document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('calendarDays')) {
        renderCalendar();
    }
});

document.addEventListener('click', function(e) {
    if (e.target.closest('a[data-section="calendar"]')) {
        setTimeout(renderCalendar, 100);
    }
});

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
                    <div class="value">${new Date(data.startDate).toLocaleDateString()}</div>
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
                    <div class="value">${new Date(data.startDate).toLocaleDateString()}</div>
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
    document.getElementById('calendarDetailPanel').style.display = 'none';
}

// Function to open order modal with pre-filled date
function openOrderModalWithDate(date) {
    // Format date as YYYY-MM-DD for input field
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;
    
    console.log('Opening order modal with date:', formattedDate);
    
    // Call the global showAddOrderModal function if it exists
    if (typeof window.showAddOrderModal === 'function') {
        window.showAddOrderModal();
        
        // Wait a bit for modal to open, then set the date
        setTimeout(() => {
            const startDateInput = document.getElementById('startDate');
            const endDateInput = document.getElementById('endDate');
            
            if (startDateInput) {
                startDateInput.value = formattedDate;
                console.log('Start date set to:', formattedDate);
            }
            
            // Set end date to same day by default
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

// Make function globally accessible
window.openOrderModalWithDate = openOrderModalWithDate;


// Recurring Calendar specific functions
let recurringCachedOrders = [];
let recurringCurrentMonth = new Date().getMonth();
let recurringCurrentYear = new Date().getFullYear();

async function loadRecurringCalendarData() {
    try {
        const allOrders = await window.APIService.getOrders();
        // Filter only recurring orders (default to 'one-time' for old orders without orderType)
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
            
            // Check if target date is within the recurring range
            if (targetDate < startDate) return;
            if (endDate && targetDate > endDate) return;
            
            // Check if this date matches the recurrence pattern
            if (isRecurringMatch(startDate, targetDate, order.recurringFrequency)) {
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

function isRecurringMatch(startDate, targetDate, frequency) {
    const start = new Date(startDate);
    const target = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    
    if (start.getTime() === target.getTime()) return true;
    if (target < start) return false;
    
    const daysDiff = Math.floor((target - start) / (1000 * 60 * 60 * 24));
    
    switch (frequency) {
        case 'weekly':
            // Same day of week, every 7 days
            return daysDiff % 7 === 0 && start.getDay() === target.getDay();
            
        case 'bi-weekly':
            // Same day of week, every 14 days
            return daysDiff % 14 === 0 && start.getDay() === target.getDay();
            
        case 'monthly':
            // Same day of month
            const monthsDiff = (target.getFullYear() - start.getFullYear()) * 12 + (target.getMonth() - start.getMonth());
            if (monthsDiff < 0) return false;
            
            // Check if same day of month
            const startDay = start.getDate();
            const targetDay = target.getDate();
            
            // Handle edge case: if start date is 29-31 and target month doesn't have that day
            const lastDayOfTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
            
            if (startDay > lastDayOfTargetMonth) {
                // If start day doesn't exist in target month, match on last day of month
                return targetDay === lastDayOfTargetMonth;
            }
            
            return targetDay === startDay;
            
        case 'yearly':
            // Same month and day every year
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
    
    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day other-month';
        dayDiv.innerHTML = `<div class="calendar-day-number">${day}</div>`;
        calendarDays.appendChild(dayDiv);
    }
    
    // Current month days
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        
        if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
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
    
    // Next month days
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
            'yearly': 'Yearly'
        };
        
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
            <div class="detail-item">
                <label>Frequency</label>
                <div class="value">${frequencyLabels[data.recurringFrequency] || data.recurringFrequency}</div>
            </div>
            <div class="detail-item">
                <label>Amount</label>
                <div class="value">$${data.amount?.toLocaleString() || '0'}</div>
            </div>
            <div class="detail-item">
                <label>Start Date</label>
                <div class="value">${new Date(data.startDate).toLocaleDateString()}</div>
            </div>
            ${data.recurringEndDate ? `
            <div class="detail-item">
                <label>End Date</label>
                <div class="value">${new Date(data.recurringEndDate).toLocaleDateString()}</div>
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

// Update the global functions
window.renderRecurringCalendar = renderRecurringCalendar;
window.showRecurringEventDetail = showRecurringEventDetail;
