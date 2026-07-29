import { getCollection } from "astro:content";
import { absoluteUrl, supportedLocales, xDefaultPath, type LocaleKey } from "../config/site";
import { blogContent, type BlogSlug } from "@site/data/locales";
import { HUMAN_BLOG_SLUGS } from "@site/config/generated-blog-collision";

const blogSlugs = Object.keys(blogContent.en) as BlogSlug[];

const localePath = (l: LocaleKey, slug: string): string =>
  l === "en" ? `/blog/${slug}/` : `/${l}/blog/${slug}/`;

const alternateLinks = (hrefFor: (locale: (typeof supportedLocales)[number]) => string, xDefaultHref: string) =>
  [
    ...supportedLocales.map(
      (alternate) => `    <xhtml:link rel="alternate" hreflang="${alternate.hreflang}" href="${hrefFor(alternate)}" />`,
    ),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${xDefaultHref}" />`,
  ].join("\n");

const localeUrls = supportedLocales
  .map(
    (locale) => `  <url>
    <loc>${absoluteUrl(locale.path)}</loc>
${alternateLinks((alternate) => absoluteUrl(alternate.path), absoluteUrl(xDefaultPath))}
  </url>`,
  )
  .join("\n");

const blogUrls = blogSlugs
  .map((slug) => {
    const pathFor = (locale: LocaleKey) => (blogContent[locale] ?? blogContent.en)[slug].routePath;
    const xDefaultHref = absoluteUrl(pathFor("en"));

    return supportedLocales
      .map(
        (locale) => `  <url>
    <loc>${absoluteUrl(pathFor(locale.key))}</loc>
${alternateLinks((alternate) => absoluteUrl(pathFor(alternate.key)), xDefaultHref)}
  </url>`,
      )
      .join("\n");
  })
  .join("\n");

const standaloneUrls = ["/privacy/", "/cookies/"]
  .map(
    (path) => `  <url>
    <loc>${absoluteUrl(path)}</loc>
  </url>`,
  )
  .join("\n");

export async function GET() {
  const generatedEntries = await getCollection("blog");
  const generatedFiltered = generatedEntries.filter(
    (entry) => !HUMAN_BLOG_SLUGS.includes(entry.data.slug),
  );

  const groupToEntries = new Map<string, { locale: LocaleKey; slug: string }[]>();
  for (const entry of generatedFiltered) {
    const list = groupToEntries.get(entry.data.translationGroupId) ?? [];
    list.push({ locale: entry.data.locale, slug: entry.data.slug });
    groupToEntries.set(entry.data.translationGroupId, list);
  }

  const existingRouteSet = new Set<string>();
  for (const locale of supportedLocales) {
    existingRouteSet.add(absoluteUrl(locale.path));
  }
  for (const slug of blogSlugs) {
    for (const locale of supportedLocales) {
      const routePath = (blogContent[locale.key] ?? blogContent.en)[slug].routePath;
      existingRouteSet.add(absoluteUrl(routePath));
    }
  }

  const generatedUrls = Array.from(groupToEntries.values())
    .flatMap((groupEntries) => {
      const byLocale = new Map<LocaleKey, string>();
      for (const g of groupEntries) byLocale.set(g.locale, g.slug);

      const xDefaultSlug = byLocale.get("en");
      const xDefaultHref = xDefaultSlug
        ? absoluteUrl(localePath("en", xDefaultSlug))
        : null;

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

      return groupEntries
        .map((g) => {
          const loc = absoluteUrl(localePath(g.locale, g.slug));
          if (existingRouteSet.has(loc)) return null;
          existingRouteSet.add(loc);
          return `  <url>
    <loc>${loc}</loc>
${altBlock}
  </url>`;
        })
        .filter((v): v is string => v !== null);
    })
    .join("\n");

  const urls = [localeUrls, blogUrls, standaloneUrls, generatedUrls]
    .filter((s) => s.length > 0)
    .join("\n");

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
