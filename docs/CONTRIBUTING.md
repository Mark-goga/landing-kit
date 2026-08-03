# Contributing to landing-kit

> ⚠️ **Shared code.** This repo is a git submodule of every landing (Fluxo, Dzing, future). A change here ships to every consumer the next time they bump the submodule pointer. **Every edit here is a multi-project change.** Treat it that way.

## Golden rules

1. **No consumer-specific hacks.** If the change only makes sense for one landing, put it in that landing's `src/`, not in the kit. Kit code must remain brand-neutral and env-driven.
2. **Do not break the alias contract.** Kit imports use `@kit/*` and `@site/*`. Never add relative imports that reach outside `landing-kit/src`, and never import consumer files by hard path.
3. **Do not rename or delete a public export without a migration path.** Public surface = anything under `src/components`, `src/layouts`, `src/pages`, `src/config`, `src/api/generated`, `src/content.config.ts`, `siteConfig` shape, `LandingContent` shape.
   - If you must break it: (a) rename with a deprecation re-export, (b) update **every** consumer in the same PR sequence, (c) note the breaking change in the commit body.
4. **Do not add a new required env var without also updating every consumer's `.env.example` and deployment.** Adding an optional var with a safe default is fine.
5. **Do not change `LandingContent` / locale schema without updating every consumer's `src/data/locales.ts`.** Zod will fail the build otherwise.
6. **Do not commit generated files by hand.** `src/api/generated/**` is produced by `npm run contracts:generate`. Regenerate, do not hand-edit.
7. **Do not add heavy runtime deps.** Consumers ship the kit as source. New deps must go in every consumer's `package.json`. Prefer zero-dep utilities.
8. **Do not break SSR / static output.** Kit must build cleanly under both output modes any consumer uses. Avoid `window`/`document` at top level; wrap in `client:*` directives or `if (import.meta.env.SSR)` guards.

## Before you push to `main`

Blast-radius checklist — run through this for every change:

- [ ] Change is generic across landings (no brand hardcoding).
- [ ] `npm run typecheck` in kit passes.
- [ ] `npm run contracts:check` passes if OpenAPI touched.
- [ ] Pulled kit into **each consumer** locally (`cd <consumer> && git -C landing-kit checkout <sha>`), ran the consumer's build, and eyeballed:
  - [ ] Landing page renders (Fluxo)
  - [ ] Landing page renders (Dzing)
  - [ ] `/privacy`, `/cookies`, `/404` render
  - [ ] `/blog` index + one generated blog page render
  - [ ] `robots.txt` + `sitemap.xml` return 200
- [ ] Any new env var documented in `docs/CONSUMERS.md` **and** in each consumer's README + deployment.
- [ ] Any breaking prop/schema change: consumers updated in the same session.

## Commit conventions

- One logical change per commit.
- Commit message body must call out consumer impact when the change is not purely additive:
  ```
  feat(header): add optional CTA slot

  Consumers: no action required (slot is optional, defaults to existing CTA).
  ```
  or
  ```
  refactor(siteConfig): rename `themeColor` → `brandColor`

  BREAKING: every consumer must rename `SITE_THEME_COLOR` env var in
  .env and Vercel. Consumer PRs bumping submodule land next.
  ```

## Bumping consumer to a new kit SHA

Done from the **consumer** repo, not from here:

```bash
cd <consumer>
git -C landing-kit fetch origin
git -C landing-kit checkout <sha>
npm run build       # must be green
git add landing-kit
git commit -m "chore: bump landing-kit to <sha>"
```

Never merge a consumer PR that bumps to an unpushed kit SHA — CI clones the public remote and will fail.

## When in doubt

- Fixing a bug that reproduces in one landing but the code is in the kit → the fix goes here, but you still test both landings.
- Wanting to add a landing-specific block → build it in the consumer, not here.
- Wanting to remove code that "nobody uses" → grep every consumer first. Absence of usage in Fluxo does not mean absence in Dzing.
