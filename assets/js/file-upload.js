// File Upload Handler
const uploadedFiles = {
    customer: [],
    vendor: [],
    employee: []
};

// Handle file selection and preview
function handleFileSelect(inputId, previewId, type) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    
    if (!input || !preview) return;
    
    input.addEventListener('change', function(e) {
        const newFiles = Array.from(e.target.files);
        
        // Add new files to the array
        newFiles.forEach(file => {
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

async function uploadFiles(files) {
    if (!files || files.length === 0) return [];
    
    const formData = new FormData();
    files.forEach(file => formData.append('documents', file));
    
    // Use dynamic URL like api-service.js
    const baseURL = window.location.hostname === 'localhost' 
        ? 'http://localhost:10000/api'
        : `${window.location.origin}/api`;
    
    try {
        const response = await fetch(`${baseURL}/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) throw new Error('Upload failed');
        
        const result = await response.json();
        return result.files || [];
    } catch (error) {
        console.error('File upload error:', error);
        return [];
    }
}

// Initialize file handlers
document.addEventListener('DOMContentLoaded', () => {
    handleFileSelect('customerDocs', 'customerDocsPreview', 'customer');
    handleFileSelect('vendorDocs', 'vendorDocsPreview', 'vendor');
    handleFileSelect('employeeDocs', 'employeeDocsPreview', 'employee');
});

window.removeFile = removeFile;
window.uploadFiles = uploadFiles;
window.uploadedFiles = uploadedFiles;
