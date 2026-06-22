# Vendor Onboarding Deployment

The onboarding workflow requires these production secrets:

- `TAX_ID_ENCRYPTION_KEY`: exactly 32 random bytes encoded as 64 hexadecimal characters or base64.
- `EMAIL_FROM`: a Resend-verified business sender, for example `Hutta Home Services <vendors@yourdomain.com>`.
- `EMAIL_REPLY_TO`: the monitored reply address for vendor questions.
- `RESEND_API_KEY`, or the existing `EMAIL_USER` and `EMAIL_PASSWORD` temporary Gmail SMTP credentials.
- `PUBLIC_APP_URL` and `FRONTEND_URL`: `https://hutta-home-services-dashboard-main.onrender.com` without a trailing path.

Production refuses localhost, private-network, non-HTTPS, and path-bearing public application URLs. Until a business domain is available, Gmail remains a temporary fallback and the dashboard warns staff that delivery may enter Spam. After purchasing a domain, verify its SPF and DKIM records in Resend, publish a DMARC policy, set `EMAIL_FROM`, and redeploy. Resend is selected automatically only when both its API key and a business-domain sender are configured.

Generate an encryption key locally without placing it in source control:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Safe rollout order

1. Configure all secrets in Render.
2. Deploy the backend and frontend changes.
3. Run the read-only migration audit:

   ```powershell
   npm run migrate:vendor-onboarding
   ```

4. Confirm the counts, then apply once:

   ```powershell
   npm run migrate:vendor-onboarding:apply
   ```

5. Test invitation delivery with a staff-controlled email before sending a real vendor invitation.
6. Resend any invitation previously delivered with a localhost link. Resending rotates the token, so the old link immediately stops working.

The migration never changes or deletes attachment data. Invitation tokens are stored only as hashes, and Tax IDs are encrypted with AES-256-GCM.
