# Order Attachments - Quick Start

## ✅ Implementation Complete

File attachments have been added to orders. Here's how to use them:

## 🚀 Getting Started

### 1. Restart Server

```bash
cd backend
npm start
```

### 2. Refresh Browser

Press `Ctrl+F5` (Windows) or `Cmd+Shift+R` (Mac) to hard refresh

## 📎 Using Order Attachments

### Add Files to New Order

1. Click **"+ Add Order"** button
2. Fill in order details
3. Scroll down to **"Documents"** section
4. Click **"Choose Files"** button
5. Select files (PDF, DOC, images, etc.)
6. Files appear in preview below
7. Click **"Save Order"**

### Add Files to Existing Order

1. Click **Edit** button on any order
2. Existing files (if any) appear in preview
3. Click **"Choose Files"** to add more
4. Click **X** icon to remove existing files
5. Click **"Save Order"**

### Remove Files

- Click the **X** icon next to any file in the preview
- File is removed when you save the order

### View Documents

1. Click on any order in **Orders** tab
2. Scroll down to **"Documents"** section
3. See all attached files with metadata
4. Click **View** (👁️) to open in new tab
5. Click **Download** (⬇️) to save to computer

### View from Pipeline

1. Click on order card in **Pipeline**
2. Order detail modal opens
3. Scroll to **"Documents"** section
4. View or download documents

## 📋 File Specifications

- **Supported formats**: PDF, DOC, DOCX, TXT, JPG, JPEG, PNG
- **Max file size**: 10MB per file
- **Max files**: 10 files at once
- **Storage**: Files saved in `backend/uploads/`

## 🎯 What Works Now

✅ Upload files when creating orders
✅ Upload files when editing orders  
✅ Remove existing files from orders
✅ Multiple file upload support
✅ File preview before saving
✅ Files stored with order in database
✅ **View documents in order details**
✅ **Download documents from order details**
✅ **Documents visible in Pipeline modal**

## 🔮 Coming Soon

- Document preview (inline images, PDFs)
- Bulk document download
- Document categories/tags

## 🐛 Troubleshooting

### Files not uploading?

1. Check file size (must be under 10MB)
2. Check file type (must be PDF, DOC, DOCX, TXT, JPG, JPEG, or PNG)
3. Check browser console for errors (F12)

### Files not showing after save?

1. Hard refresh browser (Ctrl+F5)
2. Check `backend/uploads/` folder exists
3. Check server logs for upload errors

### Can't remove existing files?

1. Make sure you're in edit mode (not view mode)
2. Click the X icon, then click "Save Order"
3. Refresh page to see changes

## 📝 Example Use Cases

1. **Invoices**: Attach vendor invoices to orders
2. **Contracts**: Upload signed service agreements
3. **Photos**: Add before/after photos of work
4. **Receipts**: Keep material purchase receipts
5. **Permits**: Store building permits or licenses
6. **Estimates**: Attach original estimates or quotes

## 🔗 Related Features

- Customer attachments (contracts, agreements)
- Vendor attachments (licenses, insurance)
- Employee attachments (certifications, documents)

All use the same file upload system!
