const express = require('express');
const router = express.Router();
const multer = require('multer');
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

// Use memory storage for multer since we're storing in GridFS
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /pdf|doc|docx|txt|jpg|jpeg|png/;
        const extname = allowedTypes.test(file.originalname.split('.').pop().toLowerCase());
        if (extname) {
            return cb(null, true);
        }
        cb(new Error('Invalid file type'));
    }
});

let gfsBucket;
mongoose.connection.once('open', () => {
    gfsBucket = new GridFSBucket(mongoose.connection.db, {
        bucketName: 'uploads'
    });
    console.log('✅ GridFS initialized');
});

// Upload files to GridFS
router.post('/', upload.array('documents', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No files uploaded' });
        }

        const files = [];
        
        for (const file of req.files) {
            const timestamp = Date.now();
            const random = Math.round(Math.random() * 1E9);
            const ext = file.originalname.split('.').pop();
            const filename = `${timestamp}-${random}.${ext}`;
            
            const uploadStream = gfsBucket.openUploadStream(filename, {
                metadata: {
                    originalName: file.originalname,
                    mimetype: file.mimetype,
                    size: file.size,
                    uploadedAt: new Date()
                }
            });

            uploadStream.end(file.buffer);

            await new Promise((resolve, reject) => {
                uploadStream.on('finish', resolve);
                uploadStream.on('error', reject);
            });

            files.push({
                name: file.originalname,
                url: `/uploads/${filename}`,
                type: file.mimetype,
                size: file.size,
                fileId: uploadStream.id
            });
        }

        console.log('Files uploaded to GridFS:', files.length);
        res.json({ files });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ message: error.message });
    }
});

// Download file from GridFS
router.get('/download/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        console.log('Download request for:', filename);

        const files = await gfsBucket.find({ filename }).toArray();
        
        if (!files || files.length === 0) {
            console.log('File not found in GridFS:', filename);
            return res.status(404).json({ message: 'File not found' });
        }

        const file = files[0];
        
        res.set({
            'Content-Type': file.metadata.mimetype,
            'Content-Disposition': `attachment; filename="${file.metadata.originalName}"`,
            'Content-Length': file.length
        });

        const downloadStream = gfsBucket.openDownloadStreamByName(filename);
        downloadStream.pipe(res);
        
        downloadStream.on('error', (error) => {
            console.error('Download stream error:', error);
            if (!res.headersSent) {
                res.status(500).json({ message: 'Error downloading file' });
            }
        });
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ message: error.message });
    }
});

// View file from GridFS
router.get('/view/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        console.log('View request for:', filename);

        const files = await gfsBucket.find({ filename }).toArray();
        
        if (!files || files.length === 0) {
            console.log('File not found in GridFS:', filename);
            return res.status(404).json({ message: 'File not found' });
        }

        const file = files[0];
        
        res.set({
            'Content-Type': file.metadata.mimetype,
            'Content-Disposition': 'inline',
            'Content-Length': file.length
        });

        const downloadStream = gfsBucket.openDownloadStreamByName(filename);
        downloadStream.pipe(res);
        
        downloadStream.on('error', (error) => {
            console.error('View stream error:', error);
            if (!res.headersSent) {
                res.status(500).json({ message: 'Error viewing file' });
            }
        });
    } catch (error) {
        console.error('View error:', error);
        res.status(500).json({ message: error.message });
    }
});

// List all files in GridFS
router.get('/list', async (req, res) => {
    try {
        const files = await gfsBucket.find().toArray();
        res.json({
            count: files.length,
            files: files.map(f => ({
                filename: f.filename,
                originalName: f.metadata?.originalName,
                size: f.length,
                uploadedAt: f.metadata?.uploadedAt
            }))
        });
    } catch (error) {
        console.error('List error:', error);
        res.status(500).json({ message: error.message });
    }
});

// Serve file directly from GridFS (for /uploads/:filename)
router.get('/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        console.log('Direct file request for:', filename);

        const files = await gfsBucket.find({ filename }).toArray();
        
        if (!files || files.length === 0) {
            console.log('File not found in GridFS:', filename);
            return res.status(404).json({ message: 'File not found' });
        }

        const file = files[0];
        
        res.set({
            'Content-Type': file.metadata.mimetype,
            'Content-Disposition': 'inline',
            'Content-Length': file.length
        });

        const downloadStream = gfsBucket.openDownloadStreamByName(filename);
        downloadStream.pipe(res);
        
        downloadStream.on('error', (error) => {
            console.error('Stream error:', error);
            if (!res.headersSent) {
                res.status(500).json({ message: 'Error streaming file' });
            }
        });
    } catch (error) {
        console.error('File serve error:', error);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
