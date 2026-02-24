# MongoDB Atlas Setup Instructions

## 1. Create MongoDB Atlas Account
1. Go to https://www.mongodb.com/atlas
2. Sign up for a free account
3. Create a new cluster (free tier M0)

## 2. Configure Database Access
1. Go to Database Access in your Atlas dashboard
2. Add a new database user with read/write permissions
3. Note down the username and password

## 3. Configure Network Access
1. Go to Network Access
2. Add your IP address (or 0.0.0.0/0 for development)

## 4. Get Connection String
1. Click "Connect" on your cluster
2. Choose "Connect your application"
3. Copy the connection string

## 5. Update Environment Variables
1. Open `backend/.env`
2. Replace the MONGODB_URI with your connection string:
   ```
   MONGODB_URI=mongodb+srv://YOUR_USERNAME:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/hutta_home_services?retryWrites=true&w=majority
   ```
3. Replace YOUR_USERNAME and YOUR_PASSWORD with your database credentials

## 6. Install Dependencies and Start Server
```bash
cd backend
npm install
npm run dev
```

## 7. Create Initial Admin User
Use a tool like Postman or curl to create an admin user:
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@huttaservices.com",
    "password": "admin123",
    "firstName": "Admin",
    "lastName": "User",
    "role": "administrator"
  }'
```

## 8. Test the Application
1. Start the backend server: `npm run dev`
2. Open the frontend in a browser
3. Login with the created admin credentials