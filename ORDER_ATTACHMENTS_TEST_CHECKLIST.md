# Order Attachments - Test Checklist

##  Pre-Testing Setup

- [ ] Server restarted (`cd backend && npm start`)
- [ ] Browser hard refreshed (Ctrl+F5 or Cmd+Shift+R)
- [ ] Logged into dashboard
- [ ] Test files prepared (PDF, image, document)

##  Test Scenarios

### 1. Create Order with Attachments

- [ ] Click "+ Add Order" button
- [ ] Fill in required order fields
- [ ] Scroll to "Documents" section
- [ ] Click "Choose Files" button
- [ ] Select 2-3 test files
- [ ] Verify files appear in preview
- [ ] Click "Save Order"
- [ ] Verify success message
- [ ] Check files uploaded to `backend/uploads/`

**Expected Result:** Order created with files attached

### 2. Create Order without Attachments

- [ ] Click "+ Add Order" button
- [ ] Fill in required order fields
- [ ] Skip "Documents" section (don't upload files)
- [ ] Click "Save Order"
- [ ] Verify success message

**Expected Result:** Order created successfully without files

### 3. Edit Order - Add Attachments

- [ ] Click "Edit" on existing order (without files)
- [ ] Scroll to "Documents" section
- [ ] Click "Choose Files"
- [ ] Select 1-2 test files
- [ ] Verify files appear in preview
- [ ] Click "Save Order"
- [ ] Verify success message

**Expected Result:** Files added to existing order

### 4. Edit Order - Remove Attachments

- [ ] Click "Edit" on order with attachments
- [ ] Verify existing files shown in preview
- [ ] Click "X" icon on one file
- [ ] Verify file removed from preview
- [ ] Click "Save Order"
- [ ] Verify success message
- [ ] Edit order again to confirm file is gone

**Expected Result:** File removed from order

### 5. Edit Order - Add and Remove

- [ ] Click "Edit" on order with attachments
- [ ] Remove one existing file (click X)
- [ ] Add one new file (click "Choose Files")
- [ ] Verify preview shows changes
- [ ] Click "Save Order"
- [ ] Edit order again to verify changes saved

**Expected Result:** Old file removed, new file added

### 6. Cancel Without Saving

- [ ] Click "Edit" on order with attachments
- [ ] Remove a file
- [ ] Add a new file
- [ ] Click "Cancel" button
- [ ] Edit order again
- [ ] Verify no changes were saved

**Expected Result:** Changes discarded, original files intact

### 7. File Type Validation

- [ ] Try uploading unsupported file type (.exe, .zip)
- [ ] Verify error message or rejection

**Expected Result:** Only allowed file types accepted

### 8. File Size Validation

- [ ] Try uploading file larger than 10MB
- [ ] Verify error message or rejection

**Expected Result:** Large files rejected

### 9. Multiple Files

- [ ] Upload 5 files at once
- [ ] Verify all appear in preview
- [ ] Save order
- [ ] Verify all files saved

**Expected Result:** Multiple files handled correctly

### 10. Close and Reopen Modal

- [ ] Click "+ Add Order"
- [ ] Upload 2 files
- [ ] Click "Cancel"
- [ ] Click "+ Add Order" again
- [ ] Verify file preview is empty

**Expected Result:** Previous files cleared

##  Common Issues to Check

### Files Not Uploading

- [ ] Check browser console (F12) for errors
- [ ] Verify `backend/uploads/` directory exists
- [ ] Check file size (must be < 10MB)
- [ ] Check file type (must be allowed format)
- [ ] Check server logs for upload errors

### Files Not Showing

- [ ] Hard refresh browser (Ctrl+F5)
- [ ] Check database for documents array
- [ ] Verify files exist in `backend/uploads/`
- [ ] Check network tab for API responses

### Can't Remove Files

- [ ] Verify in edit mode (not view mode)
- [ ] Check for JavaScript errors in console
- [ ] Verify removeExistingOrderDoc function exists

##  Test Results

| Test | Status | Notes |
|------|--------|-------|
| Create with attachments |  | |
| Create without attachments |  | |
| Add attachments to existing |  | |
| Remove attachments |  | |
| Add and remove together |  | |
| Cancel without saving |  | |
| File type validation |  | |
| File size validation |  | |
| Multiple files |  | |
| Modal cleanup |  | |

##  Success Criteria

All tests should pass with:
-  Files upload successfully
-  Files display in preview
-  Files save with order
-  Files can be removed
-  Modal clears properly
-  No console errors
-  No server errors

##  Next Steps After Testing

If all tests pass:
1.  Feature is ready to use
2.  Document any issues found
3.  Deploy to production

If tests fail:
1.  Note which tests failed
2.  Check browser console for errors
3.  Check server logs
4.  Report issues with details
