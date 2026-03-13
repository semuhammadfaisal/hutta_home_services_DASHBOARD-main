# Troubleshooting: Employee Eye Icon Not Working

## Quick Fixes

### 1. Hard Refresh Browser
Press `Ctrl + Shift + R` (or `Cmd + Shift + R` on Mac) to clear cache and reload

### 2. Check Browser Console
1. Press `F12` to open Developer Tools
2. Click on "Console" tab
3. Click the eye icon on an employee
4. Look for any error messages (they will be in red)

## Common Issues & Solutions

### Issue: "viewEmployee is not defined"
**Solution:** The JavaScript file didn't load properly
- Hard refresh the page (Ctrl + Shift + R)
- Check if `dashboard-script.js` is loaded in Network tab
- Verify the file path is correct

### Issue: "Cannot read property '_id' of undefined"
**Solution:** Employee data didn't load
- Check if employees are showing in the table
- Verify backend server is running
- Check `/api/employees` endpoint is working

### Issue: Nothing happens when clicking
**Solution:** Event handler not attached
- Check browser console for errors
- Verify the onclick attribute exists: Right-click eye icon → Inspect
- Should see: `onclick="viewEmployee('...')"`

### Issue: "showSection is not a function"
**Solution:** Function not loaded
- Hard refresh browser
- Check console for JavaScript errors on page load

## Testing Steps

### Test 1: Check if function exists
Open browser console and type:
```javascript
typeof window.viewEmployee
```
Should return: `"function"`

### Test 2: Manually call function
Get an employee ID from the table, then in console:
```javascript
viewEmployee('EMPLOYEE_ID_HERE')
```
Replace `EMPLOYEE_ID_HERE` with actual ID

### Test 3: Check section exists
In console:
```javascript
document.getElementById('employee-detail')
```
Should return the HTML element (not null)

## Debug Mode

The code now includes console logging. When you click the eye icon, you should see:
```
viewEmployee called with ID: 67xxxxx
Loading employee details for: 67xxxxx
Employee data loaded: {name: "...", ...}
Loading employee stats...
Stats loaded: {totalOrders: 0, ...}
Showing employee-detail section
```

If you don't see these messages, the function isn't being called.

## Manual Fix

If nothing works, try this in browser console:
```javascript
// Get first employee ID from table
const firstEmployee = document.querySelector('.employee-actions .view');
const onclick = firstEmployee.getAttribute('onclick');
console.log('Onclick attribute:', onclick);

// Try to execute it
eval(onclick);
```

## Server-Side Check

Verify the backend endpoint works:
1. Open: `http://localhost:10000/api/employees`
2. Should see list of employees
3. Copy an employee `_id`
4. Open: `http://localhost:10000/api/employees/EMPLOYEE_ID/stats`
5. Should see stats object

## Still Not Working?

1. **Clear all browser data:**
   - Settings → Privacy → Clear browsing data
   - Select "Cached images and files"
   - Clear data

2. **Try different browser:**
   - Test in Chrome, Firefox, or Edge
   - Rules out browser-specific issues

3. **Check file was saved:**
   - Verify `dashboard-script.js` has the updated code
   - Look for `console.log('viewEmployee called with ID:', employeeId);`
   - File should be around 3000+ lines

4. **Restart backend server:**
   ```bash
   cd backend
   # Stop server (Ctrl+C)
   node server.js
   ```

## Expected Behavior

When working correctly:
1. Click eye icon on employee row
2. Page switches to employee detail view
3. Shows employee information
4. Shows performance stats (may be all zeros if no orders)
5. Shows documents section

## Contact Support

If issue persists, provide:
- Browser console errors (screenshot)
- Network tab showing failed requests
- Browser and version
- Steps to reproduce
