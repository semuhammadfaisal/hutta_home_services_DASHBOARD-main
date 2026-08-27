# Vendor Onboarding Deployment

The onboarding workflow requires these production secrets:

- `TAX_ID_ENCRYPTION_KEY`: exactly 32 random bytes encoded as 64 hexadecimal characters or base64.
- `RESEND_API_KEY`: the existing Resend key for the verified smplfix sending domain.
- `EMAIL_FROM`: exactly `smplfix <sales@smplfix.com>`.
- `EMAIL_REPLY_TO`: exactly `sales@smplfix.com`.
- `EMAIL_USER` and `EMAIL_PASSWORD`: optional legacy Gmail fallback credentials.
- `PUBLIC_APP_URL` and `FRONTEND_URL`: `https://app.smplfix.com` without a trailing path.

Production refuses localhost, private-network, non-HTTPS, and path-bearing public application URLs. It uses the verified smplfix Resend sender first and falls back to Gmail only when Resend is unavailable. Keep credentials only in Render environment variables; never place them in this repository or documentation.

Generate an encryption key locally without placing it in source control:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Safe rollout order

1. Confirm `smplfix.com` remains verified in Resend and `sales@smplfix.com` can receive replies.
2. Rotate any secret pasted into chat, an issue, or source code.
3. Configure the Resend key and exact smplfix sender values in Render.
4. Deploy the backend and frontend changes.
5. Run the read-only migration audit:

   ```powershell
   npm run migrate:vendor-onboarding
   ```

6. Confirm the counts, then apply once:

   ```powershell
   npm run migrate:vendor-onboarding:apply
   ```

7. Use `/api/users/test-email` and a staff-controlled vendor invitation to verify delivery before sending a real invitation.
8. Confirm the received message shows `sales@smplfix.com` for both From and Reply-To.
9. Resend any invitation previously delivered with a localhost link. Resending rotates the token, so the old link immediately stops working.

The migration never changes or deletes attachment data. Invitation tokens are stored only as hashes, and Tax IDs are encrypted with AES-256-GCM.
