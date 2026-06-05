# Order Attachments - Visual Guide

##  What You'll See

### 1. Order Modal - Documents Section

When creating or editing an order, scroll down to find the **Documents** section:

```
┌─────────────────────────────────────────────┐
│  Notes                                      │
│  ┌───────────────────────────────────────┐ │
│  │ Additional notes about the order...   │ │
│  └───────────────────────────────────────┘ │
│                                             │
│   Documents                               │
│  ┌───────────────────────────────────────┐ │
│  │ Choose Files                          │ │
│  └───────────────────────────────────────┘ │
│  Upload invoices, contracts, photos, or    │
│  other documents                            │
│                                             │
│  [Preview area appears here after upload]  │
└─────────────────────────────────────────────┘
```

### 2. After Selecting Files

Files appear in preview with remove option:

```
┌─────────────────────────────────────────────┐
│   Documents                               │
│  ┌───────────────────────────────────────┐ │
│  │ Choose Files                          │ │
│  └───────────────────────────────────────┘ │
│  Upload invoices, contracts, photos, or    │
│  other documents                            │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │  invoice.pdf                    │   │
│  ├─────────────────────────────────────┤   │
│  │  before-photo.jpg               │   │
│  ├─────────────────────────────────────┤   │
│  │  contract.docx                  │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### 3. Editing Order with Existing Files

Existing files shown with links:

```
┌─────────────────────────────────────────────┐
│   Documents                               │
│  ┌───────────────────────────────────────┐ │
│  │ Choose Files                          │ │
│  └───────────────────────────────────────┘ │
│  Upload invoices, contracts, photos, or    │
│  other documents                            │
│                                             │
│  Existing Documents:                        │
│  ┌─────────────────────────────────────┐   │
│  │  invoice.pdf (link)             │   │
│  ├─────────────────────────────────────┤   │
│  │  before-photo.jpg (link)        │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  [Click "Choose Files" to add more]        │
└─────────────────────────────────────────────┘
```

##  File Icons

Different file types show different icons:

-  **PDF files**: `file-pdf` icon (red)
-  **Word docs**: `file-word` icon (blue)
-  **Images**: `file-image` icon (green)
-  **Other**: `file-alt` icon (gray)

##  User Flow Diagrams

### Creating Order with Attachments

```
Start
  ↓
Click "+ Add Order"
  ↓
Fill in order details
  ↓
Scroll to Documents section
  ↓
Click "Choose Files"
  ↓
Select files from computer
  ↓
Files appear in preview
  ↓
Click "Save Order"
  ↓
Files uploaded to server
  ↓
Order saved with attachments
  ↓
Success message shown
  ↓
End
```

### Editing Order Attachments

```
Start
  ↓
Click "Edit" on order
  ↓
Existing files shown in preview
  ↓
┌─────────────┬─────────────┐
│ Add Files?  │ Remove Files?│
└─────────────┴─────────────┘
      ↓              ↓
Click "Choose    Click  icon
Files"           on file
      ↓              ↓
Select new       File removed
files            from preview
      ↓              ↓
New files        ↓
appear           ↓
      ↓              ↓
      └──────┬───────┘
             ↓
      Click "Save Order"
             ↓
      Changes saved
             ↓
      Success message
             ↓
            End
```

##  Button States

### Choose Files Button

**Normal State:**
```
┌───────────────────────────────┐
│  Choose Files                 │
└───────────────────────────────┘
```

**Hover State:**
```
┌───────────────────────────────┐
│  Choose Files  (cursor: pointer)
└───────────────────────────────┘
```

### Remove File Icon ()

**Normal State:**
```
 invoice.pdf                  
```

**Hover State:**
```
 invoice.pdf                   (red, cursor: pointer)
```

##  Responsive Design

### Desktop View
```
┌──────────────────────────────────────────────────┐
│  Notes                                           │
│  ┌────────────────────────────────────────────┐ │
│  │ Order notes here...                        │ │
│  └────────────────────────────────────────────┘ │
│                                                  │
│   Documents                                    │
│  ┌────────────────────────────────────────────┐ │
│  │ Choose Files                               │ │
│  └────────────────────────────────────────────┘ │
│  Upload invoices, contracts, photos, or other   │
│  documents                                       │
│                                                  │
│  ┌────────────────────────────────────────────┐ │
│  │  invoice.pdf                           │ │
│  │  photo.jpg                             │ │
│  └────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### Mobile View
```
┌──────────────────────┐
│  Notes               │
│  ┌────────────────┐  │
│  │ Order notes   │  │
│  └────────────────┘  │
│                      │
│   Documents        │
│  ┌────────────────┐  │
│  │ Choose Files  │  │
│  └────────────────┘  │
│  Upload documents    │
│                      │
│  ┌────────────────┐  │
│  │  invoice.pdf │  │
│  │              │  │
│  ├────────────────┤  │
│  │  photo.jpg   │  │
│  │              │  │
│  └────────────────┘  │
└──────────────────────┘
```

##  Color Scheme

- **Section Label**: Dark gray (#374151)
- **Helper Text**: Light gray (#6b7280)
- **File Preview**: Light background (#f3f4f6)
- **Remove Icon**: Red on hover (#ef4444)
- **File Icons**: Type-specific colors
  - PDF: Red (#ef4444)
  - Word: Blue (#3b82f6)
  - Image: Green (#10b981)
  - Other: Gray (#6b7280)

##  Visual Cues

### Empty State
```
┌─────────────────────────────────────────────┐
│   Documents                               │
│  ┌───────────────────────────────────────┐ │
│  │ Choose Files                          │ │
│  └───────────────────────────────────────┘ │
│  Upload invoices, contracts, photos, or    │
│  other documents                            │
│                                             │
│  [No files selected]                        │
└─────────────────────────────────────────────┘
```

### With Files
```
┌─────────────────────────────────────────────┐
│   Documents                               │
│  ┌───────────────────────────────────────┐ │
│  │ Choose Files                          │ │
│  └───────────────────────────────────────┘ │
│  Upload invoices, contracts, photos, or    │
│  other documents                            │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │  invoice.pdf                    │   │
│  │  before-photo.jpg               │   │
│  │  contract.docx                  │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  [3 files ready to upload]                 │
└─────────────────────────────────────────────┘
```

### Loading State (During Upload)
```
┌─────────────────────────────────────────────┐
│   Documents                               │
│  ┌───────────────────────────────────────┐ │
│  │ Choose Files                          │ │
│  └───────────────────────────────────────┘ │
│  Upload invoices, contracts, photos, or    │
│  other documents                            │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │  invoice.pdf                    │   │
│  │  before-photo.jpg               │   │
│  │  contract.docx                  │   │
│  └─────────────────────────────────────┘   │
│                                             │
│   Uploading documents...                 │
└─────────────────────────────────────────────┘
```

##  Animation States

1. **File Added**: Fade in from top
2. **File Removed**: Fade out and collapse
3. **Hover**: Scale up slightly (1.02x)
4. **Click**: Brief scale down (0.98x)

##  Spacing

- Section padding: 16px
- File item padding: 8px
- Gap between files: 8px
- Icon size: 16px
- Button padding: 12px 24px

##  Typography

- **Section Label**: 14px, semi-bold
- **Helper Text**: 12px, regular
- **File Name**: 14px, regular
- **Button Text**: 14px, medium

##  Accessibility

-  Keyboard navigation supported
-  Screen reader friendly labels
-  High contrast colors
-  Focus indicators visible
-  ARIA labels on buttons

##  Interaction Patterns

### Click "Choose Files"
1. Native file picker opens
2. User selects files
3. Files validate (type, size)
4. Valid files added to preview
5. Invalid files show error

### Click Remove ()
1. Confirmation prompt (optional)
2. File removed from preview
3. Smooth fade-out animation
4. Preview updates

### Save Order
1. Button shows loading state
2. Files upload to server
3. Progress indicator shown
4. Success message displayed
5. Modal closes

This visual guide helps you understand exactly what to expect when using the order attachments feature!
