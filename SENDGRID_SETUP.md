# SendGrid Setup for Render Deployment

## Why SendGrid?
Render blocks outbound SMTP connections (ports 587/465), causing Gmail SMTP to timeout. SendGrid uses HTTP API instead, which works perfectly on Render.

## Setup Steps

### 1. Create SendGrid Account
1. Go to https://sendgrid.com/
2. Sign up for FREE account (100 emails/day)
3. Verify your email address

### 2. Create API Key
1. Login to SendGrid dashboard
2. Go to **Settings** → **API Keys**
3. Click **Create API Key**
4. Name: `Hutta Home Services`
5. Permissions: **Full Access** (or at minimum: Mail Send)
6. Click **Create & View**
7. **COPY THE API KEY** (you won't see it again!)
   - Format: `SG.xxxxxxxxxxxxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy`

### 3. Verify Sender Email
1. Go to **Settings** → **Sender Authentication**
2. Click **Verify a Single Sender**
3. Fill in your details:
   - From Name: `Hutta Home Services`
   - From Email: `sefaisal17@gmail.com` (your email)
   - Reply To: Same email
   - Company details (can be simple)
4. Check your email and click verification link
5. **MUST BE VERIFIED** before sending emails

### 4. Add to Render Environment Variables
1. Go to your Render dashboard
2. Select your backend service
3. Go to **Environment** tab
4. Add new variable:
   - Key: `SENDGRID_API_KEY`
   - Value: `SG.xxxxxxxxxxxxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy`
5. Keep existing variables:
   - `EMAIL_USER=sefaisal17@gmail.com` (verified sender)
   - `EMAIL_PASSWORD` (no longer needed but keep it)
   - `FRONTEND_URL`

### 5. Deploy
1. Commit and push code changes
2. Render will auto-deploy
3. Test user creation - emails should work!

## How It Works
- Code checks for `SENDGRID_API_KEY` environment variable
- If found: Uses SendGrid HTTP API ✅
- If not found: Falls back to Gmail SMTP (for local dev)

## Testing
After setup, create a new user in the dashboard. Check logs for:
```
Using SendGrid for email delivery
Email sent via SendGrid: 202
```

## Free Tier Limits
- 100 emails/day (plenty for your needs)
- No credit card required
- Upgrade anytime if needed

## Troubleshooting
- **"Sender not verified"**: Complete step 3 above
- **"Invalid API key"**: Check you copied the full key
- **Still not working**: Check Render logs for specific error
