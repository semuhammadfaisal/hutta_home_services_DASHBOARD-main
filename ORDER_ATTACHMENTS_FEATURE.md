# Order Attachments Feature

File attachment functionality has been added to orders, matching the existing pattern used for customers, vendors, and employees.

## What Was Added

### Backend Changes

1. **Order Model** (`backend/models/Order.js`)
   - Added `documents` field with schema:
     ```javascript
     documents: [{
       name: String,
       url: String,
       type: String,
       size: Number,
       uploadedAt: Date
     }]
     ```

### Frontend Changes

1. **Order Modal** (`pages/admin-dashboard.html`)
   - Added file upload section after Notes field
   - Includes file input, preview area, and helper text
   - Accepts: `.pdf, .doc, .docx, .txt, .jpg, .jpeg, .png`

2. **File Upload Handler** (`assets/js/file-upload.js`)
   - Added `order` type to `uploadedFiles` object
   - Initialized file handler for `orderDocs` input

3. **Dashboard Script** (`assets/js/dashboard-script.js`)
   - **saveOrder()**: Uploads new files and merges with existing documents
   - **editOrder()**: Displays existing documents with remove option
   - **closeOrderModal()**: Clears uploaded files and preview
   - **removeExistingOrderDoc()**: Removes documents from existing orders

## How It Works

### Creating an Order with Attachments

1. Click "Add New Order"
2. Fill in order details
3. Scroll to "Documents" section
4. Click "Choose Files" and select files
5. Files appear in preview with remove option
6. Click "Save Order"
7. Files are uploaded and linked to the order

### Editing an Order with Attachments

1. Click edit on an existing order
2. Existing documents appear in preview
3. Can remove existing documents (click X icon)
4. Can add new documents (click "Choose Files")
5. Click "Save Order"
6. New files are uploaded and merged with remaining existing files

### Viewing Order Documents

1. **From Orders Tab:**
   - Click on any order
   - Scroll to "Documents" section
   - See all attached files
   - Click View or Download buttons

2. **From Pipeline:**
   - Click on order card
   - Order detail modal opens
   - Scroll to "Documents" section
   - View or download documents

### Document Actions

- **View Button (👁️)**: Opens document in new browser tab
- **Download Button (⬇️)**: Downloads file to your computer

### Supported File Types

- Documents: PDF, DOC, DOCX, TXT
- Images: JPG, JPEG, PNG
- Max size: 10MB per file
- Multiple files: Up to 10 files at once

## File Storage

- Files are stored in `backend/uploads/` directory
- Filenames are timestamped to prevent conflicts
- URLs are stored in database as `/uploads/filename`

## API Endpoints Used

- **POST** `/api/upload` - Uploads files
- **POST** `/api/orders` - Creates order with documents
- **PUT** `/api/orders/:id` - Updates order with documents
- **GET** `/api/orders/:id` - Retrieves order with documents

## Testing

1. **Create order with attachments**:
   - Add new order
   - Upload 2-3 files
   - Save and verify files are attached

2. **Edit order attachments**:
   - Edit existing order
   - Remove one existing file
   - Add one new file
   - Save and verify changes

3. **View order attachments**:
   - Click on order to view details
   - Scroll to Documents section
   - Verify files are displayed
   - Test View and Download buttons

## Future Enhancements

1. **Document preview**
   - Add inline preview for images
   - Add PDF viewer for documents

2. **Document management**
   - Bulk download all documents
   - Document categories/tags
   - Document search

3. **Advanced features**
   - Document versioning
   - Document comments/notes
   - Cloud storage integration

## Files Modified

- `backend/models/Order.js` - Added documents field
- `pages/admin-dashboard.html` - Added file upload UI
- `assets/js/file-upload.js` - Added order file handling
- `assets/js/dashboard-script.js` - Added upload/edit/remove logic

## No Migration Required

The `documents` field defaults to an empty array, so existing orders will work without any database migration.

## Restart Required

After implementing these changes, restart the server:

```bash
cd backend
npm start
```

Then hard refresh the browser (Ctrl+F5 or Cmd+Shift+R).
