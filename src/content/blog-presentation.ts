import { z } from "zod";

// Accepts card-<any-digits>.<img-ext> (the auto-discovered hero pool from
// public/assets/) plus auto-generated /assets/covers/<slug>.png|svg thumbnails
// written by scripts/generate-cover.mjs.
export const HERO_IMAGE_ANY_RE =
  /^\/assets\/(card-\d+\.(png|webp|jpe?g|gif|avif|svg)|covers\/[a-z0-9-]+\.(png|svg))$/i;

export const relatedPostSchema = z
  .object({
    href: z.string().regex(/^\/(?:[^\s]*)$/),
    title: z.string().min(1),
    metaDescription: z.string().min(1),
    heroImage: z.string().regex(HERO_IMAGE_ANY_RE).optional(),
  })
  .strict();

export type RelatedPost = z.infer<typeof relatedPostSchema>;
