#!/usr/bin/env tsx
// Sync backend-generated MDX blog content into src/content/blog/generated/.
// All types + runtime schemas come from the Orval-generated content-publishing
// client — this script owns only the deterministic file layout and I/O.
// See README-publishing.md for the full flow.

import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";
import {
  rebuildControllerExport,
} from "../api/generated/content-publishing";
import type { ContentBuildExportDto } from "../api/generated/model";
import { rebuildControllerExportResponse } from "../api/generated/content-publishing.zod";
import { createContentPublishingRequestInit } from "../api/content-publishing-fetch";
import { isBlogHeroImage, relatedPostSchema } from "../content/blog-presentation";

type BuildPost = ContentBuildExportDto["posts"][number];

const SUPPORTED_LOCALES = ["en", "uk", "es", "de"] as const;
const SLUG_RE = /^[a-z0-9-]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CliArgs = Record<string, string | true>;

const parseArgs = (argv: string[]): CliArgs => {
  const out: CliArgs = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg?.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
};

const requireArg = (args: CliArgs, name: string, envKey?: string): string => {
  const raw = args[name];
  if (typeof raw === "string" && raw.length > 0) return raw;
  const fromEnv = envKey ? process.env[envKey] : undefined;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  throw new Error(
    `Missing required argument --${name}` + (envKey ? ` or env ${envKey}` : ""),
  );
};

const FRONTMATTER_KEY_ORDER = [
  "schemaVersion",
  "draftId",
  "slug",
  "locale",
  "pageType",
  "title",
  "metaDescription",
  "createdAt",
  "modifiedAt",
  "translationGroupId",
  "heroImage",
  "relatedPosts",
  "faq",
  "references",
  "compared",
  "videoUrl",
  "itemCount",
  "importUrl",
  "author",
  "sources",
] as const;

type Frontmatter = Record<string, unknown>;

// A post is rewritten from scratch on every rebuild, so anything the landing
// owns has to be read back out of the file it is about to replace.
const readExistingFrontmatter = async (
  managedRoot: string,
  post: BuildPost,
): Promise<Frontmatter | undefined> => {
  for (const extension of [".mdx", ".md"]) {
    const existingPath = path.join(managedRoot, post.locale, `${post.slug}${extension}`);
    try {
      const existing = parseMarkdown(await fs.readFile(existingPath, "utf8"));
      if (typeof existing.data === "object" && existing.data !== null) return existing.data as Frontmatter;
    } catch (error: unknown) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    }
  }
  return undefined;
};

// The backend owns which image an article wears (picked once, least-used
// first, from the app's R2 folder) so the landing and the mobile app show the
// same one. The landing keeps a local copy under public/ for speed and SEO;
// a file already on disk is never fetched again, because R2 keys are never
// reused for a different picture.
const HERO_DIR = "assets/blog";
const HERO_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(avif|gif|jpe?g|png|webp)$/i;

type BuildHeroImage = NonNullable<BuildPost["heroImage"]>;

const downloadHeroImage = async (hero: BuildHeroImage, publicRoot: string): Promise<string> => {
  if (!HERO_FILE_RE.test(hero.fileName)) {
    throw new Error(`Unsafe hero image file name: ${hero.fileName}`);
  }
  const publicPath = `/${HERO_DIR}/${hero.fileName}`;
  const dest = path.join(publicRoot, HERO_DIR, hero.fileName);
  if (existsSync(dest)) return publicPath;
  const response = await fetch(hero.url);
  if (!response.ok) {
    throw new Error(`Hero image download failed (${response.status}): ${hero.url}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Hero image is not an image (${contentType}): ${hero.url}`);
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const partial = `${dest}.partial-${process.pid}`;
  await fs.writeFile(partial, Buffer.from(await response.arrayBuffer()));
  await fs.rename(partial, dest);
  return publicPath;
};

// Articles published before images moved to the backend still carry a local
// card; they keep it until the backend assigns one of its own.
const resolveHeroImage = async (
  post: BuildPost,
  existing: Frontmatter | undefined,
  publicRoot: string,
  downloads: Map<string, Promise<string>>,
): Promise<string | undefined> => {
  if (post.pageType === "video_summary") return undefined;
  const hero = post.heroImage;
  if (hero) {
    const pending = downloads.get(hero.url) ?? downloadHeroImage(hero, publicRoot);
    downloads.set(hero.url, pending);
    return pending;
  }
  return isBlogHeroImage(existing?.heroImage) ? existing.heroImage : undefined;
};

// "Read next" links are sticky the same way the hero image is: assign-related-
// posts picks them once and never re-picks. Dropping them here would hand that
// script a blank slate on every rebuild and silently reshuffle every article's
// recommendations. Stale entries are not this script's problem — the assignment
// step runs next and prunes links whose target is gone.
const carryOverRelatedPosts = (existing: Frontmatter | undefined): unknown[] | undefined => {
  if (!Array.isArray(existing?.relatedPosts)) return undefined;
  const kept = existing.relatedPosts.filter((entry) => relatedPostSchema.safeParse(entry).success);
  return kept.length > 0 ? kept : undefined;
};

const orderedFrontmatter = (
  post: BuildPost,
  heroImage?: string,
  relatedPosts?: unknown[],
): Frontmatter => {
  const base: Frontmatter = {
    schemaVersion: 1,
    draftId: post.draftId,
    slug: post.slug,
    locale: post.locale,
    pageType: post.pageType,
    title: post.title,
    metaDescription: post.metaDescription,
    createdAt: post.createdAt,
    modifiedAt: post.updatedAt,
    translationGroupId: post.translationGroupId,
    faq: post.faq,
    references: post.references,
    author: post.author,
    sources: post.sources,
  };
  if (heroImage) base.heroImage = heroImage;
  if (relatedPosts) base.relatedPosts = relatedPosts;
  if (post.pageType === "comparison") base.compared = post.compared;
  if (post.pageType === "video_summary") base.videoUrl = post.videoUrl;
  if (post.pageType === "template") {
    base.itemCount = post.itemCount;
    base.importUrl = post.importUrl;
  }
  const ordered: Frontmatter = {};
  for (const key of FRONTMATTER_KEY_ORDER) {
    if (key in base) ordered[key] = base[key];
  }
  return ordered;
};

const serializePost = (post: BuildPost, heroImage?: string, relatedPosts?: unknown[]): string => {
  const yaml = YAML.stringify(orderedFrontmatter(post, heroImage, relatedPosts), {
    defaultStringType: "QUOTE_DOUBLE",
    defaultKeyType: "PLAIN",
    lineWidth: 0,
    minContentWidth: 0,
  });
  const body = escapeBareAngleBrackets(
    post.bodyMdx.replace(/\r\n/g, "\n").replace(/\s+$/g, ""),
  );
  return `---\n${yaml}---\n\n${body}\n`;
};

// The backend writes prose with literal "<" that isn't a tag (e.g. Apple
// Notes' "<<" link shortcut), which MDX's JSX parser rejects outright. Escape
// any "<" not followed by a valid tag start, but skip fenced/inline code so
// real code samples in the body render unchanged.
const escapeBareAngleBrackets = (text: string): string =>
  text
    .split(/(```[\s\S]*?```|`[^`\n]*`)/)
    .map((chunk, i) => (i % 2 === 0 ? chunk.replace(/<(?![a-zA-Z/>])/g, "&lt;") : chunk))
    .join("");

const parseMarkdown = (source: string): { data: unknown; body: string } => {
  if (!source.startsWith("---\n")) throw new Error("Missing frontmatter");
  const end = source.indexOf("\n---\n", 4);
  if (end === -1) throw new Error("Unterminated frontmatter");
  return {
    data: YAML.parse(source.slice(4, end)),
    body: source.slice(end + 5),
  };
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv);

  const rebuildId = requireArg(args, "rebuild-id");
  const managedRoot = path.resolve(requireArg(args, "managed-root"));
  const applicationId = requireArg(args, "application-id", "APPLICATION_ID");
  const exportFile = args["export-file"];
  const publicRoot = path.resolve(typeof args["public-root"] === "string" ? args["public-root"] : "public");

  if (!managedRoot.replace(/\\/g, "/").endsWith("/content/blog/generated")) {
    throw new Error(
      `Refusing to touch managed root outside content/blog/generated: ${managedRoot}`,
    );
  }
  if (!UUID_RE.test(rebuildId)) throw new Error(`Invalid rebuild id: ${rebuildId}`);
  if (!UUID_RE.test(applicationId)) {
    throw new Error(`Invalid application id: ${applicationId}`);
  }

  const exportData = rebuildControllerExportResponse.parse(
    typeof exportFile === "string"
      ? JSON.parse(await fs.readFile(path.resolve(exportFile), "utf8"))
      : await rebuildControllerExport(
          rebuildId,
          createContentPublishingRequestInit({
            backendUrl: requireArg(args, "backend-url", "BACKEND_URL"),
            apiKey: requireArg(args, "api-key", "PUBLISHING_API_KEY"),
          }),
        ),
  );
  if (exportData.schemaVersion !== 1) throw new Error("schemaVersion mismatch");
  if (exportData.application.id !== applicationId) {
    throw new Error(
      `Application mismatch: export=${exportData.application.id} expected=${applicationId}`,
    );
  }

  // Write EVERY post the backend returned — that includes both the
  // approved-for-this-rebuild set and previously-published posts kept in
  // the overlay. Filtering by `includedInRebuild` here caused the replace-all
  // strategy below to delete previously-published articles from the landing
  // repo whenever they weren't part of the current rebuild's approvals.
  const posts: BuildPost[] = exportData.posts;

  const routeSet = new Set<string>();
  for (const post of posts) {
    if (!SLUG_RE.test(post.slug)) throw new Error(`Invalid slug: ${post.slug}`);
    if (!SUPPORTED_LOCALES.includes(post.locale as (typeof SUPPORTED_LOCALES)[number])) {
      throw new Error(`Unsupported locale: ${post.locale}`);
    }
    const route = `${post.locale}/${post.slug}`;
    if (routeSet.has(route)) throw new Error(`Duplicate route in export: ${route}`);
    routeSet.add(route);
  }

  const tmpRoot = `${managedRoot}.tmp-${process.pid}-${Date.now()}`;
  await fs.mkdir(tmpRoot, { recursive: true });

  type WrittenPost = {
    draftId: string;
    locale: string;
    slug: string;
    includedInRebuild: boolean;
  };
  const written: WrittenPost[] = [];
  const heroDownloads = new Map<string, Promise<string>>();
  for (const post of posts) {
    const rel = path.join(post.locale, `${post.slug}.mdx`);
    const dest = path.join(tmpRoot, rel);
    if (!dest.startsWith(`${tmpRoot}${path.sep}`)) {
      throw new Error(`Serialized path escaped managed root: ${dest}`);
    }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    const existing = await readExistingFrontmatter(managedRoot, post);
    const heroImage = await resolveHeroImage(post, existing, publicRoot, heroDownloads);
    const serialized = serializePost(post, heroImage, carryOverRelatedPosts(existing));
    await fs.writeFile(dest, serialized, { encoding: "utf8" });
    parseMarkdown(serialized);
    written.push({
      draftId: post.draftId,
      locale: post.locale,
      slug: post.slug,
      includedInRebuild: post.includedInRebuild,
    });
  }

  const relRepoRoot = path.relative(process.cwd(), managedRoot);
  const manifestPosts = written.map((p) => ({
    draftId: p.draftId,
    locale: p.locale,
    slug: p.slug,
    path: `${relRepoRoot}/${p.locale}/${p.slug}.mdx`.replace(/\\/g, "/"),
    includedInRebuild: p.includedInRebuild,
  }));
  const manifest = {
    schemaVersion: 1 as const,
    rebuildId,
    applicationId,
    posts: manifestPosts,
  };
  await fs.writeFile(
    path.join(tmpRoot, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    { encoding: "utf8" },
  );

  if (existsSync(managedRoot)) {
    const backup = `${managedRoot}.old-${process.pid}-${Date.now()}`;
    await fs.rename(managedRoot, backup);
    try {
      await fs.rename(tmpRoot, managedRoot);
      await fs.rm(backup, { recursive: true, force: true });
    } catch (err) {
      await fs.rm(managedRoot, { recursive: true, force: true }).catch(() => undefined);
      await fs.rename(backup, managedRoot).catch(() => undefined);
      throw err;
    }
  } else {
    await fs.mkdir(path.dirname(managedRoot), { recursive: true });
    await fs.rename(tmpRoot, managedRoot);
  }

  // The `/complete` callback only needs the draftIds the backend expects to
  // publish (i.e. this rebuild's approved set). Reporting previously-published
  // posts here would re-trigger publishedPosts.upsert + markPublishedFromRebuild
  // for content the backend already tracks as published.
  const files = manifestPosts
    .filter((p) => p.includedInRebuild)
    .map((p) => ({ draftId: p.draftId, path: p.path }));
  process.stdout.write(`${JSON.stringify({ files })}\n`);
};

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(`sync-blog-content failed: ${message}\n`);
  process.exit(1);
});
