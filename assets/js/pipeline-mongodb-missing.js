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
