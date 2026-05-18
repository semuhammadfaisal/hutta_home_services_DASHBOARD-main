# Server Restart Required

The NO BID filtering has been added to the backend. You need to restart your server for changes to take effect.

## Steps:

1. **Stop the server** (Ctrl+C in the terminal where server is running)

2. **Restart the server:**
   ```bash
   cd backend
   npm start
   ```

3. **Hard refresh browser** (Ctrl+F5 or Cmd+Shift+R)

4. **Test the NO BID feature:**
   - Go to Pipeline tab
   - Drag an order to the "Lost" stage (red NO BID stage)
   - Check Orders tab - order should disappear
   - Check Payments tab - payment should disappear
   - Check KPI cards - amounts should update (exclude the NO BID order)
   - Go back to Pipeline - order still visible there

## If KPIs still show NO BID amounts:

1. **Check if NO BID stage exists:**
   ```bash
   cd backend
   node manage-no-bid-stages.js
   ```

2. **Mark your "Lost" stage as NO BID:**
   ```bash
   node mark-stage-as-no-bid.js "Lost"
   ```

3. **Restart server again**

4. **Clear browser cache completely** (Ctrl+Shift+Delete)

5. **Refresh browser** (Ctrl+F5)

## Verify Backend is Filtering:

Open browser console (F12) and run:
```javascript
// Check if orders are being filtered
fetch('/api/orders/stats', {
  headers: {
    'Authorization': 'Bearer ' + JSON.parse(sessionStorage.getItem('huttaSession')).token
  }
})
.then(r => r.json())
.then(data => console.log('Stats from backend:', data));
```

The stats should NOT include orders in NO BID stages.
