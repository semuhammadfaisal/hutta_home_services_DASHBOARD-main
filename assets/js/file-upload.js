// File Upload Handler
const uploadedFiles = {
    customer: [],
    vendor: [],
    employee: [],
    order: []
};
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_LABEL = '10MB';
const MAX_UPLOAD_REASON = 'Cloudinary free plan limit';

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
    
    preview.innerHTML = uploadedFiles[type].map((file, index) => `
        <div class="doc-item">
            <i class="fas fa-file-${getFileIcon(file.name)}"></i>
            <span>${file.name}</span>
            <i class="fas fa-times remove-doc" onclick="removeFile('${type}', ${index}, '${previewId}')"></i>
        </div>
    `).join('');
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
        xhr.send(formData);
    }).catch(error => {
        console.error('File upload error:', error);
        throw error;
    });
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
window.uploadedFiles = uploadedFiles;
window.MAX_UPLOAD_BYTES = MAX_UPLOAD_BYTES;
window.MAX_UPLOAD_LABEL = MAX_UPLOAD_LABEL;
window.MAX_UPLOAD_REASON = MAX_UPLOAD_REASON;
