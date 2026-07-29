import type { LocaleKey } from "../config/site";

export const HUMAN_LOCALES: readonly LocaleKey[] = ["en", "uk", "es", "de"] as const;

export type GeneratedRouteEntry = { locale: LocaleKey; slug: string };

export const isCollision = (
  entry: GeneratedRouteEntry,
  humanSlugs: readonly string[],
): boolean => humanSlugs.includes(entry.slug);

export const assertNoRouteCollision = (
  entries: readonly GeneratedRouteEntry[],
  humanSlugs: readonly string[],
): void => {
  const collisions = entries.filter((e) => isCollision(e, humanSlugs));
  if (collisions.length > 0) {
    const list = collisions.map((c) => `${c.locale}/${c.slug}`).join(", ");
    throw new Error(
      `Generated blog entries collide with human-authored routes: ${list}. ` +
        `Rename the generated slug or remove the human page before publishing.`,
    );
  }
};
