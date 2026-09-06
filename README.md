# Dova Futures website

The standalone marketing website for DOVA Futures Limited. It is a vanilla
HTML/CSS/JS single-page site with an optional Express contact-form backend.

## What is here

- `index.html` — the public website and client-side navigation
- `vollmann/` — Vollmann Akarakiri's shareable digital card, vCard and portfolio links
- `assets/` — logos, project imagery, icons and portfolio documents
- `data/` — portfolio data used by the website
- `server.js` — optional Express server for local hosting and contact email
- `CNAME` — custom domain for GitHub Pages (`dovafutures.com`)

The preorder store is maintained in its own repository and is not part of this
website repository.

## Run locally

```bash
npm install
cp .env.example .env
npm start
```

Open `http://localhost:3000`. The static frontend can also be previewed with
any static file server. Contact email delivery requires the SMTP variables in
`.env`; no credentials belong in Git.

## Deployment

The GitHub Pages workflow publishes the repository root. The Express backend
is a separate runtime concern and must be hosted where Node.js and SMTP
environment variables are available.
