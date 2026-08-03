import { getCollection, type CollectionEntry } from "astro:content";
import { absoluteUrl, siteConfig, type LocaleKey } from "../../config/site";
import { HUMAN_BLOG_SLUGS } from "@site/config/generated-blog-collision";
import { buildBlogRss } from "../../lib/build-blog-rss";

export async function GET() {
  const locale: LocaleKey = "en";
  const [staticEntries, generatedEntries] = await Promise.all([
    getCollection("blogStatic"),
    getCollection("blog"),
  ]);

  const staticForLocale = staticEntries.filter((e: CollectionEntry<"blogStatic">) => e.data.locale === locale);
  const generatedForLocale = generatedEntries.filter(
    (e: CollectionEntry<"blog">) => e.data.locale === locale && !HUMAN_BLOG_SLUGS.includes(e.data.slug),
  );

  return buildBlogRss({
    locale,
    siteName: siteConfig.name,
    feedUrl: absoluteUrl("/blog/rss.xml"),
    siteUrl: absoluteUrl("/"),
    blogIndexUrl: absoluteUrl("/blog/"),
    staticEntries: staticForLocale,
    generatedEntries: generatedForLocale,
  });
}
