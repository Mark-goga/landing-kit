import type { CollectionEntry } from "astro:content";
import { absoluteUrl, type LocaleKey } from "../config/site";

interface BuildBlogRssArgs {
  locale: LocaleKey;
  siteName: string;
  feedUrl: string;
  siteUrl: string;
  blogIndexUrl: string;
  staticEntries: CollectionEntry<"blogStatic">[];
  generatedEntries: CollectionEntry<"blog">[];
}

type FeedItem = {
  title: string;
  description: string;
  url: string;
  pubDate: Date;
  author: string | null;
};

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

const rfc822 = (date: Date): string => date.toUTCString();

const parseDate = (raw: string | undefined): Date => {
  if (!raw) return new Date(0);
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T09:00:00Z` : raw;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
};

const localeLangMap: Record<LocaleKey, string> = {
  en: "en-US",
  uk: "uk-UA",
  es: "es-ES",
  de: "de-DE",
};

export function buildBlogRss(args: BuildBlogRssArgs): Response {
  const {
    locale,
    siteName,
    feedUrl,
    siteUrl,
    blogIndexUrl,
    staticEntries,
    generatedEntries,
  } = args;

  const items: FeedItem[] = [];

  for (const entry of staticEntries) {
    items.push({
      title: entry.data.title,
      description: entry.data.metaDescription,
      url: absoluteUrl(entry.data.routePath),
      pubDate: parseDate(entry.data.modifiedAt ?? entry.data.publishedAt),
      author: entry.data.author?.name ?? null,
    });
  }

  for (const entry of generatedEntries) {
    const routePath = locale === "en" ? `/blog/${entry.data.slug}/` : `/${locale}/blog/${entry.data.slug}/`;
    items.push({
      title: entry.data.title,
      description: entry.data.metaDescription,
      url: absoluteUrl(routePath),
      pubDate: parseDate(entry.data.modifiedAt ?? entry.data.createdAt),
      author: entry.data.author?.name ?? null,
    });
  }

  items.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  const lastBuildDate = items.length ? items[0].pubDate : new Date(0);

  const itemsXml = items
    .map(
      (item) => `    <item>
      <title>${xmlEscape(item.title)}</title>
      <link>${xmlEscape(item.url)}</link>
      <guid isPermaLink="true">${xmlEscape(item.url)}</guid>
      <description>${xmlEscape(item.description)}</description>
      <pubDate>${rfc822(item.pubDate)}</pubDate>${item.author ? `\n      <dc:creator>${xmlEscape(item.author)}</dc:creator>` : ""}
    </item>`,
    )
    .join("\n");

  const feedTitle = `${siteName} Blog${locale === "en" ? "" : ` (${locale.toUpperCase()})`}`;

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xmlEscape(feedTitle)}</title>
    <link>${xmlEscape(blogIndexUrl)}</link>
    <description>${xmlEscape(`${siteName} — latest posts`)}</description>
    <language>${localeLangMap[locale]}</language>
    <lastBuildDate>${rfc822(lastBuildDate)}</lastBuildDate>
    <atom:link href="${xmlEscape(feedUrl)}" rel="self" type="application/rss+xml" />
    <generator>${xmlEscape(siteName)}</generator>
    <docs>https://www.rssboard.org/rss-specification</docs>
    <copyright>© ${new Date().getFullYear()} ${xmlEscape(siteName)}</copyright>
    <ttl>60</ttl>
${itemsXml}
  </channel>
</rss>
`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
