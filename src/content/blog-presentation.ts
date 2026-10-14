import { z } from "zod";

// An article's own hero: a legacy local card from public/assets/ or a copy of
// the backend-assigned image that sync-blog-content downloads into
// public/assets/blog/.
const HERO_IMAGE_RE =
  /^\/assets\/(card-\d+\.(png|webp|jpe?g|gif|avif|svg)|blog\/[A-Za-z0-9][A-Za-z0-9._-]*\.(png|webp|jpe?g|gif|avif))$/i;

// Any image a card may show: a hero, or an auto-generated
// /assets/covers/<slug>.png|svg thumbnail written by scripts/generate-cover.mjs.
export const HERO_IMAGE_ANY_RE =
  /^\/assets\/(card-\d+\.(png|webp|jpe?g|gif|avif|svg)|blog\/[A-Za-z0-9][A-Za-z0-9._-]*\.(png|webp|jpe?g|gif|avif)|covers\/[a-z0-9-]+\.(png|svg))$/i;

export type BlogHeroImage = string;

export const isBlogHeroImage = (value: unknown): value is BlogHeroImage =>
  typeof value === "string" && HERO_IMAGE_RE.test(value);

export const relatedPostSchema = z
  .object({
    href: z.string().regex(/^\/(?:[^\s]*)$/),
    title: z.string().min(1),
    metaDescription: z.string().min(1),
    heroImage: z.string().regex(HERO_IMAGE_ANY_RE).optional(),
  })
  .strict();

export type RelatedPost = z.infer<typeof relatedPostSchema>;
