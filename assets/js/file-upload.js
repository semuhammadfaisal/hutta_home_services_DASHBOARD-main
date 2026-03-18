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
        const files = Array.from(e.target.files);
        uploadedFiles[type] = files;
        
        preview.innerHTML = files.map((file, index) => `
            <div class="doc-item">
                <i class="fas fa-file-${getFileIcon(file.name)}"></i>
                <span>${file.name}</span>
                <i class="fas fa-times remove-doc" onclick="removeFile('${type}', ${index}, '${inputId}', '${previewId}')"></i>
            </div>
        `).join('');
    });
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (['doc', 'docx'].includes(ext)) return 'word';
    if (['jpg', 'jpeg', 'png'].includes(ext)) return 'image';
    return 'alt';
}

function removeFile(type, index, inputId, previewId) {
    uploadedFiles[type].splice(index, 1);
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    
    const dt = new DataTransfer();
    uploadedFiles[type].forEach(file => dt.items.add(file));
    input.files = dt.files;
    
    preview.innerHTML = uploadedFiles[type].map((file, i) => `
        <div class="doc-item">
            <i class="fas fa-file-${getFileIcon(file.name)}"></i>
            <span>${file.name}</span>
            <i class="fas fa-times remove-doc" onclick="removeFile('${type}', ${i}, '${inputId}', '${previewId}')"></i>
        </div>
    `).join('');
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
