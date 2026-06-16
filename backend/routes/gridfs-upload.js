const express = require('express');
const router = express.Router();
const multer = require('multer');
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const MAX_UPLOAD_BYTES = parseInt(process.env.CLOUDINARY_MAX_UPLOAD_BYTES || `${10 * 1024 * 1024}`, 10);
const MAX_UPLOAD_LABEL = `${Math.round((MAX_UPLOAD_BYTES / 1024 / 1024) * 100) / 100}MB`;

function uploadBufferToGridFs(file) {
    return new Promise((resolve, reject) => {
        const bucket = initGridFsBucket();
        if (!bucket) return reject(new Error('File storage is not ready'));

        const safeName = file.originalname.replace(/\s+/g, '_');
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2,8)}-${safeName}`;

        const uploadStream = bucket.openUploadStream(filename, {
            metadata: {
                originalName: file.originalname,
                mimetype: file.mimetype,
                size: file.size,
                uploadedAt: new Date()
            }
        });

        uploadStream.on('finish', () => {
            resolve({
                name: file.originalname,
                url: `/uploads/${uploadStream.filename}`,
                type: file.mimetype,
                size: file.size,
                uploadedAt: new Date(),
                storageProvider: 'gridfs',
                fileId: uploadStream.id
            });
        });

        uploadStream.on('error', (err) => reject(err));

        // Write buffer and end after handlers attached
        uploadStream.end(file.buffer);
    });
}

// Use memory storage for multer since we're storing in GridFS
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: MAX_UPLOAD_BYTES },
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

function initGridFsBucket() {
    if (!gfsBucket && mongoose.connection.readyState === 1 && mongoose.connection.db) {
        gfsBucket = new GridFSBucket(mongoose.connection.db, {
            bucketName: 'uploads'
        });
        console.log(' GridFS initialized');
    }
    return gfsBucket;
}

mongoose.connection.once('open', () => {
    initGridFsBucket();
});

mongoose.connection.on('reconnected', () => {
    gfsBucket = null;
    initGridFsBucket();
});

/*
 * If this route is loaded after Mongoose is already connected, the "open"
 * event has already fired. Initialize immediately in that case.
 */
if (mongoose.connection.readyState === 1) {
    initGridFsBucket();
}

const uploadDocuments = upload.array('documents', 10);

function handleUploadDocuments(req, res, next) {
    uploadDocuments(req, res, (error) => {
        if (!error) return next();
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ message: `File too large. Maximum file size is ${MAX_UPLOAD_LABEL}.` });
        }
        return res.status(400).json({ message: error.message || 'Upload failed' });
    });
}

// Upload new files to Cloudinary. Existing GridFS read routes below stay untouched
// so older /uploads/... document links continue to work.
router.post('/', handleUploadDocuments, async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No files uploaded' });
        }

        const files = [];
        for (const file of req.files) {
            files.push(await uploadBufferToGridFs(file));
        }

        console.log('Files uploaded to GridFS:', files.length);
        res.json({ files });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(error.statusCode || 500).json({ message: error.message });
    }
});

// Download file from GridFS
router.get('/download/:filename', async (req, res) => {
    try {
        const bucket = initGridFsBucket();
        if (!bucket) {
            return res.status(503).json({ message: 'File storage is not ready. Please try again in a moment.' });
        }

        const filename = req.params.filename;
        console.log('Download request for:', filename);

        const files = await bucket.find({ filename }).toArray();
        
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

        const downloadStream = bucket.openDownloadStreamByName(filename);
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
        const bucket = initGridFsBucket();
        if (!bucket) {
            return res.status(503).json({ message: 'File storage is not ready. Please try again in a moment.' });
        }

        const filename = req.params.filename;
        console.log('View request for:', filename);

        const files = await bucket.find({ filename }).toArray();
        
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

        const downloadStream = bucket.openDownloadStreamByName(filename);
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
        const bucket = initGridFsBucket();
        if (!bucket) {
            return res.status(503).json({ message: 'File storage is not ready. Please try again in a moment.' });
        }

        const files = await bucket.find().toArray();
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
        const bucket = initGridFsBucket();
        if (!bucket) {
            return res.status(503).json({ message: 'File storage is not ready. Please try again in a moment.' });
        }

        const filename = req.params.filename;
        console.log('Direct file request for:', filename);

        const files = await bucket.find({ filename }).toArray();
        
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

        const downloadStream = bucket.openDownloadStreamByName(filename);
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
