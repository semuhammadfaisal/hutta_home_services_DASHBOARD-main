# 🚀 Backend Server - Quick Start

## Start the Server

### Option 1: Using the batch file (Windows)
```bash
start-server.bat
```

### Option 2: Manual start
```bash
cd backend
node server.js
```

## ✅ Verify Server is Running

You should see these logs:
```
✅ MongoDB Connected
✅ Server running on port 10000
✅ API Base: http://localhost:10000/api
✅ Health check: http://localhost:10000/api/health
```

## 🧪 Test the Server

### Method 1: Open test page
Open `test-backend.html` in your browser

### Method 2: Browser test
Navigate to: http://localhost:10000/api/health

Should return:
```json
{"status":"OK","timestamp":"2024-..."}
```

### Method 3: Command line
```bash
curl http://localhost:10000/api/health
```

## 🔧 Troubleshooting

### Server won't start
1. Check if port 10000 is already in use
2. Verify MongoDB connection string in `.env`
3. Run `npm install` in backend folder

### "Failed to fetch" error
1. Ensure server is running (check console logs)
2. Verify API_BASE in frontend matches: `http://localhost:10000/api`
3. Check CORS settings in server.js

### MongoDB connection fails
1. Check internet connection
2. Verify MongoDB URI in `.env`
3. Check MongoDB Atlas whitelist (allow 0.0.0.0/0 for development)

## 📝 Server Logs

The server logs every request:
```
GET /api/health
POST /api/auth/login
GET /api/orders
```

## 🎯 Next Steps

1. Start the server
2. Open `test-backend.html` to verify connectivity
3. Open `pages/login.html` to use the application
4. Login with your credentials

## 🔐 Default Test Credentials

Create a user first via signup, or use MongoDB Compass to add a test user.
