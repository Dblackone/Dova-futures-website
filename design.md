# Design — Dova Futures Field Journal

A locked visual system for the Dova Futures marketing site. Every virtual page
shares this system; page variety comes from imagery, rhythm, and page-specific
composition—not from changing the brand language.

## Genre

Editorial: architectural catalogue, working archive, and field journal.

## Macrostructure family

- Home and marketing pages: **Photographic** with narrow editorial text bands.
- Projects: **Portfolio Grid** with irregular image spans and factual captions.
- About, services, and process: **Long Document** with tabular registers.

## Theme

- Paper: warm mineral off-white.
- Ink: near-black forest green.
- Accent: kiln clay, held below five percent of each viewport.
- Rules: quiet warm-grey hairlines; no floating card chrome or decorative gradients.

Canonical values live in `tokens.css`.

## Typography

- Display: Newsreader, weight 300, roman.
- Body: IBM Plex Sans, weight 400.
- Outlier: IBM Plex Mono, weight 400, for metadata and project indices only.
- Display tracking: `-0.035em`.
- Display scale anchor: `clamp(3rem, 6vw, 5.25rem)`.

## Spacing

Four-point named scale in `tokens.css`. Components use named tokens and logical
properties; mobile layouts are verified at 320, 375, 414, and 768 CSS pixels.

## Motion

- Easings: `--ease-out`, `--ease-in`, and `--ease-in-out`.
- Reveal: one image-settle on the home cover; no universal scroll reveals.
- Reduced motion: static/opacity-only, effectively immediate.

## Microinteractions stance

- Quiet state changes; no celebratory toasts.
- Keyboard focus appears immediately with a three-pixel ring.
- Hover changes are pointer-gated; touch targets are at least 44 pixels.

## CTA voice

- Primary: compact ink block in navigation and forms.
- Editorial: typographic link with a one-pixel underline and north-east arrow.
- Copy uses direct verbs: “Open,” “Read,” “Start,” and “Share.”

## Per-page allowances

- Marketing pages use supplied project photography only.
- Services/process pages are typography-led and may use one supporting project image.
- No generated stock photography, fake metrics, testimonials, or client logos.

## What pages MUST share

- Dova wordmark, forest/clay colour system, type pairing, CTA voice, square corners,
  hairline rules, factual project-caption language, and restrained motion.

## What pages MAY differ on

- Image crop, image scale, section density, and whether headings appear above or
  below the work they identify.

## Exports

### tokens.css

The production CSS export is [`tokens.css`](tokens.css).

### Tailwind v4 `@theme`

```css
@theme {
  --color-paper: oklch(96% 0.012 78);
  --color-ink: oklch(20% 0.025 156);
  --color-accent: oklch(49% 0.145 38);
  --font-display: "Newsreader", ui-serif, serif;
  --font-body: "IBM Plex Sans", ui-sans-serif, sans-serif;
  --spacing-md: 1.5rem;
  --text-display: clamp(3rem, 6vw, 5.25rem);
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

### DTCG `tokens.json`

```json
{
  "color": {
    "paper": { "$value": "oklch(96% 0.012 78)", "$type": "color" },
    "ink": { "$value": "oklch(20% 0.025 156)", "$type": "color" },
    "accent": { "$value": "oklch(49% 0.145 38)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "Newsreader", "$type": "fontFamily" },
    "body": { "$value": "IBM Plex Sans", "$type": "fontFamily" }
  },
  "space": { "md": { "$value": "1.5rem", "$type": "dimension" } }
}
```

### shadcn/ui CSS variables

```css
:root {
  --background: 96% 0.012 78;
  --foreground: 20% 0.025 156;
  --primary: 49% 0.145 38;
  --primary-foreground: 97% 0.01 78;
  --muted: 91% 0.016 78;
  --muted-foreground: 43% 0.018 105;
  --border: 72% 0.018 76;
  --input: 72% 0.018 76;
  --ring: 42% 0.15 38;
  --radius: 0;
}
```
