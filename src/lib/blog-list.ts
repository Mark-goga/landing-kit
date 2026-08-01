import { getCollection, type CollectionEntry } from "astro:content";
import type { LocaleKey } from "../config/site";
import { HUMAN_BLOG_SLUGS } from "@site/config/generated-blog-collision";

// Unified card model consumed by the blog index UI. Both generated posts
// (auto-published) and static posts (hand-written) collapse into this shape
// so the index component does not need to know their provenance.
export type BlogCard = {
  slug: string;
  href: string;
  locale: LocaleKey;
  title: string;
  description: string;
  category: string;
  publishedAt: string; // ISO date used for sorting
  publishedDisplay: string;
  readTime?: string;
  heroImage?: string;
  source: "generated" | "static";
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
  const [generated, statics] = await Promise.all([
    getCollection("blog"),
    getCollection("blogStatic"),
  ]);

  const cards: BlogCard[] = [];

  for (const entry of generated as CollectionEntry<"blog">[]) {
    const data = entry.data;
    if (data.locale !== locale) continue;
    // English routing rule from kit/pages/blog/[slug].astro: collisions with
    // handwritten slugs are skipped, so index parity requires the same filter.
    if (locale === "en" && HUMAN_BLOG_SLUGS.includes(data.slug)) continue;

    cards.push({
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
      publishedDisplay: formatDate(data.createdAt, locale),
      readTime: estimateReadTime(locale),
      heroImage: data.heroImage,
      source: "generated",
      featured: Boolean(data.featured),
    });
  }

  for (const entry of statics as CollectionEntry<"blogStatic">[]) {
    const data = entry.data;
    if (data.locale !== locale) continue;
    cards.push({
      slug: data.slug,
      href: data.routePath,
      locale: data.locale as LocaleKey,
      title: data.title,
      description: data.metaDescription,
      category: data.category,
      publishedAt: `${data.publishedAt}T00:00:00Z`,
      publishedDisplay: formatDate(`${data.publishedAt}T00:00:00Z`, locale),
      readTime: data.readTime,
      heroImage: `/${data.heroAsset.replace(/^\/+/, "")}`,
      source: "static",
      featured: Boolean(data.featured),
    });
  }

  // Ordering: featured first, then publishedAt desc, then title asc as a
  // deterministic tiebreaker (same-day posts should not swap position between
  // builds).
  cards.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    if (a.publishedAt !== b.publishedAt) return a.publishedAt < b.publishedAt ? 1 : -1;
    return a.title.localeCompare(b.title);
  });
  return cards;
}
