# assets/ — Static Media for Company Surfaces

**Definition:** an asset is a static media file consumed by a company surface —
the website, a PDF, a template: logos, project photography, icons, portfolio
documents.

**Belongs here:** brand logo lockups (`logo/`), website portfolio images
(`projects/`), UI icons (`widgets/icons/`), public marketing PDFs, and (for
now) the company project-photo archive (`Project Pictures/`).

**Does NOT belong here:** client-confidential job media (→
`projects/<JOB>/03-Site/` or `04-Photos/`), agent documents, code, or font
files with licences (a future `assets/fonts/` needs a logged decision first).

**Deploy note:** this folder is referenced by `index.html` and shipped whole by
GitHub Pages — do not move or rename it (or its referenced paths) outside an
approved Wave-2 migration. Brand token values live in `company/brand.md`, not
here.
