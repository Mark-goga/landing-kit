#!/usr/bin/env tsx
// Assigns destination-owned "Read next" links after content sync.
// It never changes backend content. Re-run after `sync:blog` whenever the
// generated collection changes.
//
// A recommendation is sticky, the same way a hero image is: once an article
// carries a link, that link is not re-picked. Each run only fills the slots an
// article is still missing and drops links whose target has disappeared, so
// yesterday's pairings survive today's rebuild.
//
// The one deliberate exception is reachability. A newly published article can
// only be reached from inside the site if some older article gives up a slot
// for it, so every article is topped up to MIN_INBOUND_LINKS inbound links. A
// donor loses at most one card, and only a card whose target keeps enough
// inbound links of its own. Publishing one article therefore moves a handful of
// links, not the whole graph. `lastmod` stays tied to the backend's modifiedAt,
// so the sitemap never claims content changed when it did not.

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";
import { isBlogHeroImage, type BlogHeroImage } from "@site/content/blog-hero-images";
import { relatedPostSchema, type RelatedPost } from "../content/blog-presentation";

type StaticBlogFrontmatter = {
  slug: string;
  locale: string;
  routePath: string;
  category: string;
  title: string;
  subtitle: string;
  metaTitle: string;
  metaDescription: string;
  author: string;
  readTime: string;
  heroAsset: string;
  heroAlt: string;
  publishedAt: string;
  modifiedAt?: string;
};

const STATIC_BLOG_ROOT = path.resolve(process.cwd(), "src/content/blog-static");

const MAX_RELATED_POSTS = 3;
// Every article must be reachable from at least this many other articles.
// Outbound links are sticky, inbound ones cannot be — see the rebalance pass.
const MIN_INBOUND_LINKS = 2;
// `sync-blog-content` writes `.mdx`; hand-authored static posts are `.md`.
// Both collections take part in the internal-link graph.
const ARTICLE_FILE_RE = /\.mdx?$/u;
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
  // Recommendations already stored in the file. Kept verbatim: the card copy is
  // editorial (static posts quote the target's subtitle, not its meta
  // description), so regenerating it would silently rewrite published text.
  existingRelated: RelatedPost[];
  titleTerms: Set<string>;
  descriptionTerms: Set<string>;
  bodyTerms: Set<string>;
};

type Slot = { key: string; frozen?: RelatedPost };

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

const readExistingRelated = (data: Frontmatter): RelatedPost[] => {
  if (!Array.isArray(data.relatedPosts)) return [];
  const out: RelatedPost[] = [];
  for (const entry of data.relatedPosts) {
    const parsed = relatedPostSchema.safeParse(entry);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
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
    existingRelated: readExistingRelated(data),
    titleTerms: tokenize(`${slug.replaceAll("-", " ")} ${title}`),
    descriptionTerms: tokenize(metaDescription),
    bodyTerms: tokenize(body),
  };
};

const toManualArticle = (file: string, fm: StaticBlogFrontmatter, bodyHtml: string, data: Frontmatter): Article => {
  const heroCandidate = `/${fm.heroAsset.replace(/^\/+/, "")}`;
  const heroImage = isBlogHeroImage(heroCandidate) ? heroCandidate : undefined;
  const body = bodyHtml.replace(/<[^>]*>/gu, " ");
  return {
    file,
    writable: true,
    key: `${fm.locale}/${fm.slug}`,
    locale: fm.locale,
    slug: fm.slug,
    title: fm.title,
    metaDescription: fm.metaDescription,
    pageType: "manual",
    translationGroupId: `manual:${fm.locale}:${fm.slug}`,
    heroImage,
    data,
    body: bodyHtml,
    existingRelated: readExistingRelated(data),
    titleTerms: tokenize(`${fm.slug.replaceAll("-", " ")} ${fm.title}`),
    descriptionTerms: tokenize(fm.metaDescription),
    bodyTerms: tokenize(body),
  };
};

const manualArticles = async (): Promise<Article[]> => {
  const out: Article[] = [];
  let dirs: string[];
  try {
    dirs = await fs.readdir(STATIC_BLOG_ROOT);
  } catch {
    return out;
  }
  for (const locale of dirs) {
    const dir = path.join(STATIC_BLOG_ROOT, locale);
    let stat;
    try { stat = await fs.stat(dir); } catch { continue; }
    if (!stat.isDirectory()) continue;
    for (const name of await fs.readdir(dir)) {
      if (!ARTICLE_FILE_RE.test(name)) continue;
      const file = path.join(dir, name);
      const source = await fs.readFile(file, "utf8");
      if (!source.startsWith("---\n")) continue;
      const end = source.indexOf("\n---\n", 4);
      if (end === -1) continue;
      const data = YAML.parse(source.slice(4, end)) as Frontmatter;
      const fm = data as unknown as StaticBlogFrontmatter;
      const body = source.slice(end + 5);
      out.push(toManualArticle(file, fm, body, data));
    }
  }
  return out;
};

const listMarkdownFiles = async (root: string): Promise<string[]> => {
  const files: string[] = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const item = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await listMarkdownFiles(item)));
    if (entry.isFile() && ARTICLE_FILE_RE.test(entry.name)) files.push(item);
  }
  return files;
};

// An article may link to any other article in its locale that is not a
// translation of itself. The link graph is deliberately allowed to contain
// cycles: forcing it acyclic starves whatever is processed last, because the
// last node of a DAG cannot have any outgoing edge at all.
const candidatesFor = (sorted: Article[], article: Article): Article[] =>
  sorted.filter(
    (candidate) =>
      candidate.locale === article.locale &&
      candidate.key !== article.key &&
      candidate.translationGroupId !== article.translationGroupId,
  );

const targetRelatedCount = (sorted: Article[], article: Article): number =>
  Math.min(MAX_RELATED_POSTS, candidatesFor(sorted, article).length);

const toCard = (candidate: Article): RelatedPost => ({
  href: routeFor(candidate.locale, candidate.slug),
  title: candidate.title,
  metaDescription: candidate.metaDescription,
  ...(candidate.heroImage ? { heroImage: candidate.heroImage } : {}),
});

const assignRelatedPosts = (articles: Article[]): Map<string, RelatedPost[]> => {
  const sorted = [...articles].sort((a, b) => a.key.localeCompare(b.key));
  const byKey = new Map(sorted.map((article) => [article.key, article]));
  const keyByRoute = new Map(sorted.map((article) => [routeFor(article.locale, article.slug), article.key]));
  const inbound = new Map(sorted.map((article) => [article.key, 0]));
  const writable = sorted.filter((item) => item.writable);

  const selected = new Map<string, Slot[]>();
  const addLink = (fromKey: string, slot: Slot): void => {
    selected.get(fromKey)?.push(slot);
    inbound.set(slot.key, (inbound.get(slot.key) ?? 0) + 1);
  };

  // Carry forward what each article already recommends. A stored link only
  // drops out when its target no longer exists — otherwise it would render a
  // dead "Read next" card.
  for (const article of sorted) {
    selected.set(article.key, []);
    const taken = new Set<string>();
    for (const post of article.existingRelated) {
      const targetKey = keyByRoute.get(post.href);
      if (!targetKey || targetKey === article.key || taken.has(targetKey)) continue;
      if (selected.get(article.key)!.length >= MAX_RELATED_POSTS) break;
      taken.add(targetKey);
      addLink(article.key, { key: targetKey, frozen: post });
    }
  }

  for (const article of writable) {
    const candidates = candidatesFor(sorted, article);
    while (selected.get(article.key)!.length < MAX_RELATED_POSTS) {
      const taken = new Set(selected.get(article.key)!.map((slot) => slot.key));
      const candidate = candidates
        .filter((item) => !taken.has(item.key))
        .sort((left, right) => {
          const leftScore = relevance(article, left) * 10 - (inbound.get(left.key) ?? 0) * 3;
          const rightScore = relevance(article, right) * 10 - (inbound.get(right.key) ?? 0) * 3;
          return rightScore - leftScore || left.key.localeCompare(right.key);
        })[0];
      if (!candidate) break;
      addLink(article.key, { key: candidate.key });
    }
  }

  // Outbound links are sticky, but inbound links cannot be: a freshly published
  // article can only become reachable if some older article gives up a slot for
  // it. Relevance alone also lets a handful of hub articles absorb nearly every
  // recommendation. So each article is topped up to MIN_INBOUND_LINKS inbound
  // links, taking one slot from the article that matches it best.
  const donated = new Set<string>();
  const relevanceToSlot = (offer: { donor: Article; key: string }): number =>
    offer.key === "" ? 0 : relevance(offer.donor, byKey.get(offer.key) as Article);
  const byInboundThenKey = (left: Article, right: Article): number =>
    (inbound.get(left.key) ?? 0) - (inbound.get(right.key) ?? 0) || left.key.localeCompare(right.key);

  for (const target of [...sorted].sort(byInboundThenKey)) {
    while ((inbound.get(target.key) ?? 0) < MIN_INBOUND_LINKS) {
      const offers = writable
        .filter(
          (donor) =>
            donor.locale === target.locale &&
            donor.key !== target.key &&
            donor.translationGroupId !== target.translationGroupId &&
            !selected.get(donor.key)!.some((slot) => slot.key === target.key),
        )
        .flatMap((donor) => {
          const slots = selected.get(donor.key)!;
          if (slots.length < MAX_RELATED_POSTS) return [{ donor, index: -1, stored: false, key: "" }];
          // Dropping a link must not push its own target under the floor.
          return slots
            .map((slot, index) => ({ donor, index, stored: slot.frozen !== undefined, key: slot.key }))
            .filter((item) => (inbound.get(item.key) ?? 0) > MIN_INBOUND_LINKS);
        });

      const donation = offers.sort((left, right) => {
        // A free slot costs nothing; a slot this run picked is next; a card the
        // article has been published with is the last resort.
        const cost = Number(left.index >= 0) - Number(right.index >= 0) || Number(left.stored) - Number(right.stored);
        if (cost !== 0) return cost;
        // Spreading donations keeps any single article from losing more than one
        // card, but it stays a preference: as a hard cap it exhausts the donor
        // pool and leaves the last few articles unreachable again.
        const spread = Number(donated.has(left.donor.key)) - Number(donated.has(right.donor.key));
        if (spread !== 0) return spread;
        // Same donor on both sides from here on: give up its weakest card.
        return (
          relevance(right.donor, target) - relevance(left.donor, target) ||
          left.donor.key.localeCompare(right.donor.key) ||
          relevanceToSlot(left) - relevanceToSlot(right) ||
          left.index - right.index
        );
      })[0];
      if (!donation) break;

      const slots = selected.get(donation.donor.key)!;
      if (donation.index >= 0) {
        const [dropped] = slots.splice(donation.index, 1);
        inbound.set(dropped.key, (inbound.get(dropped.key) ?? 0) - 1);
      }
      addLink(donation.donor.key, { key: target.key });
      donated.add(donation.donor.key);
    }
  }

  const related = new Map<string, RelatedPost[]>();
  for (const article of sorted) {
    related.set(
      article.key,
      selected.get(article.key)!.map((slot) => slot.frozen ?? toCard(byKey.get(slot.key) as Article)),
    );
  }
  return related;
};

// Keeps the key in the slot `sync-blog-content` writes it to, so re-running the
// assignment over freshly synced content produces a byte-identical file.
const withRelatedPosts = (data: Frontmatter, relatedPosts: RelatedPost[]): Frontmatter => {
  if ("relatedPosts" in data) return { ...data, relatedPosts };
  const out: Frontmatter = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = value;
    if (key === "heroImage") out.relatedPosts = relatedPosts;
  }
  if (!("relatedPosts" in out)) out.relatedPosts = relatedPosts;
  return out;
};

const writeArticle = async (article: Article, relatedPosts: RelatedPost[]): Promise<void> => {
  const yaml = YAML.stringify(withRelatedPosts(article.data, relatedPosts), {
    defaultStringType: "QUOTE_DOUBLE",
    defaultKeyType: "PLAIN",
    lineWidth: 0,
    minContentWidth: 0,
  });
  const target = `${article.file}.tmp`;
  await fs.writeFile(target, `---\n${yaml}---\n${article.body}`, "utf8");
  await fs.rename(target, article.file);
};

// Compared field by field rather than by raw JSON: key order inside a YAML
// mapping is incidental, and a reordered-but-equal entry is not a change.
const canonical = (posts: readonly unknown[]): string =>
  JSON.stringify(
    posts.map((post) => {
      const entry = (post ?? {}) as Partial<RelatedPost>;
      return [entry.href, entry.title, entry.metaDescription, entry.heroImage ?? null];
    }),
  );

// Nothing to add and nothing to drop means the file must not be touched at all:
// re-serialising it would churn the frontmatter of content nobody changed.
const needsWrite = (article: Article, relatedPosts: RelatedPost[]): boolean =>
  !Array.isArray(article.data.relatedPosts) ||
  canonical(article.data.relatedPosts) !== canonical(relatedPosts);

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv);
  const root = path.resolve(args["managed-root"] ?? "src/content/blog/generated");
  if (!root.replace(/\\/g, "/").endsWith("/content/blog/generated")) {
    throw new Error(`Refusing to touch managed root outside content/blog/generated: ${root}`);
  }
  const generatedArticles = await Promise.all(
    (await listMarkdownFiles(root)).map((file) => toArticle(file, root)),
  );
  const staticArticles = await manualArticles();
  const articles = [...generatedArticles, ...staticArticles];
  const sorted = [...articles].sort((a, b) => a.key.localeCompare(b.key));
  const related = assignRelatedPosts(articles);

  // Fail the publish run instead of shipping articles with an empty
  // "Keep reading" block: every article must reach its full quota whenever the
  // locale holds enough candidates to fill it.
  const starved = sorted
    .filter((article) => article.writable)
    .filter((article) => (related.get(article.key)?.length ?? 0) < targetRelatedCount(sorted, article))
    .map((article) => article.key);
  if (starved.length > 0) {
    throw new Error(
      `${starved.length} article(s) received fewer than the expected related posts: ${starved.join(", ")}`,
    );
  }

  const pending = articles
    .filter((article) => article.writable)
    .filter((article) => needsWrite(article, related.get(article.key) ?? []));
  await Promise.all(pending.map((article) => writeArticle(article, related.get(article.key) ?? [])));

  const counts = sorted.map((article) => related.get(article.key)?.length ?? 0);
  const inbound = new Map(sorted.map((article) => [routeFor(article.locale, article.slug), 0]));
  for (const posts of related.values()) {
    for (const post of posts) inbound.set(post.href, (inbound.get(post.href) ?? 0) + 1);
  }
  process.stdout.write(
    `${JSON.stringify({
      generated: generatedArticles.length,
      static: staticArticles.length,
      candidates: articles.length,
      updated: pending.length,
      preserved: articles.length - pending.length,
      minRelatedPosts: Math.min(...counts),
      minInboundLinks: Math.min(...inbound.values()),
      orphans: [...inbound.values()].filter((value) => value === 0).length,
    })}\n`,
  );
};

main().catch((error: unknown) => {
  process.stderr.write(`assign-related-posts failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
