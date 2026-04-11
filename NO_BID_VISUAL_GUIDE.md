# NO BID Stage - Visual Guide

## 🎨 Visual Overview

### Pipeline with NO BID Stage

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PIPELINE VIEW                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  Lead    │  │ Proposal │  │   Won    │  │   Paid   │  │🚫 NO BID │    │
│  │      [5] │  │      [3] │  │      [2] │  │      [4] │  │      [3] │    │
│  ├──────────┤  ├──────────┤  ├──────────┤  ├──────────┤  ├──────────┤    │
│  │ Order 1  │  │ Order 6  │  │ Order 9  │  │ Order 11 │  │ Order 14 │    │
│  │ Order 2  │  │ Order 7  │  │ Order 10 │  │ Order 12 │  │ Order 15 │    │
│  │ Order 3  │  │ Order 8  │  │          │  │ Order 13 │  │ Order 16 │    │
│  │ Order 4  │  │          │  │          │  │          │  │          │    │
│  │ Order 5  │  │          │  │          │  │          │  │          │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│     Blue         Blue          Green         Green          RED            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Orders Tab View

### Before Moving to NO BID

```
┌─────────────────────────────────────────────────────────────────────┐
│ ORDERS TAB                                    Total Orders: 16      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Order 1  │ Customer A │ $1,000 │ Lead                             │
│  Order 2  │ Customer B │ $2,000 │ Lead                             │
│  Order 3  │ Customer C │ $1,500 │ Lead                             │
│  ...                                                                 │
│  Order 14 │ Customer N │ $3,000 │ Lead      ← Will be hidden       │
│  Order 15 │ Customer O │ $2,500 │ Proposal  ← Will be hidden       │
│  Order 16 │ Customer P │ $4,000 │ Proposal  ← Will be hidden       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### After Moving to NO BID

```
┌─────────────────────────────────────────────────────────────────────┐
│ ORDERS TAB                                    Total Orders: 13      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Order 1  │ Customer A │ $1,000 │ Lead                             │
│  Order 2  │ Customer B │ $2,000 │ Lead                             │
│  Order 3  │ Customer C │ $1,500 │ Lead                             │
│  ...                                                                 │
│  Order 13 │ Customer M │ $5,000 │ Paid                             │
│                                                                      │
│  ❌ Orders 14, 15, 16 are hidden (in NO BID stage)                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📈 Dashboard KPIs Impact

### Before NO BID

```
┌─────────────────────────────────────────────────────────────────┐
│                      DASHBOARD                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Total Orders │  │   Revenue    │  │   Active     │         │
│  │      16      │  │   $50,000    │  │      8       │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                  │
│  Includes 3 lost deals worth $9,500                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### After NO BID

```
┌─────────────────────────────────────────────────────────────────┐
│                      DASHBOARD                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Total Orders │  │   Revenue    │  │   Active     │         │
│  │      13      │  │   $40,500    │  │      5       │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                  │
│  ✅ Accurate metrics (NO BID excluded)                          │
│  📊 3 orders in NO BID (tracked separately)                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Creating NO BID Stage

### Step 1: Open Stage Modal

```
┌─────────────────────────────────────────┐
│ Pipeline Tab                            │
├─────────────────────────────────────────┤
│                                         │
│  [+ Add Stage] ← Click here             │
│                                         │
└─────────────────────────────────────────┘
```

### Step 2: Fill Form

```
┌─────────────────────────────────────────┐
│ Add Stage                          [X]  │
├─────────────────────────────────────────┤
│                                         │
│  Stage Name: [NO BID___________]        │
│                                         │
│  ☑ Mark as NO BID stage                 │
│  Orders in NO BID stages won't          │
│  appear in Orders tab and won't         │
│  count in calculations                  │
│                                         │
│  [Cancel]  [Save Stage]                 │
│                                         │
└─────────────────────────────────────────┘
```

### Step 3: Result

```
┌─────────────────────────────────────────┐
│ Pipeline View                           │
├─────────────────────────────────────────┤
│                                         │
│  ... other stages ...                   │
│                                         │
│  ┌──────────────────────────┐          │
│  │ 🚫 NO BID            [0] │ ← NEW!   │
│  ├──────────────────────────┤          │
│  │                          │          │
│  │  Drop orders here        │          │
│  │                          │          │
│  └──────────────────────────┘          │
│     RED STAGE                           │
│                                         │
└─────────────────────────────────────────┘
```

---

## 🔄 Moving Orders to NO BID

### Drag and Drop

```
Step 1: Click and hold order
┌──────────┐
│  Lead    │
│      [5] │
├──────────┤
│ Order 1  │ ← Click here
│ Order 2  │
│ Order 3  │
└──────────┘

Step 2: Drag to NO BID stage
┌──────────┐              ┌──────────┐
│  Lead    │              │🚫 NO BID │
│      [5] │   ────────>  │      [0] │
├──────────┤              ├──────────┤
│ Order 2  │              │          │
│ Order 3  │              │          │
└──────────┘              └──────────┘

Step 3: Drop in NO BID
┌──────────┐              ┌──────────┐
│  Lead    │              │🚫 NO BID │
│      [4] │              │      [1] │
├──────────┤              ├──────────┤
│ Order 2  │              │ Order 1  │ ← Moved!
│ Order 3  │              │          │
└──────────┘              └──────────┘
```

---

## 🎨 Visual Comparison

### Regular Stage vs NO BID Stage

```
REGULAR STAGE                    NO BID STAGE
┌──────────────────┐            ┌──────────────────┐
│ Lead         [5] │            │🚫 NO BID     [3] │
├──────────────────┤            ├──────────────────┤
│                  │            │                  │
│  ┌────────────┐  │            │  ┌────────────┐  │
│  │ Order 1    │  │            │  │ Order 14   │  │
│  │ Customer A │  │            │  │ Customer N │  │
│  │ $1,000     │  │            │  │ $3,000     │  │
│  └────────────┘  │            │  └────────────┘  │
│                  │            │                  │
│  ┌────────────┐  │            │  ┌────────────┐  │
│  │ Order 2    │  │            │  │ Order 15   │  │
│  │ Customer B │  │            │  │ Customer O │  │
│  │ $2,000     │  │            │  │ $2,500     │  │
│  └────────────┘  │            │  └────────────┘  │
│                  │            │                  │
└──────────────────┘            └──────────────────┘
  Blue/Gray                       Red/Pink
  Visible in Orders               Hidden from Orders
  Counted in KPIs                 Not counted in KPIs
```

---

## 📱 Mobile View

### Pipeline on Mobile

```
┌─────────────────────┐
│ Pipeline            │
├─────────────────────┤
│                     │
│ ▼ Lead (5)          │
│   Order 1           │
│   Order 2           │
│   ...               │
│                     │
│ ▼ Proposal (3)      │
│   Order 6           │
│   Order 7           │
│   ...               │
│                     │
│ ▼ 🚫 NO BID (3)     │ ← Red section
│   Order 14          │
│   Order 15          │
│   Order 16          │
│                     │
└─────────────────────┘
```

---

## 🔄 Recovery Flow

### Bringing Order Back from NO BID

```
STEP 1: Order in NO BID
┌──────────┐  ┌──────────┐  ┌──────────┐
│  Lead    │  │   Won    │  │🚫 NO BID │
│      [4] │  │      [2] │  │      [3] │
├──────────┤  ├──────────┤  ├──────────┤
│ Order 2  │  │ Order 9  │  │ Order 14 │ ← Want this back
│ Order 3  │  │ Order 10 │  │ Order 15 │
└──────────┘  └──────────┘  └──────────┘

STEP 2: Drag to another stage
┌──────────┐  ┌──────────┐  ┌──────────┐
│  Lead    │  │   Won    │  │🚫 NO BID │
│      [4] │  │      [2] │  │      [3] │
├──────────┤  ├──────────┤  ├──────────┤
│ Order 2  │  │ Order 9  │  │ Order 15 │
│ Order 3  │  │ Order 10 │  └──────────┘
└──────────┘  └──────────┘       │
                  ▲               │
                  └───────────────┘
                   Drag Order 14

STEP 3: Order recovered
┌──────────┐  ┌──────────┐  ┌──────────┐
│  Lead    │  │   Won    │  │🚫 NO BID │
│      [4] │  │      [3] │  │      [2] │
├──────────┤  ├──────────┤  ├──────────┤
│ Order 2  │  │ Order 9  │  │ Order 15 │
│ Order 3  │  │ Order 10 │  │ Order 16 │
└──────────┘  │ Order 14 │← Back!      │
              └──────────┘  └──────────┘

✅ Order 14 now visible in Orders tab
✅ Order 14 counted in KPIs again
```

---

## 📊 Reporting View

### Pipeline Report with NO BID

```
┌─────────────────────────────────────────────────────────────┐
│ PIPELINE REPORT - January 2024                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Active Pipeline:                                             │
│   Lead:         5 orders    $10,000                         │
│   Proposal:     3 orders    $15,000                         │
│   Won:          2 orders    $8,000                          │
│   Paid:         4 orders    $20,000                         │
│   ─────────────────────────────────                         │
│   Total:       14 orders    $53,000                         │
│                                                              │
│ NO BID (Not Counted):                                        │
│   NO BID:       3 orders    $9,500                          │
│                                                              │
│ Conversion Rate: 14/17 = 82% (excluding NO BID)             │
│ Win Rate: 6/14 = 43% (Won+Paid / Active)                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Multiple NO BID Stages

### Organized NO BID Tracking

```
┌─────────────────────────────────────────────────────────────────┐
│ Pipeline with Multiple NO BID Stages                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Lead    │  │ Proposal │  │   Won    │  │   Paid   │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                                                                  │
│  NO BID STAGES (All Red):                                       │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │🚫 NO BID     │  │🚫 NO BID     │  │🚫 NO BID     │         │
│  │   Lost       │  │   Declined   │  │   Budget     │         │
│  │       [5]    │  │       [3]    │  │       [2]    │         │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤         │
│  │ Lost to      │  │ Customer     │  │ Budget too   │         │
│  │ competitor   │  │ declined     │  │ low          │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                  │
│  Total NO BID: 10 orders (tracked but not counted)              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎨 Color Legend

```
┌─────────────────────────────────────────────────────────┐
│ STAGE COLORS                                            │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  🔵 Blue/Gray    = Regular stages (counted)             │
│  🟢 Green        = Success stages (counted)             │
│  🔴 Red          = NO BID stages (not counted)          │
│                                                          │
│  Regular Stage:                                          │
│  ┌────────────┐                                         │
│  │ Lead   [5] │ ← Blue header                           │
│  ├────────────┤                                         │
│  │ Orders...  │ ← White/gray background                 │
│  └────────────┘                                         │
│                                                          │
│  NO BID Stage:                                           │
│  ┌────────────┐                                         │
│  │🚫 NO BID[3]│ ← Red header + icon                     │
│  ├────────────┤                                         │
│  │ Orders...  │ ← Pink/red background                   │
│  └────────────┘                                         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## ✅ Quick Visual Checklist

```
✅ NO BID stage has red color
✅ NO BID stage has 🚫 icon
✅ Orders in NO BID have red-tinted cards
✅ NO BID orders not in Orders tab
✅ Dashboard shows lower counts (accurate)
✅ Can drag orders in and out
✅ Changes take effect immediately
```

---

## 🎯 Summary Diagram

```
                    PIPELINE FLOW
                         
    ┌─────────┐     ┌─────────┐     ┌─────────┐
    │  Lead   │ ──> │Proposal │ ──> │   Won   │
    └─────────┘     └─────────┘     └─────────┘
         │               │                │
         │               │                │
         ▼               ▼                ▼
    ┌─────────────────────────────────────────┐
    │         🚫 NO BID STAGE                  │
    │  (Lost, Declined, Budget, etc.)         │
    └─────────────────────────────────────────┘
              │                    ▲
              │                    │
              ▼                    │
    ┌─────────────────────────────────────────┐
    │  Hidden from Orders Tab                 │
    │  Excluded from KPIs                     │
    │  Tracked in Pipeline                    │
    │  Can be recovered ──────────────────────┘
    └─────────────────────────────────────────┘
```

---

**Visual guide complete! Use these diagrams to understand and explain the NO BID feature.** 🎨
