import type { CollectionEntry } from "astro:content";

type BlogEntry = CollectionEntry<"blog">;

// Every locale of one article shares its translationGroupId; an article page
// links to the other members of its group (hreflang + language switcher).
export const translationsByGroup = (all: BlogEntry[]) => {
  const byGroup = new Map<string, BlogEntry[]>();
  for (const entry of all) {
    const list = byGroup.get(entry.data.translationGroupId) ?? [];
    list.push(entry);
    byGroup.set(entry.data.translationGroupId, list);
  }
  return (entry: BlogEntry): BlogEntry[] =>
    (byGroup.get(entry.data.translationGroupId) ?? []).filter((other) => other.id !== entry.id);
};
