// API Configuration
const API_BASE_URL = '/api';

// Data storage
let stages = [];
let records = [];
let filteredRecords = [];
let draggedStage = null;
let searchQuery = '';
let newOrders = []; // Store new orders for suggestions

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
        await Promise.all([fetchStages(), fetchRecords(), fetchNewOrders()]);
        console.log('Pipeline data loaded - Stages:', stages.length, 'Records:', records.length, 'New Orders:', newOrders.length);
        loadStages();
        loadNewOrdersSuggestions();
    } catch (error) {
        console.error('Error loading data:', error);
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

// Load and render stages
function loadStages() {
    const container = document.getElementById('stagesContainer');
    if (!container) return;
    
    // Remove old event listeners by cloning
    const newContainer = container.cloneNode(false);
    container.parentNode.replaceChild(newContainer, container);
    
    // Add new orders suggestion column first
    const suggestionsColumn = createNewOrdersSuggestionColumn();
    newContainer.appendChild(suggestionsColumn);
    
    stages.forEach(stage => {
        const stageColumn = createStageColumn(stage);
        newContainer.appendChild(stageColumn);
    });
    
    // Add event delegation for all buttons
    newContainer.addEventListener('click', (e) => {
        console.log('Click detected:', e.target);
        
        // Add record button
        const addBtn = e.target.closest('.btn-add-record');
        if (addBtn) {
            console.log('Add button clicked, stageId:', addBtn.dataset.stageId);
            e.stopPropagation();
            e.preventDefault();
            const stageId = addBtn.dataset.stageId;
            openRecordModal(stageId);
            return;
        }
        
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
            viewRecord(viewBtn.dataset.recordId);
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
function createStageColumn(stage) {
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
            <button class="btn-add-record" data-stage-id="${stage._id}" title="Add Record">+</button>
        </div>
    `;
    
    const stageBody = document.createElement('div');
    stageBody.className = 'stage-body';
    stageBody.dataset.stageId = stage._id;
    stageBody.innerHTML = renderRecords(stage._id);
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
function renderRecords(stageId) {
    const stageRecords = filteredRecords.filter(r => r.stageId === stageId);
    if (stageRecords.length === 0) {
        const allRecordsInStage = records.filter(r => r.stageId === stageId).length;
        if (searchQuery && allRecordsInStage > 0) {
            return '<div style="text-align:center; color:#999; padding:20px; font-size:13px;">No matching records</div>';
        }
        return '<div style="text-align:center; color:#999; padding:20px; font-size:13px;">No records yet</div>';
    }
    return stageRecords.map(record => {
        const budget = record.budget ? `$${parseFloat(record.budget).toLocaleString()}` : '';
        return `
        <div class="record-card" draggable="true" data-record-id="${record._id}">
            <div class="record-header">
                <div class="record-title">${record.customerName}</div>
                <div class="record-actions">
                    <button class="icon-btn record-view-btn" data-record-id="${record._id}" title="View Details"><i class="fas fa-eye"></i></button>
                    <button class="icon-btn record-edit-btn" data-record-id="${record._id}" title="Edit"><i class="fas fa-edit"></i></button>
                    <button class="icon-btn delete record-delete-btn" data-record-id="${record._id}" title="Delete"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            ${record.email ? `<div class="record-info"><i class="fas fa-envelope"></i> ${record.email}</div>` : ''}
            ${record.phone ? `<div class="record-info"><i class="fas fa-phone"></i> ${record.phone}</div>` : ''}
            ${budget ? `<div class="record-info"><i class="fas fa-dollar-sign"></i> ${budget}</div>` : ''}
            ${record.description ? `<div class="record-description">${record.description}</div>` : ''}
            <div class="record-footer">
                <span class="priority-badge priority-${record.priority}">${record.priority}</span>
                <span class="record-time">${formatTime(record.createdAt)}</span>
            </div>
        </div>
    `}).join('');
}

// Stage Modal Functions
function openStageModal() {
    document.getElementById('stageModalTitle').textContent = 'Add Stage';
    document.getElementById('stageForm').reset();
    document.getElementById('stageId').value = '';
    document.getElementById('stageModal').classList.add('show');
}

function closeStageModal() {
    document.getElementById('stageModal').classList.remove('show');
}

function editStage(stageId) {
    const stage = stages.find(s => s._id === stageId);
    if (!stage) return;
    
    document.getElementById('stageModalTitle').textContent = 'Edit Stage';
    document.getElementById('stageId').value = stage._id;
    document.getElementById('stageName').value = stage.name;
    document.getElementById('stageModal').classList.add('show');
}

async function saveStage(event) {
    event.preventDefault();
    
    const id = document.getElementById('stageId').value;
    const name = document.getElementById('stageName').value;
    
    try {
        let response;
        if (id) {
            response = await fetch(`${API_BASE_URL}/stages/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
        } else {
            response = await fetch(`${API_BASE_URL}/stages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, position: stages.length + 1 })
            });
        }
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to save stage');
        }
        
        closeStageModal();
        await loadDataFromDB();
    } catch (error) {
        console.error('Error saving stage:', error);
        alert('Error saving stage: ' + error.message);
    }
}

async function deleteStage(stageId) {
    const stageRecords = records.filter(r => r.stageId === stageId);
    
    if (stageRecords.length > 0) {
        if (!confirm(`This stage has ${stageRecords.length} record(s). Delete anyway?`)) return;
    }
    
    try {
        await fetch(`${API_BASE_URL}/stages/${stageId}`, { method: 'DELETE' });
        await loadDataFromDB();
    } catch (error) {
        alert('Error deleting stage: ' + error.message);
    }
}

// Record View Modal Functions
let currentViewRecordId = null;

function viewRecord(recordId) {
    const record = records.find(r => r._id === recordId);
    if (!record) return;
    
    currentViewRecordId = recordId;
    const stage = stages.find(s => s._id === record.stageId);
    
    document.getElementById('viewProjectName').textContent = record.customerName || '-';
    document.getElementById('viewCustomerName').textContent = record.customerName || '-';
    document.getElementById('viewEmail').textContent = record.email || '-';
    document.getElementById('viewPhone').textContent = record.phone || '-';
    document.getElementById('viewAddress').textContent = record.address || '-';
    
    const priorityEl = document.getElementById('viewPriority');
    priorityEl.innerHTML = `<span class="priority-badge priority-${record.priority}">${record.priority}</span>`;
    
    document.getElementById('viewBudget').textContent = record.budget ? `$${parseFloat(record.budget).toLocaleString()}` : '-';
    document.getElementById('viewStage').textContent = stage ? stage.name : '-';
    document.getElementById('viewStartDate').textContent = record.startDate ? new Date(record.startDate).toLocaleDateString() : '-';
    document.getElementById('viewCreated').textContent = new Date(record.createdAt).toLocaleString();
    document.getElementById('viewUpdated').textContent = new Date(record.updatedAt).toLocaleString();
    document.getElementById('viewDescription').textContent = record.description || 'No description provided';
    document.getElementById('viewNotes').textContent = record.notes || 'No notes';
    
    document.getElementById('viewRecordModal').classList.add('show');
}

function closeViewRecordModal() {
    document.getElementById('viewRecordModal').classList.remove('show');
    currentViewRecordId = null;
}

function editFromView() {
    closeViewRecordModal();
    if (currentViewRecordId) {
        editRecord(currentViewRecordId);
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

function editRecord(recordId) {
    const record = records.find(r => r._id === recordId);
    if (!record) return;
    
    document.getElementById('recordModalTitle').innerHTML = '<i class="fas fa-edit"></i> Edit Record';
    document.getElementById('recordId').value = record._id;
    document.getElementById('recordStageId').value = record.stageId;
    document.getElementById('recordCustomerName').value = record.customerName;
    document.getElementById('recordEmail').value = record.email || '';
    document.getElementById('recordPhone').value = record.phone || '';
    document.getElementById('recordPriority').value = record.priority;
    document.getElementById('recordBudget').value = record.budget || '';
    document.getElementById('recordStartDate').value = record.startDate ? record.startDate.split('T')[0] : '';
    document.getElementById('recordAddress').value = record.address || '';
    document.getElementById('recordDescription').value = record.description || '';
    document.getElementById('recordNotes').value = record.notes || '';
    document.getElementById('recordModal').classList.add('show');
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
    const orderId = document.getElementById('recordWorkOrder')?.value || null;
    
    console.log('Form data:', { customerName, stageId, orderId });
    
    try {
        let response;
        if (id) {
            response = await fetch(`${API_BASE_URL}/pipeline-records/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customerName, email, phone, priority, budget, startDate, address, description, notes })
            });
        } else {
            response = await fetch(`${API_BASE_URL}/pipeline-records`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stageId, orderId, customerName, email, phone, priority, budget, startDate, address, description, notes })
            });
        }
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to save record');
        }
        
        console.log('Record saved successfully');
        closeRecordModal();
        await loadDataFromDB();
        if (window.refreshCalendar) {
            console.log('Refreshing calendar...');
            await window.refreshCalendar();
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
            
            // Wait longer to ensure backend update is complete
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Refresh dashboard KPIs if moved to/from 'Paid' stage
            if (newStageName === 'Paid' || oldStageName === 'Paid') {
                console.log('=== DASHBOARD REFRESH TRIGGERED ===');
                console.log('Stage change detected - from:', oldStageName, 'to:', newStageName);
                console.log('Record orderId:', record.orderId);
                
                // Force clear any cached data first
                if (window.dashboard && window.dashboard.clearCache) {
                    console.log('Clearing dashboard cache...');
                    window.dashboard.clearCache();
                }
                
                // CRITICAL: Clear APIService cache to force fresh data
                if (window.APIService && window.APIService.clearCache) {
                    console.log('Clearing APIService cache...');
                    window.APIService.clearCache();
                }
                
                // Verify the backend update was successful before refreshing dashboard
                console.log('Verifying backend update...');
                try {
                    const session = localStorage.getItem('huttaSession') || sessionStorage.getItem('huttaSession');
                    if (session) {
                        const sessionData = JSON.parse(session);
                        const token = sessionData.token;
                        
                        // Check if the order was actually updated
                        const orderResponse = await fetch(`/api/orders/${record.orderId}`, {
                            headers: {
                                'Authorization': `Bearer ${token}`
                            }
                        });
                        
                        if (orderResponse.ok) {
                            const updatedOrder = await orderResponse.json();
                            console.log('Backend verification - Order pipelineStage:', updatedOrder.pipelineStage);
                            
                            if (updatedOrder.pipelineStage === newStageName) {
                                console.log('✅ Backend update verified successfully');
                            } else {
                                console.log('❌ Backend update not yet reflected, waiting more...');
                                await new Promise(resolve => setTimeout(resolve, 2000));
                            }
                        } else {
                            console.error('Failed to verify order update:', orderResponse.status);
                        }
                    }
                } catch (verifyError) {
                    console.error('Error verifying backend update:', verifyError);
                }
                
                // Check order data before refresh
                console.log('Checking order data before refresh...');
                try {
                    const session = localStorage.getItem('huttaSession') || sessionStorage.getItem('huttaSession');
                    if (session) {
                        const sessionData = JSON.parse(session);
                        const token = sessionData.token;
                        
                        const response = await fetch('/api/orders', {
                            headers: {
                                'Authorization': `Bearer ${token}`
                            }
                        });
                        
                        if (response.ok) {
                            const orders = await response.json();
                            const updatedOrder = orders.find(o => o._id === record.orderId);
                            console.log('Updated order found:', updatedOrder ? {
                                id: updatedOrder._id,
                                pipelineStage: updatedOrder.pipelineStage,
                                amount: updatedOrder.amount
                            } : 'NOT FOUND');
                            
                            const paidOrders = orders.filter(order => order.pipelineStage === 'Paid');
                            const paymentsCollected = paidOrders.reduce((sum, order) => sum + (order.amount || 0), 0);
                            console.log('Fresh data - Paid orders:', paidOrders.length, 'Payments collected:', paymentsCollected);
                        } else {
                            console.error('Failed to fetch orders:', response.status, response.statusText);
                        }
                    } else {
                        console.error('No session found for authentication');
                    }
                } catch (err) {
                    console.error('Error checking order data:', err);
                }
                
                // Try multiple refresh methods with retries to ensure dashboard updates
                console.log('Starting dashboard refresh with retries...');
                
                for (let attempt = 1; attempt <= 3; attempt++) {
                    console.log(`Dashboard refresh attempt ${attempt}/3`);
                    
                    if (window.refreshDashboard) {
                        console.log('Calling window.refreshDashboard...');
                        await window.refreshDashboard();
                    }
                    if (window.refreshDashboardKPIs) {
                        console.log('Calling window.refreshDashboardKPIs...');
                        await window.refreshDashboardKPIs();
                    }
                    if (window.onPipelineStageChange) {
                        console.log('Calling window.onPipelineStageChange...');
                        await window.onPipelineStageChange();
                    }
                    if (window.dashboard && window.dashboard.renderDashboard) {
                        console.log('Calling window.dashboard.renderDashboard...');
                        await window.dashboard.renderDashboard();
                    }
                    
                    // Wait between attempts
                    if (attempt < 3) {
                        console.log(`Waiting before attempt ${attempt + 1}...`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
                
                // Additional delay and final check
                await new Promise(resolve => setTimeout(resolve, 500));
                console.log('=== DASHBOARD REFRESH COMPLETE ===');
            } else {
                console.log('Stage change detected but not to/from Paid stage:', oldStageName, '->', newStageName);
            }
            
            console.log('=== PIPELINE DROP COMPLETE ===');
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
            
            return customerName.includes(searchQuery) || 
                   email.includes(searchQuery) || 
                   phone.includes(searchQuery);
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
    viewRecord(recordId);
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
        
        console.log('Creating pipeline record from order:', {
            orderId: order._id,
            customerName,
            stageId
        });
        
        const response = await fetch(`${API_BASE_URL}/pipeline-records`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                stageId,
                orderId: order._id,
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
            window.showToast(`Order "${customerName}" added to pipeline!`, 'success');
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
