# Dova-futures — DOVA Futures Limited Company Hub

This repository is the **hub for all company undertakings** — every task,
project, and side project run by DOVA Futures Limited lives here, each isolated
in its own workspace.

## Orientation (humans and agents)

| Start here | What it is |
|------------|-----------|
| `AGENTS.md` | Entry pointer for any AI assistant, and who decides what |
| `CLAUDE.md` | The router + master loop — how every session must operate |
| `CODEX.md` | Entry pointer for the lead orchestrator |
| `governance/agents/GOVERNANCE.md` | Authority, permission, and how the rules change |
| `company/registry.md` | Index of every project: what it is, where its code lives, status |
| `company/` | Shared control point: brand, voice, goals, ethics, standards |
| `workspaces/<project>/` | Per-project context (`PROJECT.md`) + memory — read only yours |

**Authority:** Vollmann Akarakiri is the owner, project leader, and final
approving authority. **Codex (`@lead/vector`) is the lead orchestrator.** Claude
(`@lead/atlas`) is a senior planning and review agent. Every other assistant
works within its assigned role. Vollmann may authorize any agent to act across
any file, workspace, or agent boundary, and may grant an agent full permission
for a defined goal — see `governance/agents/GOVERNANCE.md`.

**Projects:** marketing website (repo root, GitHub Pages), preorder store
(`dova-preorder/`, Render), document templates (`documents/`), BIM standards
(`bim-standards/`), client jobs (`projects/`), and internal ops.

> Deploy note: website files intentionally live at the repo root (GitHub Pages
> ships the root; `CNAME` → dovafutures.com), and the store deploys from
> `dova-preorder/` via `render.yaml`. Do not relocate either without an
> approved migration plan.

---

## The website (this repo's root code)

Production single-page website with an Express contact-form backend.

### Features
- Contact form with backend email delivery to `info@dovafutures.com`
- Frontend + backend validation, honeypot spam protection
- Dual submit options: **Send Email** and **Send via WhatsApp**
- Active social links (Instagram, TikTok, WhatsApp)
- Structured asset paths under `/assets`

### Run locally
1. `npm install`
2. `cp .env.example .env` and fill SMTP values
3. `npm start`
4. Open `http://localhost:3000`

Full website context: `workspaces/website/PROJECT.md`.
