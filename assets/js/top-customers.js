// Top Customers Report Functionality
let topCustomersData = [];
let showAllTopCustomers = false;

async function loadTopCustomers(startDate = null, endDate = null) {
    try {
        const stats = await window.APIService.getDashboardStats({
            topStartDate: startDate,
            topEndDate: endDate
        });

        setTopCustomersData(stats.topCustomers || []);
    } catch (error) {
        console.error('Error loading top customers:', error);
        if (window.showToast) {
            showToast('Failed to load top customers', 'error');
        }
    }
}

function setTopCustomersData(customers = []) {
    topCustomersData = Array.isArray(customers) ? customers : [];
    showAllTopCustomers = false;
    renderTopCustomers();
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
    const rankedCount = showAllTopCustomers ? customers.length : Math.min(customers.length, 3);

    grid.innerHTML = `
        <div class="top-customers-summary">
            <div class="top-customers-summary-item customers">
                <span class="summary-icon" aria-hidden="true"><i class="fas fa-users"></i></span>
                <span class="summary-label">Ranked customers</span>
                <strong>${rankedCount}</strong>
                <small>Total in this period</small>
            </div>
            <div class="top-customers-summary-item revenue">
                <span class="summary-icon" aria-hidden="true"><i class="fas fa-dollar-sign"></i></span>
                <span class="summary-label">Top revenue</span>
                <strong>$${(topCustomer?.totalRevenue || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                <small>Highest customer value</small>
            </div>
            <div class="top-customers-summary-item ranked-revenue">
                <span class="summary-icon" aria-hidden="true"><i class="fas fa-chart-line"></i></span>
                <span class="summary-label">Ranked revenue</span>
                <strong>$${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                <small>All ranked customers</small>
            </div>
            <div class="top-customers-summary-item orders">
                <span class="summary-icon" aria-hidden="true"><i class="fas fa-shopping-bag"></i></span>
                <span class="summary-label">Ranked orders</span>
                <strong>${totalOrders}</strong>
                <small>Total order count</small>
            </div>
        </div>
        <div class="top-customers-list">
            ${visibleCustomers.map((customer, index) => {
        const rank = index + 1;
        const rankClass = rank <= 3 ? `rank-${rank}` : '';
        const customerType = rank === 1 ? 'Top customer' : rank === 2 ? 'Premium customer' : 'Repeat customer';
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
                        <span class="top-customer-badge">${customerType}</span>
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
                        <span class="top-customer-stat-icon" aria-hidden="true"><i class="fas fa-shopping-bag"></i></span>
                    </div>
                </div>
                <span class="top-customer-chevron" aria-hidden="true"><i class="fas fa-chevron-right"></i></span>
            </div>
        `;
    }).join('')}
        </div>
        ${hasMoreCustomers ? `
            <div class="top-customers-actions">
                <button type="button" class="top-customers-toggle" onclick="toggleTopCustomersList()">
                    ${showAllTopCustomers ? 'Show top 3' : `View All ${customers.length} Customers`}
                    <i class="fas fa-arrow-right" aria-hidden="true"></i>
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
window.setTopCustomersData = setTopCustomersData;

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
