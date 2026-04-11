// Top Customers Report Functionality

async function loadTopCustomers(startDate = null, endDate = null) {
    try {
        // Use the global APIService instance
        const customers = await window.APIService.getCustomers();
        const orders = await window.APIService.getOrders();
        
        // Filter orders by date if provided
        let filteredOrders = orders;
        if (startDate && endDate) {
            filteredOrders = orders.filter(order => {
                const orderDate = new Date(order.startDate);
                return orderDate >= new Date(startDate) && orderDate <= new Date(endDate);
            });
        }
        
        // Calculate customer statistics
        const customerStats = customers.map(customer => {
            const customerOrders = filteredOrders.filter(order => order.customerId === customer._id);
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
        
        renderTopCustomers(topCustomers);
    } catch (error) {
        console.error('Error loading top customers:', error);
        if (window.showToast) {
            showToast('Failed to load top customers', 'error');
        }
    }
}

function renderTopCustomers(customers) {
    const grid = document.getElementById('topCustomersGrid');
    
    if (!customers || customers.length === 0) {
        grid.innerHTML = `
            <div class="top-customers-empty" style="grid-column: 1 / -1;">
                <i class="fas fa-users"></i>
                <h3>No Customer Data</h3>
                <p>No customers with orders found for the selected period</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = customers.map((customer, index) => {
        const rank = index + 1;
        const rankClass = rank <= 3 ? `rank-${rank}` : '';
        
        return `
            <div class="top-customer-card">
                <div class="top-customer-rank ${rankClass}">${rank}</div>
                <div class="top-customer-info">
                    <div class="top-customer-name">${customer.name || 'N/A'}</div>
                    <div class="top-customer-email">
                        <i class="fas fa-envelope"></i>
                        ${customer.email || 'No email'}
                    </div>
                </div>
                <div class="top-customer-stats">
                    <div class="top-customer-stat">
                        <span class="top-customer-stat-label">Total Revenue</span>
                        <span class="top-customer-stat-value revenue">$${customer.totalRevenue.toFixed(2)}</span>
                    </div>
                    <div class="top-customer-stat">
                        <span class="top-customer-stat-label">Total Orders</span>
                        <span class="top-customer-stat-value orders">${customer.totalOrders}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function filterTopCustomers() {
    const startDate = document.getElementById('topCustomersStartDate').value;
    const endDate = document.getElementById('topCustomersEndDate').value;
    
    if (!startDate || !endDate) {
        if (window.showToast) {
            showToast('Please select both start and end dates', 'warning');
        }
        return;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
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

// Load top customers when customers section is shown
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
        
        // Reload when customers section becomes active
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.target.id === 'customers' && mutation.target.classList.contains('active')) {
                    loadTopCustomers();
                }
            });
        });
        
        const customersSection = document.getElementById('customers');
        if (customersSection) {
            observer.observe(customersSection, { attributes: true, attributeFilter: ['class'] });
        }
    }, 1000);
}
