# Cloudflare Workers production runbook

## Architecture

Cloudflare Workers serves the static website from `dist/` and runs the same-origin
`/api/contact` endpoint. The endpoint validates requests, rejects the honeypot,
applies a per-isolate rate limit, and sends accepted enquiries through Resend's
HTTPS API. No SMTP server, Node server, or Render service is used in production.

## 1. Create and configure the accounts

1. Create a Cloudflare account and add `dovafutures.com` as a zone.
2. Before changing nameservers at Namecheap, copy every current DNS record into
   Cloudflare DNS, especially MX, SPF, DKIM, and any mail-related records. This
   avoids interrupting company email.
3. Change the Namecheap nameservers to the two Cloudflare-assigned nameservers
   and wait until the zone becomes active. Workers custom domains require a
   Cloudflare-managed zone.
4. Create a Resend account, add and verify `dovafutures.com`, and publish only
   the exact DNS records Resend provides. Do not replace existing email records
   by guesswork.

## 2. Deploy the Worker

Run locally first:

```bash
npm ci
npm test
npm run format:check
npm run build
npx wrangler login
npx wrangler secret put RESEND_API_KEY
npm run deploy
```

Enter the Resend API key only at the Wrangler secret prompt. It must never be
committed or placed in `wrangler.toml`.

After the first deploy, add `dovafutures.com` and `www.dovafutures.com` as
custom domains in the Cloudflare Worker dashboard. Make `dovafutures.com` the
canonical domain and redirect `www` to it in Cloudflare.

## 3. Verify before and after cutover

1. Test the generated `workers.dev` URL: website, `/api/health`, a valid contact
   enquiry, a malformed enquiry, and the Vollmann card.
2. Confirm Resend reports the test email as accepted and reply-to works.
3. Add the custom domains only once the Worker is healthy, then verify:
   - `https://dovafutures.com/`
   - `https://www.dovafutures.com/` redirects to the canonical domain
   - `https://dovafutures.com/api/health` returns `{ "status": "ok" }`
   - one real contact-form delivery
4. Keep the existing GitHub Pages DNS record values documented until the new
   domain has been stable for 48 hours.

## Security operations

The Worker provides input validation, source isolation, same-origin checks,
honeypot protection, and a lightweight per-isolate rate limit. Add a Cloudflare
WAF custom rule or Turnstile challenge if spam becomes persistent: in-memory
limits intentionally do not coordinate across all global Worker isolates.

## Rollback

If the Worker deployment fails, remove its custom-domain routes in Cloudflare
and restore the prior GitHub Pages DNS records only after confirming the old
site is still available. Do not alter MX or email-authentication records during
the web rollback.
