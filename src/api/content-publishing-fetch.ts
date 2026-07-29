/**
 * Runtime transport for the generated publishing client.
 *
 * Orval owns endpoint paths, methods, payload types, and response types. This
 * file owns only deployment-specific concerns that cannot live in OpenAPI:
 * the backend origin, API key, and the fetch implementation used by scripts.
 */
export interface ContentPublishingClientConfig {
  backendUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export type ContentPublishingRequestInit = RequestInit & {
  backendUrl?: string;
  fetchImpl?: typeof fetch;
};

const trimTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

export const createContentPublishingRequestInit = (
  config: ContentPublishingClientConfig,
): ContentPublishingRequestInit => ({
  backendUrl: config.backendUrl,
  fetchImpl: config.fetchImpl,
  headers: {
    Accept: 'application/json',
    'X-API-Key': config.apiKey,
  },
});

export const contentPublishingFetch = async <T>(
  endpoint: string,
  options: ContentPublishingRequestInit = {},
): Promise<T> => {
  const { backendUrl, fetchImpl = fetch, ...request } = options;
  if (!backendUrl) {
    throw new Error('Publishing client requires a backendUrl.');
  }
  const response = await fetchImpl(`${trimTrailingSlash(backendUrl)}${endpoint}`, request);

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Publishing request failed: ${response.status} ${response.statusText} ${body.slice(0, 500)}`,
    );
  }

  return response.json() as Promise<T>;
};
