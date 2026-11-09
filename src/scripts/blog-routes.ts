// Shared URL rules for blog articles: where an article lives, which of a
// landing's redirects belong to the blog, and how they are written into
// vercel.json. Used by the sync step and by the URL-retention check.

import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";

export const DEFAULT_LOCALE = "en";

export type BlogRedirect = {
  fromLocale: string;
  fromSlug: string;
  toLocale: string;
  toSlug: string | null;
};

type VercelRedirect = { source: string; destination: string; permanent?: boolean };
type VercelConfig = { redirects?: VercelRedirect[] } & Record<string, unknown>;

const BLOG_PATH_RE = /^\/(?:[a-z]{2}\/)?blog\//;

export const blogPath = (locale: string, slug: string | null): string => {
  const prefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;
  return slug === null ? `${prefix}/blog/` : `${prefix}/blog/${slug}/`;
};

export const isBlogPath = (source: string): boolean => BLOG_PATH_RE.test(source);

export const toVercelRedirects = (redirects: BlogRedirect[]): VercelRedirect[] =>
  redirects
    .map((redirect) => ({
      source: blogPath(redirect.fromLocale, redirect.fromSlug),
      destination: blogPath(redirect.toLocale, redirect.toSlug),
      permanent: true,
    }))
    .filter((redirect) => redirect.source !== redirect.destination)
    .sort((a, b) => a.source.localeCompare(b.source));

const readVercelConfig = async (file: string): Promise<VercelConfig> =>
  existsSync(file) ? (JSON.parse(await fs.readFile(file, "utf8")) as VercelConfig) : {};

// The blog's redirects are owned by the backend export; every other redirect in
// vercel.json is human-authored and kept as is.
export const writeBlogRedirects = async (
  repoRoot: string,
  redirects: BlogRedirect[],
): Promise<boolean> => {
  const file = path.join(repoRoot, "vercel.json");
  const config = await readVercelConfig(file);
  const kept = (config.redirects ?? []).filter((redirect) => !isBlogPath(redirect.source));
  const next = [...kept, ...toVercelRedirects(redirects)];
  const updated: VercelConfig = { ...config };
  if (next.length > 0) updated.redirects = next;
  else delete updated.redirects;

  const serialized = `${JSON.stringify(updated, null, 2)}\n`;
  const current = existsSync(file) ? await fs.readFile(file, "utf8") : "";
  if (serialized === current) return false;
  await fs.writeFile(file, serialized, "utf8");
  return true;
};

export const readRedirectSources = async (repoRoot: string): Promise<Set<string>> => {
  const config = await readVercelConfig(path.join(repoRoot, "vercel.json"));
  return new Set((config.redirects ?? []).map((redirect) => redirect.source));
};

export const findLostUrls = (
  before: Set<string>,
  after: Set<string>,
  redirected: Set<string>,
): string[] =>
  [...before].filter((route) => !after.has(route) && !redirected.has(route)).sort();
