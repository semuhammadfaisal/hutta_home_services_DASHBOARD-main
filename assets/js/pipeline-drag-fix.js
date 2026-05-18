// SIMPLE DRAG AND DROP FIX
console.log('🔧 Drag fix script loaded');

// Wait for DOM and pipeline to be ready
window.addEventListener('load', function() {
    console.log('🔧 Window loaded, waiting for pipeline...');
    
    const waitForPipeline = setInterval(() => {
        const container = document.getElementById('stagesContainer');
        if (container && typeof window.loadStages === 'function') {
            clearInterval(waitForPipeline);
            console.log('🔧 Pipeline ready, initializing drag fix');
            initDragFix();
        }
    }, 100);
});

function initDragFix() {
    // Override loadStages to setup drag after each render
    const originalLoadStages = window.loadStages;
    window.loadStages = async function() {
        await originalLoadStages();
        setTimeout(setupDragAndDrop, 200);
    };
    
    // Setup drag for current cards
    setupDragAndDrop();
}

function setupDragAndDrop() {
    console.log('🔧 Setting up drag and drop');
    
    // Setup all cards
    const cards = document.querySelectorAll('.record-card, .new-order-card');
    console.log('🔧 Found', cards.length, 'cards');
    
    cards.forEach(card => {
        card.draggable = true;
        card.style.cursor = 'grab';
        
        card.ondragstart = function(e) {
            console.log('🔧 DRAG START:', this.dataset.recordId || this.dataset.orderId);
            this.style.opacity = '0.5';
            this.style.cursor = 'grabbing';
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', ''); // Required for Firefox
            
            if (this.classList.contains('new-order-card')) {
                window.draggedOrderId = this.dataset.orderId;
                window.draggedRecordId = null;
                window.draggedIsNewOrder = true;
            } else {
                window.draggedRecordId = this.dataset.recordId;
                window.draggedOrderId = null;
                window.draggedIsNewOrder = false;
            }
        };
        
        card.ondragend = function(e) {
            console.log('🔧 DRAG END');
            this.style.opacity = '';
            this.style.cursor = 'grab';
        };
    });
    
    // Setup all drop zones
    const zones = document.querySelectorAll('.stage-body');
    console.log('🔧 Found', zones.length, 'drop zones');
    
    zones.forEach(zone => {
        zone.ondragover = function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            this.style.background = '#e3f2fd';
            return false;
        };
        
        zone.ondragleave = function(e) {
            this.style.background = '';
        };
        
        zone.ondrop = function(e) {
            e.preventDefault();
            e.stopPropagation();
            this.style.background = '';
            
            const stageId = this.dataset.stageId;
            console.log('🔧 DROPPED on stage:', stageId);
            
            if (window.draggedRecordId) {
                console.log('🔧 Moving record:', window.draggedRecordId);
                moveRecordOptimistic(window.draggedRecordId, stageId);
            } else if (window.draggedOrderId) {
                console.log('🔧 Adding order:', window.draggedOrderId);
                addOrderToPipeline(window.draggedOrderId, stageId);
            }
            
            return false;
        };
    });
}
    
async function moveRecordOptimistic(recordId, newStageId) {
    console.log('🔧 moveRecord called:', recordId, newStageId);
    
    // Find the card element
    const card = document.querySelector(`[data-record-id="${recordId}"]`);
    const oldStage = card ? card.closest('.stage-body') : null;
    const newStage = document.querySelector(`[data-stage-id="${newStageId}"]`);
    
    // Optimistic update - move card immediately in UI
    if (card && newStage) {
        newStage.appendChild(card);
        card.style.opacity = '';
    }
    
    try {
        const session = localStorage.getItem('huttaSession') || sessionStorage.getItem('huttaSession');
        if (!session) {
            console.error('❌ No session found');
            // Revert on error
            if (card && oldStage) oldStage.appendChild(card);
            alert('Session expired. Please login again.');
            return;
        }
        
        const token = JSON.parse(session).token;
        
        const response = await fetch(`/api/pipeline-records/${recordId}/stage`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ stageId: newStageId })
        });
        
        if (response.ok) {
            console.log('✅ Record moved successfully');
            // Refresh in background to sync any other changes
            if (window.loadDataFromDB) {
                window.loadDataFromDB();
            }
        } else {
            const error = await response.text();
            console.error('❌ Move failed:', response.status, error);
            // Revert on error
            if (card && oldStage) oldStage.appendChild(card);
            alert('Failed to move record: ' + error);
        }
    } catch (err) {
        console.error('❌ Move error:', err);
        // Revert on error
        if (card && oldStage) oldStage.appendChild(card);
        alert('Error moving record: ' + err.message);
    }
}

async function moveRecord(recordId, newStageId) {
    console.log('🔧 moveRecord called:', recordId, newStageId);
    try {
        const session = localStorage.getItem('huttaSession') || sessionStorage.getItem('huttaSession');
        if (!session) {
            console.error('❌ No session found');
            alert('Session expired. Please login again.');
            return;
        }
        
        const token = JSON.parse(session).token;
        console.log('🔧 Making API call...');
        
        const response = await fetch(`/api/pipeline-records/${recordId}/stage`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ stageId: newStageId })
        });
        
        console.log('🔧 API response:', response.status);
        
        if (response.ok) {
            console.log('✅ Record moved successfully');
            if (window.loadDataFromDB) {
                await window.loadDataFromDB();
            }
        } else {
            const error = await response.text();
            console.error('❌ Move failed:', response.status, error);
            alert('Failed to move record: ' + error);
        }
    } catch (err) {
        console.error('❌ Move error:', err);
        alert('Error moving record: ' + err.message);
    }
}
    
async function addOrderToPipeline(orderId, stageId) {
    console.log('🔧 addOrderToPipeline called:', orderId, stageId);
    
    try {
        const session = localStorage.getItem('huttaSession') || sessionStorage.getItem('huttaSession');
        if (!session) {
            console.error('❌ No session found');
            alert('Session expired. Please login again.');
            return;
        }
        
        const token = JSON.parse(session).token;
        console.log('🔧 Fetching order details...');
        
        const orderResponse = await fetch(`/api/orders/${orderId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!orderResponse.ok) {
            console.error('❌ Failed to fetch order');
            alert('Failed to fetch order details');
            return;
        }
        
        const order = await orderResponse.json();
        console.log('🔧 Order fetched, creating pipeline record...');
        
        const response = await fetch('/api/pipeline-records', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                stageId: stageId,
                orderId: order._id,
                orderIdDisplay: order.orderId || '',
                customerName: order.customer?.name || order.customer || 'Unknown',
                email: order.customer?.email || '',
                phone: order.customer?.phone || '',
                address: order.customer?.address || '',
                budget: order.amount || '',
                startDate: order.startDate || '',
                description: order.description || '',
                notes: order.notes || '',
                priority: order.priority || 'medium'
            })
        });
        
        console.log('🔧 API response:', response.status);
        
        if (response.ok) {
            console.log('✅ Order added to pipeline successfully');
            if (window.loadDataFromDB) {
                await window.loadDataFromDB();
            }
        } else {
            const error = await response.text();
            console.error('❌ Failed to add order:', response.status, error);
            alert('Failed to add order to pipeline: ' + error);
        }
    } catch (err) {
        console.error('❌ Add order error:', err);
        alert('Error adding order: ' + err.message);
    }
}
