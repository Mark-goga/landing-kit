# landing-kit — Architecture

Shared Astro landing chrome consumed as a **git submodule** by every landing project (Fluxo, Dzing, and future ones). Any change here ships to every consumer the next time they bump the submodule pointer.

Repo: `https://github.com/Mark-goga/landing-kit.git` — branch `main`.

## Layout

```
landing-kit/
├── src/
│   ├── components/     Astro UI blocks (Header, Footer, Hero, Why, Features,
│   │                   Pricing, Faq, Cta, Modal, PolicyDocument, Breadcrumb,
│   │                   BlogIndex, KeepReading, TableOfContents,
│   │                   TurnstileScript, TrackingScripts, LandingPage)
│   ├── layouts/        LandingLayout, PageLayout, BlogArticleLayout,
│   │                   BlogIndexLayout, GeneratedBlogArticleLayout
│   ├── pages/          Shared routes: 404, robots.txt, sitemap.xml,
│   │                   blog/[slug], [locale]/blog/[slug], blog/index,
│   │                   [locale]/blog/index
│   ├── config/         siteConfig (env-driven brand tokens), locale types
│   ├── content/        Astro Content Collections schema for generated blog
│   ├── api/generated/  orval-generated MindAI client + Zod schemas
│   ├── openapi/        openapi spec snapshots
│   ├── lib/            shared helpers
│   └── scripts/        sync-blog-content, assign-related-posts,
│                       pull-mindai-spec, fix-static-paths
├── orval.config.ts
├── astro.config.reference.mjs   reference config consumers copy from
└── package.json                 @mark-goga/landing-kit (private)
```

## Boundary — what belongs where

| Belongs in **kit** | Belongs in **consumer** |
|---|---|
| Reusable UI, layouts, dynamic routes | Copy (locales), brand assets, `.env` |
| MindAI client + OpenAPI + orval config | `src/data/locales.ts`, `blog-hero-images.ts` |
| Blog content schema + pipeline scripts | `src/content/blog/generated/` MDX corpus |
| `siteConfig` env plumbing | `src/config/site.ts` thin re-export |
| Cross-landing bug fixes | Landing-specific pages under `src/pages/` |

Rule of thumb: if only one landing needs it, it lives in the landing. If two or more do, it belongs in the kit.

## Data flow

1. Consumer `.env` values (`SITE_NAME`, `SITE_URL`, `APPLICATION_ID`, `LEADS_API_URL`, `CLARITY_PROJECT_ID`, `SITE_THEME_COLOR`, `SITE_FAVICON_PATH`, etc.) feed `siteConfig`.
2. Consumer `@site/data/locales.ts` provides copy that matches `LandingContent` shape.
3. Kit components read both and render.
4. Blog: MindAI backend publishes MDX to consumer's `src/content/blog/generated/` via GitHub workflow; kit provides schema + `[slug]` route + layout.

## Alias contract

Consumers alias the kit and their own tree the same way — kit code always imports own kit files via `@kit/*`, and consumer-owned files via `@site/*`. Break the alias contract and every consumer stops building.
