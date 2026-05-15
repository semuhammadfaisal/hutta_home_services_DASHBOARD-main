# MDT Timezone Configuration Guide

## Overview
The entire Hutta Home Services platform has been configured to use **MDT (Mountain Daylight Time)** timezone (America/Denver).

## What Changed

### 1. Frontend Changes

#### Calendar (`assets/js/calendar.js`)
- All date parsing now uses MDT timezone
- Calendar displays dates in MDT
- Event details show dates in MDT format
- Current date/time uses MDT

#### Timezone Config (`config/timezone-config.js`)
- Centralized timezone configuration
- Helper functions for date formatting in MDT
- Can be used across all frontend JavaScript files

### 2. Backend Changes

#### Server (`backend/server.js`)
- Process timezone set to `America/Denver`
- Health check endpoint shows MDT timestamp
- All server operations use MDT

#### Timezone Utility (`backend/utils/timezone.js`)
- Backend helper functions for MDT conversion
- Use in routes and models as needed

## Usage

### Frontend
```javascript
// Calendar and all date displays automatically use MDT
const TIMEZONE = 'America/Denver';
const mdtDate = new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }));
```

### Backend
```javascript
// In routes or models
const { toMDT, nowMDT } = require('../utils/timezone');
const currentTime = nowMDT();
```

## Testing

1. **Check Calendar**: Open calendar tab and verify dates display correctly
2. **Check Health Endpoint**: Visit `/api/health` and verify timezone shows "America/Denver (MDT)"
3. **Create Order**: Create an order with a date and verify it displays in MDT
4. **View Events**: Click on calendar events and verify dates show in MDT

## Additional Files to Update (Optional)

If you need MDT in other parts of the application, update these files:

- `assets/js/dashboard-script.js` - Dashboard date displays
- `assets/js/payment-detail.js` - Payment dates
- `assets/js/accounting-system.js` - Accounting dates
- `backend/routes/orders.js` - Order date handling
- `backend/routes/payments.js` - Payment date handling
- `backend/routes/reports.js` - Report date ranges

## Notes

- MDT is UTC-6 during daylight saving time
- MST (Mountain Standard Time) is UTC-7 during standard time
- The timezone automatically adjusts between MDT and MST
- All dates stored in database remain in UTC (recommended practice)
- Conversion to MDT happens at display time
