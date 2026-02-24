// Data storage (simulating database with localStorage)
let stages = JSON.parse(localStorage.getItem('pipeline_stages')) || [];
let records = JSON.parse(localStorage.getItem('pipeline_records')) || [];
let movementLogs = JSON.parse(localStorage.getItem('pipeline_movements')) || [];
let currentEditingStage = null;
let currentEditingRecord = null;
let draggedStage = null;

// Initialize default stages if none exist
function initializeDefaultStages() {
    if (stages.length === 0) {
        stages = [
            { id: 1, name: 'Work Order Received', createdAt: new Date().toISOString() },
            { id: 2, name: 'Bidding', createdAt: new Date().toISOString() },
            { id: 3, name: 'Bid Submitted to Client', createdAt: new Date().toISOString() },
            { id: 4, name: 'Approved – Ready to Schedule', createdAt: new Date().toISOString() },
            { id: 5, name: 'In Progress', createdAt: new Date().toISOString() },
            { id: 6, name: 'Awaiting Documentation', createdAt: new Date().toISOString() },
            { id: 7, name: 'Ready to Invoice', createdAt: new Date().toISOString() },
            { id: 8, name: 'Invoice Sent', createdAt: new Date().toISOString() },
            { id: 9, name: 'Paid', createdAt: new Date().toISOString() },
            { id: 10, name: 'Closed', createdAt: new Date().toISOString() }
        ];
        localStorage.setItem('pipeline_stages', JSON.stringify(stages));
    }
}

// Initialize sample records if none exist
function initializeSampleRecords() {
    if (records.length === 0 && stages.length > 0) {
        records = [
            { id: 1001, stageId: 1, projectName: 'Kitchen Renovation', customerName: 'John Smith', priority: 'high', description: 'Complete kitchen remodel', createdAt: new Date().toISOString() },
            { id: 1002, stageId: 1, projectName: 'Bathroom Repair', customerName: 'Sarah Johnson', priority: 'medium', description: 'Fix plumbing issues', createdAt: new Date(Date.now() - 3600000).toISOString() },
            { id: 1003, stageId: 2, projectName: 'Roof Replacement', customerName: 'Mike Davis', priority: 'high', description: 'Replace old roof', createdAt: new Date(Date.now() - 7200000).toISOString() },
            { id: 1004, stageId: 5, projectName: 'Electrical Upgrade', customerName: 'Emily Brown', priority: 'medium', description: 'Upgrade electrical panel', createdAt: new Date(Date.now() - 86400000).toISOString() },
            { id: 1005, stageId: 5, projectName: 'HVAC Installation', customerName: 'David Wilson', priority: 'low', description: 'Install new HVAC system', createdAt: new Date(Date.now() - 172800000).toISOString() }
        ];
        localStorage.setItem('pipeline_records', JSON.stringify(records));
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeDefaultStages();
    initializeSampleRecords();
    loadStages();
});

// Load and render stages
function loadStages() {
    const container = document.getElementById('stagesContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    stages.forEach(stage => {
        const stageColumn = createStageColumn(stage);
        container.appendChild(stageColumn);
    });
    
    // Add event delegation for record card buttons
    container.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.record-edit-btn');
        const deleteBtn = e.target.closest('.record-delete-btn');
        
        if (editBtn) {
            e.stopPropagation();
            const recordId = parseInt(editBtn.dataset.recordId);
            editRecord(recordId);
        } else if (deleteBtn) {
            e.stopPropagation();
            const recordId = parseInt(deleteBtn.dataset.recordId);
            deleteRecord(recordId);
        }
    });
    
    // Add drag event delegation for record cards
    container.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('record-card')) {
            drag(e);
        }
    });
    
    updateStatistics();
}

// Update statistics
function updateStatistics() {
    const totalStagesEl = document.getElementById('totalStages');
    const totalRecordsEl = document.getElementById('totalRecords');
    
    if (totalStagesEl) totalStagesEl.textContent = stages.length;
    if (totalRecordsEl) totalRecordsEl.textContent = records.length;
}

// Clear all pipeline data
function clearPipelineData() {
    if (!confirm('Clear all pipeline data? This will remove all stages, records, and movement logs.')) return;
    
    stages = [];
    records = [];
    movementLogs = [];
    
    localStorage.removeItem('pipeline_stages');
    localStorage.removeItem('pipeline_records');
    localStorage.removeItem('pipeline_movements');
    
    initializeDefaultStages();
    initializeSampleRecords();
    loadStages();
    
    alert('Pipeline data cleared and reset to defaults!');
}

// Create stage column
function createStageColumn(stage) {
    const count = records.filter(r => r.stageId === stage.id).length;
    
    const column = document.createElement('div');
    column.className = 'stage-column';
    column.draggable = true;
    column.dataset.stageId = stage.id;
    
    const stageHeader = document.createElement('div');
    stageHeader.className = 'stage-header';
    stageHeader.draggable = false;
    stageHeader.innerHTML = `
        <div class="stage-title">
            <h3>${stage.name}</h3>
            <div class="stage-actions">
                <button class="icon-btn" title="Edit Stage"><i class="fas fa-edit"></i></button>
                <button class="icon-btn delete" title="Delete Stage"><i class="fas fa-trash"></i></button>
            </div>
        </div>
        <div class="stage-count">
            <span class="count-badge">${count}</span>
            <button class="btn-add-record" title="Add Record">+</button>
        </div>
    `;
    
    // Add event listeners to buttons
    const editBtn = stageHeader.querySelector('.icon-btn:not(.delete)');
    const deleteBtn = stageHeader.querySelector('.icon-btn.delete');
    const addBtn = stageHeader.querySelector('.btn-add-record');
    
    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        editStage(stage.id);
    });
    
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteStage(stage.id);
    });
    
    addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openRecordModal(stage.id);
    });
    
    const stageBody = document.createElement('div');
    stageBody.className = 'stage-body';
    stageBody.dataset.stageId = stage.id;
    stageBody.innerHTML = renderRecords(stage.id);
    stageBody.addEventListener('drop', drop);
    stageBody.addEventListener('dragover', allowDrop);
    stageBody.addEventListener('dragleave', dragLeave);
    
    column.appendChild(stageHeader);
    column.appendChild(stageBody);
    
    // Add stage drag events
    column.addEventListener('dragstart', stageColumnDragStart);
    column.addEventListener('dragover', stageColumnDragOver);
    column.addEventListener('drop', stageColumnDrop);
    column.addEventListener('dragend', stageColumnDragEnd);
    
    return column;
}

// Render records for a stage
function renderRecords(stageId) {
    const stageRecords = records.filter(r => r.stageId === stageId);
    if (stageRecords.length === 0) {
        return '<div style="text-align:center; color:#999; padding:20px; font-size:13px;">No records yet</div>';
    }
    return stageRecords.map(record => createRecordCardHTML(record)).join('');
}

function createRecordCardHTML(record) {
    return `
        <div class="record-card" draggable="true" data-record-id="${record.id}" title="Drag to move between stages">
            <div class="record-header">
                <div class="record-title">${record.projectName}</div>
                <div class="record-actions">
                    <button class="icon-btn record-edit-btn" data-record-id="${record.id}" title="Edit"><i class="fas fa-edit"></i></button>
                    <button class="icon-btn delete record-delete-btn" data-record-id="${record.id}" title="Delete"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <div class="record-customer"><i class="fas fa-user"></i> ${record.customerName}</div>
            ${record.description ? `<div class="record-description">${record.description}</div>` : ''}
            <div class="record-footer">
                <span class="priority-badge priority-${record.priority}">${record.priority}</span>
                <span class="record-time">${formatTime(record.createdAt)}</span>
            </div>
        </div>
    `;
}

// Stage Modal Functions
function openStageModal() {
    currentEditingStage = null;
    document.getElementById('stageModalTitle').textContent = 'Add Stage';
    document.getElementById('stageForm').reset();
    document.getElementById('stageId').value = '';
    const modal = document.getElementById('stageModal');
    if (modal) modal.style.display = 'flex';
}

function closeStageModal() {
    const modal = document.getElementById('stageModal');
    if (modal) modal.style.display = 'none';
}

function editStage(stageId) {
    const stage = stages.find(s => s.id === stageId);
    if (!stage) return;
    
    currentEditingStage = stage;
    document.getElementById('stageModalTitle').textContent = 'Edit Stage';
    document.getElementById('stageId').value = stage.id;
    document.getElementById('stageName').value = stage.name;
    const modal = document.getElementById('stageModal');
    if (modal) modal.style.display = 'flex';
}

function saveStage(event) {
    event.preventDefault();
    
    const id = document.getElementById('stageId').value;
    const name = document.getElementById('stageName').value;
    
    if (id) {
        // Update existing stage
        const stage = stages.find(s => s.id == id);
        if (stage) {
            stage.name = name;
            // Simulate database update
            updateStageInDB(stage);
        }
    } else {
        // Create new stage
        const newStage = {
            id: Date.now(),
            name: name,
            createdAt: new Date().toISOString()
        };
        stages.push(newStage);
        // Simulate database insert
        saveStageInDB(newStage);
    }
    
    localStorage.setItem('pipeline_stages', JSON.stringify(stages));
    closeStageModal();
    loadStages();
}

function deleteStage(stageId) {
    const stageRecords = records.filter(r => r.stageId === stageId);
    
    if (stageRecords.length > 0) {
        if (!confirm(`This stage has ${stageRecords.length} record(s). Delete anyway?`)) {
            return;
        }
        // Remove all records in this stage
        records = records.filter(r => r.stageId !== stageId);
    }
    
    stages = stages.filter(s => s.id !== stageId);
    // Simulate database delete
    deleteStageFromDB(stageId);
    
    localStorage.setItem('pipeline_stages', JSON.stringify(stages));
    localStorage.setItem('pipeline_records', JSON.stringify(records));
    loadStages();
}

// Record Modal Functions
function openRecordModal(stageId) {
    currentEditingRecord = null;
    document.getElementById('recordModalTitle').textContent = 'Add Record';
    document.getElementById('recordForm').reset();
    document.getElementById('recordId').value = '';
    document.getElementById('recordStageId').value = stageId;
    const modal = document.getElementById('recordModal');
    if (modal) modal.style.display = 'flex';
}

function closeRecordModal() {
    const modal = document.getElementById('recordModal');
    if (modal) modal.style.display = 'none';
}

function editRecord(recordId) {
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    
    currentEditingRecord = record;
    document.getElementById('recordModalTitle').textContent = 'Edit Record';
    document.getElementById('recordId').value = record.id;
    document.getElementById('recordStageId').value = record.stageId;
    document.getElementById('projectName').value = record.projectName;
    document.getElementById('customerName').value = record.customerName;
    document.getElementById('priority').value = record.priority;
    document.getElementById('description').value = record.description || '';
    const modal = document.getElementById('recordModal');
    if (modal) modal.style.display = 'flex';
}

function saveRecord(event) {
    event.preventDefault();
    
    const id = document.getElementById('recordId').value;
    const stageId = parseInt(document.getElementById('recordStageId').value);
    const projectName = document.getElementById('projectName').value;
    const customerName = document.getElementById('customerName').value;
    const priority = document.getElementById('priority').value;
    const description = document.getElementById('description').value;
    
    if (id) {
        // Update existing record
        const record = records.find(r => r.id == id);
        if (record) {
            record.projectName = projectName;
            record.customerName = customerName;
            record.priority = priority;
            record.description = description;
            // Simulate database update
            updateRecordInDB(record);
        }
    } else {
        // Create new record
        const newRecord = {
            id: Date.now(),
            stageId: stageId,
            projectName: projectName,
            customerName: customerName,
            priority: priority,
            description: description,
            createdAt: new Date().toISOString()
        };
        records.push(newRecord);
        // Simulate database insert
        saveRecordInDB(newRecord);
    }
    
    localStorage.setItem('pipeline_records', JSON.stringify(records));
    closeRecordModal();
    loadStages();
}

function deleteRecord(recordId) {
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    
    if (!confirm(`Delete "${record.projectName}"?`)) return;
    
    records = records.filter(r => r.id !== recordId);
    // Simulate database delete
    deleteRecordFromDB(recordId);
    
    localStorage.setItem('pipeline_records', JSON.stringify(records));
    loadStages();
}

// View movement history
function viewMovementHistory(recordId) {
    const history = getMovementHistory(recordId);
    const record = records.find(r => r.id === recordId);
    
    if (history.length === 0) {
        alert('No movement history for this record.');
        return;
    }
    
    let historyText = `Movement History for "${record.projectName}":\n\n`;
    history.forEach(log => {
        historyText += `${new Date(log.movedAt).toLocaleString()}\n`;
        historyText += `  From: ${log.fromStageName} → To: ${log.toStageName}\n`;
        historyText += `  By: ${log.movedBy}\n\n`;
    });
    
    alert(historyText);
}

// Drag and Drop Functions
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

function drop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    
    const recordId = parseInt(event.dataTransfer.getData('recordId'));
    const newStageId = parseInt(event.currentTarget.dataset.stageId);
    
    const record = records.find(r => r.id === recordId);
    if (record && record.stageId !== newStageId) {
        const oldStageId = record.stageId;
        const oldStageName = stages.find(s => s.id === oldStageId)?.name || 'Unknown';
        const newStageName = stages.find(s => s.id === newStageId)?.name || 'Unknown';
        
        record.stageId = newStageId;
        
        // Log movement
        logMovement(recordId, record.projectName, oldStageId, oldStageName, newStageId, newStageName);
        
        // Simulate database update
        updateRecordStageInDB(recordId, oldStageId, newStageId);
        
        localStorage.setItem('pipeline_records', JSON.stringify(records));
        loadStages();
    }
    
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
}

// Stage Column Drag and Drop Functions
function stageColumnDragStart(event) {
    if (event.target.classList.contains('stage-column')) {
        draggedStage = event.target;
        event.target.style.opacity = '0.5';
        event.dataTransfer.effectAllowed = 'move';
    }
}

function stageColumnDragOver(event) {
    if (event.target.classList.contains('stage-column') && draggedStage) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        
        const container = document.getElementById('stagesContainer');
        const afterElement = getDragAfterElement(container, event.clientX);
        
        if (afterElement == null) {
            container.appendChild(draggedStage);
        } else {
            container.insertBefore(draggedStage, afterElement);
        }
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

function getDragAfterElement(container, x) {
    const draggableElements = [...container.querySelectorAll('.stage-column:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function reorderStages() {
    const container = document.getElementById('stagesContainer');
    const stageElements = [...container.querySelectorAll('.stage-column')];
    const newOrder = stageElements.map(el => parseInt(el.dataset.stageId));
    
    // Reorder stages array
    stages.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
    localStorage.setItem('pipeline_stages', JSON.stringify(stages));
    
    console.log('PATCH /api/stages/reorder', { order: newOrder });
}

// Movement Logging
function logMovement(recordId, projectName, fromStageId, fromStageName, toStageId, toStageName) {
    const movement = {
        id: Date.now(),
        recordId: recordId,
        projectName: projectName,
        fromStageId: fromStageId,
        fromStageName: fromStageName,
        toStageId: toStageId,
        toStageName: toStageName,
        movedBy: 'Admin',
        movedAt: new Date().toISOString()
    };
    
    movementLogs.push(movement);
    localStorage.setItem('pipeline_movements', JSON.stringify(movementLogs));
    
    console.log('Movement Logged:', movement);
    console.log('POST /api/projects/' + recordId + '/movements', movement);
}

// Get movement history for a record
function getMovementHistory(recordId) {
    return movementLogs.filter(log => log.recordId === recordId);
}

// Database Simulation Functions (Replace with actual API calls)
function saveStageInDB(stage) {
    console.log('POST /api/stages', stage);
    // fetch('/api/stages', { method: 'POST', body: JSON.stringify(stage) });
}

function updateStageInDB(stage) {
    console.log('PUT /api/stages/' + stage.id, stage);
    // fetch('/api/stages/' + stage.id, { method: 'PUT', body: JSON.stringify(stage) });
}

function deleteStageFromDB(stageId) {
    console.log('DELETE /api/stages/' + stageId);
    // fetch('/api/stages/' + stageId, { method: 'DELETE' });
}

function saveRecordInDB(record) {
    console.log('POST /api/records', record);
    // fetch('/api/records', { method: 'POST', body: JSON.stringify(record) });
}

function updateRecordInDB(record) {
    console.log('PUT /api/records/' + record.id, record);
    // fetch('/api/records/' + record.id, { method: 'PUT', body: JSON.stringify(record) });
}

function deleteRecordFromDB(recordId) {
    console.log('DELETE /api/records/' + recordId);
    // fetch('/api/records/' + recordId, { method: 'DELETE' });
}

function updateRecordStageInDB(recordId, oldStageId, newStageId) {
    console.log('PATCH /api/records/' + recordId + '/stage', { oldStageId, newStageId });
    // fetch('/api/records/' + recordId + '/stage', { method: 'PATCH', body: JSON.stringify({ stageId: newStageId }) });
}

// Utility Functions
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

// Close modals on outside click
window.addEventListener('click', function(event) {
    if (event.target.id === 'stageModal') {
        closeStageModal();
    }
    if (event.target.id === 'recordModal') {
        closeRecordModal();
    }
});
