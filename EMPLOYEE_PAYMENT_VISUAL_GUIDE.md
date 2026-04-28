# Employee Payment - Visual Guide

## Payment Detail Modal Structure

```
┌─────────────────────────────────────────────────────────┐
│  Payment Details - PAY-0001                        [X]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [Hero Section - Amount & Stats]                       │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [Overview]              [Customer & Order]            │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [Description] (if exists)                             │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [Notes] (if exists)                                   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────┐ │
│  │ 🟢 EMPLOYEE ASSIGNMENT              [Employee]   │ │
│  ├───────────────────────────────────────────────────┤ │
│  │                                                   │ │
│  │  Name: John Doe                                  │ │
│  │  Email: john@example.com                         │ │
│  │  Phone: (555) 123-4567                           │ │
│  │                                                   │ │
│  ├───────────────────────────────────────────────────┤ │
│  │  EMPLOYEE PAYMENT              [🟡 Pending]      │ │
│  ├───────────────────────────────────────────────────┤ │
│  │                                                   │ │
│  │  Amount: [____]    Status: [Pending ▼]          │ │
│  │  Date: [____]      Method: [Select ▼]           │ │
│  │  Notes: [_____________________________]          │ │
│  │                                                   │ │
│  │         [💾 Save Employee Payment]               │ │
│  │                                                   │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [Payment Milestones]                                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Employee Section - Detailed View

```
╔═══════════════════════════════════════════════════════╗
║  🟢 EMPLOYEE ASSIGNMENT                  [Employee]  ║
╠═══════════════════════════════════════════════════════╣
║  Create milestones for partial client payments       ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  ┌─────────────┬─────────────┬─────────────┐        ║
║  │ NAME        │ EMAIL       │ PHONE       │        ║
║  ├─────────────┼─────────────┼─────────────┤        ║
║  │ John Doe    │ john@...    │ (555) 123-  │        ║
║  └─────────────┴─────────────┴─────────────┘        ║
║                                                       ║
╠═══════════════════════════════════════════════════════╣
║  EMPLOYEE PAYMENT                    [🟡 Pending]    ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  ┌─────────────────────────────────────────────────┐ ║
║  │  AMOUNT          STATUS                         │ ║
║  │  [500.00]        [Pending ▼]                    │ ║
║  │                                                 │ ║
║  │  PAYMENT DATE    PAYMENT METHOD                │ ║
║  │  [2024-01-15]    [Bank Transfer ▼]             │ ║
║  │                                                 │ ║
║  │  NOTES                                          │ ║
║  │  [Payment for project completion...]           │ ║
║  │                                                 │ ║
║  └─────────────────────────────────────────────────┘ ║
║                                                       ║
║  [💾 Save Employee Payment]                          ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
```

## Status Badge Examples

### Pending Status
```
┌─────────────────────┐
│ 🕐 Pending          │  ← Yellow background
└─────────────────────┘
```

### Paid Status
```
┌─────────────────────┐
│ ✅ Paid             │  ← Green background
└─────────────────────┘
```

### Cancelled Status
```
┌─────────────────────┐
│ 🚫 Cancelled        │  ← Red background
└─────────────────────┘
```

## Color Scheme

### Customer Payment Section (Blue Theme)
- Primary: `#0056B8` (Blue)
- Background: `#E6F0FF` (Light Blue)
- Border: `#0056B8` (Blue)

### Employee Payment Section (Green Theme)
- Primary: `#22c55e` (Green)
- Background: `#f0fdf4` to `#dcfce7` (Light Green Gradient)
- Border: `#22c55e` (Green)

## Responsive Behavior

### Desktop (> 768px)
```
┌─────────────┬─────────────┬─────────────┐
│   Amount    │   Status    │    Date     │
├─────────────┼─────────────┼─────────────┤
│   Method    │             │             │
└─────────────┴─────────────┴─────────────┘
```

### Mobile (< 768px)
```
┌─────────────────────────────┐
│         Amount              │
├─────────────────────────────┤
│         Status              │
├─────────────────────────────┤
│         Date                │
├─────────────────────────────┤
│         Method              │
└─────────────────────────────┘
```

## Form Field States

### Default State
```
┌──────────────────┐
│ [Input Field]    │  ← Gray border
└──────────────────┘
```

### Focus State
```
┌══════════════════┐
│ [Input Field]    │  ← Green border + shadow
└══════════════════┘
```

### Filled State
```
┌──────────────────┐
│ 500.00          │  ← Bold text
└──────────────────┘
```

## Button States

### Default
```
┌─────────────────────────────┐
│ 💾 Save Employee Payment    │  ← Blue background
└─────────────────────────────┘
```

### Hover
```
┌─────────────────────────────┐
│ 💾 Save Employee Payment    │  ← Darker blue + lift
└─────────────────────────────┘
```

### Loading
```
┌─────────────────────────────┐
│ ⏳ Saving...                │  ← Disabled state
└─────────────────────────────┘
```

## Integration Points

```
Order Creation
    ↓
Employee Assignment
    ↓
Payment Auto-Created
    ↓
[Payment Detail Modal]
    ↓
Employee Section Visible
    ↓
Fill Employee Payment Form
    ↓
Save Employee Payment
    ↓
Database Updated
    ↓
Modal Refreshed
```

## Data Validation

✅ Amount must be ≥ 0
✅ Status must be: pending, paid, or cancelled
✅ Date must be valid date format
✅ Method must be: cash, bank-transfer, check, or online
✅ Notes can be any text (optional)

## Empty States

### No Employee Assigned
```
[Employee section does not appear]
```

### Employee Assigned, No Payment Data
```
┌─────────────────────────────┐
│ Amount: 0                   │
│ Status: Pending             │
│ Date: [empty]               │
│ Method: [Select Method]     │
│ Notes: [empty]              │
└─────────────────────────────┘
```
