import { z } from "zod";
import { BLOG_HERO_IMAGES } from "@site/content/blog-hero-images";

export const relatedPostSchema = z
  .object({
    href: z.string().regex(/^\/(?:[^\s]*)$/),
    title: z.string().min(1),
    metaDescription: z.string().min(1),
    heroImage: z.enum(BLOG_HERO_IMAGES).optional(),
  })
  .strict();

export type RelatedPost = z.infer<typeof relatedPostSchema>;
