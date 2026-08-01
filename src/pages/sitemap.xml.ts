import { getCollection, type CollectionEntry } from "astro:content";
import { absoluteUrl, supportedLocales, xDefaultPath, type LocaleKey } from "../config/site";
import { HUMAN_BLOG_SLUGS } from "@site/config/generated-blog-collision";

const localePath = (l: LocaleKey, slug: string): string =>
  l === "en" ? `/blog/${slug}/` : `/${l}/blog/${slug}/`;

const blogIndexPath = (l: LocaleKey): string =>
  l === "en" ? "/blog/" : `/${l}/blog/`;

const alternateLinks = (hrefFor: (locale: (typeof supportedLocales)[number]) => string, xDefaultHref: string) =>
  [
    ...supportedLocales.map(
      (alternate) => `    <xhtml:link rel="alternate" hreflang="${alternate.hreflang}" href="${hrefFor(alternate)}" />`,
    ),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${xDefaultHref}" />`,
  ].join("\n");

const xmlEscape = (value: string): string =>
  value.replace(/[<>&"']/g, (ch) => {
    switch (ch) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      default:
        return "&apos;";
    }
  });

const imageBlock = (
  imageUrl: string,
  title: string | null,
  caption: string | null,
): string => {
  const lines = [`    <image:image>`, `      <image:loc>${xmlEscape(imageUrl)}</image:loc>`];
  if (title) lines.push(`      <image:title>${xmlEscape(title)}</image:title>`);
  if (caption) lines.push(`      <image:caption>${xmlEscape(caption)}</image:caption>`);
  lines.push(`    </image:image>`);
  return lines.join("\n");
};

const localeUrls = supportedLocales
  .map(
    (locale) => `  <url>
    <loc>${absoluteUrl(locale.path)}</loc>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
${alternateLinks((alternate) => absoluteUrl(alternate.path), absoluteUrl(xDefaultPath))}
  </url>`,
  )
  .join("\n");

const standaloneUrls = ["/privacy/", "/cookies/"]
  .map(
    (path) => `  <url>
    <loc>${absoluteUrl(path)}</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>`,
  )
  .join("\n");

// Freshness key used for cross-source sort: matches getBlogCards().freshnessAt
// so sitemap and blog index page appear in the same order.
type BlogUrlEntry = {
  loc: string;
  lastmod: string; // ISO datetime OR date-only (YYYY-MM-DD) — passed through untouched
  freshnessKey: string; // parseable-by-Date value used strictly for sort
  altBlock: string;
  image: string;
};

const normalizeDateInput = (raw: string): { display: string; key: string } => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { display: raw, key: `${raw}T00:00:00Z` };
  }
  const parsed = new Date(raw);
  const iso = Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
  return { display: iso, key: iso };
};

export async function GET() {
  const staticEntries = await getCollection("blogStatic");
  const staticBySlug = new Map<string, CollectionEntry<"blogStatic">[]>();
  for (const entry of staticEntries) {
    const list = staticBySlug.get(entry.data.slug) ?? [];
    list.push(entry);
    staticBySlug.set(entry.data.slug, list);
  }

  // Track per-locale freshest post so blog index page can carry a real lastmod.
  const localeFreshest = new Map<LocaleKey, string>();
  const bumpLocaleFreshness = (locale: LocaleKey, key: string) => {
    const current = localeFreshest.get(locale);
    if (!current || current < key) localeFreshest.set(locale, key);
  };

  const staticFreshness = (entry: CollectionEntry<"blogStatic">): { display: string | null; key: string } => {
    const rawModified = entry.data.modifiedAt;
    if (rawModified) return { display: normalizeDateInput(rawModified).display, key: normalizeDateInput(rawModified).key };
    // No modifiedAt → no <lastmod> emitted, but still contribute publishedAt to sort key.
    return { display: null, key: `${entry.data.publishedAt}T00:00:00Z` };
  };

  const blogEntries: BlogUrlEntry[] = [];

  for (const [slug, entries] of staticBySlug.entries()) {
    const byLocale = new Map<LocaleKey, CollectionEntry<"blogStatic">>();
    for (const e of entries) byLocale.set(e.data.locale as LocaleKey, e);
    const enEntry = byLocale.get("en");
    const xDefaultHref = enEntry
      ? absoluteUrl(enEntry.data.routePath)
      : absoluteUrl(localePath("en", slug));

    for (const locale of supportedLocales) {
      const entry = byLocale.get(locale.key) ?? enEntry;
      if (!entry) continue;
      const loc = absoluteUrl(entry.data.routePath);
      const { display: lastmodDisplay, key } = staticFreshness(entry);
      bumpLocaleFreshness(locale.key, key);
      const heroPath = `/${entry.data.heroAsset.replace(/^\/+/, "")}`;
      const image = imageBlock(
        absoluteUrl(heroPath),
        entry.data.title,
        entry.data.heroAlt,
      );
      const altBlock = alternateLinks((alternate) => {
        const alt = byLocale.get(alternate.key) ?? enEntry;
        return alt ? absoluteUrl(alt.data.routePath) : xDefaultHref;
      }, xDefaultHref);
      blogEntries.push({
        loc,
        lastmod: lastmodDisplay ?? "",
        freshnessKey: key,
        altBlock,
        image,
      });
    }
  }

  const generatedEntries = await getCollection("blog");
  const generatedFiltered = generatedEntries.filter(
    (entry) => !HUMAN_BLOG_SLUGS.includes(entry.data.slug),
  );

  const generatedFreshness = (data: CollectionEntry<"blog">["data"]): { display: string; key: string } => {
    const raw = data.modifiedAt ?? data.updatedAt ?? data.createdAt;
    return normalizeDateInput(raw);
  };

  type GeneratedEntry = {
    locale: LocaleKey;
    slug: string;
    lastmod: string;
    freshnessKey: string;
    heroImage: string | undefined;
    title: string;
  };
  const groupToEntries = new Map<string, GeneratedEntry[]>();
  for (const entry of generatedFiltered) {
    const list = groupToEntries.get(entry.data.translationGroupId) ?? [];
    const { display, key } = generatedFreshness(entry.data);
    list.push({
      locale: entry.data.locale,
      slug: entry.data.slug,
      lastmod: display,
      freshnessKey: key,
      heroImage: entry.data.heroImage,
      title: entry.data.title,
    });
    groupToEntries.set(entry.data.translationGroupId, list);
  }

  const existingRouteSet = new Set<string>();
  for (const locale of supportedLocales) {
    existingRouteSet.add(absoluteUrl(locale.path));
  }
  for (const entry of staticEntries) {
    existingRouteSet.add(absoluteUrl(entry.data.routePath));
  }

  for (const groupEntries of groupToEntries.values()) {
    const byLocale = new Map<LocaleKey, string>();
    for (const g of groupEntries) byLocale.set(g.locale, g.slug);

    const xDefaultSlug = byLocale.get("en");
    const xDefaultHref = xDefaultSlug ? absoluteUrl(localePath("en", xDefaultSlug)) : null;

    const altLines: string[] = [];
    for (const locale of supportedLocales) {
      const slug = byLocale.get(locale.key);
      if (!slug) continue;
      altLines.push(
        `    <xhtml:link rel="alternate" hreflang="${locale.hreflang}" href="${absoluteUrl(localePath(locale.key, slug))}" />`,
      );
    }
    if (xDefaultHref) {
      altLines.push(
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${xDefaultHref}" />`,
      );
    }
    const altBlock = altLines.join("\n");

    for (const g of groupEntries) {
      const loc = absoluteUrl(localePath(g.locale, g.slug));
      if (existingRouteSet.has(loc)) continue;
      existingRouteSet.add(loc);
      bumpLocaleFreshness(g.locale, g.freshnessKey);
      const image = g.heroImage ? imageBlock(absoluteUrl(g.heroImage), g.title, null) : "";
      blogEntries.push({
        loc,
        lastmod: g.lastmod,
        freshnessKey: g.freshnessKey,
        altBlock,
        image,
      });
    }
  }

  // Sort by freshness desc, then loc asc for deterministic tiebreaker.
  // Mirrors getBlogCards() so blog index UI and sitemap emit the same order.
  blogEntries.sort((a, b) => {
    if (a.freshnessKey !== b.freshnessKey) return a.freshnessKey < b.freshnessKey ? 1 : -1;
    return a.loc.localeCompare(b.loc);
  });

  const blogUrls = blogEntries
    .map(
      (e) => `  <url>
    <loc>${e.loc}</loc>${e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : ""}
    <changefreq>yearly</changefreq>
    <priority>0.7</priority>
${e.altBlock}${e.image ? `\n${e.image}` : ""}
  </url>`,
    )
    .join("\n");

  // Blog index pages (hub URLs). Only emit for locales that actually have posts.
  const indexAltHrefFor = (locale: (typeof supportedLocales)[number]): string =>
    absoluteUrl(blogIndexPath(locale.key));
  const indexAltBlock = alternateLinks(indexAltHrefFor, absoluteUrl("/blog/"));
  const blogIndexUrls = supportedLocales
    .map((locale) => {
      const freshest = localeFreshest.get(locale.key);
      if (!freshest) return null;
      const parsed = new Date(freshest);
      const lastmod = Number.isNaN(parsed.getTime()) ? freshest : parsed.toISOString();
      return `  <url>
    <loc>${absoluteUrl(blogIndexPath(locale.key))}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
${indexAltBlock}
  </url>`;
    })
    .filter((v): v is string => v !== null)
    .join("\n");

  const urls = [localeUrls, blogIndexUrls, blogUrls, standaloneUrls]
    .filter((s) => s.length > 0)
    .join("\n");

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>
`, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
