import { getCollection, type CollectionEntry } from "astro:content";
import { absoluteUrl, siteConfig, supportedLocales, type LocaleKey } from "../../../config/site";
import { buildBlogRss } from "../../../lib/build-blog-rss";

export function getStaticPaths() {
  return supportedLocales
    .filter((locale) => locale.key !== "en")
    .map((locale) => ({ params: { locale: locale.key } }));
}

interface Props {}

export async function GET({ params }: { params: { locale: string } }) {
  const locale = params.locale as LocaleKey;
  const entries = await getCollection("blog");

  return buildBlogRss({
    locale,
    siteName: siteConfig.name,
    feedUrl: absoluteUrl(`/${locale}/blog/rss.xml`),
    siteUrl: absoluteUrl("/"),
    blogIndexUrl: absoluteUrl(`/${locale}/blog/`),
    entries: entries.filter((e: CollectionEntry<"blog">) => e.data.locale === locale),
  });
}
