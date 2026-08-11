# data/ — Machine-Readable Application Inputs

**Definition:** data files consumed by application code at runtime — config,
JS/JSON/CSV inputs. Currently: `projects.js`, the website's portfolio
configuration loaded by `index.html`.

**Boundaries:**
- **data** feeds *programs* — if code reads it, it's data.
- **assets/** is binary media rendered to humans.
- **memory/** is agent operational state (status, queues, logs) — never read
  by application code.
- **workspaces/** is per-project agent context — never application input.

This folder is website-scoped and stays at root only because the website
deploys from the root (Wave-2 destination: the website app folder). Add new
application data for *other* apps inside those apps' own folders (e.g.
`dova-preorder/`), not here.
