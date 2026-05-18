// API Configuration
const API_BASE_URL = '/api';

function getPipelineAuthHeaders(includeJson = true) {
    const headers = {};
    if (includeJson) headers['Content-Type'] = 'application/json';
    try {
        const session = localStorage.getItem('huttaSession') || sessionStorage.getItem('huttaSession');
        if (session) {
            const token = JSON.parse(session).token;
            if (token) headers.Authorization = `Bearer ${token}`;
        }
    } catch (e) {
        console.warn('Pipeline auth header skipped:', e);
    }
    return headers;
}

async function throwIfPipelineRequestFailed(response, fallbackMessage) {
    if (response.ok) return;

    let message = fallbackMessage;
    try {
        const errorData = await response.json();
        message = errorData.message || message;
    } catch (e) {
        message = response.statusText || message;
    }
    throw new Error(message);
}
/** How many new-order cards show before clicking “Show more” */
const NEW_ORDERS_DEFAULT_VISIBLE = 2;

// Data storage
let stages = [];
let records = [];
let filteredRecords = [];
let draggedStage = null;
let draggedRecordId = null; // Store dragged record ID
let draggedOrderId = null; // Store dragged order ID
let draggedIsNewOrder = false; // Store if it's a new order
let searchQuery = '';
let newOrders = []; // Store new orders for suggestions
let employeeCache = new Map(); // Cache employee data
let orderCache = new Map(); // Cache order data
let autoScrollInterval = null; // For auto-scroll during drag

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('Pipeline MongoDB script loaded');
    
    const pipelineSection = document.getElementById('pipeline');
    if (pipelineSection && pipelineSection.classList.contains('active')) {
        console.log('Pipeline section is active, loading data...');
        loadDataFromDB();
    }
    
    // CRITICAL: Prevent default dragover on document to allow drop
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        console.log('Global dragover detected on:', e.target.className);
    }, false);
    
    // Also prevent default drop on document
    document.addEventListener('drop', (e) => {
        e.preventDefault();
        console.log('Global drop detected (prevented)');
    }, false);
});

// Load all data from MongoDB
async function loadDataFromDB() {
    try {
        console.log('Loading pipeline data from database...');
        
        // Fetch all data in parallel - NO loading overlay for speed
        const [stagesData, recordsData, ordersData, employeesData] = await Promise.all([
            fetch(`${API_BASE_URL}/stages`).then(r => r.json()),
            fetch(`${API_BASE_URL}/pipeline-records`).then(r => r.json()),
            fetchAllOrdersData(),
            fetchAllEmployeesData()
        ]);
        
        stages = stagesData;
        records = recordsData;
        filteredRecords = [...records];
        
        // Cache orders and employees
        orderCache.clear();
        employeeCache.clear();
        if (ordersData) ordersData.forEach(o => orderCache.set(o._id, o));
        if (employeesData) employeesData.forEach(e => employeeCache.set(e._id, e));
        
        // Calculate new orders from cached data
        const ordersInPipeline = records.map(r => r.orderId).filter(Boolean);
        const thirtyDaysAgo = window.TimezoneConfig
            ? new Date(window.TimezoneConfig.nowMDT().getTime() - 30 * 86400000)
            : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
        newOrders = (ordersData || []).filter(order => {
            const isNotInPipeline = !ordersInPipeline.includes(order._id);
            const isRecent = new Date(order.createdAt) > thirtyDaysAgo;
            return isNotInPipeline && isRecent;
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        console.log('Pipeline loaded:', stages.length, 'stages,', records.length, 'records');
        
        loadStages();
        loadNewOrdersSuggestions();
    } catch (error) {
        console.error('Error loading data:', error);
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

function unwrapApiListResponse(json) {
    if (!json) return [];
    if (Array.isArray(json)) return json;
    if (Array.isArray(json.data)) return json.data;
    return [];
}

// Fetch all orders data
async function fetchAllOrdersData() {
    try {
        const session = localStorage.getItem('huttaSession') || sessionStorage.getItem('huttaSession');
        if (!session) return [];
        const token = JSON.parse(session).token;
        const response = await fetch(`${API_BASE_URL}/orders?limit=5000`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return [];
        const json = await response.json();
        return unwrapApiListResponse(json);
    } catch (error) {
        console.error('Error fetching orders:', error);
        return [];
    }
}

// Fetch all employees data
async function fetchAllEmployeesData() {
    try {
        const session = localStorage.getItem('huttaSession') || sessionStorage.getItem('huttaSession');
        if (!session) return [];
        const token = JSON.parse(session).token;
        const response = await fetch(`${API_BASE_URL}/employees`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.ok ? await response.json() : [];
    } catch (error) {
        console.error('Error fetching employees:', error);
        return [];
    }
}

/** Bind once — loadStages() runs often; duplicate listeners broke stage actions */
function bindPipelineStagesContainerOnce(container) {
    if (!container || container.dataset.pipelineUiBound === '1') return;
    container.dataset.pipelineUiBound = '1';
    container.addEventListener('click', pipelineStagesContainerClick);
    // Removed event delegation for drag - using direct handlers instead
}

function pipelineStagesContainerDragStart(e) {
    const card = e.target.closest('.record-card, .new-order-card');
    if (!card) return;
    
    if (e.target.closest('button, .record-actions, .icon-btn, input, textarea, select, a')) {
        e.preventDefault();
        return;
    }
    
    if (!card.draggable) card.draggable = true;
    card.classList.add('dragging');
    
    if (card.classList.contains('new-order-card')) {
        draggedOrderId = card.dataset.orderId;
        draggedRecordId = null;
        draggedIsNewOrder = true;
    } else {
        draggedRecordId = card.dataset.recordId;
        draggedOrderId = null;
        draggedIsNewOrder = false;
    }
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'dragging');
}

function pipelineStagesContainerDragEnd(e) {
    // Clean up all drag states
    document.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
    document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
    
    // Clear drag data
    draggedRecordId = null;
    draggedOrderId = null;
    draggedIsNewOrder = false;
    
    // Reset any stuck drag operations
    if (e && e.dataTransfer) {
        e.dataTransfer.clearData();
    }
}

function pipelineStagesContainerClick(e) {
    const editStageBtn = e.target.closest('.edit-stage-btn');
    if (editStageBtn) {
        e.stopPropagation();
        editStage(editStageBtn.dataset.stageId);
        return;
    }

    const deleteStageBtn = e.target.closest('.delete-stage-btn');
    if (deleteStageBtn) {
        e.stopPropagation();
        deleteStage(deleteStageBtn.dataset.stageId);
        return;
    }

    const editBtn = e.target.closest('.record-edit-btn');
    if (editBtn) {
        e.stopPropagation();
        editRecord(editBtn.dataset.recordId);
        return;
    }

    const viewBtn = e.target.closest('.record-view-btn');
    if (viewBtn) {
        e.stopPropagation();
        const recordId = viewBtn.dataset.recordId;
        const record = records.find(r => r._id === recordId);

        if (record && record.orderId) {
            if (typeof window.showOrderDetail === 'function') {
                window.showOrderDetail(record.orderId, true);
            } else {
                console.error('showOrderDetail function not found');
                viewRecord(recordId);
            }
        } else {
            viewRecord(recordId);
        }
        return;
    }

    const deleteBtn = e.target.closest('.record-delete-btn');
    if (deleteBtn) {
        e.stopPropagation();
        deleteRecord(deleteBtn.dataset.recordId);
        return;
    }

    const descToggle = e.target.closest('.record-description-toggle');
    if (descToggle) {
        e.stopPropagation();
        e.preventDefault();
        const block = descToggle.closest('.record-description-block');
        const descEl = block?.querySelector('.record-description');
        if (!descEl) return;
        const expanded = descEl.classList.toggle('record-description--expanded');
        if (expanded) {
            descEl.classList.remove('record-description--clamped');
            descToggle.textContent = 'Read less';
            descToggle.setAttribute('aria-expanded', 'true');
        } else {
            descEl.classList.add('record-description--clamped');
            descEl.classList.remove('record-description--expanded');
            descToggle.textContent = 'Read more';
            descToggle.setAttribute('aria-expanded', 'false');
        }
        return;
    }

    const expandBtn = e.target.closest('.expand-stage-btn');
    if (expandBtn) {
        e.stopPropagation();
        expandStage(expandBtn.dataset.stageId);
        return;
    }
}

// Load and render stages
function loadStages() {
    const container = document.getElementById('stagesContainer');
    if (!container) return;

    container.innerHTML = '';

    const suggestionsColumn = createNewOrdersSuggestionColumn();
    container.appendChild(suggestionsColumn);

    for (const stage of stages) {
        container.appendChild(createStageColumn(stage));
    }

    bindPipelineStagesContainerOnce(container);

    // Ensure all cards are draggable with proper event handlers
    requestAnimationFrame(() => {
        const allCards = container.querySelectorAll('.record-card, .new-order-card');
        console.log('Setting up drag for', allCards.length, 'cards');
        allCards.forEach(card => {
            card.setAttribute('draggable', 'true');
            card.draggable = true;
            
            // Add mousedown to verify events work
            card.onmousedown = function(e) {
                if (e.target.closest('button, .record-actions, .icon-btn, input, textarea, select, a')) {
                    return; // Let buttons work normally
                }
                console.log('Mouse down on card - drag should start');
                console.log('Card draggable attribute:', this.getAttribute('draggable'));
                console.log('Card draggable property:', this.draggable);
            };
            
            // Add direct ondragstart handler
            card.ondragstart = function(e) {
                console.log('=== DRAGSTART EVENT ===');
                console.log('Target:', e.target);
                console.log('CurrentTarget:', e.currentTarget);
                console.log('Card ID:', this.dataset.recordId || this.dataset.orderId);
                
                if (e.target.closest('button, .record-actions, .icon-btn, input, textarea, select, a')) {
                    console.log('Drag prevented - clicked on button/action');
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }
                
                // Don't create drag image - it might be causing issues
                this.classList.add('dragging');
                this.style.opacity = '0.5';
                
                if (this.classList.contains('new-order-card')) {
                    draggedOrderId = this.dataset.orderId;
                    draggedRecordId = null;
                    draggedIsNewOrder = true;
                    console.log('Set draggedOrderId:', draggedOrderId);
                } else {
                    draggedRecordId = this.dataset.recordId;
                    draggedOrderId = null;
                    draggedIsNewOrder = false;
                    console.log('Set draggedRecordId:', draggedRecordId);
                }
                
                try {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', this.dataset.recordId || this.dataset.orderId);
                    console.log('DataTransfer set successfully');
                } catch (err) {
                    console.error('Error setting dataTransfer:', err);
                }
            };
            
            // Add direct ondragend handler
            card.ondragend = function(e) {
                console.log('Drag ended');
                this.classList.remove('dragging');
                this.style.opacity = '';
                document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            };
        });
        
        // Check for read more buttons
        container.querySelectorAll('.record-description-block').forEach((block) => {
            const desc = block.querySelector('.record-description');
            const btn = block.querySelector('.record-description-toggle');
            if (!desc || !btn || btn.hidden) return;
            if (desc.scrollHeight <= desc.clientHeight + 2) {
                btn.hidden = true;
            }
        });
    });

    updateStatistics();
}

// Create stage column
function createStageColumn(stage) {
    const count = records.filter(r => r.stageId === stage._id).length;
    
    const column = document.createElement('div');
    column.className = 'stage-column';
    if (stage.isNoBid) {
        column.classList.add('no-bid-stage');
        column.style.background = 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)';
        column.style.border = '2px dashed #dc2626';
    }
    column.dataset.stageId = stage._id;
    
    const stageHeader = document.createElement('div');
    stageHeader.className = 'stage-header';
    if (stage.isNoBid) {
        stageHeader.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
    }
    stageHeader.innerHTML = `
        <div class="stage-title">
            <h3 style="${stage.isNoBid ? 'color: white;' : ''}">
                ${stage.isNoBid ? '<i class="fas fa-ban" style="margin-right: 6px;"></i>' : ''}${stage.name}
            </h3>
            <div class="stage-actions">
                <button type="button" class="icon-btn expand-stage-btn" data-stage-id="${stage._id}" title="Expand Stage"><i class="fas fa-expand-alt"></i></button>
                <button type="button" class="icon-btn edit-stage-btn" data-stage-id="${stage._id}" title="Edit Stage"><i class="fas fa-edit"></i></button>
                <button type="button" class="icon-btn delete delete-stage-btn" data-stage-id="${stage._id}" title="Delete Stage"><i class="fas fa-trash"></i></button>
            </div>
        </div>
        <div class="stage-count">
            <span class="count-badge" style="${stage.isNoBid ? 'background: rgba(255,255,255,0.2); color: white;' : ''}">${count}</span>
        </div>
    `;
    
    const stageBody = document.createElement('div');
    stageBody.className = 'stage-body';
    if (stage.isNoBid) {
        stageBody.style.background = '#fef2f2';
    }
    stageBody.dataset.stageId = stage._id;
    stageBody.innerHTML = renderRecords(stage._id);
    
    stageBody.ondragover = function(e) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        this.classList.add('drag-over');
        console.log('Drag over stage:', this.dataset.stageId);
    };
    
    stageBody.ondragleave = function(e) {
        const rect = this.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX >= rect.right || e.clientY < rect.top || e.clientY >= rect.bottom) {
            this.classList.remove('drag-over');
        }
    };
    
    stageBody.ondrop = function(e) {
        console.log('Drop event triggered on stage:', this.dataset.stageId);
        e.preventDefault();
        e.stopPropagation();
        this.classList.remove('drag-over');
        drop.call(this, e);
    };
    
    column.appendChild(stageHeader);
    column.appendChild(stageBody);
    
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
        <div class="record-card" data-record-id="${record._id}">
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
            ${record.description ? renderRecordDescriptionHtml(record.description) : ''}
            <div class="record-footer">
                ${employeeName ? `<span class="record-assignee"><i class="fas fa-user-tie" aria-hidden="true"></i> ${employeeName}</span>` : ''}
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
        
        const response = await fetch(`${API_BASE_URL}/customers?limit=5000`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load customers');

        availableCustomers = unwrapApiListResponse(await response.json());
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
        const response = await fetch(`${API_BASE_URL}/orders?limit=5000`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load work orders');
        
        const allOrders = unwrapApiListResponse(await response.json());
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
                headers: getPipelineAuthHeaders(),
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
                headers: getPipelineAuthHeaders(),
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
        const response = await fetch(`${API_BASE_URL}/pipeline-records/${recordId}`, {
            method: 'DELETE',
            headers: getPipelineAuthHeaders(false)
        });
        await throwIfPipelineRequestFailed(response, 'Failed to delete pipeline record');

        if (window.APIService && window.APIService.clearCache) window.APIService.clearCache();
        await loadDataFromDB();
        if (window.showToast) {
            window.showToast(`Removed "${record.customerName}" from pipeline`, 'success');
        }
    } catch (error) {
        alert('Error deleting record: ' + error.message);
    }
}



async function drop(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const dropTarget = this;
    const newStageId = dropTarget.dataset.stageId;
    
    dropTarget.classList.remove('drag-over');
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    
    if (draggedIsNewOrder && draggedOrderId) {
        const order = newOrders.find(o => o._id === draggedOrderId);
        if (order) await createPipelineRecordFromOrder(order, newStageId);
    } else if (draggedRecordId) {
        const record = records.find(r => r._id === draggedRecordId);
        if (!record || record.stageId === newStageId) return;
        
        const oldStageId = record.stageId;
        const oldStageName = stages.find(s => s._id === oldStageId)?.name || 'Unknown';
        const newStageName = stages.find(s => s._id === newStageId)?.name || 'Unknown';
        
        try {
            // Update the pipeline record stage
            const stageUpdateResponse = await fetch(`${API_BASE_URL}/pipeline-records/${record._id}/stage`, {
                method: 'PATCH',
                headers: getPipelineAuthHeaders(),
                body: JSON.stringify({ stageId: newStageId })
            });
            
            if (!stageUpdateResponse.ok) {
                const errorText = await stageUpdateResponse.text();
                throw new Error('Failed to update pipeline record stage: ' + errorText);
            }
            
            // Auto-update linked payment record when moving to Paid/Close
            if (/^(paid|close|closed|complete|completed|won|done)$/i.test(newStageName.trim()) && record.orderId) {
                try {
                    const session = localStorage.getItem('huttaSession') || sessionStorage.getItem('huttaSession');
                    if (session) {
                        const token = JSON.parse(session).token;
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
                                if (window.APIService && window.APIService.clearCache) window.APIService.clearCache();
                                if (typeof refreshPayments === 'function') refreshPayments();
                            }
                        }
                    }
                } catch (payErr) {
                    console.warn('Failed to auto-update payment:', payErr);
                }
            }
            
            try {
                await fetch(`${API_BASE_URL}/pipeline-movements`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        recordId: record._id,
                        customerName: record.customerName,
                        fromStageId: oldStageId,
                        fromStageName: oldStageName,
                        toStageId: newStageId,
                        toStageName: newStageName,
                        movedBy: 'Admin'
                    })
                });
            } catch (movementError) {
                console.warn('Failed to log pipeline movement:', movementError);
            }
            
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

// Statistics
function updateStatistics() {
    const totalStagesEl = document.getElementById('totalStages');
    const totalRecordsEl = document.getElementById('totalRecords');
    
    if (totalStagesEl) totalStagesEl.textContent = stages.length;
    if (totalRecordsEl) totalRecordsEl.textContent = records.length;
    
    const count = newOrders.length;
    const newOrdersCountEl = document.getElementById('newOrdersCount');
    if (newOrdersCountEl) newOrdersCountEl.textContent = count;
    document.querySelectorAll('.pipeline-new-orders-badge').forEach((el) => {
        el.textContent = count;
    });
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
            const response = await fetch(`${API_BASE_URL}/pipeline-records/${record._id}`, {
                method: 'DELETE',
                headers: getPipelineAuthHeaders(false)
            });
            await throwIfPipelineRequestFailed(response, 'Failed to delete pipeline record');
        }
        for (const stage of stages) {
            const response = await fetch(`${API_BASE_URL}/stages/${stage._id}`, {
                method: 'DELETE',
                headers: getPipelineAuthHeaders(false)
            });
            await throwIfPipelineRequestFailed(response, 'Failed to delete stage');
        }
        
        if (window.APIService && window.APIService.clearCache) window.APIService.clearCache();
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

function escapeHtml(unsafe) {
    if (unsafe == null || unsafe === '') return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderRecordDescriptionHtml(description) {
    const raw = String(description ?? '').trim();
    if (!raw) return '';
    const safe = escapeHtml(raw);
    return `
        <div class="record-description-block">
            <div class="record-description record-description--clamped">${safe}</div>
            <button type="button" class="record-description-toggle" aria-expanded="false">Read more</button>
        </div>`;
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
                                            <span>Start: ${window.TimezoneConfig ? window.TimezoneConfig.formatDateShortMDT(record.startDate) : new Date(record.startDate).toLocaleDateString('en-US', { timeZone: 'America/Denver' })}</span>
                                        </div>
                                    ` : ''}
                                    
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <i class="fas fa-clock" style="width: 16px; color: #6b7280;"></i>
                                        <span>Created: ${window.TimezoneConfig ? window.TimezoneConfig.formatDateShortMDT(record.createdAt) : new Date(record.createdAt).toLocaleDateString('en-US', { timeZone: 'America/Denver' })}</span>
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
    
    const header = document.createElement('div');
    header.className = 'stage-header new-orders-column-header';
    header.innerHTML = `
        <div class="stage-title">
            <h3 class="new-orders-column-title">
                <i class="fas fa-plus-circle" aria-hidden="true"></i>
                New orders
            </h3>
        </div>
        <div class="stage-count">
            <span class="count-badge pipeline-new-orders-badge">${newOrders.length}</span>
        </div>
    `;
    
    const body = document.createElement('div');
    body.className = 'stage-body new-orders-column-body';
    body.innerHTML = renderNewOrders();
    
    column.appendChild(header);
    column.appendChild(body);
    
    return column;
}

function renderNewOrders() {
    if (newOrders.length === 0) {
        return `
            <div class="pipeline-new-orders-empty" role="status">
                <i class="fas fa-check-circle" aria-hidden="true"></i>
                <div class="pipeline-new-orders-empty-title">All caught up</div>
                <div class="pipeline-new-orders-empty-hint">No new orders to add to the pipeline.</div>
            </div>
        `;
    }
    
    const visible = newOrders.slice(0, NEW_ORDERS_DEFAULT_VISIBLE);
    const remainingCount = newOrders.length - visible.length;

    let html = visible.map((order) => renderOrderCard(order)).join('');

    if (remainingCount > 0) {
        html += `
            <button type="button" class="expand-new-orders-btn pipeline-expand-new-orders" onclick="expandNewOrders()">
                <i class="fas fa-chevron-down" aria-hidden="true"></i>
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
        requestAnimationFrame(() => {
            container.querySelectorAll('.new-order-card').forEach(card => {
                card.setAttribute('draggable', 'true');
                card.draggable = true;
                
                card.ondragstart = function(e) {
                    if (e.target.closest('button')) {
                        e.preventDefault();
                        return false;
                    }
                    this.classList.add('dragging');
                    draggedOrderId = this.dataset.orderId;
                    draggedRecordId = null;
                    draggedIsNewOrder = true;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', 'dragging');
                };
                
                card.ondragend = function(e) {
                    this.classList.remove('dragging');
                    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
                };
            });
        });
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
            headers: getPipelineAuthHeaders(),
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
        <div class="new-order-card" data-order-id="${order._id}">
            <div class="new-order-card-grip" aria-hidden="true">
                <i class="fas fa-grip-vertical"></i>
            </div>
            <div class="new-order-card-head">
                <div class="new-order-card-title">${customerName}</div>
                <div class="new-order-card-id">${order.orderId || '#' + order._id.substring(0, 8).toUpperCase()}</div>
            </div>
            <div class="new-order-card-meta">
                <div class="new-order-card-row">
                    <i class="fas fa-wrench" aria-hidden="true"></i>
                    <span>${order.service || 'Service not specified'}</span>
                </div>
                ${order.customer?.email ? `
                    <div class="new-order-card-row">
                        <i class="fas fa-envelope" aria-hidden="true"></i>
                        <span>${order.customer.email}</span>
                    </div>
                ` : ''}
                ${amount ? `
                    <div class="new-order-card-row new-order-card-amount-row">
                        <i class="fas fa-dollar-sign" aria-hidden="true"></i>
                        <span class="new-order-card-amount">${amount}</span>
                    </div>
                ` : ''}
            </div>
            <div class="new-order-card-foot">
                <span class="priority-badge priority-${priority}">${priority}</span>
                <span class="new-order-card-time">${timeAgo}</span>
            </div>
            <div class="new-order-card-hint">Drag to a stage</div>
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
        <button type="button" class="pipeline-collapse-new-orders" onclick="collapseNewOrders()">
            <i class="fas fa-chevron-up" aria-hidden="true"></i>
            Show less
        </button>
    `;
    
    container.innerHTML = allOrdersHtml + collapseBtn;
    
    requestAnimationFrame(() => {
        container.querySelectorAll('.new-order-card').forEach(card => {
            card.setAttribute('draggable', 'true');
            card.draggable = true;
            
            card.ondragstart = function(e) {
                if (e.target.closest('button')) {
                    e.preventDefault();
                    return false;
                }
                this.classList.add('dragging');
                draggedOrderId = this.dataset.orderId;
                draggedRecordId = null;
                draggedIsNewOrder = true;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', 'dragging');
            };
            
            card.ondragend = function(e) {
                this.classList.remove('dragging');
                document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            };
        });
    });
}

// Collapse new orders to show only first
function collapseNewOrders() {
    const container = document.querySelector('.new-orders-column .stage-body');
    if (!container) return;
    
    container.innerHTML = renderNewOrders();
    
    requestAnimationFrame(() => {
        container.querySelectorAll('.new-order-card').forEach(card => {
            card.setAttribute('draggable', 'true');
            card.draggable = true;
            
            card.ondragstart = function(e) {
                if (e.target.closest('button')) {
                    e.preventDefault();
                    return false;
                }
                this.classList.add('dragging');
                draggedOrderId = this.dataset.orderId;
                draggedRecordId = null;
                draggedIsNewOrder = true;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', 'dragging');
            };
            
            card.ondragend = function(e) {
                this.classList.remove('dragging');
                document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            };
        });
    });
}

// Add hover effects for new order cards (styles live in pipeline.css)
window.loadNewOrdersSuggestions = loadNewOrdersSuggestions;
window.expandNewOrders = expandNewOrders;
window.collapseNewOrders = collapseNewOrders;

// Stage Management Functions
function openStageModal() {
    const modal = document.getElementById('stageModal');
    if (!modal) return;
    
    document.getElementById('stageModalTitle').textContent = 'Add Stage';
    document.getElementById('stageForm').reset();
    document.getElementById('stageId').value = '';
    const isNoBidCheckbox = document.getElementById('stageIsNoBid');
    if (isNoBidCheckbox) isNoBidCheckbox.checked = false;
    modal.classList.add('show');
}

function closeStageModal() {
    const modal = document.getElementById('stageModal');
    if (modal) modal.classList.remove('show');
}

async function saveStage(event) {
    if (event) event.preventDefault();
    
    const id = document.getElementById('stageId').value;
    const name = document.getElementById('stageName').value.trim();
    const isNoBid = document.getElementById('stageIsNoBid')?.checked || false;
    
    if (!name) {
        alert('Stage name is required');
        return;
    }
    
    try {
        const url = id ? `${API_BASE_URL}/stages/${id}` : `${API_BASE_URL}/stages`;
        const method = id ? 'PUT' : 'POST';
        
        // Calculate position for new stages (add to end)
        const position = id ? undefined : stages.length + 1;
        
        const body = { name, isNoBid };
        if (position !== undefined) body.position = position;
        
        const response = await fetch(url, {
            method,
            headers: getPipelineAuthHeaders(),
            body: JSON.stringify(body)
        });
        
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

function editStage(stageId) {
    const stage = stages.find(s => s._id === stageId);
    if (!stage) return;
    
    document.getElementById('stageModalTitle').textContent = 'Edit Stage';
    document.getElementById('stageId').value = stage._id;
    document.getElementById('stageName').value = stage.name;
    const isNoBidCheckbox = document.getElementById('stageIsNoBid');
    if (isNoBidCheckbox) isNoBidCheckbox.checked = stage.isNoBid || false;
    document.getElementById('stageModal').classList.add('show');
}

async function deleteStage(stageId) {
    const stage = stages.find(s => s._id === stageId);
    if (!stage) return;
    
    const recordCount = records.filter(r => r.stageId === stageId).length;
    if (recordCount > 0) {
        alert(`Cannot delete stage "${stage.name}" because it contains ${recordCount} record(s). Please move or delete the records first.`);
        return;
    }
    
    if (!confirm(`Delete stage "${stage.name}"?`)) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/stages/${stageId}`, {
            method: 'DELETE',
            headers: getPipelineAuthHeaders(false)
        });

        await throwIfPipelineRequestFailed(response, 'Failed to delete stage');

        if (window.APIService && window.APIService.clearCache) window.APIService.clearCache();
        await loadDataFromDB();
        if (window.showToast) {
            window.showToast(`Stage "${stage.name}" deleted`, 'success');
        }
    } catch (error) {
        alert('Error deleting stage: ' + error.message);
    }
}

window.openStageModal = openStageModal;
window.closeStageModal = closeStageModal;
window.saveStage = saveStage;
window.editStage = editStage;
window.deleteStage = deleteStage;
window.clearPipelineData = clearPipelineData;
window.openRecordModal = openRecordModal;
window.closeRecordModal = closeRecordModal;

