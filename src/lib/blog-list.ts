import { getCollection, type CollectionEntry } from "astro:content";
import type { LocaleKey } from "../config/site";

// Card model consumed by the blog index UI.
export type BlogCard = {
  slug: string;
  href: string;
  locale: LocaleKey;
  title: string;
  description: string;
  category: string;
  publishedAt: string; // ISO date used for sorting fallback
  freshnessAt?: string; // ISO date = modifiedAt, else createdAt — used as primary sort key
  publishedDisplay: string;
  readTime?: string;
  heroImage?: string;
  featured: boolean;
};

const CATEGORY_BY_PAGETYPE: Record<string, string> = {
  how_to: "How-to",
  comparison: "Comparison",
  concept: "Concept",
  video_summary: "Video summary",
  template: "Template",
};

const CATEGORY_BY_PAGETYPE_LOCALIZED: Record<LocaleKey, Record<string, string>> = {
  en: CATEGORY_BY_PAGETYPE,
  uk: {
    how_to: "Практика",
    comparison: "Порівняння",
    concept: "Концепція",
    video_summary: "Огляд відео",
    template: "Шаблон",
  },
  de: {
    how_to: "Anleitung",
    comparison: "Vergleich",
    concept: "Konzept",
    video_summary: "Videozusammenfassung",
    template: "Vorlage",
  },
  es: {
    how_to: "Cómo hacerlo",
    comparison: "Comparación",
    concept: "Concepto",
    video_summary: "Resumen de vídeo",
    template: "Plantilla",
  },
};

const READTIME_SUFFIX: Record<LocaleKey, string> = {
  en: "min read",
  uk: "хв читання",
  de: "Min. Lesezeit",
  es: "min de lectura",
};

const DATE_LOCALE: Record<LocaleKey, string> = {
  en: "en-US",
  uk: "uk-UA",
  de: "de-DE",
  es: "es-ES",
};

const formatDate = (iso: string, locale: LocaleKey): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(DATE_LOCALE[locale], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const estimateReadTime = (locale: LocaleKey): string => {
  // Generated posts do not carry a read-time; fall back to a stable placeholder
  // rather than fabricating a page-length count from unavailable body text.
  return `6 ${READTIME_SUFFIX[locale]}`;
};

const generatedRoutePath = (locale: LocaleKey, slug: string) =>
  locale === "en" ? `/blog/${slug}/` : `/${locale}/blog/${slug}/`;

export async function getBlogCards(locale: LocaleKey): Promise<BlogCard[]> {
  const generated = await getCollection("blog");

  const cards: BlogCard[] = (generated as CollectionEntry<"blog">[])
    .filter((entry) => entry.data.locale === locale)
    .map(({ data }) => ({
      slug: data.slug,
      href: generatedRoutePath(locale, data.slug),
      locale: data.locale as LocaleKey,
      title: data.title,
      description: data.metaDescription,
      category:
        CATEGORY_BY_PAGETYPE_LOCALIZED[locale]?.[data.pageType] ??
        CATEGORY_BY_PAGETYPE[data.pageType] ??
        "",
      publishedAt: data.createdAt,
      freshnessAt: data.modifiedAt ?? data.createdAt,
      publishedDisplay: formatDate(data.createdAt, locale),
      readTime: estimateReadTime(locale),
      heroImage: data.heroImage,
      featured: Boolean(data.featured),
    }));

  // Ordering: featured first, then freshness (freshnessAt desc), then title asc.
  // freshnessAt matches sitemap `<lastmod>` semantic — modifiedAt when present,
  // else publishedAt. Keeps blog index and sitemap in the same order so Google
  // and users see the same "most-recently-refreshed first" list.
  cards.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    const aFresh = a.freshnessAt ?? a.publishedAt;
    const bFresh = b.freshnessAt ?? b.publishedAt;
    if (aFresh !== bFresh) return aFresh < bFresh ? 1 : -1;
    return a.title.localeCompare(b.title);
  });
  return cards;
}
