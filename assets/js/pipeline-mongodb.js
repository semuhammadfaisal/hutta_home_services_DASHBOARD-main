// API Configuration
const API_BASE_URL = '/api';

// Data storage
let stages = [];
let records = [];
let draggedStage = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadDataFromDB();
});

// Load all data from MongoDB
async function loadDataFromDB() {
    try {
        await Promise.all([fetchStages(), fetchRecords()]);
        loadStages();
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Fetch stages from MongoDB
async function fetchStages() {
    const response = await fetch(`${API_BASE_URL}/stages`);
    stages = await response.json();
}

// Fetch records from MongoDB
async function fetchRecords() {
    const response = await fetch(`${API_BASE_URL}/pipeline-records`);
    records = await response.json();
}

// Load and render stages
function loadStages() {
    const container = document.getElementById('stagesContainer');
    if (!container) return;
    
    // Remove old event listeners by cloning
    const newContainer = container.cloneNode(false);
    container.parentNode.replaceChild(newContainer, container);
    
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
    });
    
    // Add drag event delegation
    newContainer.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('record-card')) {
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
    const stageRecords = records.filter(r => r.stageId === stageId);
    if (stageRecords.length === 0) {
        return '<div style="text-align:center; color:#999; padding:20px; font-size:13px;">No records yet</div>';
    }
    return stageRecords.map(record => {
        const dueDate = record.dueDate ? new Date(record.dueDate).toLocaleDateString() : '';
        const budget = record.budget ? `$${parseFloat(record.budget).toLocaleString()}` : '';
        return `
        <div class="record-card" draggable="true" data-record-id="${record._id}">
            <div class="record-header">
                <div class="record-title">${record.projectName}</div>
                <div class="record-actions">
                    <button class="icon-btn record-view-btn" data-record-id="${record._id}" title="View Details"><i class="fas fa-eye"></i></button>
                    <button class="icon-btn record-edit-btn" data-record-id="${record._id}" title="Edit"><i class="fas fa-edit"></i></button>
                    <button class="icon-btn delete record-delete-btn" data-record-id="${record._id}" title="Delete"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <div class="record-customer"><i class="fas fa-user"></i> ${record.customerName}</div>
            ${record.email ? `<div class="record-info"><i class="fas fa-envelope"></i> ${record.email}</div>` : ''}
            ${record.phone ? `<div class="record-info"><i class="fas fa-phone"></i> ${record.phone}</div>` : ''}
            ${budget ? `<div class="record-info"><i class="fas fa-dollar-sign"></i> ${budget}</div>` : ''}
            ${dueDate ? `<div class="record-info"><i class="fas fa-calendar"></i> Due: ${dueDate}</div>` : ''}
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
    
    document.getElementById('viewProjectName').textContent = record.projectName || '-';
    document.getElementById('viewCustomerName').textContent = record.customerName || '-';
    document.getElementById('viewEmail').textContent = record.email || '-';
    document.getElementById('viewPhone').textContent = record.phone || '-';
    document.getElementById('viewAddress').textContent = record.address || '-';
    
    const priorityEl = document.getElementById('viewPriority');
    priorityEl.innerHTML = `<span class="priority-badge priority-${record.priority}">${record.priority}</span>`;
    
    document.getElementById('viewBudget').textContent = record.budget ? `$${parseFloat(record.budget).toLocaleString()}` : '-';
    document.getElementById('viewStage').textContent = stage ? stage.name : '-';
    document.getElementById('viewStartDate').textContent = record.startDate ? new Date(record.startDate).toLocaleDateString() : '-';
    document.getElementById('viewDueDate').textContent = record.dueDate ? new Date(record.dueDate).toLocaleDateString() : '-';
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
let availableOrders = [];

async function loadAvailableOrders() {
    try {
        const session = localStorage.getItem('huttaSession') || sessionStorage.getItem('huttaSession');
        if (!session) return;
        
        const sessionData = JSON.parse(session);
        const token = sessionData.token;
        
        const response = await fetch(`${API_BASE_URL}/orders`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load orders');
        
        availableOrders = await response.json();
        populateOrderDropdown();
    } catch (error) {
        console.error('Error loading orders:', error);
    }
}

function populateOrderDropdown() {
    const select = document.getElementById('existingOrderSelect');
    if (!select) return;
    
    select.innerHTML = '<option value="">-- Select an order --</option>' +
        availableOrders.map(order => {
            const orderId = order.orderId || `#${order._id.substring(0, 8).toUpperCase()}`;
            const customerName = order.customer?.name || order.customer;
            return `<option value="${order._id}">${orderId} - ${customerName} - ${order.service}</option>`;
        }).join('');
}

function toggleOrderSelection() {
    const checkbox = document.getElementById('selectFromOrders');
    const orderGroup = document.getElementById('orderSelectionGroup');
    const manualFields = document.getElementById('manualEntryFields');
    const form = document.getElementById('recordForm');
    
    if (checkbox.checked) {
        orderGroup.style.display = 'block';
        manualFields.style.display = 'none';
        
        // Remove required from manual fields
        form.querySelectorAll('#manualEntryFields input[required]').forEach(input => {
            input.removeAttribute('required');
        });
        
        // Add required to order select
        document.getElementById('existingOrderSelect').setAttribute('required', 'required');
        
        // Load orders if not loaded
        if (availableOrders.length === 0) {
            loadAvailableOrders();
        }
    } else {
        orderGroup.style.display = 'none';
        manualFields.style.display = 'block';
        
        // Add required back to manual fields
        document.getElementById('recordProjectName').setAttribute('required', 'required');
        document.getElementById('recordCustomerName').setAttribute('required', 'required');
        
        // Remove required from order select
        document.getElementById('existingOrderSelect').removeAttribute('required');
    }
}

function populateFromOrder() {
    const select = document.getElementById('existingOrderSelect');
    const orderId = select?.value;
    
    if (!orderId) return;
    
    const order = availableOrders.find(o => o._id === orderId);
    if (!order) return;
    
    const fields = {
        recordProjectName: order.service || '',
        recordCustomerName: order.customer?.name || order.customer || '',
        recordEmail: order.customer?.email || '',
        recordPhone: order.customer?.phone || '',
        recordAddress: order.customer?.address || '',
        recordBudget: order.amount || '',
        recordStartDate: order.startDate ? order.startDate.split('T')[0] : '',
        recordDueDate: order.endDate ? order.endDate.split('T')[0] : '',
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
    
    // Reset toggle
    document.getElementById('selectFromOrders').checked = false;
    document.getElementById('orderSelectionGroup').style.display = 'none';
    document.getElementById('manualEntryFields').style.display = 'block';
    
    // Restore required attributes
    document.getElementById('recordProjectName').setAttribute('required', 'required');
    document.getElementById('recordCustomerName').setAttribute('required', 'required');
    document.getElementById('existingOrderSelect').removeAttribute('required');
    
    // Load orders
    loadAvailableOrders();
    
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
    document.getElementById('recordProjectName').value = record.projectName;
    document.getElementById('recordCustomerName').value = record.customerName;
    document.getElementById('recordEmail').value = record.email || '';
    document.getElementById('recordPhone').value = record.phone || '';
    document.getElementById('recordPriority').value = record.priority;
    document.getElementById('recordBudget').value = record.budget || '';
    document.getElementById('recordStartDate').value = record.startDate ? record.startDate.split('T')[0] : '';
    document.getElementById('recordDueDate').value = record.dueDate ? record.dueDate.split('T')[0] : '';
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
    const projectName = document.getElementById('recordProjectName')?.value || '';
    const customerName = document.getElementById('recordCustomerName')?.value || '';
    const email = document.getElementById('recordEmail')?.value || '';
    const phone = document.getElementById('recordPhone')?.value || '';
    const priority = document.getElementById('recordPriority')?.value || 'medium';
    const budget = document.getElementById('recordBudget')?.value || '';
    const startDate = document.getElementById('recordStartDate')?.value || '';
    const dueDate = document.getElementById('recordDueDate')?.value || '';
    const address = document.getElementById('recordAddress')?.value || '';
    const description = document.getElementById('recordDescription')?.value || '';
    const notes = document.getElementById('recordNotes')?.value || '';
    
    console.log('Form data:', { projectName, customerName, stageId });
    
    try {
        const session = localStorage.getItem('huttaSession') || sessionStorage.getItem('huttaSession');
        const token = session ? JSON.parse(session).token : null;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
        
        let customerId = null;
        if (!id && customerName) {
            const customerResponse = await fetch(`${API_BASE_URL}/customers`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: customerName,
                    email: email || '',
                    phone: phone || '',
                    address: address || '',
                    customerType: 'one-time',
                    status: 'active'
                })
            });
            if (customerResponse.ok) {
                const customer = await customerResponse.json();
                customerId = customer._id;
                console.log('Customer created:', customerId);
            } else {
                const error = await customerResponse.json();
                console.error('Customer creation failed:', error);
                throw new Error('Failed to create customer: ' + (error.message || 'Unknown error'));
            }
        }
        
        let projectId = null;
        if (!id && projectName && customerId) {
            const projectResponse = await fetch(`${API_BASE_URL}/projects`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: projectName,
                    customer: customerId,
                    budget: parseFloat(budget) || 0,
                    startDate: startDate || new Date().toISOString(),
                    endDate: dueDate || new Date().toISOString(),
                    status: 'planning',
                    priority: priority,
                    progress: 0,
                    description: description || '',
                    notes: notes || ''
                })
            });
            if (projectResponse.ok) {
                const project = await projectResponse.json();
                projectId = project._id;
                console.log('Project created:', projectId);
            } else {
                const error = await projectResponse.json();
                console.error('Project creation failed:', error);
                throw new Error('Failed to create project: ' + (error.message || 'Unknown error'));
            }
        }
        
        let response;
        if (id) {
            response = await fetch(`${API_BASE_URL}/pipeline-records/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectName, customerName, email, phone, priority, budget, startDate, dueDate, address, description, notes })
            });
        } else {
            response = await fetch(`${API_BASE_URL}/pipeline-records`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stageId, projectName, customerName, email, phone, priority, budget, startDate, dueDate, address, description, notes })
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
    
    if (!confirm(`Delete "${record.projectName}"?`)) return;
    
    try {
        await fetch(`${API_BASE_URL}/pipeline-records/${recordId}`, { method: 'DELETE' });
        await loadDataFromDB();
    } catch (error) {
        alert('Error deleting record: ' + error.message);
    }
}

// Drag and Drop
function drag(event) {
    event.dataTransfer.setData('recordId', event.target.dataset.recordId);
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
    
    const recordId = event.dataTransfer.getData('recordId');
    const newStageId = event.currentTarget.dataset.stageId;
    
    const record = records.find(r => r._id === recordId);
    if (record && record.stageId !== newStageId) {
        const oldStageId = record.stageId;
        const oldStageName = stages.find(s => s._id === oldStageId)?.name || 'Unknown';
        const newStageName = stages.find(s => s._id === newStageId)?.name || 'Unknown';
        
        try {
            await fetch(`${API_BASE_URL}/pipeline-records/${recordId}/stage`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stageId: newStageId })
            });
            
            await fetch(`${API_BASE_URL}/pipeline-movements`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recordId,
                    projectName: record.projectName,
                    fromStageId: oldStageId,
                    fromStageName: oldStageName,
                    toStageId: newStageId,
                    toStageName: newStageName,
                    movedBy: 'Admin'
                })
            });
            
            await loadDataFromDB();
        } catch (error) {
            alert('Error moving record: ' + error.message);
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
window.toggleOrderSelection = toggleOrderSelection;
window.populateFromOrder = populateFromOrder;
