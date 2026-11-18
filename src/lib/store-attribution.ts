/**
 * Carries the campaign of a tracked social link (`/go/<slug>` lands here with
 * `utm_source` + `utm_campaign`) onto every App Store and Google Play button, so a
 * visitor who arrives from a post and installs is attributed to that post:
 * App Store reads `ct` (with the provider token `pt` the listing URL may carry),
 * Google Play reads `referrer`, which the app hands back through Install Referrer.
 *
 * The campaign is kept in sessionStorage for the visit, so a visitor who opens a
 * blog post first and the store second still carries it.
 */

export type StoreCampaign = {
  source: string;
  medium: string | null;
  campaign: string;
};

export const CAMPAIGN_STORAGE_KEY = "store-campaign";

/** App Store Connect keeps at most 40 characters of a campaign token. */
const CAMPAIGN_VALUE = /^[A-Za-z0-9._-]{1,40}$/;

const APP_STORE_HOST = "apps.apple.com";
const GOOGLE_PLAY_HOST = "play.google.com";

const cleanValue = (value: string | null): string | null => {
  const trimmed = value?.trim() ?? "";
  return CAMPAIGN_VALUE.test(trimmed) ? trimmed : null;
};

/** The campaign of a page URL query, or null when it carries no valid one. */
export function campaignFromSearch(search: string): StoreCampaign | null {
  const params = new URLSearchParams(search);
  const source = cleanValue(params.get("utm_source"));
  const campaign = cleanValue(params.get("utm_campaign"));
  if (!source || !campaign) return null;
  return { source, medium: cleanValue(params.get("utm_medium")), campaign };
}

/** A campaign read back from storage; anything that does not parse is ignored. */
export function campaignFromStorage(raw: string | null): StoreCampaign | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const query = new URLSearchParams();
    if (typeof record.source === "string") query.set("utm_source", record.source);
    if (typeof record.campaign === "string") query.set("utm_campaign", record.campaign);
    if (typeof record.medium === "string") query.set("utm_medium", record.medium);
    return campaignFromSearch(query.toString());
  } catch {
    return null;
  }
}

/** The store link with the campaign put where that store reads it; other links unchanged. */
export function withStoreCampaign(href: string, campaign: StoreCampaign): string {
  if (!URL.canParse(href)) return href;
  const url = new URL(href);
  const host = url.hostname.toLowerCase();
  if (host === APP_STORE_HOST) {
    url.searchParams.set("ct", campaign.campaign);
    if (!url.searchParams.has("mt")) url.searchParams.set("mt", "8");
    return url.toString();
  }
  if (host === GOOGLE_PLAY_HOST) {
    const referrer = new URLSearchParams({
      utm_source: campaign.source,
      ...(campaign.medium ? { utm_medium: campaign.medium } : {}),
      utm_campaign: campaign.campaign,
    });
    url.searchParams.set("referrer", referrer.toString());
    return url.toString();
  }
  return href;
}

type AttributionWindow = {
  location: { search: string };
  sessionStorage: Pick<Storage, "getItem" | "setItem">;
};

type AttributionDocument = {
  querySelectorAll: (selector: string) => ArrayLike<{ href: string }>;
};

/**
 * Reads the campaign from the URL (remembering it for the visit) or from the visit
 * so far, and rewrites every store link on the page. Returns the campaign applied.
 */
export function applyStoreAttribution(
  win: AttributionWindow,
  doc: AttributionDocument,
): StoreCampaign | null {
  const fromUrl = campaignFromSearch(win.location.search);
  if (fromUrl) {
    try {
      win.sessionStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(fromUrl));
    } catch {
      // Storage can be off (private mode); the links on this page are still rewritten.
    }
  }
  let stored: string | null = null;
  try {
    stored = win.sessionStorage.getItem(CAMPAIGN_STORAGE_KEY);
  } catch {
    stored = null;
  }
  const campaign = fromUrl ?? campaignFromStorage(stored);
  if (!campaign) return null;
  Array.from(
    doc.querySelectorAll(`a[href*="${APP_STORE_HOST}"], a[href*="${GOOGLE_PLAY_HOST}"]`),
  ).forEach((anchor) => {
    anchor.href = withStoreCampaign(anchor.href, campaign);
  });
  return campaign;
}
