# Email Not Working - Troubleshooting Steps

## Current Issue
Emails are not being sent when creating new users on Render.

## Steps to Debug

### 1. Check Render Logs
1. Go to https://dashboard.render.com
2. Click on your backend service
3. Click "Logs" tab
4. Create a new user and watch for these messages:
   - "Attempting to send welcome email to: [email]"
   - "EMAIL_USER configured: Yes/No"
   - "EMAIL_PASSWORD configured: Yes/No"
   - Any error messages

### 2. Test Email Endpoint
After deployment, open browser console and run:

```javascript
fetch('https://hutta-home-services-dashboard-main.onrender.com/api/users/test-email', {
  headers: {
    'Authorization': 'Bearer ' + JSON.parse(localStorage.getItem('huttaSession')).token
  }
})
.then(r => r.json())
.then(console.log)
.catch(console.error)
```

### 3. Verify Environment Variables on Render
Make sure these are set correctly:
- `EMAIL_USER` = sefaisal17@gmail.com
- `EMAIL_PASSWORD` = mmfhxzwmuyyixjdu (NO SPACES!)
- `FRONTEND_URL` = https://hutta-home-services-dashboard-main.onrender.com

### 4. Common Gmail Issues

#### Issue: "Invalid login"
**Solution:** 
- Go to https://myaccount.google.com/security
- Enable 2-Step Verification
- Go to https://myaccount.google.com/apppasswords
- Create new app password
- Use that password (16 characters, no spaces)

#### Issue: "Less secure app access"
**Solution:**
- Gmail no longer supports "less secure apps"
- You MUST use App Password (see above)

#### Issue: Email timeout
**Solution:**
- Already fixed with 5-second timeouts
- Email sends in background (non-blocking)

### 5. Alternative: Use Different Email Service

If Gmail continues to fail, consider using SendGrid (free tier):

1. Sign up at https://sendgrid.com
2. Get API key
3. Update environment variables:
   - `SENDGRID_API_KEY` = your_api_key
4. Update emailService.js to use SendGrid

## What Should Happen
1. User clicks "Create User"
2. User is created immediately (loading finishes)
3. Email sends in background
4. Check Render logs to see if email sent successfully
5. Check recipient's inbox (including spam folder)

## Next Steps
1. Share the Render backend logs after creating a user
2. Share the response from the test-email endpoint
3. We'll identify the exact error and fix it
