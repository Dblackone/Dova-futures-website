# Dova Futures website

The production marketing website for DOVA Futures Limited. It uses a small
Express application to serve the responsive HTML/CSS/JavaScript frontend and
deliver project enquiries through SMTP.

## Architecture

- `index.html` — public website and client-side navigation
- `assets/optimized/` — compressed WebP images used by the website
- `assets/` — original project media and company documents
- `server.js` — static delivery, health check, and secured contact API
- `server.test.js` — backend unit and integration tests
- `site-audit.spec.js` — responsive browser and performance regression tests
- `render.yaml` — Render web-service infrastructure configuration
- `DEPLOYMENT.md` — production deployment, DNS, email, and rollback runbook

The frontend and API intentionally run on the same origin. This keeps the
contact form simple, avoids cross-origin configuration, and lets one Render
service own TLS, security headers, compression, and caching.

## Local development

```bash
npm ci
cp .env.example .env
npm start
```

Open `http://localhost:3000`. SMTP credentials are only required to deliver a
real contact message. Never commit `.env` or credentials.

## Quality checks

```bash
npm test
npm audit
npm run format:check
```

The browser suite checks seven site views at mobile, tablet, and desktop
widths. It also verifies image loading, the contact API contract, source-file
isolation, and a 4 MB image-transfer budget.

## Deployment

Production is designed to run as one Render web service. Render waits for the
GitHub validation workflow to pass before deploying. Follow `DEPLOYMENT.md`
for the SMTP variables and the controlled Namecheap DNS migration.
