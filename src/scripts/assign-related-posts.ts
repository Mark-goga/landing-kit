#!/usr/bin/env tsx
// Assigns destination-owned "Read next" links after content sync.
// It never changes backend content. Re-run after `sync:blog` whenever the
// generated collection changes.

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";
import { isBlogHeroImage, type BlogHeroImage } from "../src/content/blog-hero-images";
import type { RelatedPost } from "../src/content/blog-presentation";
import type { BlogArticle } from "../src/data/locales";

// `blogContent` is Astro app data. The related-post script only needs it as a
// read-only catalog, so these fallbacks make that import safe in Node without
// changing the deploy environment's real values.
const scriptEnvDefaults: Record<string, string> = {
  SITE_NAME: "Fluxo",
  CLARITY_PROJECT_ID: "script",
  HERO_IMAGE_PATH: "assets/hero.png",
  SITE_SCRIPT_PATH: "script.js",
  LEADS_API_URL: "https://fluxo.today/api",
  APPLICATION_ID: "script",
  SITE_URL: "https://fluxo.today/",
};
for (const [key, value] of Object.entries(scriptEnvDefaults)) {
  process.env[key] ??= value;
}
const { blogContent } = await import("../src/data/locales");

const MAX_RELATED_POSTS = 3;
const SUPPORTED_LOCALES = new Set(["en", "uk", "es", "de"]);
const STOP_WORDS = new Set([
  "about", "after", "also", "and", "are", "article", "been", "being", "but", "can", "for", "from",
  "have", "how", "into", "its", "more", "not", "now", "one", "our", "that", "the", "their", "this",
  "these", "they", "through", "what", "when", "with", "you", "your",
]);

type Frontmatter = Record<string, unknown>;

type Article = {
  file: string;
  writable: boolean;
  key: string;
  locale: string;
  slug: string;
  title: string;
  metaDescription: string;
  pageType: string;
  translationGroupId: string | null;
  heroImage?: BlogHeroImage;
  data: Frontmatter;
  body: string;
  titleTerms: Set<string>;
  descriptionTerms: Set<string>;
  bodyTerms: Set<string>;
};

const parseArgs = (argv: string[]): Record<string, string> => {
  const args: Record<string, string> = {};
  for (let index = 2; index < argv.length - 1; index++) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key?.startsWith("--") && value && !value.startsWith("--")) args[key.slice(2)] = value;
  }
  return args;
};

const parseMarkdown = (source: string): { data: Frontmatter; body: string } => {
  if (!source.startsWith("---\n")) throw new Error("Missing frontmatter");
  const end = source.indexOf("\n---\n", 4);
  if (end === -1) throw new Error("Unterminated frontmatter");
  const data = YAML.parse(source.slice(4, end));
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Frontmatter must be an object");
  }
  return { data: data as Frontmatter, body: source.slice(end + 5) };
};

const tokenize = (value: string): Set<string> =>
  new Set(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/u)
      .filter((term) => term.length >= 3 && !STOP_WORDS.has(term)),
  );

const overlap = (left: Set<string>, right: Set<string>): number => {
  let total = 0;
  for (const term of left) if (right.has(term)) total++;
  return total;
};

const relevance = (from: Article, to: Article): number => {
  const titleOverlap = overlap(from.titleTerms, to.titleTerms);
  const descriptionOverlap = overlap(from.descriptionTerms, to.descriptionTerms);
  const bodyOverlap = overlap(from.bodyTerms, to.bodyTerms);
  return titleOverlap * 8 + descriptionOverlap * 3 + bodyOverlap + (from.pageType === to.pageType ? 1 : 0);
};

const routeFor = (locale: string, slug: string): string =>
  locale === "en" ? `/blog/${slug}/` : `/${locale}/blog/${slug}/`;

const hasPath = (graph: Map<string, Set<string>>, from: string, target: string): boolean => {
  const visited = new Set<string>();
  const queue = [from];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    if (current === target) return true;
    visited.add(current);
    for (const next of graph.get(current) ?? []) queue.push(next);
  }
  return false;
};

const toArticle = async (file: string, root: string): Promise<Article> => {
  const { data, body } = parseMarkdown(await fs.readFile(file, "utf8"));
  const locale = String(data.locale ?? "");
  const slug = String(data.slug ?? "");
  const title = String(data.title ?? "");
  const metaDescription = String(data.metaDescription ?? "");
  const pageType = String(data.pageType ?? "");
  if (!SUPPORTED_LOCALES.has(locale) || !slug || !title || !metaDescription || !pageType) {
    throw new Error(`Invalid related-post frontmatter: ${path.relative(root, file)}`);
  }
  const heroImage = isBlogHeroImage(data.heroImage) ? data.heroImage : undefined;
  return {
    file,
    writable: true,
    key: `${locale}/${slug}`,
    locale,
    slug,
    title,
    metaDescription,
    pageType,
    translationGroupId: typeof data.translationGroupId === "string" ? data.translationGroupId : null,
    heroImage,
    data,
    body,
    titleTerms: tokenize(`${slug.replaceAll("-", " ")} ${title}`),
    descriptionTerms: tokenize(metaDescription),
    bodyTerms: tokenize(body),
  };
};

const toManualArticle = (locale: string, slug: string, article: BlogArticle): Article => {
  const heroCandidate = `/${article.heroAsset}`;
  const heroImage = isBlogHeroImage(heroCandidate) ? heroCandidate : undefined;
  const body = article.bodyHtml.replace(/<[^>]*>/gu, " ");
  return {
    file: "",
    writable: false,
    key: `${locale}/${slug}`,
    locale,
    slug,
    title: article.title,
    metaDescription: article.meta.description,
    pageType: "manual",
    translationGroupId: `manual:${locale}:${slug}`,
    heroImage,
    data: {},
    body,
    titleTerms: tokenize(`${slug.replaceAll("-", " ")} ${article.title}`),
    descriptionTerms: tokenize(article.meta.description),
    bodyTerms: tokenize(body),
  };
};

const manualArticles = (): Article[] =>
  Object.entries(blogContent).flatMap(([locale, entries]) =>
    Object.entries(entries).map(([slug, article]) => toManualArticle(locale, slug, article)),
  );

const listMarkdownFiles = async (root: string): Promise<string[]> => {
  const files: string[] = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const item = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await listMarkdownFiles(item)));
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(item);
  }
  return files;
};

const assignRelatedPosts = (articles: Article[]): Map<string, RelatedPost[]> => {
  const sorted = [...articles].sort((a, b) => a.key.localeCompare(b.key));
  const graph = new Map(sorted.map((article) => [article.key, new Set<string>()]));
  const inbound = new Map(sorted.map((article) => [article.key, 0]));
  const related = new Map(sorted.map((article) => [article.key, [] as RelatedPost[]]));

  for (const article of sorted.filter((item) => item.writable)) {
    const candidates = sorted.filter(
      (candidate) =>
        candidate.locale === article.locale &&
        candidate.key !== article.key &&
        candidate.translationGroupId !== article.translationGroupId &&
        relevance(article, candidate) > 0,
    );

    for (let slot = 0; slot < MAX_RELATED_POSTS; slot++) {
      const selectedKeys = graph.get(article.key) ?? new Set<string>();
      const candidate = candidates
        .filter((item) => !selectedKeys.has(item.key) && !hasPath(graph, item.key, article.key))
        .sort((left, right) => {
          const leftScore = relevance(article, left) * 10 - (inbound.get(left.key) ?? 0) * 3;
          const rightScore = relevance(article, right) * 10 - (inbound.get(right.key) ?? 0) * 3;
          return rightScore - leftScore || left.key.localeCompare(right.key);
        })[0];
      if (!candidate) break;

      selectedKeys.add(candidate.key);
      inbound.set(candidate.key, (inbound.get(candidate.key) ?? 0) + 1);
      related.get(article.key)?.push({
        href: routeFor(candidate.locale, candidate.slug),
        title: candidate.title,
        metaDescription: candidate.metaDescription,
        ...(candidate.heroImage ? { heroImage: candidate.heroImage } : {}),
      });
    }
  }
  return related;
};

const writeArticle = async (article: Article, relatedPosts: RelatedPost[]): Promise<void> => {
  article.data.relatedPosts = relatedPosts;
  const yaml = YAML.stringify(article.data, {
    defaultStringType: "QUOTE_DOUBLE",
    defaultKeyType: "PLAIN",
    lineWidth: 0,
    minContentWidth: 0,
  });
  const target = `${article.file}.tmp`;
  await fs.writeFile(target, `---\n${yaml}---\n${article.body.replace(/^\n+/u, "")}`, "utf8");
  await fs.rename(target, article.file);
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv);
  const root = path.resolve(args["managed-root"] ?? "src/content/blog/generated");
  if (!root.replace(/\\/g, "/").endsWith("/content/blog/generated")) {
    throw new Error(`Refusing to touch managed root outside content/blog/generated: ${root}`);
  }
  const generatedArticles = await Promise.all(
    (await listMarkdownFiles(root)).map((file) => toArticle(file, root)),
  );
  const articles = [...generatedArticles, ...manualArticles()];
  const related = assignRelatedPosts(articles);
  await Promise.all(
    generatedArticles.map((article) => writeArticle(article, related.get(article.key) ?? [])),
  );
  process.stdout.write(
    `${JSON.stringify({ articles: generatedArticles.length, candidates: articles.length })}\n`,
  );
};

main().catch((error: unknown) => {
  process.stderr.write(`assign-related-posts failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
