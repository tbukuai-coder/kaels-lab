# AGENTS.md — Kael's Lab

## What Is This?

A knowledge base built with **Astro Starlight**, deployed on **Cloudflare Pages**. Auto-deploys on push to `main`.

- **Live:** https://kaels-lab.pages.dev
- **Framework:** Astro 6 + Starlight 0.38
- **Theme:** Electric Amber (custom CSS, no Tailwind)
- **Repo:** `tbukuai-coder/kaels-lab`

## Project Structure

```
├── astro.config.mjs          # Site config, sidebar, customCss
├── src/
│   ├── content/
│   │   ├── config.ts         # Content collection config
│   │   └── docs/
│   │       ├── index.mdx     # Landing page (splash template)
│   │       ├── ai/           # AI & Tools
│   │       ├── dev/          # Dev & Code
│   │       ├── infra/        # Infra & Self-Hosting
│   │       └── security/     # Security & Privacy
│   └── styles/
│       └── custom.css        # Electric Amber color scheme
└── package.json
```

## Categories

| Category | Directory | Slug |
|----------|-----------|------|
| AI & Tools | `src/content/docs/ai/` | `/ai/` |
| Dev & Code | `src/content/docs/dev/` | `/dev/` |
| Infra & Self-Hosting | `src/content/docs/infra/` | `/infra/` |
| Security & Privacy | `src/content/docs/security/` | `/security/` |

## Adding Content

### New article in existing category

Create `src/content/docs/<category>/<slug>.md`:

```markdown
---
title: Article Title
description: One-line summary for SEO and previews.
---

Content here.
```

Sidebar auto-populates via `autogenerate` — no config changes needed.

### New category

1. Create `src/content/docs/<slug>/index.md` with title + description
2. Add sidebar entry in `astro.config.mjs`:
   ```js
   { label: 'Category Name', autogenerate: { directory: 'slug' } },
   ```
3. Add a Card to `src/content/docs/index.mdx` (use Starlight built-in icons only)
4. Build, commit, push

## Build & Deploy

```bash
npm install        # First time only
npm run build      # Verify no errors
npm run dev        # Local preview at localhost:4321
```

Push to `main` → Cloudflare auto-deploys in ~30 seconds.

## Writing Style

- Practical, no fluff — every article should be actionable
- Direct tone, present tense
- Use code blocks for commands, tables for comparisons
- Include a "Key takeaway" or "Quick take" for skimmers
- File names: lowercase, hyphenated (`momentum-etfs.md`)

## Design Rules

- **Icons:** Only use [Starlight built-in icons](https://starlight.astro.build/reference/icons/) — no `seti:*`, no arbitrary icon names
- **Theme:** Custom CSS in `src/styles/custom.css` — overrides `--sl-color-accent-*` and `--sl-color-gray-*`
- **No edit links, no git info, no credits** — clean reader experience
- **No external fonts** — system font stack only

## Don'ts

- Don't add Tailwind (not needed, adds complexity)
- Don't modify the splash landing page layout without asking
- Don't commit `node_modules/` or `dist/`
- Don't change the color scheme without asking — it's intentional
- Don't add social links or contributor info
