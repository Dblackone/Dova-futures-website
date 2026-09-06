# Production deployment and domain runbook

## Target architecture

`dovafutures.com` and `www.dovafutures.com` point to one Render Node web
service. Express serves the frontend and the same-origin `/api/contact`
endpoint. Render terminates HTTPS and performs health checks at `/api/health`.

This replaces GitHub Pages as the production host because GitHub Pages cannot
execute the contact backend.

## 1. Deploy the Render service

1. In Render, create a Blueprint from this GitHub repository and review
   `render.yaml`.
2. Keep the production `starter` plan for no idle spin-down. A free plan can be
   used for staging, but it can make the first request after inactivity slow.
3. Set these secret environment variables in Render:
   - `SMTP_HOST`
   - `SMTP_USER`
   - `SMTP_PASS`
4. Confirm `SMTP_PORT` and `SMTP_SECURE` match the email provider. Typical
   STARTTLS uses port `587` with `SMTP_SECURE=false`; implicit TLS commonly
   uses port `465` with `SMTP_SECURE=true`.
5. Wait for the GitHub checks and Render health check to pass.
6. Test the Render-provided `onrender.com` URL, including one controlled email
   enquiry, before changing DNS.

## 2. Add the domains in Render

Add `dovafutures.com` under the service's Custom Domains settings. Render will
also add `www.dovafutures.com` and redirect it to the root domain. Do not change
Namecheap DNS until the service itself is healthy.

## 3. Migrate Namecheap DNS

Current production points to GitHub Pages. In Namecheap Advanced DNS:

1. Record or screenshot the existing website records for rollback.
2. Remove the four GitHub Pages `A` records for host `@`:
   - `185.199.108.153`
   - `185.199.109.153`
   - `185.199.110.153`
   - `185.199.111.153`
3. Add an `A` record for host `@` pointing to Render's load balancer:
   `216.24.57.1`.
4. Replace the `www` CNAME target `dblackone.github.io` with the exact Render
   service hostname shown in the dashboard, such as
   `dova-futures-website.onrender.com`.
5. Remove website `AAAA` records if any exist. Do not modify MX or other email
   records during the website cutover.
6. Use the lowest available TTL during migration, save, then click **Verify**
   in Render.
7. Confirm both domain variants use HTTPS, `www` redirects to the root, the
   health endpoint returns `{"status":"ok"}`, and the contact form delivers.

## 4. Email-domain checks

The domain currently has an MX record, but the September 6, 2026 DNS audit did
not find SPF or DMARC TXT records and did not find a common DKIM selector. This
does not block the website deployment, but it can reduce deliverability for
messages sent as `no-reply@dovafutures.com`.

Before production email delivery is considered complete:

1. Confirm the actual mail provider for `dovafutures.com`.
2. Publish the provider's SPF record.
3. Enable DKIM in the provider and publish its exact selector record.
4. Start DMARC in monitoring mode (`p=none`) with a reporting mailbox, review
   reports, then strengthen the policy after legitimate senders are aligned.
5. Make sure `CONTACT_FROM_EMAIL` is a sender the SMTP provider authorizes.

Never guess or combine email records. Use the exact values supplied by the
mail provider so existing company email is not interrupted.

## Verification

Run locally before release:

```bash
npm ci
npm audit
npm test
```

After release, verify:

- `https://dovafutures.com/`
- `https://www.dovafutures.com/`
- `https://dovafutures.com/api/health`
- one contact-form email and one WhatsApp enquiry
- mobile navigation and project filters
- browser security headers and certificate validity

## Rollback

If Render fails after DNS cutover, restore the four previous GitHub Pages `A`
records and the `www` CNAME target `dblackone.github.io`. Keep the previous
GitHub Pages deployment available until Render and SMTP have been stable for
at least 48 hours.
