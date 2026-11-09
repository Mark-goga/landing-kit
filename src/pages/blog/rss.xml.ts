import { getCollection, type CollectionEntry } from "astro:content";
import { absoluteUrl, siteConfig, type LocaleKey } from "../../config/site";
import { buildBlogRss } from "../../lib/build-blog-rss";

export async function GET() {
  const locale: LocaleKey = "en";
  const entries = await getCollection("blog");

  return buildBlogRss({
    locale,
    siteName: siteConfig.name,
    feedUrl: absoluteUrl("/blog/rss.xml"),
    siteUrl: absoluteUrl("/"),
    blogIndexUrl: absoluteUrl("/blog/"),
    entries: entries.filter((e: CollectionEntry<"blog">) => e.data.locale === locale),
  });
}
