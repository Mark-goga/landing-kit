const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

// Google cuts titles at roughly 60 characters; a suffix that does not fit
// pushes the article's own keywords out of the visible snippet.
export const MAX_TITLE_LENGTH = 60;

export const withBrandSuffix = (title: string, brand: string): string => {
  const suffix = new RegExp(`\\s(?:—|\\|)\\s${escapeRegExp(brand)}$`, "u");
  let baseTitle = title.trim();

  while (suffix.test(baseTitle)) baseTitle = baseTitle.replace(suffix, "").trim();

  const branded = `${baseTitle} — ${brand}`;
  return branded.length <= MAX_TITLE_LENGTH ? branded : baseTitle;
};
