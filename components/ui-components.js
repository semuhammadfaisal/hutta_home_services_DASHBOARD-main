// Reusable UI Components for Hutta Home Services

class UIComponents {
    // Create a modal component
    static createModal(id, title, content, actions = []) {
        return `
            <div class="modal-overlay" id="${id}">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>${title}</h2>
                        <button class="modal-close" onclick="UIComponents.closeModal('${id}')">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        ${content}
                    </div>
                    <div class="modal-footer">
                        ${actions.map(action => `<button class="${action.class}" onclick="${action.onclick}">${action.text}</button>`).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    // Show modal
    static showModal(id) {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.add('show');
        }
    }

    // Close modal
    static closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.remove('show');
        }
    }

    // Create a notification toast
    static showToast(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <i class="fas fa-${this.getToastIcon(type)}"></i>
            <span>${message}</span>
            <button onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // Get appropriate icon for toast type
    static getToastIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    // Create a loading spinner
    static showLoading(target, show = true) {
        const element = typeof target === 'string' ? document.getElementById(target) : target;
        if (!element) return;

        if (show) {
            element.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>';
        } else {
            const spinner = element.querySelector('.loading-spinner');
            if (spinner) spinner.remove();
        }
    }
}

// Export for global use
window.UIComponents = UIComponents;