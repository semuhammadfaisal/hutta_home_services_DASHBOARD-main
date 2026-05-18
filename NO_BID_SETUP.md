# NO BID Stage Feature

## What It Does

Orders in NO BID stages are **completely hidden** from:
- ✅ Orders tab
- ✅ Payments tab  
- ✅ KPI calculations (revenue, order counts, etc.)

Orders remain **visible only in Pipeline view** so you can track lost/declined opportunities.

## Quick Setup

1. **Create NO BID stage:**
   ```bash
   cd backend
   node manage-no-bid-stages.js
   ```

2. **Restart your server:**
   ```bash
   npm start
   ```

3. **Refresh your browser** (Ctrl+F5)

## How to Use

### Drag an order to NO BID:
1. Go to Pipeline tab
2. Drag any order card to the NO BID stage
3. Order disappears from Orders tab, Payments tab, and KPIs
4. Order still visible in Pipeline for tracking

### Bring an order back:
1. Go to Pipeline tab
2. Drag the order from NO BID to any normal stage
3. Order becomes visible everywhere again

## Create Multiple NO BID Stages

You can have multiple NO BID stages like "Lost", "Declined", "Not Interested", etc.

### Method 1: Via Dashboard
1. Go to Pipeline tab
2. Click "Add Stage"
3. Name it "Lost" or "Declined"
4. Run: `node mark-stage-as-no-bid.js "Lost"`

### Method 2: Via Script
```bash
# Mark existing stage as NO BID
node mark-stage-as-no-bid.js "Lost"
node mark-stage-as-no-bid.js "Declined"
```

## Visual Indicators

NO BID stages have:
- 🚫 Red color scheme
- Ban icon
- Distinctive styling

## Important Notes

- ✅ Orders in NO BID stages are **excluded from all calculations**
- ✅ Payments for NO BID orders are **hidden from Payments tab**
- ✅ NO BID orders **don't count in KPIs** (revenue, order counts, etc.)
- ✅ You can **drag orders back** to normal stages anytime
- ✅ **No data is lost** - orders are just hidden, not deleted

## Troubleshooting

If NO BID filtering isn't working:

1. **Check if stage is marked as NO BID:**
   ```bash
   node manage-no-bid-stages.js
   ```

2. **Restart server:**
   ```bash
   npm start
   ```

3. **Hard refresh browser:**
   - Windows: Ctrl+F5
   - Mac: Cmd+Shift+R

4. **Check console for errors:**
   - Press F12 in browser
   - Look for any red error messages
