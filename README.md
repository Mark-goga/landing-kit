# landing-kit

> ⚠️ **Shared code.** This repo is a git submodule of every landing (Fluxo, Dzing, and future). A change on `main` ships to every consumer the next time they bump the submodule pointer. Read [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md) **before** editing anything here.

## Docs

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — layout, boundary between kit and consumer, data flow
- [`docs/CONSUMERS.md`](./docs/CONSUMERS.md) — how a landing wires the kit in (aliases, env, expected `@site/*` files)
- [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md) — golden rules + blast-radius checklist

## Overview

Shared Astro landing chrome consumed by Fluxo, Dzing, and future landings as a
git submodule. Ships:

- `src/components` — Header, Footer, Hero, Why, Features, Pricing, Faq, Cta,
  Modal, PolicyDocument, Turnstile + Tracking wrappers.
- `src/layouts` — LandingLayout, PageLayout, BlogArticleLayout, GeneratedBlogArticleLayout.
- `src/pages` — cookies, privacy, unsubscribe, 404, robots.txt, sitemap.xml,
  and the dynamic auto-generated blog routes (`blog/[slug]`, `[locale]/blog/[slug]`).
- `src/api` — orval-generated MindAI backend client (`content-publishing.ts`
  + `model/**` + Zod schemas).
- `src/scripts` — `sync-blog-content`, `assign-related-posts`,
  `pull-mindai-spec`, `fix-static-paths`.
- `src/content.config.ts` — Astro Content Collections schema for the generated
  blog corpus. Re-exported by each landing's own `src/content.config.ts`.
- `src/config/site.ts` — env-driven `siteConfig`, tokens (`themeColor`,
  `trackingGlobal`, `googleFontsUrl`, favicons, OG image, etc.).
- `src/styles/styles.css` — base landing styles. Landings override brand tokens
  via CSS variables in their own root stylesheet.
- `orval.config.ts`, `openapi/mindai.json` — MindAI API spec + generator config.

## Consumer wiring

Each landing:

1. Adds this repo as a git submodule at `landing-kit/`.
2. Aliases in `tsconfig.json`:
   ```json
   "paths": {
     "@kit/*":  ["./landing-kit/src/*"],
     "@site/*": ["./src/*"]
   }
   ```
3. Aliases in `astro.config.mjs` (Vite):
   ```js
   vite: {
     resolve: {
       alias: {
         "@site": path.resolve(process.cwd(), "src"),
         "@kit":  path.resolve(process.cwd(), "landing-kit/src"),
       }
     }
   }
   ```
4. Implements the landing-specific modules the kit expects at `@site/…`:
   - `src/data/locales.ts` — copy (English + optional locales), FAQ, pricing,
     etc. Must match the `LandingContent` shape.
   - `src/content/blog-hero-images.ts` — allowed hero image paths (Zod enum).
   - `src/config/generated-blog-collision.ts` — human-authored slug list to
     guard against auto-generated collisions.
   - `src/config/site.ts` — thin re-export of `@kit/config/site` so `.env`
     values feed both kit and landing.
5. Provides `.env` values documented in `src/config/site.ts` (SITE_NAME,
   SITE_URL, APPLICATION_ID, LEADS_API_URL, CLARITY_PROJECT_ID, etc.).
6. Re-exports shared pages via thin stubs in `src/pages/` (e.g.
   `cookies.astro`, `privacy.astro`, `blog/[slug].astro`) that import the
   corresponding kit page.

## Brand tokenization

Everything brand-specific flows through `siteConfig` in `src/config/site.ts`:

| Token | Env var | Default |
| --- | --- | --- |
| `name` | `SITE_NAME` | required |
| `themeColor` | `SITE_THEME_COLOR` | `#4C27E3` |
| `trackingGlobal` | `SITE_TRACKING_GLOBAL` | `siteTrack` |
| `faviconPath` | `SITE_FAVICON_PATH` | `assets/favicon.png` |
| `faviconDarkPath` | `SITE_FAVICON_DARK_PATH` | `assets/favicon-dark.png` |
| `ogImagePath` | `SITE_OG_IMAGE_PATH` | `/assets/Photo_herosection_NEW.png` |
| `googleFontsUrl` | `SITE_GOOGLE_FONTS_URL` | Roboto Flex |

Landings can layer additional CSS variables in their own stylesheet without
touching the kit.

## Auto-generated blog

The MindAI backend (`content-seo/rebuild`) publishes MDX to each landing's
`src/content/blog/generated/` via the `publish-content.yml` workflow. Kit
holds the schema, layouts, and dynamic routes; the content itself stays inside
the landing so the pipeline path stays stable
(`managedContentRoot: src/content/blog/generated`).
