// Pipeline Management Module
const PipelineManager = {
    stages: [],
    projects: [],
    currentUser: { role: 'admin' }, // admin, manager, staff
    editingStageId: null,
    deletingStageId: null,

    async init() {
        this.loadStages();
        this.loadProjects();
        this.setupEventListeners();
    },

    setupEventListeners() {
        // Listen for section changes
        document.querySelectorAll('[data-section="pipeline"]').forEach(link => {
            link.addEventListener('click', () => {
                setTimeout(() => {
                    this.loadStages();
                    this.loadProjects();
                }, 100);
            });
        });
    },

    // Load stages from API/localStorage
    async loadStages() {
        try {
            const response = await fetch('/api/stages');
            if (response.ok) {
                this.stages = await response.json();
            } else {
                throw new Error('API not available');
            }
        } catch (error) {
            const saved = localStorage.getItem('pipelineStages');
            if (saved) {
                this.stages = JSON.parse(saved);
            } else {
                // Initialize with default stages if none exist
                this.stages = this.getDefaultStages();
                localStorage.setItem('pipelineStages', JSON.stringify(this.stages));
            }
        }
        
        // Ensure we always have the default stages
        if (this.stages.length === 0) {
            this.stages = this.getDefaultStages();
            localStorage.setItem('pipelineStages', JSON.stringify(this.stages));
        }
        
        this.renderStages();
    },

    getDefaultStages() {
        const saved = localStorage.getItem('pipelineStages');
        if (saved) {
            return JSON.parse(saved);
        }
        return [
            { id: 1, name: 'Work Order Received', position: 1, description: 'Initial work order intake' },
            { id: 2, name: 'Bidding', position: 2, description: 'Preparing bid for client' },
            { id: 3, name: 'Bid Submitted to Client', position: 3, description: 'Awaiting client decision' },
            { id: 4, name: 'Approved – Ready to Schedule', position: 4, description: 'Client approved, ready for scheduling' },
            { id: 5, name: 'In Progress', position: 5, description: 'Work is being performed' },
            { id: 6, name: 'Awaiting Documentation', position: 6, description: 'Work complete, gathering documents' },
            { id: 7, name: 'Ready to Invoice', position: 7, description: 'Ready to send invoice' },
            { id: 8, name: 'Invoice Sent', position: 8, description: 'Invoice sent to client' },
            { id: 9, name: 'Paid', position: 9, description: 'Payment received' },
            { id: 10, name: 'Closed', position: 10, description: 'Project completed and closed' }
        ];
    },

    // Load projects from API/localStorage
    async loadProjects() {
        try {
            const response = await fetch('/api/projects');
            if (response.ok) {
                this.projects = await response.json();
            } else {
                throw new Error('API not available');
            }
        } catch (error) {
            // Fallback to sample projects
            this.projects = this.getSampleProjects();
        }
        this.renderStages();
    },

    getSampleProjects() {
        const saved = localStorage.getItem('pipelineProjects');
        if (saved) {
            return JSON.parse(saved);
        }
        return [
            { id: 'P001', name: 'Kitchen Renovation', customer: 'John Doe', priority: 'high', stageId: 5 },
            { id: 'P002', name: 'Bathroom Plumbing', customer: 'Jane Smith', priority: 'medium', stageId: 2 },
            { id: 'P003', name: 'Electrical Wiring', customer: 'Bob Johnson', priority: 'low', stageId: 1 },
            { id: 'P004', name: 'Roof Repair', customer: 'Alice Brown', priority: 'high', stageId: 7 }
        ];
    },

    renderStages() {
        const container = document.getElementById('pipelineStages');
        if (!container) return;

        container.innerHTML = '';
        
        this.stages.sort((a, b) => a.position - b.position).forEach(stage => {
            const stageProjects = this.projects.filter(p => p.stageId === stage.id);
            const stageEl = this.createStageElement(stage, stageProjects);
            container.appendChild(stageEl);
        });
    },

    createStageElement(stage, projects) {
        const div = document.createElement('div');
        div.className = 'pipeline-stage';
        div.dataset.stageId = stage.id;
        
        const canEdit = this.currentUser.role === 'admin';
        const canMove = ['admin', 'manager'].includes(this.currentUser.role);

        div.innerHTML = `
            <div class="stage-header ${projects.length > 0 ? 'active' : ''}">
                <div class="stage-title">
                    <i class="fas fa-grip-vertical drag-handle"></i>
                    <h3>${stage.name}</h3>
                    <span class="stage-count">${projects.length}</span>
                </div>
                ${canEdit ? `
                <div class="stage-actions">
                    <button class="stage-action-btn" onclick="PipelineManager.editStage(${stage.id})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="stage-action-btn" onclick="PipelineManager.deleteStage(${stage.id})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                ` : ''}
            </div>
            <div class="stage-body">
                <div class="stage-projects" data-stage-id="${stage.id}">
                    ${projects.map(p => this.createProjectCard(p, canMove)).join('')}
                </div>
            </div>
        `;

        // Setup drag and drop
        if (canEdit) {
            this.setupStageDragDrop(div);
        }
        if (canMove) {
            this.setupProjectDragDrop(div.querySelector('.stage-projects'));
        }

        return div;
    },

    createProjectCard(project, canMove) {
        return `
            <div class="project-card" draggable="${canMove}" data-project-id="${project.id}">
                <div class="project-card-header">
                    <span class="project-name">${project.name}</span>
                    <span class="project-id">${project.id}</span>
                </div>
                <div class="project-customer">
                    <i class="fas fa-user"></i>
                    ${project.customer}
                </div>
                <div class="project-meta">
                    <span class="project-priority ${project.priority}">${project.priority}</span>
                    <span><i class="fas fa-clock"></i> Today</span>
                </div>
            </div>
        `;
    },

    setupStageDragDrop(stageEl) {
        const header = stageEl.querySelector('.stage-header');
        
        header.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', stageEl.innerHTML);
            stageEl.classList.add('dragging');
        });

        header.addEventListener('dragend', () => {
            stageEl.classList.remove('dragging');
        });

        stageEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });

        stageEl.addEventListener('drop', (e) => {
            e.preventDefault();
            // Handle stage reordering
            this.reorderStages();
        });
    },

    setupProjectDragDrop(projectsContainer) {
        projectsContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            projectsContainer.closest('.pipeline-stage').classList.add('dragging-over');
        });

        projectsContainer.addEventListener('dragleave', (e) => {
            if (e.target === projectsContainer) {
                projectsContainer.closest('.pipeline-stage').classList.remove('dragging-over');
            }
        });

        projectsContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            projectsContainer.closest('.pipeline-stage').classList.remove('dragging-over');
            
            const projectId = e.dataTransfer.getData('projectId');
            const newStageId = parseInt(projectsContainer.dataset.stageId);
            
            if (projectId) {
                this.moveProject(projectId, newStageId);
            }
        });

        // Setup drag for each project card
        projectsContainer.querySelectorAll('.project-card').forEach(card => {
            card.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('projectId', card.dataset.projectId);
                card.classList.add('dragging');
            });

            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
            });
        });
    },

    async moveProject(projectId, newStageId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return;

        const oldStageId = project.stageId;
        const oldStage = this.stages.find(s => s.id === oldStageId);
        const newStage = this.stages.find(s => s.id === newStageId);

        // Log movement
        this.logProjectMovement(projectId, oldStage?.name, newStage?.name);

        // Update project
        project.stageId = newStageId;

        try {
            // Try to update via API
            await fetch(`/api/projects/${projectId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stageId: newStageId })
            });
        } catch (error) {
            // Save to localStorage
            localStorage.setItem('pipelineProjects', JSON.stringify(this.projects));
        }

        this.renderStages();
    },

    logProjectMovement(projectId, fromStage, toStage) {
        const log = {
            projectId,
            fromStage,
            toStage,
            user: this.currentUser.name || 'Admin',
            date: new Date().toISOString()
        };
        
        const logs = JSON.parse(localStorage.getItem('projectMovementLogs') || '[]');
        logs.push(log);
        localStorage.setItem('projectMovementLogs', JSON.stringify(logs));
        
        console.log('Project moved:', log);
    },

    showAddStageModal() {
        if (this.currentUser.role !== 'admin') {
            alert('Only administrators can add stages');
            return;
        }

        this.editingStageId = null;
        document.getElementById('stageModalTitle').textContent = 'Add Stage';
        document.getElementById('stageName').value = '';
        document.getElementById('stagePosition').value = this.stages.length + 1;
        document.getElementById('stageDescription').value = '';
        document.getElementById('stageModal').classList.add('show');
    },

    editStage(stageId) {
        const stage = this.stages.find(s => s.id === stageId);
        if (!stage) return;

        this.editingStageId = stageId;
        document.getElementById('stageModalTitle').textContent = 'Edit Stage';
        document.getElementById('stageName').value = stage.name;
        document.getElementById('stagePosition').value = stage.position;
        document.getElementById('stageDescription').value = stage.description || '';
        document.getElementById('stageModal').classList.add('show');
    },

    async saveStage() {
        const name = document.getElementById('stageName').value.trim();
        const position = parseInt(document.getElementById('stagePosition').value);
        const description = document.getElementById('stageDescription').value.trim();

        if (!name) {
            alert('Please enter a stage name');
            return;
        }

        const stageData = { name, position, description };

        try {
            if (this.editingStageId) {
                // Update existing stage
                await fetch(`/api/stages/${this.editingStageId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(stageData)
                });
                
                const stage = this.stages.find(s => s.id === this.editingStageId);
                Object.assign(stage, stageData);
            } else {
                // Create new stage
                const response = await fetch('/api/stages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(stageData)
                });
                
                const newStage = await response.json();
                this.stages.push(newStage);
            }
        } catch (error) {
            // Fallback to localStorage
            if (this.editingStageId) {
                const stage = this.stages.find(s => s.id === this.editingStageId);
                Object.assign(stage, stageData);
            } else {
                const newId = Math.max(...this.stages.map(s => s.id), 0) + 1;
                this.stages.push({ id: newId, ...stageData });
            }
            localStorage.setItem('pipelineStages', JSON.stringify(this.stages));
        }

        this.closeStageModal();
        this.renderStages();
    },

    deleteStage(stageId) {
        const stage = this.stages.find(s => s.id === stageId);
        if (!stage) return;

        const projectsInStage = this.projects.filter(p => p.stageId === stageId);
        
        this.deletingStageId = stageId;
        
        const modal = document.getElementById('deleteStageModal');
        const message = document.getElementById('deleteStageMessage');
        const reassignSection = document.getElementById('reassignSection');
        const reassignSelect = document.getElementById('reassignStage');

        if (projectsInStage.length > 0) {
            message.textContent = `This stage contains ${projectsInStage.length} project(s). Please reassign them before deleting.`;
            reassignSection.style.display = 'block';
            
            // Populate reassign dropdown
            reassignSelect.innerHTML = this.stages
                .filter(s => s.id !== stageId)
                .map(s => `<option value="${s.id}">${s.name}</option>`)
                .join('');
        } else {
            message.textContent = 'Are you sure you want to delete this stage?';
            reassignSection.style.display = 'none';
        }

        modal.classList.add('show');
    },

    async confirmDelete() {
        const stageId = this.deletingStageId;
        const projectsInStage = this.projects.filter(p => p.stageId === stageId);
        
        if (projectsInStage.length > 0) {
            const reassignStageId = parseInt(document.getElementById('reassignStage').value);
            
            // Reassign projects
            projectsInStage.forEach(project => {
                project.stageId = reassignStageId;
            });
        }

        try {
            await fetch(`/api/stages/${stageId}`, { method: 'DELETE' });
        } catch (error) {
            // Fallback to localStorage
            localStorage.setItem('pipelineProjects', JSON.stringify(this.projects));
        }

        // Remove stage
        this.stages = this.stages.filter(s => s.id !== stageId);
        localStorage.setItem('pipelineStages', JSON.stringify(this.stages));

        this.closeDeleteModal();
        this.renderStages();
    },

    async reorderStages() {
        const container = document.getElementById('pipelineStages');
        const stageElements = Array.from(container.querySelectorAll('.pipeline-stage'));
        
        stageElements.forEach((el, index) => {
            const stageId = parseInt(el.dataset.stageId);
            const stage = this.stages.find(s => s.id === stageId);
            if (stage) {
                stage.position = index + 1;
            }
        });

        try {
            await fetch('/api/stages/reorder', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.stages)
            });
        } catch (error) {
            localStorage.setItem('pipelineStages', JSON.stringify(this.stages));
        }

        this.renderStages();
    },

    closeStageModal() {
        document.getElementById('stageModal').classList.remove('show');
    },

    closeDeleteModal() {
        document.getElementById('deleteStageModal').classList.remove('show');
    }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PipelineManager.init());
} else {
    PipelineManager.init();
}
