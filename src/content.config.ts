import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "zod";
import { rebuildControllerExportResponse } from "./api/generated/content-publishing.zod";
import { BLOG_HERO_IMAGES } from "@site/content/blog-hero-images";
import { relatedPostSchema } from "./content/blog-presentation";

const generatedPostSchemas = rebuildControllerExportResponse.shape.posts.element.options;
const [howTo, comparison, concept, videoSummary, template] = generatedPostSchemas;

const frontmatterOverrides = {
  // File-format marker written by the sync script; it is not an API contract field.
  schemaVersion: z.literal(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  locale: z.enum(["en", "uk", "es", "de"]),
  // Landing-owned presentation choice, persisted by sync after its first selection.
  heroImage: z.enum(BLOG_HERO_IMAGES).optional(),
  // Landing-owned internal-link graph, assigned by scripts/assign-related-posts.ts.
  relatedPosts: z.array(relatedPostSchema).max(3).default([]),
};

export const blogPostSchema = z.discriminatedUnion("pageType", [
  howTo.omit({ bodyMdx: true, includedInRebuild: true }).extend(frontmatterOverrides),
  comparison
    .omit({ bodyMdx: true, includedInRebuild: true })
    .extend(frontmatterOverrides),
  concept.omit({ bodyMdx: true, includedInRebuild: true }).extend(frontmatterOverrides),
  videoSummary
    .omit({ bodyMdx: true, includedInRebuild: true })
    .extend(frontmatterOverrides),
  template
    .omit({ bodyMdx: true, includedInRebuild: true })
    .extend(frontmatterOverrides),
]);

const blog = defineCollection({
  loader: glob({
    pattern: "{en,uk,es,de}/*.md",
    base: "./src/content/blog/generated",
  }),
  schema: blogPostSchema,
});

export const collections = { blog };
