// Operational config for every landing. Values come from `.env` (SITE_URL,
// SITE_NAME, APPLICATION_ID, LEADS_API_URL, analytics ids, etc.).
//
// Visual brand tokens (theme color, favicons, OG image, font URL) live in the
// landing's own `@site/config/brand.ts` — they are not env-driven because each
// landing configures them once and rarely changes them.
export type LocaleKey = "en" | "uk" | "es" | "de";

const requiredEnv = (key: string) => {
  const value = import.meta.env?.[key] ?? process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

const optionalEnv = (key: string, fallback = "") =>
  import.meta.env?.[key] ?? process.env[key] ?? fallback;

const normalizeAssetPath = (path: string) => path.replace(/^\/+/, "");

const stripTrailingSlash = (url: string) => url.replace(/\/+$/, "");

export const siteConfig = {
  name: requiredEnv("SITE_NAME"),
  clarityProjectId: requiredEnv("CLARITY_PROJECT_ID"),
  heroImagePath: normalizeAssetPath(requiredEnv("HERO_IMAGE_PATH")),
  scriptPath: normalizeAssetPath(requiredEnv("SITE_SCRIPT_PATH")),

  termlyUuid: optionalEnv("TERMLY_WEBSITE_UUID"),
  gaMeasurementId: optionalEnv("GA_MEASUREMENT_ID"),
  turnstileSiteKey: optionalEnv("TURNSTILE_SITE_KEY"),

  leadsApiUrl: stripTrailingSlash(requiredEnv("LEADS_API_URL")),
  applicationId: requiredEnv("APPLICATION_ID"),
};

const rawSiteUrl = requiredEnv("SITE_URL");

export const siteUrl = rawSiteUrl.endsWith("/") ? rawSiteUrl : `${rawSiteUrl}/`;

export const absoluteUrl = (path: string) => new URL(path, siteUrl).href;

export const pageAssetUrl = (pagePath: string, assetPath: string) => {
  const depth = pagePath.split("/").filter(Boolean).length;
  const prefix = depth === 0 ? "./" : "../".repeat(depth);

  return `${prefix}${normalizeAssetPath(assetPath)}`;
};

export const supportedLocales = [
  {
    key: "en",
    hreflang: "en",
    path: "/",
  },
  {
    key: "uk",
    hreflang: "uk",
    path: "/uk/",
  },
  {
    key: "es",
    hreflang: "es",
    path: "/es/",
  },
  {
    key: "de",
    hreflang: "de",
    path: "/de/",
  },
] as const;

export const xDefaultPath = "/";

// Contract every landing implements at `@site/config/brand.ts`.
export type BrandTokens = {
  themeColor: string;
  themeColorDark?: string;
  trackingGlobal: string;
  faviconPath: string;
  faviconDarkPath: string;
  ogImagePath: string;
  googleFontsUrl: string;
  logoPath: string;
  twitterSite?: string;
  twitterCreator?: string;
};
