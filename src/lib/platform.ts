/**
 * Platform detection utility for directing users to the correct app store.
 *
 * Usage:
 *   import { detectPlatform, getStoreUrl } from "@kit/lib/platform";
 *
 *   const platform = detectPlatform(); // 'ios' | 'android' | 'desktop'
 *   const url = getStoreUrl(platform, { appStore: '...', googlePlay: '...' });
 *
 * Works in both browser and Node environments. In Node (SSR) it always returns
 * 'desktop' since there is no user-agent to inspect.
 */

export type Platform = "ios" | "android" | "desktop";

export interface StoreLinks {
  appStore: string;
  googlePlay: string;
}

const iOS_PATTERN = /iPad|iPhone|iPod/;
const ANDROID_PATTERN = /Android/;

/**
 * Detect the current platform from `navigator.userAgent`.
 * Falls back to `'desktop'` when running on the server or when the agent
 * does not match a known mobile OS.
 */
export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (iOS_PATTERN.test(ua)) return "ios";
  if (ANDROID_PATTERN.test(ua)) return "android";
  return "desktop";
}

/**
 * Return the store URL for the given platform.
 * For `'desktop'` returns `undefined` so the caller can decide to show a
 * modal with both options instead of redirecting.
 */
export function getStoreUrl(platform: Platform, links: StoreLinks): string | undefined {
  switch (platform) {
    case "ios":
      return links.appStore;
    case "android":
      return links.googlePlay;
    default:
      return undefined;
  }
}

/**
 * Convenience helper: redirect to the appropriate store if the user is on
 * a mobile platform; return `false` when running on desktop so the caller
 * can open a modal instead.
 *
 * ```ts
 * if (!redirectIfMobile(links)) {
 *   openModal();
 * }
 * ```
 */
export function redirectIfMobile(links: StoreLinks): boolean {
  const platform = detectPlatform();
  if (platform === "desktop") return false;
  const url = getStoreUrl(platform, links);
  if (url) window.location.href = url;
  return true;
}
