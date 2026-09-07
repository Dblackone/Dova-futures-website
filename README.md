# Dova Futures website

The production marketing website for DOVA Futures Limited. It is a static site
with a Cloudflare Worker contact API and Resend email delivery.

## Architecture

- `index.html`, `hallmark.css`, and `tokens.css` — public site
- `assets/`, `data/`, and `vollmann/` — public images, portfolio media, and digital card
- `worker.mjs` — contact API, validation, security responses, and Resend delivery
- `scripts/build-static-assets.mjs` — creates the safe deploy-only `dist/` directory
- `wrangler.toml` — Cloudflare Worker configuration (no secrets)
- `CNAME` — retained only as a record of the prior GitHub Pages configuration
- `DEPLOYMENT.md` — DNS, Resend, and production runbook

Only files copied into `dist/` become public assets. The Worker source,
configuration, tests, and local environment files are excluded from deployment.

## Local development

```bash
npm ci
npm run dev -- --ip 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000`. A real contact email requires the `RESEND_API_KEY`
secret to be configured in Cloudflare; do not put it in this repository.

## Quality checks

```bash
npm test
npm audit --audit-level=high
npm run format:check
```

## Deploy

Follow [DEPLOYMENT.md](DEPLOYMENT.md). The deployment requires access to the
Cloudflare account, a verified Resend sending domain, and the Namecheap domain
settings.
