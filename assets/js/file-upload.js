// File Upload Handler
const uploadedFiles = {
    customer: [],
    vendor: [],
    employee: [],
    order: []
};
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_UPLOAD_LABEL = '50MB';
const MAX_UPLOAD_REASON = 'secure attachment limit';

// Handle file selection and preview
function handleFileSelect(inputId, previewId, type) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    
    if (!input || !preview) return;
    
    input.addEventListener('change', function(e) {
        const newFiles = Array.from(e.target.files);
        
        // Add new files to the array
        newFiles.forEach(file => {
            if (file.size > MAX_UPLOAD_BYTES) {
                if (typeof showToast === 'function') {
                    showToast(`${file.name} is too large. Maximum file size is ${MAX_UPLOAD_LABEL} (${MAX_UPLOAD_REASON}).`, 'error');
                }
                return;
            }

            // Check if file already exists (by name and size)
            const exists = uploadedFiles[type].some(f => 
                f.name === file.name && f.size === file.size
            );
            if (!exists) {
                uploadedFiles[type].push(file);
            }
        });
        
        // Update preview
        updatePreview(type, previewId);
        
        // Clear input so same file can be selected again
        input.value = '';
    });
}

function updatePreview(type, previewId) {
    const preview = document.getElementById(previewId);
    if (!preview) return;

    const existingSources = {
        customer: window.existingCustomerDocs,
        vendor: window.currentVendorDocuments,
        employee: window.currentEmployeeDocuments,
        order: window.existingOrderDocs
    };
    const removeHandlers = {
        customer: 'removeExistingCustomerDoc',
        vendor: 'removeExistingVendorDoc',
        employee: 'removeExistingEmployeeDoc',
        order: 'removeExistingOrderDoc'
    };
    const existing = (Array.isArray(existingSources[type]) ? existingSources[type] : [])
        .map((document, index) => ({ document, index }))
        .filter(({ document }) => document.status !== 'archived')
        .filter(({ document }) => type !== 'vendor' || !document.complianceDocumentType);
    const escape = (value) => String(value || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    const existingHtml = existing.map(({ document, index }) => `
        <div class="doc-item existing-doc-item" data-doc-index="${index}">
            <i class="fas fa-file-${getFileIcon(document.name || '')}"></i>
            <span>${escape(document.name || 'Document')}</span>
            <i class="fas fa-archive remove-doc" title="Archive (file is retained)" onclick="${removeHandlers[type]}(${index})"></i>
        </div>
    `).join('');
    const pendingHtml = uploadedFiles[type].map((file, index) => `
        <div class="doc-item">
            <i class="fas fa-file-${getFileIcon(file.name)}"></i>
            <span>${escape(file.name)} <small>(new)</small></span>
            <i class="fas fa-times remove-doc" onclick="removeFile('${type}', ${index}, '${previewId}')"></i>
        </div>
    `).join('');

    preview.innerHTML = existingHtml + pendingHtml;
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (['doc', 'docx'].includes(ext)) return 'word';
    if (['jpg', 'jpeg', 'png'].includes(ext)) return 'image';
    return 'alt';
}

function removeFile(type, index, previewId) {
    uploadedFiles[type].splice(index, 1);
    updatePreview(type, previewId);
}

async function uploadFiles(files, onProgress = null) {
    if (!files || files.length === 0) return [];

    const oversizedFile = files.find(file => file.size > MAX_UPLOAD_BYTES);
    if (oversizedFile) {
        throw new Error(`${oversizedFile.name} is too large. Maximum file size is ${MAX_UPLOAD_LABEL} (${MAX_UPLOAD_REASON}).`);
    }
    
    const formData = new FormData();
    files.forEach(file => formData.append('documents', file));
    
    // Use dynamic URL like api-service.js
    const baseURL = window.location.hostname === 'localhost' 
        ? 'http://localhost:10000/api'
        : `${window.location.origin}/api`;
    
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
            if (!event.lengthComputable || typeof onProgress !== 'function') return;
            const percent = Math.round((event.loaded / event.total) * 100);
            onProgress(Math.min(percent, 100), event.loaded, event.total);
        });

        xhr.addEventListener('load', () => {
            let result = {};
            try {
                result = xhr.responseText ? JSON.parse(xhr.responseText) : {};
            } catch (error) {
                reject(new Error('Upload failed: server returned an invalid response.'));
                return;
            }

            if (xhr.status < 200 || xhr.status >= 300) {
                reject(new Error(result.message || `Upload failed (${xhr.status})`));
                return;
            }

            if (typeof onProgress === 'function') {
                onProgress(100, null, null);
            }
            resolve(result.files || []);
        });

        xhr.addEventListener('error', () => reject(new Error('Network error while uploading files.')));
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled.')));
        xhr.open('POST', `${baseURL}/upload`);
        xhr.withCredentials = true;
        if (window.AuthSession?.csrfToken) xhr.setRequestHeader('X-CSRF-Token', window.AuthSession.csrfToken);
        xhr.setRequestHeader('X-Session-Activity', 'active');
        xhr.send(formData);
    }).catch(error => {
        console.error('File upload error:', error);
        throw error;
    });
}

function attachmentBaseUrl() {
    return window.location.hostname === 'localhost'
        ? 'http://localhost:10000/api/attachments'
        : `${window.location.origin}/api/attachments`;
}

async function uploadEntityAttachments(entityType, entityId, files, metadata = {}, onProgress = null) {
    if (!entityId || !files?.length) return { files: [], documents: [] };
    const formData = new FormData();
    files.forEach((file) => formData.append('documents', file));
    Object.entries(metadata).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') formData.append(key, value);
    });

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable && typeof onProgress === 'function') {
                onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
            }
        });
        xhr.addEventListener('load', () => {
            let payload = {};
            try { payload = JSON.parse(xhr.responseText || '{}'); } catch (_error) { /* handled below */ }
            if (xhr.status < 200 || xhr.status >= 300) return reject(new Error(payload.message || `Upload failed (${xhr.status})`));
            resolve(payload);
        });
        xhr.addEventListener('error', () => reject(new Error('Network error while uploading attachments')));
        xhr.open('POST', `${attachmentBaseUrl()}/${entityType}/${entityId}`);
        xhr.withCredentials = true;
        if (window.AuthSession?.csrfToken) xhr.setRequestHeader('X-CSRF-Token', window.AuthSession.csrfToken);
        xhr.setRequestHeader('X-Session-Activity', 'active');
        xhr.send(formData);
    });
}

async function attachmentRequest(entityType, entityId, suffix = '', options = {}) {
    const response = await fetch(`${attachmentBaseUrl()}/${entityType}/${entityId}${suffix}`, {
        ...options,
        headers: {
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(!['GET', 'HEAD'].includes(String(options.method || 'GET').toUpperCase()) && window.AuthSession?.csrfToken
                ? { 'X-CSRF-Token': window.AuthSession.csrfToken }
                : {}),
            ...(options.headers || {})
        }
    });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.blob();
    if (!response.ok) throw new Error(payload?.message || `Attachment request failed (${response.status})`);
    return payload;
}

async function archiveEntityAttachment(entityType, entityId, documentId, reason = 'Archived by user') {
    return attachmentRequest(entityType, entityId, `/${documentId}/archive`, {
        method: 'PATCH',
        body: JSON.stringify({ reason })
    });
}

async function restoreEntityAttachment(entityType, entityId, documentId) {
    return attachmentRequest(entityType, entityId, `/${documentId}/restore`, {
        method: 'PATCH',
        body: JSON.stringify({})
    });
}

async function openEntityAttachment(entityType, entityId, attachment, download = false) {
    const previewWindow = download ? null : window.open('', '_blank');
    const suffix = attachment.documentId
        ? `/${attachment.documentId}${download ? '/download' : ''}`
        : null;
    const url = suffix
        ? `${attachmentBaseUrl()}/${entityType}/${entityId}${suffix}`
        : new URL(attachment.url, window.location.origin).href;
    let response;
    try {
        response = await fetch(url);
    } catch (error) {
        previewWindow?.close();
        throw error;
    }
    if (!response.ok) {
        let message = `File is unavailable (${response.status})`;
        try {
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                message = (await response.json()).message || message;
            } else {
                const text = await response.text();
                if (text) message = text;
            }
        } catch (_error) { /* keep fallback */ }
        previewWindow?.close();
        const error = new Error(message);
        error.status = response.status;
        error.attachmentUnavailable = response.status === 404;
        throw error;
    }
    const blobUrl = URL.createObjectURL(await response.blob());
    if (download) {
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = attachment.name || 'document';
        document.body.appendChild(link);
        link.click();
        link.remove();
    } else {
        if (previewWindow) {
            previewWindow.opener = null;
            previewWindow.location.href = blobUrl;
        } else {
            throw new Error('The browser blocked the document preview window');
        }
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}

function markAttachmentUnavailable(row, item, message) {
    item.unavailable = true;
    item.unavailableReason = message || 'Stored file is unavailable';
    row.classList.add('document-unavailable');
    row.querySelectorAll('[data-attachment-open-action="true"]').forEach((button) => {
        button.disabled = true;
        button.title = item.unavailableReason;
        button.setAttribute('aria-label', item.unavailableReason);
    });
    const meta = row.querySelector('.document-meta');
    if (meta && !meta.dataset.unavailableMarked) {
        meta.dataset.unavailableMarked = 'true';
        meta.textContent = `${meta.textContent} • Unavailable`;
    }
}

function renderAttachmentList(container, documents = [], context = {}) {
    if (!container) return;
    container.replaceChildren();
    const all = Array.isArray(documents) ? documents : [];
    const active = all.filter((item) => item.status !== 'archived');
    const archived = all.filter((item) => item.status === 'archived');

    const renderRows = (items, parent, archivedRows = false) => {
        items.forEach((item) => {
            const row = document.createElement('div');
            row.className = `document-item${archivedRows ? ' document-archived' : ''}${item.unavailable ? ' document-unavailable' : ''}`;
            const info = document.createElement('div');
            info.className = 'document-info';
            const icon = document.createElement('div');
            icon.className = 'document-icon';
            const iconElement = document.createElement('i');
            iconElement.className = `fas fa-file-${getFileIcon(item.name || '')}`;
            icon.appendChild(iconElement);
            const details = document.createElement('div');
            details.className = 'document-details';
            const name = document.createElement('div');
            name.className = 'document-name';
            name.textContent = item.name || 'Unnamed document';
            const meta = document.createElement('div');
            meta.className = 'document-meta';
            const size = Number(item.size || 0);
            meta.textContent = `${size ? `${Math.round(size / 1024)} KB` : 'Size unavailable'} • ${item.uploadedAt ? new Date(item.uploadedAt).toLocaleDateString() : 'Date unavailable'}${item.unavailable ? ' • Unavailable' : ''}`;
            if (item.unavailable) meta.dataset.unavailableMarked = 'true';
            details.append(name, meta);
            info.append(icon, details);
            const actions = document.createElement('div');
            actions.className = 'document-actions';
            const addAction = (label, iconClass, handler, options = {}) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'btn-icon';
                button.title = label;
                button.setAttribute('aria-label', label);
                if (options.openAction) button.dataset.attachmentOpenAction = 'true';
                if (item.unavailable && options.openAction) {
                    button.disabled = true;
                    button.title = item.unavailableReason || 'Stored file is unavailable';
                    button.setAttribute('aria-label', button.title);
                }
                const actionIcon = document.createElement('i');
                actionIcon.className = `fas ${iconClass}`;
                button.appendChild(actionIcon);
                button.addEventListener('click', async () => {
                    button.disabled = true;
                    try {
                        await handler();
                    } catch (error) {
                        if (error.attachmentUnavailable && options.openAction) {
                            markAttachmentUnavailable(row, item, error.message);
                        }
                        window.showToast?.(error.message, 'error');
                    } finally {
                        if (!item.unavailable || !options.openAction) button.disabled = false;
                    }
                });
                actions.appendChild(button);
            };
            addAction('View', 'fa-eye', () => openEntityAttachment(context.entityType, context.entityId, item, false), { openAction: true });
            addAction('Download', 'fa-download', () => openEntityAttachment(context.entityType, context.entityId, item, true), { openAction: true });
            if (item.documentId && context.allowArchive !== false) {
                addAction(archivedRows ? 'Restore' : 'Archive', archivedRows ? 'fa-undo' : 'fa-archive', async () => {
                    if (!archivedRows && !confirm('Archive this attachment? The stored file will be retained and can be restored.')) return;
                    if (archivedRows) await restoreEntityAttachment(context.entityType, context.entityId, item.documentId);
                    else await archiveEntityAttachment(context.entityType, context.entityId, item.documentId);
                    window.APIService?.clearCache?.();
                    await context.onChanged?.();
                });
            }
            row.append(info, actions);
            parent.appendChild(row);
        });
    };

    if (active.length) renderRows(active, container);
    else {
        const empty = document.createElement('p');
        empty.className = 'no-documents';
        empty.textContent = 'No active documents';
        container.appendChild(empty);
    }
    if (archived.length) {
        const section = document.createElement('details');
        section.className = 'archived-documents';
        const summary = document.createElement('summary');
        summary.textContent = `Archived documents (${archived.length})`;
        const rows = document.createElement('div');
        rows.className = 'archived-documents-list';
        renderRows(archived, rows, true);
        section.append(summary, rows);
        container.appendChild(section);
    }
}

// Initialize file handlers
document.addEventListener('DOMContentLoaded', () => {
    handleFileSelect('customerDocs', 'customerDocsPreview', 'customer');
    handleFileSelect('vendorDocs', 'vendorDocsPreview', 'vendor');
    handleFileSelect('employeeDocs', 'employeeDocsPreview', 'employee');
    handleFileSelect('orderDocs', 'orderDocsPreview', 'order');
});

window.removeFile = removeFile;
window.uploadFiles = uploadFiles;
window.uploadEntityAttachments = uploadEntityAttachments;
window.archiveEntityAttachment = archiveEntityAttachment;
window.restoreEntityAttachment = restoreEntityAttachment;
window.openEntityAttachment = openEntityAttachment;
window.renderAttachmentList = renderAttachmentList;
window.uploadedFiles = uploadedFiles;
window.updateDocumentPreview = updatePreview;
window.MAX_UPLOAD_BYTES = MAX_UPLOAD_BYTES;
window.MAX_UPLOAD_LABEL = MAX_UPLOAD_LABEL;
window.MAX_UPLOAD_REASON = MAX_UPLOAD_REASON;
