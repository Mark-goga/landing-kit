import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "zod";
import { rebuildControllerExportResponse } from "./api/generated/content-publishing.zod";
import { relatedPostSchema, HERO_IMAGE_ANY_RE } from "./content/blog-presentation";

const generatedPostSchemas = rebuildControllerExportResponse.shape.posts.element.options;
const [howTo, comparison, concept, videoSummary, template] = generatedPostSchemas;

const frontmatterOverrides = {
  // File-format marker written by the sync script; it is not an API contract field.
  schemaVersion: z.literal(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  locale: z.enum(["en", "uk", "es", "de"]),
  // Landing-owned presentation choice, persisted by sync after its first selection.
  heroImage: z.string().regex(HERO_IMAGE_ANY_RE).optional(),
  // Landing-owned internal-link graph, assigned by scripts/assign-related-posts.ts.
  relatedPosts: z.array(relatedPostSchema).max(3).default([]),
  // Editor-controlled hero pick on /blog. When true, promotes the post into the
  // featured slot regardless of publish date. At most one per locale should be
  // marked featured; ties break by publish date.
  featured: z.boolean().default(false),
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

export const blogStaticSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  locale: z.enum(["en", "uk", "es", "de"]),
  routePath: z.string(),
  category: z.string(),
  title: z.string(),
  subtitle: z.string(),
  metaTitle: z.string(),
  metaDescription: z.string(),
  author: z.object({
    id: z.string().optional(),
    name: z.string(),
    role: z.string().optional(),
    photoUrl: z.string().nullable().optional(),
    bio: z
      .array(z.object({ locale: z.string(), text: z.string() }))
      .default([]),
    links: z
      .object({
        website: z.string().optional(),
        linkedin: z.string().optional(),
        twitter: z.string().optional(),
      })
      .partial()
      .default({}),
  }),
  readTime: z.string(),
  heroAsset: z.string(),
  heroAlt: z.string(),
  publishedAt: z.string(),
  modifiedAt: z.string().optional(),
  faq: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .default([]),
  relatedPosts: z.array(relatedPostSchema).max(3).default([]),
  // Editor-controlled hero pick on /blog. See generated-post override above.
  featured: z.boolean().default(false),
});

const blogStatic = defineCollection({
  loader: glob({
    pattern: "{en,uk,es,de}/*.md",
    base: "./src/content/blog-static",
    generateId: ({ entry }) => entry.replace(/\.md$/, ""),
  }),
  schema: blogStaticSchema,
});

export const collections = { blog, blogStatic };
