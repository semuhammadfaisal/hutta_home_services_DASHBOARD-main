# Resend Setup for Email Delivery

## Why Resend?
- Works on Render (HTTP API, not SMTP)
- Simple setup (2 minutes)
- Free tier: 100 emails/day, 3,000/month
- No domain verification required

## Setup Steps

### 1. Create Resend Account
1. Go to https://resend.com/
2. Sign up with GitHub or email
3. Verify your email

### 2. Get API Key
1. Go to **API Keys** in dashboard
2. Click **Create API Key**
3. Name: `Hutta Home Services`
4. Permission: **Sending access**
5. Click **Add**
6. **COPY THE KEY** (starts with `re_`)

### 3. Add to Render
1. Render Dashboard → Your Service → Environment
2. Add variable:
   - Key: `RESEND_API_KEY`
   - Value: `re_xxxxxxxxxx` (your key)
3. Save (auto-deploys)

### 4. Test
Create a new user - email should work instantly!

## How It Works
- Uses `onboarding@resend.dev` as sender (no setup needed)
- HTTP API bypasses SMTP port blocks
- Automatic fallback to Gmail SMTP for local development

## Free Tier
- 100 emails/day
- 3,000 emails/month
- No credit card required