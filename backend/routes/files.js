const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../uploads');

// Test endpoint - list all files
router.get('/list', (req, res) => {
    console.log('Listing files in uploads directory');
    try {
        if (!fs.existsSync(uploadDir)) {
            return res.json({ message: 'Uploads directory does not exist', files: [] });
        }
        
        const files = fs.readdirSync(uploadDir);
        console.log('Files found:', files);
        res.json({ uploadDir, files, count: files.length });
    } catch (error) {
        console.error('List error:', error);
        res.status(500).json({ message: error.message });
    }
});

// Test endpoint
router.get('/test', (req, res) => {
    console.log('Files route test endpoint hit');
    res.json({ message: 'Files route is working', uploadDir });
});

// Download file
router.get('/download/:filename', (req, res) => {
    console.log('Download request for:', req.params.filename);
    try {
        const filename = req.params.filename;
        const filePath = path.join(uploadDir, filename);
        
        console.log('Looking for file at:', filePath);
        console.log('File exists:', fs.existsSync(filePath));
        
        if (!fs.existsSync(filePath)) {
            console.log('File not found:', filePath);
            return res.status(404).json({ message: 'File not found' });
        }
        
        console.log('Sending file for download:', filename);
        res.download(filePath, (err) => {
            if (err) {
                console.error('Download error:', err);
                if (!res.headersSent) {
                    res.status(500).json({ message: 'Error downloading file' });
                }
            }
        });
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ message: error.message });
    }
});

// View file (inline)
router.get('/view/:filename', (req, res) => {
    console.log('View request for:', req.params.filename);
    try {
        const filename = req.params.filename;
        const filePath = path.join(uploadDir, filename);
        
        console.log('Looking for file at:', filePath);
        console.log('File exists:', fs.existsSync(filePath));
        
        if (!fs.existsSync(filePath)) {
            console.log('File not found:', filePath);
            return res.status(404).json({ message: 'File not found' });
        }
        
        const ext = path.extname(filename).toLowerCase();
        const mimeTypes = {
            '.pdf': 'application/pdf',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.txt': 'text/plain'
        };
        
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        console.log('Setting content type:', contentType);
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', 'inline');
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.on('error', (err) => {
            console.error('Stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({ message: 'Error reading file' });
            }
        });
        
        console.log('Streaming file:', filename);
        fileStream.pipe(res);
    } catch (error) {
        console.error('View error:', error);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
