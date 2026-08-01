const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

export const withBrandSuffix = (title: string, brand: string): string => {
  const suffix = new RegExp(`\\s(?:—|\\|)\\s${escapeRegExp(brand)}$`, "u");
  let baseTitle = title.trim();

  while (suffix.test(baseTitle)) baseTitle = baseTitle.replace(suffix, "").trim();

  return `${baseTitle} — ${brand}`;
};
