let currentDate = new Date();
let cachedOrders = [];
let cachedProjects = [];

function getEventsForDate(year, month, day) {
    const events = [];
    
    cachedOrders.forEach(order => {
        if (order.startDate) {
            const oDate = new Date(order.startDate);
            if (oDate.getFullYear() === year && oDate.getMonth() === month && oDate.getDate() === day) {
                events.push({
                    type: 'order',
                    title: order.service || order.customer?.name || 'Order',
                    id: order._id
                });
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
                eventDiv.textContent = event.title;
                eventDiv.title = event.title;
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
