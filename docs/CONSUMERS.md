# Consuming landing-kit

## Add the submodule

```bash
git submodule add https://github.com/Mark-goga/landing-kit.git landing-kit
git submodule update --init --recursive
```

## Aliases

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@kit/*":  ["./landing-kit/src/*"],
      "@site/*": ["./src/*"]
    }
  }
}
```

`astro.config.mjs`:

```js
import path from "node:path";

export default defineConfig({
  vite: {
    resolve: {
      alias: {
        "@site": path.resolve(process.cwd(), "src"),
        "@kit":  path.resolve(process.cwd(), "landing-kit/src"),
      }
    }
  }
});
```

## Files the kit expects at `@site/…`

- `src/config/site.ts` — thin re-export of `@kit/config/site`
- `src/data/locales.ts` — must satisfy `LandingContent` shape
- `src/content/blog-hero-images.ts` — Zod enum of allowed hero image paths
- `src/config/generated-blog-collision.ts` — human-authored slug list, guards auto-generated collisions
- `src/content.config.ts` — re-export kit content collections schema
- `src/pages/*.astro` — thin stubs importing kit pages (cookies, privacy, blog/[slug], etc.)

## Required env

`SITE_NAME`, `SITE_URL`, `APPLICATION_ID`, `LEADS_API_URL`, `CLARITY_PROJECT_ID`, `HERO_IMAGE_PATH`, `SITE_SCRIPT_PATH`, `ASTRO_BASE_PATH`.

## Optional env

| Var | Effect |
|---|---|
| `TERMLY_WEBSITE_UUID` | Termly consent banner |
| `GA_MEASUREMENT_ID` | GA4 loader |
| `TURNSTILE_SITE_KEY` | Cloudflare Turnstile on lead form |

> Search engine ownership verification (Google/Bing/Yandex Search Console) is done via **DNS TXT record**, not HTML meta tag — no env var needed.

See `src/config/site.ts` in the kit for defaults and full list.

## Brand tokens

| Token | Env var | Default |
|---|---|---|
| `name` | `SITE_NAME` | required |
| `themeColor` | `SITE_THEME_COLOR` | `#4C27E3` |
| `trackingGlobal` | `SITE_TRACKING_GLOBAL` | `siteTrack` |
| `faviconPath` | `SITE_FAVICON_PATH` | `assets/favicon.png` |
| `faviconDarkPath` | `SITE_FAVICON_DARK_PATH` | `assets/favicon-dark.png` |
| `ogImagePath` | `SITE_OG_IMAGE_PATH` | `/assets/Photo_herosection_NEW.png` |
| `googleFontsUrl` | `SITE_GOOGLE_FONTS_URL` | Roboto Flex |

Additional visual tweaks: layer CSS variables in consumer stylesheet, do not fork kit CSS.

## Updating to a newer kit revision

```bash
cd landing-kit
git fetch origin
git checkout <sha-or-main>
cd ..
git add landing-kit
git commit -m "chore: bump landing-kit to <sha>"
```

**Before committing the bump**: run consumer `npm run build` locally and eyeball the site. The submodule pointer is a hard dependency — a broken pointer breaks Vercel deploy.

## Pulling latest for a fresh clone / new machine

```bash
git clone <landing-repo>
cd <landing-repo>
git submodule update --init --recursive
```

Or clone with `--recurse-submodules` from the start.
