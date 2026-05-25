// Top Customers Report Functionality
let topCustomersData = [];
let showAllTopCustomers = false;

async function loadTopCustomers(startDate = null, endDate = null) {
    try {
        // Use the global APIService instance
        const customers = await window.APIService.getCustomers();
        const orders = await window.APIService.getOrders();
        
        // Filter orders by date if provided
        let filteredOrders = orders;
        if (startDate || endDate) {
            filteredOrders = orders.filter(order => {
                if (window.TimezoneConfig) {
                    const dateValue = order.startDate || order.createdAt;
                    if (startDate && endDate) {
                        return window.TimezoneConfig.isDateInRangeMDT(dateValue, startDate, endDate);
                    }
                    const orderTime = new Date(dateValue).getTime();
                    const startTime = startDate ? window.TimezoneConfig.dateInputToMDT(startDate).getTime() : null;
                    const endTime = endDate ? window.TimezoneConfig.endOfDayMDT(endDate).getTime() : null;
                    return (!startTime || orderTime >= startTime) && (!endTime || orderTime <= endTime);
                }
                const orderDate = new Date(order.startDate || order.createdAt);
                return (!startDate || orderDate >= new Date(startDate)) &&
                    (!endDate || orderDate <= new Date(`${endDate}T23:59:59.999`));
            });
        }
        
        // Calculate customer statistics
        const customerStats = customers.map(customer => {
            const customerOrders = filteredOrders.filter(order => {
                const orderCustomer = order.customer || {};
                const orderCustomerId = order.customerId || orderCustomer._id || order.customer;
                const orderCustomerEmail = orderCustomer.email;
                const orderCustomerName = orderCustomer.name || (typeof order.customer === 'string' ? order.customer : '');

                return String(orderCustomerId || '') === String(customer._id || '') ||
                    (!!orderCustomerEmail && !!customer.email && String(orderCustomerEmail).toLowerCase() === String(customer.email).toLowerCase()) ||
                    (!!orderCustomerName && !!customer.name && String(orderCustomerName).toLowerCase() === String(customer.name).toLowerCase());
            });
            const totalRevenue = customerOrders.reduce((sum, order) => sum + (parseFloat(order.amount) || 0), 0);
            const totalOrders = customerOrders.length;
            
            return {
                ...customer,
                totalRevenue,
                totalOrders
            };
        });
        
        // Sort by revenue and get top 10
        const topCustomers = customerStats
            .filter(c => c.totalRevenue > 0)
            .sort((a, b) => b.totalRevenue - a.totalRevenue)
            .slice(0, 10);
        
        topCustomersData = topCustomers;
        showAllTopCustomers = false;
        renderTopCustomers();
    } catch (error) {
        console.error('Error loading top customers:', error);
        if (window.showToast) {
            showToast('Failed to load top customers', 'error');
        }
    }
}

function renderTopCustomers(customers = topCustomersData) {
    const grid = document.getElementById('topCustomersGrid');
    
    if (!customers || customers.length === 0) {
        grid.innerHTML = `
            <div class="top-customers-empty">
                <i class="fas fa-users"></i>
                <h3>No Customer Data</h3>
                <p>No customers with orders found for the selected period</p>
            </div>
        `;
        return;
    }
    
    const totalRevenue = customers.reduce((sum, customer) => sum + customer.totalRevenue, 0);
    const totalOrders = customers.reduce((sum, customer) => sum + customer.totalOrders, 0);
    const topCustomer = customers[0];
    const visibleCustomers = showAllTopCustomers ? customers : customers.slice(0, 3);
    const hasMoreCustomers = customers.length > 3;

    grid.innerHTML = `
        <div class="top-customers-summary">
            <div class="top-customers-summary-item">
                <span class="summary-label">Ranked Customers</span>
                <strong>${showAllTopCustomers ? customers.length : Math.min(customers.length, 3)}</strong>
            </div>
            <div class="top-customers-summary-item">
                <span class="summary-label">Top Revenue</span>
                <strong>$${(topCustomer?.totalRevenue || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
            </div>
            <div class="top-customers-summary-item">
                <span class="summary-label">Ranked Revenue</span>
                <strong>$${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
            </div>
            <div class="top-customers-summary-item">
                <span class="summary-label">Ranked Orders</span>
                <strong>${totalOrders}</strong>
            </div>
        </div>
        <div class="top-customers-list">
            ${visibleCustomers.map((customer, index) => {
        const rank = index + 1;
        const rankClass = rank <= 3 ? `rank-${rank}` : '';
        return `
            <div class="top-customer-card">
                <div class="top-customer-rank ${rankClass}">${rank}</div>
                <div class="top-customer-main">
                    <div class="top-customer-info">
                        <div class="top-customer-name">${customer.name || 'N/A'}</div>
                        <div class="top-customer-email">
                            <i class="fas fa-envelope"></i>
                            ${customer.email || 'No email'}
                        </div>
                    </div>
                </div>
                <div class="top-customer-stats">
                    <div class="top-customer-stat">
                        <span class="top-customer-stat-label">Total Revenue</span>
                        <span class="top-customer-stat-value revenue">$${customer.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div class="top-customer-stat">
                        <span class="top-customer-stat-label">Total Orders</span>
                        <span class="top-customer-stat-value orders">${customer.totalOrders}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('')}
        </div>
        ${hasMoreCustomers ? `
            <div class="top-customers-actions">
                <button type="button" class="top-customers-toggle" onclick="toggleTopCustomersList()">
                    ${showAllTopCustomers ? 'Show Top 3' : `View All ${customers.length}`}
                </button>
            </div>
        ` : ''}
    `;
}

function toggleTopCustomersList() {
    showAllTopCustomers = !showAllTopCustomers;
    renderTopCustomers();
}

function filterTopCustomers() {
    const startDate = document.getElementById('topCustomersStartDate').value;
    const endDate = document.getElementById('topCustomersEndDate').value;
    
    if (!startDate && !endDate) {
        if (window.showToast) {
            showToast('Please select a start or end date', 'warning');
        }
        return;
    }
    
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        if (window.showToast) {
            showToast('Start date must be before end date', 'error');
        }
        return;
    }
    
    loadTopCustomers(startDate, endDate);
}

function resetTopCustomersFilter() {
    document.getElementById('topCustomersStartDate').value = '';
    document.getElementById('topCustomersEndDate').value = '';
    loadTopCustomers();
}

window.filterTopCustomers = filterTopCustomers;
window.resetTopCustomersFilter = resetTopCustomersFilter;
window.loadTopCustomers = loadTopCustomers;
window.toggleTopCustomersList = toggleTopCustomersList;

// Load top customers when dashboard overview is shown
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTopCustomers);
} else {
    // DOM already loaded
    initTopCustomers();
}

function initTopCustomers() {
    // Wait a bit for APIService to be ready
    setTimeout(() => {
        // Load initially
        loadTopCustomers();
        
        // Reload when dashboard overview becomes active
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.target.id === 'dashboard' && mutation.target.classList.contains('active')) {
                    loadTopCustomers();
                }
            });
        });
        
        const dashboardSection = document.getElementById('dashboard');
        if (dashboardSection) {
            observer.observe(dashboardSection, { attributes: true, attributeFilter: ['class'] });
        }
    }, 1000);
}
