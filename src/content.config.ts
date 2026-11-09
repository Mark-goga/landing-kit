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
  // Landing-owned freshness signal written by the sync step for every rebuild.
  modifiedAt: z.iso.datetime().optional(),
  // Landing-owned internal-link graph, assigned by scripts/assign-related-posts.ts.
  relatedPosts: z.array(relatedPostSchema).max(3).default([]),
  // Editor-controlled hero pick on /blog. When true, promotes the post into the
  // featured slot regardless of publish date. At most one per locale should be
  // marked featured; ties break by publish date.
  featured: z.boolean().default(false),
};

// Landing frontmatter contract is a subset of the export contract:
  // - bodyMdx: written to the body of the .mdx file, not frontmatter
// - includedInRebuild: internal signal, not persisted
// - updatedAt: sync-blog-content.ts persists it as `modifiedAt` instead — no
//   raw `updatedAt` field in landing frontmatter, so omitting keeps schema
//   aligned with what's actually on disk
const frontmatterOmit = {
  bodyMdx: true,
  includedInRebuild: true,
  updatedAt: true,
} as const;

export const blogPostSchema = z.discriminatedUnion("pageType", [
  howTo.omit(frontmatterOmit).extend(frontmatterOverrides),
  comparison.omit(frontmatterOmit).extend(frontmatterOverrides),
  concept.omit(frontmatterOmit).extend(frontmatterOverrides),
  videoSummary.omit(frontmatterOmit).extend(frontmatterOverrides),
  template.omit(frontmatterOmit).extend(frontmatterOverrides),
]);

const blog = defineCollection({
  loader: glob({
    pattern: "{en,uk,es,de}/*.{md,mdx}",
    base: "./src/content/blog/generated",
    // Without it the loader keys entries by the frontmatter `slug`, which every
    // translation shares, so only one locale of a translated article survives.
    generateId: ({ entry }) => entry.replace(/\.mdx?$/, ""),
  }),
  schema: blogPostSchema,
});

export const collections = { blog };
