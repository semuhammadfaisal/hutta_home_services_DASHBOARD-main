# Recurring Calendar - Visual Guide

## 1. Sidebar Menu Structure

```
┌─────────────────────────────┐
│  SIDEBAR MENU               │
├─────────────────────────────┤
│  📊 Dashboard               │
│  📅 Calendar                │
│  ✅ Recurring Calendar  ← NEW│
│  📋 Orders                  │
│  🔄 Pipeline                │
│  👥 Customers               │
│  🤝 Vendors                 │
│  💳 Payments                │
│  🧮 Accounting              │
│  📊 Reports                 │
│  👔 Employees               │
│  ⚙️  Settings               │
└─────────────────────────────┘
```

## 2. Order Form - Before & After

### BEFORE (Original Form)
```
┌──────────────────────────────────────┐
│  Add New Order                       │
├──────────────────────────────────────┤
│  Customer: [Select Customer ▼]      │
│  Service: [____________]             │
│  Amount: [$_______]                  │
│  Start Date: [____/____/____]        │
│  End Date: [____/____/____]          │
│  Vendor: [Select Vendor ▼]           │
│  Status: [New ▼]                     │
│  Description: [________________]     │
└──────────────────────────────────────┘
```

### AFTER (With Recurring Fields)
```
┌──────────────────────────────────────┐
│  Add New Order                       │
├──────────────────────────────────────┤
│  Customer: [Select Customer ▼]      │
│  Service: [____________]             │
│  Amount: [$_______]                  │
│  Start Date: [____/____/____]        │
│  End Date: [____/____/____]          │
│                                      │
│  Order Type: [One Time Order ▼] ← NEW│
│                                      │
│  ┌────────────────────────────────┐ │
│  │ RECURRING FIELDS (Hidden)      │ │
│  │                                │ │
│  │ Recurring Frequency: [Weekly ▼]│ │
│  │ Recurring End Date: [________] │ │
│  │ Recurring Notes: [___________] │ │
│  └────────────────────────────────┘ │
│                                      │
│  Vendor: [Select Vendor ▼]           │
│  Status: [New ▼]                     │
│  Description: [________________]     │
└──────────────────────────────────────┘
```

## 3. Order Type Selection Flow

```
┌─────────────────────────────────────────────────┐
│  Order Type: [One Time Order ▼]                │
│                                                 │
│  Click dropdown ↓                               │
│                                                 │
│  ┌──────────────────────┐                      │
│  │ One Time Order   ✓   │ ← Selected           │
│  │ Recurring Order      │                      │
│  └──────────────────────┘                      │
│                                                 │
│  Recurring fields: HIDDEN                       │
└─────────────────────────────────────────────────┘

                    ↓ User selects "Recurring Order"

┌─────────────────────────────────────────────────┐
│  Order Type: [Recurring Order ▼]               │
│                                                 │
│  ┌────────────────────────────────────────┐   │
│  │ RECURRING FIELDS (Now Visible)         │   │
│  │                                        │   │
│  │ Recurring Frequency: [Weekly ▼]       │   │
│  │   Options:                             │   │
│  │   • Weekly                             │   │
│  │   • Bi-Weekly                          │   │
│  │   • Monthly                            │   │
│  │   • Yearly                             │   │
│  │                                        │   │
│  │ Recurring End Date: [____/____/____]  │   │
│  │ (Optional)                             │   │
│  │                                        │   │
│  │ Recurring Notes: [________________]   │   │
│  │ (Optional)                             │   │
│  └────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

## 4. Recurring Calendar View

```
┌─────────────────────────────────────────────────────────┐
│  Recurring Calendar                    [+ New Recurring] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ◄  January 2024  ►                                    │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Sun  Mon  Tue  Wed  Thu  Fri  Sat                │ │
│  ├───────────────────────────────────────────────────┤ │
│  │      1    2    3    4    5    6                  │ │
│  │  7   8    9   10   11   12   13                  │ │
│  │ 14  15   16   17   18   19   20                  │ │
│  │ 21  22   23   24   25   26   27                  │ │
│  │ 28  29   30   31                                 │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  Recurring orders will be displayed here               │
└─────────────────────────────────────────────────────────┘
```

## 5. Field Visibility Logic

```
┌──────────────────────────────────────────────────┐
│                                                  │
│  IF Order Type = "One Time Order"               │
│  THEN                                            │
│    ├─ Show: Standard order fields               │
│    └─ Hide: All recurring fields                │
│                                                  │
│  IF Order Type = "Recurring Order"              │
│  THEN                                            │
│    ├─ Show: Standard order fields               │
│    ├─ Show: Recurring Frequency (Required)      │
│    ├─ Show: Recurring End Date (Optional)       │
│    └─ Show: Recurring Notes (Optional)          │
│                                                  │
└──────────────────────────────────────────────────┘
```

## 6. Recurring Frequency Options

```
┌─────────────────────────────────────┐
│  Recurring Frequency: [Weekly ▼]   │
│                                     │
│  Click dropdown ↓                   │
│                                     │
│  ┌──────────────────┐              │
│  │ Weekly       ✓   │ ← Selected   │
│  │ Bi-Weekly        │              │
│  │ Monthly          │              │
│  │ Yearly           │              │
│  └──────────────────┘              │
└─────────────────────────────────────┘

Examples:
• Weekly: Every 7 days
• Bi-Weekly: Every 14 days
• Monthly: Same day each month
• Yearly: Same date each year
```

## 7. Complete Order Form Layout

```
┌────────────────────────────────────────────────────┐
│  Add New Order                          [X] Close  │
├────────────────────────────────────────────────────┤
│                                                    │
│  Customer Information                              │
│  ┌──────────────────────────────────────────────┐ │
│  │ Select Customer: [Existing Customer ▼]      │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  Order Details                                     │
│  ┌──────────────────────────────────────────────┐ │
│  │ Service: [_________________________]         │ │
│  │ Amount: [$________]  Cost: [$________]       │ │
│  │ Start Date: [__/__/____]                     │ │
│  │ End Date: [__/__/____]                       │ │
│  │                                              │ │
│  │ Order Type: [One Time Order ▼] ← NEW        │ │
│  │                                              │ │
│  │ ┌──────────────────────────────────────┐   │ │
│  │ │ Recurring Frequency: [Weekly ▼]     │   │ │
│  │ │ Recurring End Date: [__/__/____]    │   │ │
│  │ │ Recurring Notes: [_________________]│   │ │
│  │ └──────────────────────────────────────┘   │ │
│  │                                              │ │
│  │ Vendor: [Select Vendor ▼]                   │ │
│  │ Status: [New ▼]  Priority: [Medium ▼]       │ │
│  │ Description: [__________________________]   │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  [Cancel]                          [Save Order]   │
└────────────────────────────────────────────────────┘
```

## 8. Navigation Flow

```
User Journey:

1. Dashboard
   ↓
2. Click "Recurring Calendar" in sidebar
   ↓
3. Recurring Calendar opens
   ↓
4. Click "New Recurring Order"
   ↓
5. Order form opens
   ↓
6. Select "Recurring Order" from Order Type
   ↓
7. Recurring fields appear
   ↓
8. Fill in recurring details
   ↓
9. Save order
   ↓
10. Order appears in Recurring Calendar
```

## 9. Color Coding (Suggested)

```
Order Type Badges:

┌──────────────────────────┐
│ One Time Order           │  Blue (#3b82f6)
└──────────────────────────┘

┌──────────────────────────┐
│ Recurring Order          │  Purple (#8b5cf6)
└──────────────────────────┘

Frequency Badges:

┌──────────────────────────┐
│ Weekly                   │  Green (#10b981)
└──────────────────────────┘

┌──────────────────────────┐
│ Bi-Weekly                │  Teal (#14b8a6)
└──────────────────────────┘

┌──────────────────────────┐
│ Monthly                  │  Orange (#f59e0b)
└──────────────────────────┘

┌──────────────────────────┐
│ Yearly                   │  Red (#ef4444)
└──────────────────────────┘
```

## 10. Responsive Behavior

```
Desktop (> 768px):
┌─────────────────────────────────────────┐
│ Sidebar │ Main Content                  │
│         │                               │
│ Calendar│  ┌─────────────────────────┐  │
│ Recurring│  │ Calendar View          │  │
│ Orders  │  │                         │  │
│         │  └─────────────────────────┘  │
└─────────────────────────────────────────┘

Mobile (< 768px):
┌─────────────────────┐
│ ☰ Menu              │
├─────────────────────┤
│                     │
│  ┌───────────────┐  │
│  │ Calendar View │  │
│  │               │  │
│  └───────────────┘  │
│                     │
└─────────────────────┘
```
