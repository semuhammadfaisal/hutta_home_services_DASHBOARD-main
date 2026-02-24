# Render Deployment Guide

## Steps to Deploy on Render

1. **Push your code to GitHub** (if not already done)
   - Make sure all changes are committed and pushed

2. **Connect to Render**
   - Go to [render.com](https://render.com)
   - Sign up/login with your GitHub account
   - Click "New +" and select "Web Service"

3. **Configure the service**
   - Connect your GitHub repository
   - Render will automatically detect the `render.yaml` file
   - The service will be configured automatically

4. **Environment Variables**
   - In Render dashboard, go to your service settings
   - Add these environment variables:
     - `MONGODB_URI`: Your MongoDB connection string
     - `JWT_SECRET`: Your JWT secret key
     - `NODE_ENV`: production
     - `PORT`: 10000 (automatically set by Render)

5. **Deploy**
   - Click "Deploy" - Render will build and deploy your app
   - Your app will be available at the provided URL

## Important Notes

- Render automatically uses port 10000 for web services
- The `render.yaml` file configures the deployment automatically
- Static files are served from the backend server
- MongoDB Atlas connection is maintained

## Troubleshooting

- Check the build logs in Render dashboard if deployment fails
- Ensure all environment variables are set correctly
- Verify MongoDB Atlas allows connections from all IPs (0.0.0.0/0)