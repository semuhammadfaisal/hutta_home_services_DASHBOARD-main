// API Configuration
const API_BASE_URL = '/api';

// Data storage
let stages = [];
let records = [];
let filteredRecords = [];
let draggedStage = null;
let searchQuery = '';
let newOrders = []; // Store new orders for suggestions
let employeeCache = new Map(); // Cache employee data
let orderCache = new Map(); // Cache order data

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('Pipeline MongoDB script loaded');
    // Only load data if we're on the pipeline section or if it's active
    const pipelineSection = document.getElementById('pipeline');
    if (pipelineSection && pipelineSection.classList.contains('active')) {
        console.log('Pipeline section is active, loading data...');
        loadDataFromDB();
    }
});

// Load all data from MongoDB
async function loadDataFromDB() {
    try {
        console.log('Loading pipeline data from database...');
        
        // Show loading overlay
        showLoading('Loading pipeline data...');
        
        // Show loading state in pipeline container
        const stagesContainer = document.getElementById('stagesContainer');
        if (stagesContainer) {
            stagesContainer.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px;">
                    <div class="loading-spinner" style="margin: 0 auto 20px;"></div>
                    <div style="color: #6b7280; font-size: 14px; font-weight: 500;">Loading pipeline stages...</div>
                    <div style="color: #9ca3af; font-size: 12px; margin-top: 8px;">Please wait while we fetch your data</div>
                </div>
            `;
        }
        
        // Fetch all data in parallel
        updateLoadingMessage('Fetching stages and records...');
        await Promise.all([fetchStages(), fetchRecords(), fetchNewOrders()]);
        
        // Fetch all orders and employees in batch (much faster than per-record)
        updateLoadingMessage('Loading orders and employees...');
        await Promise.all([fetchAllOrders(), fetchAllEmployees()]);
        
        console.log('Pipeline data loaded - Stages:', stages.length, 'Records:', records.length, 'New Orders:', newOrders.length);
        console.log('Cached data - Orders:', orderCache.size, 'Employees:', employeeCache.size);
        
        updateLoadingMessage('Rendering pipeline...');
        loadStages();
        loadNewOrdersSuggestions();
        
        // Hide loading
        hideLoading();
    } catch (error) {
        console.error('Error loading data:', error);
        hideLoading();
        
        // Show error state
        const stagesContainer = document.getElementById('stagesContainer');
        if (stagesContainer) {
            stagesContainer.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444; margin-bottom: 16px;"></i>
                    <div style="color: #1f2937; font-size: 16px; font-weight: 600; margin-bottom: 8px;">Failed to Load Pipeline</div>
                    <div style="color: #6b7280; font-size: 14px; margin-bottom: 20px;">${error.message}</div>
                    <button onclick="loadDataFromDB()" class="btn-primary" style="padding: 10px 20px;">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                </div>
            `;
        }
    }
}

// Make function globally accessible
window.loadDataFromDB = loadDataFromDB;

// Fetch stages from MongoDB
async function fetchStages() {
    const response = await fetch(`${API_BASE_URL}/stages`);
    stages = await response.json();
}

// Fetch records from MongoDB
async function fetchRecords() {
    const response = await fetch(`${API_BASE_URL}/pipeline-records`);
    records = await response.json();
    filteredRecords = [...records];
}

// Fetch new orders (orders without pipeline records)
async function fetchNewOrders() {
    try {
        const session = localStorage.getItem('huttaSession') || sessionStorage.getItem('huttaSession');
        if (!session) {
            newOrders = [];
            return;
        }
        
        const sessionData = JSON.parse(session);
        const token = sessionData.token;
        
        const response = await fetch(`${API_BASE_URL}/orders`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            newOrders = [];
            return;
        }
        
        const allOrders = await response.json();
        
        // Filter orders that don't have pipeline records yet
        // Get all order IDs that are already in pipeline
        const ordersInPipeline = records.map(r => r.orderId).filter(Boolean);
        
        // Filter new orders (created in last 30 days and not in pipeline)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        newOrders = allOrders.filter(order => {
            const isNotInPipeline = !ordersInPipeline.includes(order._id);
            const isRecent = new Date(order.createdAt) > thirtyDaysAgo;
            return isNotInPipeline && isRecent;
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Most recent first
        
        console.log('New orders found:', newOrders.length);
    } catch (error) {
        console.error('Error fetching new orders:', error);
        newOrders = [];
    }
}

// Fetch all orders in one batch call
async function fetchAllOrders() {
    try {
        const session = localStorage.getItem('huttaSession') || sessionStorage.getItem('huttaSession');
        if (!session) return;
        
        const sessionData = JSON.parse(session);
        const token = sessionData.token;
        
        const response = await fetch(`${API_BASE_URL}/orders`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) return;
        
        const orders = await response.json();
        
        // Cache all orders by ID
        orderCache.clear();
        orders.forEach(order => {
            orderCache.set(order._id, order);
        });
        
        console.log('Orders cached:', orderCache.size);
    } catch (error) {
        console.error('Error fetching orders:', error);
    }
}

// Fetch all employees in one batch call
async function fetchAllEmployees() {
    try {
        const session = localStorage.getItem('huttaSession') || sessionStorage.getItem('huttaSession');
        if (!session) return;
        
        const sessionData = JSON.parse(session);
        const token = sessionData.token;
        
        const response = await fetch(`${API_BASE_URL}/employees`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) return;
        
        const employees = await response.json();
        
        // Cache all employees by ID
        employeeCache.clear();
        employees.forEach(employee => {
            employeeCache.set(employee._id, employee);
        });
        
        console.log('Employees cached:', employeeCache.size);
    } catch (error) {
        console.error('Error fetching employees:', error);
    }
}

// Load and render stages
async function loadStages() {
    const container = document.getElementById('stagesContainer');
    if (!container) return;
    
    // Remove old event listeners by cloning
    const newContainer = container.cloneNode(false);
    container.parentNode.replaceChild(newContainer, container);
    
    // Add new orders suggestion column first
    const suggestionsColumn = createNewOrdersSuggestionColumn();
    newContainer.appendChild(suggestionsColumn);
    
    // Render stages with async record rendering
    for (const stage of stages) {
        const stageColumn = await createStageColumn(stage);
        newContainer.appendChild(stageColumn);
    }
    
    // Add event delegation for all buttons
    newContainer.addEventListener('click', (e) => {
        console.log('Click detected:', e.target);
        
        // Edit stage button
        const editStageBtn = e.target.closest('.edit-stage-btn');
        if (editStageBtn) {
            e.stopPropagation();
            const stageId = editStageBtn.dataset.stageId;
            editStage(stageId);
            return;
        }
        
        // Delete stage button
        const deleteStageBtn = e.target.closest('.delete-stage-btn');
        if (deleteStageBtn) {
            e.stopPropagation();
            const stageId = deleteStageBtn.dataset.stageId;
            deleteStage(stageId);
            return;
        }
        
        // Edit record button
        const editBtn = e.target.closest('.record-edit-btn');
        if (editBtn) {
            e.stopPropagation();
            editRecord(editBtn.dataset.recordId);
            return;
        }
        
        // View record button
        const viewBtn = e.target.closest('.record-view-btn');
        if (viewBtn) {
            e.stopPropagation();
            const recordId = viewBtn.dataset.recordId;
            const record = records.find(r => r._id === recordId);
            
            // If record has linked order, open order detail page
            if (record && record.orderId) {
                if (typeof window.showOrderDetail === 'function') {
                    window.showOrderDetail(record.orderId, true); // true = from pipeline
                } else {
                    console.error('showOrderDetail function not found');
                    viewRecord(recordId);
                }
            } else {
                // No linked order, show pipeline view modal
                viewRecord(recordId);
            }
            return;
        }
        
        // Delete record button
        const deleteBtn = e.target.closest('.record-delete-btn');
        if (deleteBtn) {
            e.stopPropagation();
            deleteRecord(deleteBtn.dataset.recordId);
            return;
        }
        
        // Expand stage button
        const expandBtn = e.target.closest('.expand-stage-btn');
        if (expandBtn) {
            e.stopPropagation();
            expandStage(expandBtn.dataset.stageId);
            return;
        }
    });
    
    // Add drag event delegation
    newContainer.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('record-card') || e.target.classList.contains('new-order-card')) {
            drag(e);
        }
    });
    
    updateStatistics();
}

// Create stage column
async function createStageColumn(stage) {
    const count = records.filter(r => r.stageId === stage._id).length;
    
    const column = document.createElement('div');
    column.className = 'stage-column';
    column.draggable = true;
    column.dataset.stageId = stage._id;
    
    const stageHeader = document.createElement('div');
    stageHeader.className = 'stage-header';
    stageHeader.draggable = false;
    stageHeader.innerHTML = `
        <div class="stage-title">
            <h3>${stage.name}</h3>
            <div class="stage-actions">
                <button class="icon-btn expand-stage-btn" data-stage-id="${stage._id}" title="Expand Stage"><i class="fas fa-expand-alt"></i></button>
                <button class="icon-btn edit-stage-btn" data-stage-id="${stage._id}" title="Edit Stage"><i class="fas fa-edit"></i></button>
                <button class="icon-btn delete delete-stage-btn" data-stage-id="${stage._id}" title="Delete Stage"><i class="fas fa-trash"></i></button>
            </div>
        </div>
        <div class="stage-count">
            <span class="count-badge">${count}</span>
        </div>
    `;
    
    const stageBody = document.createElement('div');
    stageBody.className = 'stage-body';
    stageBody.dataset.stageId = stage._id;
    stageBody.innerHTML = await renderRecords(stage._id);
    stageBody.addEventListener('drop', drop);
    stageBody.addEventListener('dragover', allowDrop);
    stageBody.addEventListener('dragleave', dragLeave);
    
    column.appendChild(stageHeader);
    column.appendChild(stageBody);
    
    column.addEventListener('dragstart', stageColumnDragStart);
    column.addEventListener('dragover', stageColumnDragOver);
    column.addEventListener('drop', stageColumnDrop);
    column.addEventListener('dragend', stageColumnDragEnd);
    
    return column;
}

// Render records
async function renderRecords(stageId) {
    const stageRecords = filteredRecords.filter(r => r.stageId === stageId);
    if (stageRecords.length === 0) {
        const allRecordsInStage = records.filter(r => r.stageId === stageId).length;
        if (searchQuery && allRecordsInStage > 0) {
            return '<div style="text-align:center; color:#999; padding:20px; font-size:13px;">No matching records</div>';
        }
        return '<div style="text-align:center; color:#999; padding:20px; font-size:13px;">No records yet</div>';
    }
    
    // Get employee names from cache (instant lookup, no API calls)
    return stageRecords.map(record => {
        let employeeName = null;
        
        // If record has orderId, get employee from cached order data
        if (record.orderId && orderCache.has(record.orderId)) {
            const order = orderCache.get(record.orderId);
            
            if (order.employee) {
                if (typeof order.employee === 'object' && order.employee.name) {
                    employeeName = order.employee.name;
                } else if (typeof order.employee === 'string' && employeeCache.has(order.employee)) {
                    const employee = employeeCache.get(order.employee);
                    employeeName = employee.name;
                }
            }
        }
        const budget = record.budget ? `$${parseFloat(record.budget).toLocaleString()}` : '';
        const displayTitle = record.orderIdDisplay || record.customerName;
        return `
        <div class="record-card" draggable="true" data-record-id="${record._id}">
            <div class="record-header">
                <div class="record-title">${displayTitle}</div>
                <div class="record-actions">
                    <button class="icon-btn record-view-btn" data-record-id="${record._id}" title="View Details"><i class="fas fa-eye"></i></button>
                    <button class="icon-btn record-edit-btn" data-record-id="${record._id}" title="Edit"><i class="fas fa-edit"></i></button>
                    <button class="icon-btn delete record-delete-btn" data-record-id="${record._id}" title="Delete"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            ${record.customerName ? `<div class="record-info"><i class="fas fa-user"></i> ${record.customerName}</div>` : ''}
            ${record.email ? `<div class="record-info"><i class="fas fa-envelope"></i> ${record.email}</div>` : ''}
            ${record.phone ? `<div class="record-info"><i class="fas fa-phone"></i> ${record.phone}</div>` : ''}
            ${budget ? `<div class="record-info"><i class="fas fa-dollar-sign"></i> ${budget}</div>` : ''}
            ${record.description ? `<div class="record-description">${record.description}</div>` : ''}
            <div class="record-footer">
                ${employeeName ? `<span style="font-weight: 600; color: #3b82f6; font-size: 11px; margin-right: 8px;"><i class="fas fa-user-tie"></i> ${employeeName}</span>` : ''}
                <span class="priority-badge priority-${record.priority}">${record.priority}</span>
                <span class="record-time">${formatTime(record.createdAt)}</span>
            </div>
        </div>
    `}).join('');
}

// Load and render stages

async function loadEmployeeForOrder(orderId) {
    console.log('loadEmployeeForOrder called with orderId:', orderId);
    try {
        const employeeEl = document.getElementById('viewEmployee');
        if (!employeeEl) {
            console.error('viewEmployee element not found in DOM');
            return;
        }
        
        // Try to get from cache first (instant)
        if (orderCache.has(orderId)) {
            const order = orderCache.get(orderId);
            console.log('Order found in cache:', order);
            
            if (order.employee) {
                if (typeof order.employee === 'object' && order.employee.name) {
                    console.log('Setting employee name (object):', order.employee.name);
                    employeeEl.textContent = order.employee.name;
                    return;
                } else if (typeof order.employee === 'string' && employeeCache.has(order.employee)) {
                    const employee = employeeCache.get(order.employee);
                    console.log('Setting employee name from cache:', employee.name);
                    employeeEl.textContent = employee.name;
                    return;
                }
            }
        }
        
        // Fallback: fetch from API if not in cache
        const session = localStorage.getItem('huttaSession') || sessionStorage.getItem('huttaSession');
        if (!session) {
            console.log('No session found');
            employeeEl.textContent = 'Not assigned';
            return;
        }
        
        const sessionData = JSON.parse(session);
        const token = sessionData.token;
        
        console.log('Fetching order details for:', orderId);
        const response = await fetch(`${API_BASE_URL}/orders/${orderId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            console.error('Failed to load order:', response.status, response.statusText);
            employeeEl.textContent = 'Not assigned';
            return;
        }
        
        const order = await response.json();
        console.log('Order loaded:', order);
        
        if (order.employee) {
            if (typeof order.employee === 'object' && order.employee.name) {
                console.log('Setting employee name (object):', order.employee.name);
                employeeEl.textContent = order.employee.name;
            } else if (typeof order.employee === 'string') {
                console.log('Employee is ID, fetching employee details:', order.employee);
                const empResponse = await fetch(`${API_BASE_URL}/employees/${order.employee}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (empResponse.ok) {
                    const employee = await empResponse.json();
                    console.log('Employee fetched:', employee);
                    employeeEl.textContent = employee.name;
                } else {
                    console.error('Failed to fetch employee:', empResponse.status);
                    employeeEl.textContent = 'Not assigned';
                }
            } else {
                console.log('Employee field has unexpected type');
                employeeEl.textContent = 'Not assigned';
            }
        } else {
            console.log('No employee assigned');
            employeeEl.textContent = 'Not assigned';
        }
    } catch (error) {
        console.error('Error loading employee:', error);
        const employeeEl = document.getElementById('viewEmployee');
        if (employeeEl) employeeEl.textContent = '-';
    }
}

// Record Modal Functions
let availableCustomers = [];
let selectedCustomerId = null;

async function loadAvailableCustomers() {
    try {
        const session = localStorage.getItem('huttaSession') || sessionStorage.getItem('huttaSession');
        if (!session) return;
        
        const sessionData = JSON.parse(session);
        const token = sessionData.token;
        
        const response = await fetch(`${API_BASE_URL}/customers`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load customers');
        
        availableCustomers = await response.json();
    } catch (error) {
        console.error('Error loading customers:', error);
    }
}

function searchCustomers(query) {
    const dropdown = document.getElementById('customerSuggestions');
    if (!dropdown) return;
    
    if (!query || query.length < 2) {
        dropdown.classList.remove('show');
        dropdown.innerHTML = '';
        selectedCustomerId = null;
        document.getElementById('recordWorkOrder').innerHTML = '<option value="">Select customer first</option>';
        return;
    }
    
    const filtered = availableCustomers.filter(c => 
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        (c.email && c.email.toLowerCase().includes(query.toLowerCase()))
    );
    
    if (filtered.length === 0) {
        dropdown.classList.remove('show');
        dropdown.innerHTML = '';
        return;
    }
    
    dropdown.innerHTML = filtered.map(customer => `
        <div class="suggestion-item" onclick="selectCustomer('${customer._id}', '${customer.name.replace(/'/g, "\\'")}')">            <div class="customer-name">${customer.name}</div>
            ${customer.email ? `<div class="customer-email">${customer.email}</div>` : ''}
        </div>
    `).join('');
    
    dropdown.classList.add('show');
}

async function selectCustomer(customerId, customerName) {
    selectedCustomerId = customerId;
    document.getElementById('recordCustomerName').value = customerName;
    document.getElementById('customerSuggestions').classList.remove('show');
    document.getElementById('customerSuggestions').innerHTML = '';
    
    // Load work orders for this customer
    await loadCustomerWorkOrders(customerId);
}

async function loadCustomerWorkOrders(customerId) {
    try {
        const session = localStorage.getItem('huttaSession') || sessionStorage.getItem('huttaSession');
        if (!session) return;
        
        const sessionData = JSON.parse(session);
        const token = sessionData.token;
        
        // Get customer details first
        const customerResponse = await fetch(`${API_BASE_URL}/customers/${customerId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!customerResponse.ok) throw new Error('Failed to load customer');
        const customer = await customerResponse.json();
        
        // Get all orders and filter by customer email
        const response = await fetch(`${API_BASE_URL}/orders`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load work orders');
        
        const allOrders = await response.json();
        const orders = allOrders.filter(order => 
            order.customerId === customerId || 
            order.customer?.email === customer.email
        );
        
        const workOrderSelect = document.getElementById('recordWorkOrder');
        
        if (orders.length === 0) {
            workOrderSelect.innerHTML = '<option value="">No work orders available</option>';
            return;
        }
        
        workOrderSelect.innerHTML = '<option value="">-- Select work order --</option>' +
            orders.map(order => {
                const woNumber = order.workOrderNumber || order.orderId || 'N/A';
                const service = order.service || 'Unknown Service';
                return `<option value="${order._id}">${woNumber} - ${service}</option>`;
            }).join('');
        
        // Add change event to populate form when work order is selected
        workOrderSelect.onchange = function() {
            const orderId = this.value;
            if (orderId) {
                const order = orders.find(o => o._id === orderId);
                if (order) {
                    populateFromWorkOrder(order);
                }
            }
        };
    } catch (error) {
        console.error('Error loading work orders:', error);
        document.getElementById('recordWorkOrder').innerHTML = '<option value="">Error loading orders</option>';
    }
}

function populateFromWorkOrder(order) {
    const fields = {
        recordEmail: order.customer?.email || '',
        recordPhone: order.customer?.phone || '',
        recordAddress: order.customer?.address || '',
        recordBudget: order.amount || '',
        recordStartDate: order.startDate ? order.startDate.split('T')[0] : '',
        recordDescription: order.description || '',
        recordNotes: order.notes || ''
    };
    
    Object.entries(fields).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
    });
    
    const priorityMap = { 'low': 'low', 'medium': 'medium', 'high': 'high' };
    const priorityEl = document.getElementById('recordPriority');
    if (priorityEl) priorityEl.value = priorityMap[order.priority] || 'medium';
}

function openRecordModal(stageId) {
    const modal = document.getElementById('recordModal');
    if (!modal) return;
    
    document.getElementById('recordModalTitle').innerHTML = '<i class="fas fa-folder-plus"></i> Add Record';
    document.getElementById('recordForm').reset();
    document.getElementById('recordId').value = '';
    document.getElementById('recordStageId').value = stageId;
    
    // Reset customer selection
    selectedCustomerId = null;
    document.getElementById('customerSuggestions').classList.remove('show');
    document.getElementById('customerSuggestions').innerHTML = '';
    document.getElementById('recordWorkOrder').innerHTML = '<option value="">Select customer first</option>';
    
    // Load customers
    if (availableCustomers.length === 0) {
        loadAvailableCustomers();
    }
    
    modal.classList.add('show');
}

function closeRecordModal() {
    const modal = document.getElementById('recordModal');
    if (modal) modal.classList.remove('show');
}

async function editRecord(recordId) {
    const record = records.find(r => r._id === recordId);
    if (!record) return;
    
    // If record has linked order, edit the order directly
    if (record.orderId) {
        if (typeof window.editOrder === 'function') {
            await window.editOrder(record.orderId);
            // Store pipeline record ID for later use
            window.currentPipelineRecordId = recordId;
        }
        return;
    }
    
    // Otherwise use order modal with pipeline data
    window.currentOrderId = null;
    window.currentPipelineRecordId = recordId;
    
    document.getElementById('orderModalTitle').textContent = 'Edit Pipeline Record';
    
    // Load vendors and employees
    if (typeof window.loadVendors === 'function') await window.loadVendors();
    if (typeof window.loadEmployees === 'function') await window.loadEmployees();
    if (typeof window.loadOrderCustomers === 'function') await window.loadOrderCustomers();
    
    // Populate order form with pipeline record data
    document.getElementById('customerSelect').value = 'new';
    document.getElementById('newCustomerFields').style.display = 'block';
    document.getElementById('customerName').value = record.customerName || '';
    document.getElementById('customerEmail').value = record.email || '';
    document.getElementById('customerPhone').value = record.phone || '';
    document.getElementById('customerAddress').value = record.address || '';
    document.getElementById('service').value = '';
    document.getElementById('amount').value = record.budget || '';
    document.getElementById('vendorCost').value = '';
    document.getElementById('processingFee').value = '';
    document.getElementById('profit').value = '';
    document.getElementById('startDate').value = record.startDate ? record.startDate.split('T')[0] : '';
    document.getElementById('endDate').value = '';
    document.getElementById('status').value = 'new';
    document.getElementById('priority').value = record.priority || 'medium';
    document.getElementById('description').value = record.description || '';
    document.getElementById('notes').value = record.notes || '';
    document.getElementById('orderType').value = 'one-time';
    
    if (typeof window.toggleRecurringFields === 'function') window.toggleRecurringFields();
    
    document.getElementById('orderModal').classList.add('show');
}

async function saveRecord(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    console.log('saveRecord called');
    
    const form = document.getElementById('recordForm');
    if (!form) {
        console.error('Form not found');
        return false;
    }
    
    if (!form.checkValidity()) {
        form.reportValidity();
        return false;
    }
    
    const id = document.getElementById('recordId')?.value || '';
    const stageId = document.getElementById('recordStageId')?.value || '';
    const customerName = document.getElementById('recordCustomerName')?.value || '';
    const email = document.getElementById('recordEmail')?.value || '';
    const phone = document.getElementById('recordPhone')?.value || '';
    const priority = document.getElementById('recordPriority')?.value || 'medium';
    const budget = document.getElementById('recordBudget')?.value || '';
    const startDate = document.getElementById('recordStartDate')?.value || '';
    const address = document.getElementById('recordAddress')?.value || '';
    const description = document.getElementById('recordDescription')?.value || '';
    const notes = document.getElementById('recordNotes')?.value || '';
    const orderIdValue = document.getElementById('recordWorkOrder')?.value || null;
    
    console.log('Form data:', { customerName, stageId, orderId: orderIdValue });
    
    try {
        let response;
        if (id) {
            const editingRecord = records.find(r => r._id === id);
            response = await fetch(`${API_BASE_URL}/pipeline-records/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customerName, email, phone, priority, budget, startDate, address, description, notes, orderId: editingRecord?.orderId })
            });
            
            // If this pipeline record has a linked order, update the order too
            if (editingRecord?.orderId) {
                try {
                    const session = localStorage.getItem('huttaSession') || sessionStorage.getItem('huttaSession');
                    if (session) {
                        const sessionData = JSON.parse(session);
                        const token = sessionData.token;
                        
                        // Get the current order data
                        const orderResponse = await fetch(`${API_BASE_URL}/orders/${editingRecord.orderId}`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        
                        if (orderResponse.ok) {
                            const currentOrder = await orderResponse.json();
                            
                            // Update order with new data from pipeline
                            const orderUpdateData = {
                                ...currentOrder,
                                customer: {
                                    ...currentOrder.customer,
                                    name: customerName,
                                    email: email || currentOrder.customer?.email,
                                    phone: phone || currentOrder.customer?.phone,
                                    address: address || currentOrder.customer?.address
                                },
                                amount: budget || currentOrder.amount,
                                startDate: startDate || currentOrder.startDate,
                                endDate: startDate || currentOrder.endDate,
                                description: description || currentOrder.description,
                                notes: notes || currentOrder.notes,
                                priority: priority || currentOrder.priority
                            };
                            
                            // Update the order
                            await fetch(`${API_BASE_URL}/orders/${editingRecord.orderId}`, {
                                method: 'PUT',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                },
                                body: JSON.stringify(orderUpdateData)
                            });
                            
                            console.log('Linked order updated successfully');
                            
                            // Clear order cache
                            if (orderCache.has(editingRecord.orderId)) {
                                orderCache.delete(editingRecord.orderId);
                            }
                        }
                    }
                } catch (orderUpdateError) {
                    console.warn('Failed to update linked order:', orderUpdateError);
                    // Don't fail the whole operation if order update fails
                }
            }
        } else {
            // Get order details if orderId is selected
            let orderIdDisplay = '';
            if (orderIdValue) {
                try {
                    const session = localStorage.getItem('huttaSession') || sessionStorage.getItem('huttaSession');
                    if (session) {
                        const sessionData = JSON.parse(session);
                        const token = sessionData.token;
                        const orderResponse = await fetch(`${API_BASE_URL}/orders/${orderIdValue}`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (orderResponse.ok) {
                            const order = await orderResponse.json();
                            orderIdDisplay = order.orderId || '';
                        }
                    }
                } catch (err) {
                    console.error('Error fetching order details:', err);
                }
            }
            
            response = await fetch(`${API_BASE_URL}/pipeline-records`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    stageId, 
                    orderId: orderIdValue, 
                    orderIdDisplay,
                    customerName, 
                    email, 
                    phone, 
                    priority, 
                    budget, 
                    startDate, 
                    address, 
                    description, 
                    notes 
                })
            });
        }
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to save record');
        }
        
        console.log('Record saved successfully');
        closeRecordModal();
        
        // Clear API cache and refresh all related views
        if (window.APIService && window.APIService.clearCache) window.APIService.clearCache();
        
        // Reload pipeline data
        await loadDataFromDB();
        
        // Refresh orders tab if it's loaded
        if (typeof refreshOrders === 'function') {
            console.log('Refreshing orders tab...');
            await refreshOrders();
        }
        
        // Refresh payments tab if it's loaded
        if (typeof refreshPayments === 'function') {
            console.log('Refreshing payments tab...');
            await refreshPayments();
        }
        
        // Refresh calendar if it's loaded
        if (window.refreshCalendar) {
            console.log('Refreshing calendar...');
            await window.refreshCalendar();
        }
        
        // Refresh dashboard KPIs
        if (window.dashboard && window.dashboard.renderDashboard) {
            console.log('Refreshing dashboard...');
            await window.dashboard.renderDashboard();
        }
        
        return false;
    } catch (error) {
        console.error('Error saving record:', error);
        alert('Error saving record: ' + error.message);
        return false;
    }
}

window.saveRecord = saveRecord;

async function deleteRecord(recordId) {
    const record = records.find(r => r._id === recordId);
    if (!record) return;
    
    if (!confirm(`Delete "${record.customerName}"?`)) return;
    
    try {
        await fetch(`${API_BASE_URL}/pipeline-records/${recordId}`, { method: 'DELETE' });
        await loadDataFromDB();
    } catch (error) {
        alert('Error deleting record: ' + error.message);
    }
}

// Drag and Drop
function drag(event) {
    if (event.target.classList.contains('new-order-card')) {
        console.log('Drag started for new order:', event.target.dataset.orderId);
        event.dataTransfer.setData('orderId', event.target.dataset.orderId);
        event.dataTransfer.setData('isNewOrder', 'true');
    } else {
        console.log('Drag started for record:', event.target.dataset.recordId);
        event.dataTransfer.setData('recordId', event.target.dataset.recordId);
        event.dataTransfer.setData('isNewOrder', 'false');
    }
    event.target.classList.add('dragging');
}

function allowDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.add('drag-over');
}

function dragLeave(event) {
    event.currentTarget.classList.remove('drag-over');
}

async function drop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    console.log('DROP FIRED - isNewOrder:', event.dataTransfer.getData('isNewOrder'), 'stageId:', event.currentTarget.dataset.stageId);
    
    const isNewOrder = event.dataTransfer.getData('isNewOrder') === 'true';
    const newStageId = event.currentTarget.dataset.stageId;
    
    if (isNewOrder) {
        // Handle new order drop
        const orderId = event.dataTransfer.getData('orderId');
        const order = newOrders.find(o => o._id === orderId);
        
        if (order) {
            console.log('Dropping new order into stage:', order.orderId, 'to stage:', newStageId);
            await createPipelineRecordFromOrder(order, newStageId);
        }
    } else {
        // Handle existing record drop
        const recordId = event.dataTransfer.getData('recordId');
        const record = records.find(r => r._id === recordId);
        
        if (record && record.stageId !== newStageId) {
        const oldStageId = record.stageId;
        const oldStageName = stages.find(s => s._id === oldStageId)?.name || 'Unknown';
        const newStageName = stages.find(s => s._id === newStageId)?.name || 'Unknown';
        
        console.log('=== PIPELINE DROP DEBUG ===');
        console.log('Record ID:', recordId);
        console.log('Old Stage:', oldStageName, '(' + oldStageId + ')');
        console.log('New Stage:', newStageName, '(' + newStageId + ')');
        
        try {
            // Update the pipeline record stage (this is the important one)
            console.log('Updating pipeline record stage...');
            const stageUpdateResponse = await fetch(`${API_BASE_URL}/pipeline-records/${recordId}/stage`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stageId: newStageId })
            });
            
            if (!stageUpdateResponse.ok) {
                const errorText = await stageUpdateResponse.text();
                console.error('Stage update failed:', stageUpdateResponse.status, errorText);
                throw new Error('Failed to update pipeline record stage: ' + errorText);
            }
            
            console.log('Pipeline record stage updated successfully');
            
            // Auto-update linked payment record when moving to Paid/Close
            if (/^(paid|close|closed|complete|completed|won|done)$/i.test(newStageName.trim()) && record.orderId) {
                try {
                    const session = localStorage.getItem('huttaSession') || sessionStorage.getItem('huttaSession');
                    if (session) {
                        const token = JSON.parse(session).token;
                        // Find payment linked to this order
                        const paymentsRes = await fetch(`${API_BASE_URL}/payments`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (paymentsRes.ok) {
                            const allPayments = await paymentsRes.json();
                            const linked = allPayments.find(p =>
                                (p.order?._id || p.order) === record.orderId &&
                                p.status !== 'received' && p.status !== 'completed'
                            );
                            if (linked) {
                                await fetch(`${API_BASE_URL}/payments/${linked._id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                    body: JSON.stringify({ ...linked, customer: linked.customer?._id || linked.customer, order: linked.order?._id || linked.order, status: 'received', paymentDate: linked.paymentDate || new Date().toISOString() })
                                });
                                console.log('Payment record auto-updated to received');
                                if (window.APIService && window.APIService.clearCache) window.APIService.clearCache();
                                if (typeof refreshPayments === 'function') refreshPayments();
                            }
                        }
                    }
                } catch (payErr) {
                    console.warn('Failed to auto-update payment:', payErr);
                }
            }
            
            // Try to log the movement (optional - don't fail if this doesn't work)
            try {
                console.log('Logging pipeline movement...');
                const movementResponse = await fetch(`${API_BASE_URL}/pipeline-movements`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        recordId,
                        customerName: record.customerName,
                        fromStageId: oldStageId,
                        fromStageName: oldStageName,
                        toStageId: newStageId,
                        toStageName: newStageName,
                        movedBy: 'Admin'
                    })
                });
                
                if (movementResponse.ok) {
                    console.log('Pipeline movement logged successfully');
                } else {
                    const errorText = await movementResponse.text();
                    console.warn('Pipeline movement logging failed:', movementResponse.status, errorText);
                }
            } catch (movementError) {
                console.warn('Failed to log pipeline movement:', movementError);
                // Don't fail the whole operation if movement logging fails
            }
            
            console.log('Reloading pipeline data...');
            await loadDataFromDB();
            
            // Refresh dashboard KPIs if moved to/from a paid/close stage
            if (/^(paid|close|closed|complete|completed|won|done)$/i.test(newStageName.trim()) || /^(paid|close|closed|complete|completed|won|done)$/i.test(oldStageName.trim())) {
                if (window.APIService && window.APIService.clearCache) window.APIService.clearCache();
                if (window.dashboard && window.dashboard.renderDashboard) {
                    await window.dashboard.renderDashboard();
                }
                if (typeof refreshPayments === 'function') refreshPayments();
            }
        } catch (error) {
            console.error('Error moving record:', error);
            alert('Error moving record: ' + error.message);
        }
    }
    
    }
    
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
}

// Stage Reordering
function stageColumnDragStart(event) {
    if (event.target.classList.contains('stage-column')) {
        draggedStage = event.target;
        event.target.style.opacity = '0.5';
    }
}

function stageColumnDragOver(event) {
    if (event.target.classList.contains('stage-column') && draggedStage) {
        event.preventDefault();
    }
}

function stageColumnDrop(event) {
    if (draggedStage) {
        event.preventDefault();
        reorderStages();
    }
}

function stageColumnDragEnd(event) {
    if (event.target.classList.contains('stage-column')) {
        event.target.style.opacity = '1';
        draggedStage = null;
    }
}

async function reorderStages() {
    const container = document.getElementById('stagesContainer');
    const stageElements = [...container.querySelectorAll('.stage-column')];
    const reorderedStages = stageElements.map((el, index) => ({
        _id: el.dataset.stageId,
        position: index + 1
    }));
    
    try {
        await fetch(`${API_BASE_URL}/stages/reorder`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reorderedStages)
        });
        await fetchStages();
    } catch (error) {
        console.error('Error reordering stages:', error);
    }
}

// Statistics
function updateStatistics() {
    const totalStagesEl = document.getElementById('totalStages');
    const totalRecordsEl = document.getElementById('totalRecords');
    
    if (totalStagesEl) totalStagesEl.textContent = stages.length;
    if (totalRecordsEl) totalRecordsEl.textContent = records.length;
    
    // Update new orders count
    const newOrdersCountEl = document.getElementById('newOrdersCount');
    if (newOrdersCountEl) newOrdersCountEl.textContent = newOrders.length;
}

async function clearPipelineData() {
    const password = prompt('⚠️ WARNING: This will delete ALL pipeline data!\n\nEnter admin password to confirm:');
    
    if (!password) return;
    
    // Simple password check (you can change this password)
    if (password !== 'admin123') {
        alert('❌ Incorrect password. Access denied.');
        return;
    }
    
    if (!confirm('Are you absolutely sure? This action cannot be undone!')) return;
    
    try {
        for (const record of records) {
            await fetch(`${API_BASE_URL}/pipeline-records/${record._id}`, { method: 'DELETE' });
        }
        for (const stage of stages) {
            await fetch(`${API_BASE_URL}/stages/${stage._id}`, { method: 'DELETE' });
        }
        
        await loadDataFromDB();
        alert('✅ Pipeline data cleared successfully!');
    } catch (error) {
        alert('Error clearing data: ' + error.message);
    }
}

// Utility
function formatTime(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return days + 'd ago';
    if (hours > 0) return hours + 'h ago';
    if (minutes > 0) return minutes + 'm ago';
    return 'Just now';
}

window.addEventListener('click', (event) => {
    if (event.target.id === 'stageModal') closeStageModal();
    if (event.target.id === 'recordModal') closeRecordModal();
    if (event.target.id === 'viewRecordModal') closeViewRecordModal();
});

// Make functions globally accessible
window.searchCustomers = searchCustomers;
window.selectCustomer = selectCustomer;

// Pipeline Search Functions
function filterPipelineRecords(query) {
    searchQuery = query.toLowerCase().trim();
    
    const searchInput = document.getElementById('pipelineSearchInput');
    const clearBtn = document.querySelector('.btn-clear-search');
    
    if (searchQuery) {
        filteredRecords = records.filter(record => {
            const customerName = (record.customerName || '').toLowerCase();
            const email = (record.email || '').toLowerCase();
            const phone = (record.phone || '').toLowerCase();
            const orderIdDisplay = (record.orderIdDisplay || '').toLowerCase();
            const address = (record.address || '').toLowerCase();
            const description = (record.description || '').toLowerCase();
            
            return customerName.includes(searchQuery) || 
                   email.includes(searchQuery) || 
                   phone.includes(searchQuery) ||
                   orderIdDisplay.includes(searchQuery) ||
                   address.includes(searchQuery) ||
                   description.includes(searchQuery);
        });
        
        if (clearBtn) clearBtn.style.display = 'block';
    } else {
        filteredRecords = [...records];
        if (clearBtn) clearBtn.style.display = 'none';
    }
    
    loadStages();
    updateSearchStats();
}

function clearPipelineSearch() {
    const searchInput = document.getElementById('pipelineSearchInput');
    if (searchInput) searchInput.value = '';
    filterPipelineRecords('');
}

function updateSearchStats() {
    const totalRecordsEl = document.getElementById('totalRecords');
    if (totalRecordsEl) {
        if (searchQuery) {
            totalRecordsEl.textContent = `${filteredRecords.length} / ${records.length}`;
            totalRecordsEl.style.color = '#3b82f6';
        } else {
            totalRecordsEl.textContent = records.length;
            totalRecordsEl.style.color = '';
        }
    }
}

// Global function to verify pipeline record to order connection
window.verifyPipelineConnection = async function(recordId) {
    console.log('=== VERIFYING PIPELINE CONNECTION ===');
    console.log('Record ID:', recordId);
    
    try {
        // Get pipeline record
        const recordResponse = await fetch(`/api/pipeline-records/${recordId}`);
        const record = await recordResponse.json();
        console.log('Pipeline record:', record);
        
        if (record.orderId) {
            // Get linked order
            const orderResponse = await fetch(`/api/orders/${record.orderId}`);
            const order = await orderResponse.json();
            console.log('Linked order:', {
                id: order._id,
                pipelineStage: order.pipelineStage,
                pipelineRecordId: order.pipelineRecordId,
                amount: order.amount
            });
            
            // Get stage name
            const stageResponse = await fetch(`/api/stages/${record.stageId}`);
            const stage = await stageResponse.json();
            console.log('Stage:', stage);
            
            return { record, order, stage };
        } else {
            console.log('No orderId in pipeline record');
            return { record, order: null, stage: null };
        }
    } catch (error) {
        console.error('Error verifying connection:', error);
    }
};

window.filterPipelineRecords = filterPipelineRecords;
window.clearPipelineSearch = clearPipelineSearch;
window.verifyPipelineConnection = verifyPipelineConnection;
window.fetchNewOrders = fetchNewOrders;
window.renderNewOrders = renderNewOrders;

// Expand Stage Function
async function expandStage(stageId) {
    const stage = stages.find(s => s._id === stageId);
    if (!stage) return;
    
    const stageRecords = records.filter(r => r.stageId === stageId);
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.id = 'expandedStageModal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 1400px; max-height: 90vh; overflow-y: auto;">
            <div class="modal-header">
                <h2><i class="fas fa-expand-alt"></i> ${stage.name} - All Orders (${stageRecords.length})</h2>
                <button class="modal-close" onclick="closeExpandedStage()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body" style="padding: 20px;">
                ${stageRecords.length === 0 ? 
                    '<p style="text-align: center; color: #999; padding: 40px;">No orders in this stage</p>' :
                    `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(450px, 1fr)); gap: 20px;">
                        ${stageRecords.map(record => `
                            <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
                                    <div>
                                        <h3 style="margin: 0 0 5px 0; font-size: 18px; color: #1f2937;">${record.customerName}</h3>
                                        <span class="priority-badge priority-${record.priority}" style="font-size: 11px;">${record.priority}</span>
                                    </div>
                                    <div style="display: flex; gap: 5px;">
                                        <button class="action-btn view" onclick="viewRecordFromExpanded('${record._id}')" title="View" style="padding: 6px 10px;">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="action-btn edit" onclick="editRecordFromExpanded('${record._id}')" title="Edit" style="padding: 6px 10px;">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                    </div>
                                </div>
                                
                                <div style="display: grid; gap: 10px; font-size: 14px; color: #4b5563;">
                                    ${record.email ? `
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <i class="fas fa-envelope" style="width: 16px; color: #6b7280;"></i>
                                            <span>${record.email}</span>
                                        </div>
                                    ` : ''}
                                    
                                    ${record.phone ? `
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <i class="fas fa-phone" style="width: 16px; color: #6b7280;"></i>
                                            <span>${record.phone}</span>
                                        </div>
                                    ` : ''}
                                    
                                    ${record.address ? `
                                        <div style="display: flex; align-items: start; gap: 8px;">
                                            <i class="fas fa-map-marker-alt" style="width: 16px; color: #6b7280; margin-top: 2px;"></i>
                                            <span>${record.address}</span>
                                        </div>
                                    ` : ''}
                                    
                                    ${record.budget ? `
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <i class="fas fa-dollar-sign" style="width: 16px; color: #6b7280;"></i>
                                            <span style="font-weight: 600; color: #059669;">$${parseFloat(record.budget).toLocaleString()}</span>
                                        </div>
                                    ` : ''}
                                    
                                    ${record.startDate ? `
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <i class="fas fa-calendar" style="width: 16px; color: #6b7280;"></i>
                                            <span>Start: ${new Date(record.startDate).toLocaleDateString()}</span>
                                        </div>
                                    ` : ''}
                                    
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <i class="fas fa-clock" style="width: 16px; color: #6b7280;"></i>
                                        <span>Created: ${new Date(record.createdAt).toLocaleDateString()}</span>
                                    </div>
                                </div>
                                
                                ${record.description ? `
                                    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
                                        <div style="font-weight: 600; font-size: 13px; color: #6b7280; margin-bottom: 5px;">Description:</div>
                                        <div style="font-size: 13px; color: #4b5563; line-height: 1.5;">${record.description}</div>
                                    </div>
                                ` : ''}
                                
                                ${record.notes ? `
                                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
                                        <div style="font-weight: 600; font-size: 13px; color: #6b7280; margin-bottom: 5px;">Notes:</div>
                                        <div style="font-size: 13px; color: #4b5563; line-height: 1.5;">${record.notes}</div>
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>`
                }
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="closeExpandedStage()">
                    <i class="fas fa-times"></i> Close
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function closeExpandedStage() {
    const modal = document.getElementById('expandedStageModal');
    if (modal) modal.remove();
}

function viewRecordFromExpanded(recordId) {
    closeExpandedStage();
    const record = records.find(r => r._id === recordId);
    
    // If record has linked order, open order detail page
    if (record && record.orderId) {
        if (typeof window.showOrderDetail === 'function') {
            window.showOrderDetail(record.orderId, true); // true = from pipeline
        } else {
            console.error('showOrderDetail function not found');
            viewRecord(recordId);
        }
    } else {
        // No linked order, show pipeline view modal
        viewRecord(recordId);
    }
}

function editRecordFromExpanded(recordId) {
    closeExpandedStage();
    editRecord(recordId);
}

window.expandStage = expandStage;
window.closeExpandedStage = closeExpandedStage;
window.viewRecordFromExpanded = viewRecordFromExpanded;
window.editRecordFromExpanded = editRecordFromExpanded;

// New Orders Suggestions Functions
function createNewOrdersSuggestionColumn() {
    const column = document.createElement('div');
    column.className = 'stage-column new-orders-column';
    column.style.background = 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)';
    column.style.border = '2px dashed #0ea5e9';
    column.style.minWidth = '340px';
    column.style.maxWidth = '340px';
    
    const header = document.createElement('div');
    header.className = 'stage-header';
    header.style.background = 'linear-gradient(135deg, #0ea5e9, #0284c7)';
    header.style.color = 'white';
    header.innerHTML = `
        <div class="stage-title">
            <h3 style="color: white; display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-plus-circle"></i>
                New Orders
            </h3>
        </div>
        <div class="stage-count">
            <span class="count-badge" id="newOrdersCount" style="background: rgba(255,255,255,0.2); color: white;">${newOrders.length}</span>
        </div>
    `;
    
    const body = document.createElement('div');
    body.className = 'stage-body';
    body.style.background = '#f8fafc';
    body.innerHTML = renderNewOrders();
    
    column.appendChild(header);
    column.appendChild(body);
    
    return column;
}

function renderNewOrders() {
    if (newOrders.length === 0) {
        return `
            <div style="text-align: center; color: #64748b; padding: 40px 20px; font-size: 13px;">
                <i class="fas fa-check-circle" style="font-size: 32px; color: #10b981; margin-bottom: 12px; display: block;"></i>
                <div style="font-weight: 600; margin-bottom: 4px;">All caught up!</div>
                <div>No new orders to add to pipeline</div>
            </div>
        `;
    }
    
    // Show only first order by default
    const firstOrder = newOrders[0];
    const remainingCount = newOrders.length - 1;
    
    let html = renderOrderCard(firstOrder);
    
    // Add expand button if more orders exist
    if (remainingCount > 0) {
        html += `
            <button class="expand-new-orders-btn" onclick="expandNewOrders()" style="
                width: 100%;
                padding: 12px;
                background: linear-gradient(135deg, #0ea5e9, #0284c7);
                color: white;
                border: none;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                margin-top: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
            ">
                <i class="fas fa-chevron-down"></i>
                Show ${remainingCount} more order${remainingCount > 1 ? 's' : ''}
            </button>
        `;
    }
    
    return html;
}

function loadNewOrdersSuggestions() {
    const container = document.querySelector('.new-orders-column .stage-body');
    if (container) {
        container.innerHTML = renderNewOrders();
    }
    updateStatistics();
}

// Create pipeline record from order
async function createPipelineRecordFromOrder(order, stageId) {
    try {
        const customerName = order.customer?.name || order.customer || 'Unknown Customer';
        const email = order.customer?.email || '';
        const phone = order.customer?.phone || '';
        const address = order.customer?.address || '';
        const budget = order.amount || '';
        const startDate = order.startDate || '';
        const description = order.description || '';
        const notes = order.notes || '';
        const priority = order.priority || 'medium';
        const orderIdDisplay = order.orderId || '';
        
        console.log('Creating pipeline record from order:', {
            orderId: order._id,
            orderIdDisplay,
            customerName,
            stageId
        });
        
        const response = await fetch(`${API_BASE_URL}/pipeline-records`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                stageId,
                orderId: order._id,
                orderIdDisplay,
                customerName,
                email,
                phone,
                address,
                budget,
                startDate,
                description,
                notes,
                priority
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to create pipeline record');
        }
        
        console.log('Pipeline record created successfully');
        
        // Remove the order from new orders list
        newOrders = newOrders.filter(o => o._id !== order._id);
        
        // Reload pipeline data
        await loadDataFromDB();
        
        // Show success message
        if (window.showToast) {
            window.showToast(`Order "${orderIdDisplay || customerName}" added to pipeline!`, 'success');
        }
        
        // Refresh dashboard if needed
        if (window.refreshDashboard) {
            setTimeout(() => window.refreshDashboard(), 1000);
        }
        
    } catch (error) {
        console.error('Error creating pipeline record from order:', error);
        if (window.showToast) {
            window.showToast('Failed to add order to pipeline: ' + error.message, 'error');
        } else {
            alert('Failed to add order to pipeline: ' + error.message);
        }
    }
}

// Render individual order card
function renderOrderCard(order) {
    const customerName = order.customer?.name || order.customer || 'Unknown Customer';
    const amount = order.amount ? `$${parseFloat(order.amount).toLocaleString()}` : '';
    const timeAgo = formatTime(order.createdAt);
    const priority = order.priority || 'medium';
    
    return `
        <div class="new-order-card" draggable="true" data-order-id="${order._id}" style="
            background: white;
            border: 2px solid #e0f2fe;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 8px;
            cursor: move;
            transition: all 0.2s;
            position: relative;
        ">
            <div class="drag-indicator" style="
                position: absolute;
                top: 8px;
                right: 8px;
                color: #0ea5e9;
                font-size: 12px;
            ">
                <i class="fas fa-grip-vertical"></i>
            </div>
            
            <div class="order-header" style="margin-bottom: 8px;">
                <div class="order-title" style="font-weight: 600; font-size: 13px; color: #1e293b; margin-bottom: 2px;">
                    ${customerName}
                </div>
                <div class="order-id" style="font-size: 10px; color: #64748b; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; display: inline-block;">
                    ${order.orderId || '#' + order._id.substring(0, 8).toUpperCase()}
                </div>
            </div>
            
            <div class="order-info" style="font-size: 12px; color: #475569; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                    <i class="fas fa-wrench" style="color: #64748b; font-size: 11px;"></i>
                    <span>${order.service || 'Service not specified'}</span>
                </div>
                ${order.customer?.email ? `
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                        <i class="fas fa-envelope" style="color: #64748b; font-size: 11px;"></i>
                        <span>${order.customer.email}</span>
                    </div>
                ` : ''}
                ${amount ? `
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-dollar-sign" style="color: #64748b; font-size: 11px;"></i>
                        <span style="font-weight: 600; color: #059669;">${amount}</span>
                    </div>
                ` : ''}
            </div>
            
            <div class="order-footer" style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid #e2e8f0;">
                <span class="priority-badge priority-${priority}" style="
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-weight: 500;
                    text-transform: uppercase;
                    font-size: 9px;
                    letter-spacing: 0.5px;
                    ${priority === 'high' ? 'background: #fef2f2; color: #dc2626; border: 1px solid #fecaca;' : 
                      priority === 'medium' ? 'background: #fffbeb; color: #d97706; border: 1px solid #fde68a;' : 
                      'background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0;'}
                ">${priority}</span>
                <span class="order-time" style="font-size: 10px; color: #94a3b8;">${timeAgo}</span>
            </div>
            
            <div class="drag-hint" style="
                position: absolute;
                bottom: -20px;
                left: 50%;
                transform: translateX(-50%);
                font-size: 10px;
                color: #0ea5e9;
                background: white;
                padding: 2px 8px;
                border-radius: 4px;
                border: 1px solid #0ea5e9;
                opacity: 0;
                transition: opacity 0.2s;
                pointer-events: none;
                white-space: nowrap;
            ">Drag to stage →</div>
        </div>
    `;
}

// Expand new orders to show all
function expandNewOrders() {
    const container = document.querySelector('.new-orders-column .stage-body');
    if (!container) return;
    
    // Show all orders
    const allOrdersHtml = newOrders.map(order => renderOrderCard(order)).join('');
    
    // Add collapse button
    const collapseBtn = `
        <button class="collapse-new-orders-btn" onclick="collapseNewOrders()" style="
            width: 100%;
            padding: 12px;
            background: linear-gradient(135deg, #64748b, #475569);
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            margin-top: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        ">
            <i class="fas fa-chevron-up"></i>
            Show less
        </button>
    `;
    
    container.innerHTML = allOrdersHtml + collapseBtn;
}

// Collapse new orders to show only first
function collapseNewOrders() {
    const container = document.querySelector('.new-orders-column .stage-body');
    if (!container) return;
    
    container.innerHTML = renderNewOrders();
}

// Add hover effects for new order cards
document.addEventListener('DOMContentLoaded', () => {
    // Add CSS for hover effects
    const style = document.createElement('style');
    style.textContent = `
        .new-order-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(14, 165, 233, 0.15);
            border-color: #0ea5e9 !important;
        }
        
        .new-order-card:hover .drag-hint {
            opacity: 1;
        }
        
        .new-order-card.dragging {
            opacity: 0.5;
            transform: rotate(5deg);
        }
        
        .stage-body.drag-over {
            background: #f0f9ff !important;
            border: 2px dashed #0ea5e9;
        }
    `;
    document.head.appendChild(style);
});

window.createPipelineRecordFromOrder = createPipelineRecordFromOrder;
window.loadNewOrdersSuggestions = loadNewOrdersSuggestions;
window.expandNewOrders = expandNewOrders;
window.collapseNewOrders = collapseNewOrders;

