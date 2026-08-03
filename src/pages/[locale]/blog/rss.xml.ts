import { getCollection, type CollectionEntry } from "astro:content";
import { absoluteUrl, siteConfig, supportedLocales, type LocaleKey } from "../../../config/site";
import { HUMAN_BLOG_SLUGS } from "@site/config/generated-blog-collision";
import { buildBlogRss } from "../../../lib/build-blog-rss";

export function getStaticPaths() {
  return supportedLocales
    .filter((locale) => locale.key !== "en")
    .map((locale) => ({ params: { locale: locale.key } }));
}

interface Props {}

export async function GET({ params }: { params: { locale: string } }) {
  const locale = params.locale as LocaleKey;
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
    feedUrl: absoluteUrl(`/${locale}/blog/rss.xml`),
    siteUrl: absoluteUrl("/"),
    blogIndexUrl: absoluteUrl(`/${locale}/blog/`),
    staticEntries: staticForLocale,
    generatedEntries: generatedForLocale,
  });
}
