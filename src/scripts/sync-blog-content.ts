#!/usr/bin/env tsx
// Sync backend-generated blog content into src/content/blog/generated/.
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
} from "../src/api/generated/content-publishing";
import type { ContentBuildExportDto } from "../src/api/generated/model";
import { rebuildControllerExportResponse } from "../src/api/generated/content-publishing.zod";
import { createContentPublishingRequestInit } from "../src/api/content-publishing-fetch";
import { BLOG_HERO_IMAGES, isBlogHeroImage, type BlogHeroImage } from "../src/content/blog-hero-images";

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

const selectHeroImage = async (post: BuildPost, managedRoot: string): Promise<BlogHeroImage | undefined> => {
  if (post.pageType === "video_summary") return undefined;

  const existingPath = path.join(managedRoot, post.locale, `${post.slug}.md`);
  try {
    const existing = parseMarkdown(await fs.readFile(existingPath, "utf8"));
    if (typeof existing.data === "object" && existing.data !== null) {
      const heroImage = (existing.data as Frontmatter).heroImage;
      if (isBlogHeroImage(heroImage)) return heroImage;
    }
  } catch (error: unknown) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }

  return BLOG_HERO_IMAGES[Math.floor(Math.random() * BLOG_HERO_IMAGES.length)];
};

const orderedFrontmatter = (post: BuildPost, heroImage?: BlogHeroImage): Frontmatter => {
  const base: Frontmatter = {
    schemaVersion: 1,
    draftId: post.draftId,
    slug: post.slug,
    locale: post.locale,
    pageType: post.pageType,
    title: post.title,
    metaDescription: post.metaDescription,
    createdAt: post.createdAt,
    translationGroupId: post.translationGroupId,
    faq: post.faq,
    references: post.references,
    author: post.author,
    sources: post.sources,
  };
  if (heroImage) base.heroImage = heroImage;
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

const serializePost = (post: BuildPost, heroImage?: BlogHeroImage): string => {
  const yaml = YAML.stringify(orderedFrontmatter(post, heroImage), {
    defaultStringType: "QUOTE_DOUBLE",
    defaultKeyType: "PLAIN",
    lineWidth: 0,
    minContentWidth: 0,
  });
  const body = post.bodyMdx.replace(/\r\n/g, "\n").replace(/\s+$/g, "");
  return `---\n${yaml}---\n\n${body}\n`;
};

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

  const posts: BuildPost[] = exportData.posts.filter(
    (post): post is BuildPost => post.includedInRebuild,
  );

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

  const desired: Array<{ draftId: string; locale: string; slug: string }> = [];
  for (const post of posts) {
    const rel = path.join(post.locale, `${post.slug}.md`);
    const dest = path.join(tmpRoot, rel);
    if (!dest.startsWith(`${tmpRoot}${path.sep}`)) {
      throw new Error(`Serialized path escaped managed root: ${dest}`);
    }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    const heroImage = await selectHeroImage(post, managedRoot);
    const serialized = serializePost(post, heroImage);
    await fs.writeFile(dest, serialized, { encoding: "utf8" });
    parseMarkdown(serialized);
    desired.push({ draftId: post.draftId, locale: post.locale, slug: post.slug });
  }

  const relRepoRoot = path.relative(process.cwd(), managedRoot);
  const manifest = {
    schemaVersion: 1 as const,
    rebuildId,
    applicationId,
    posts: desired.map((p) => ({
      draftId: p.draftId,
      locale: p.locale,
      slug: p.slug,
      path: `${relRepoRoot}/${p.locale}/${p.slug}.md`.replace(/\\/g, "/"),
    })),
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

  const files = manifest.posts.map((p) => ({ draftId: p.draftId, path: p.path }));
  process.stdout.write(`${JSON.stringify({ files })}\n`);
};

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(`sync-blog-content failed: ${message}\n`);
  process.exit(1);
});
