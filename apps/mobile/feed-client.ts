import type { FeedResponse, Platform } from '@omnifeed/core';

export async function requestFeed(
  baseUrl: string,
  options: { platform?: Platform; cursor?: string; signal?: AbortSignal } = {},
): Promise<FeedResponse> {
  const params = new URLSearchParams({ limit: '25' });
  if (options.platform) params.set('platform', options.platform);
  if (options.cursor) params.set('cursor', options.cursor);
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/feed?${params}`, { signal: options.signal });
  if (!response.ok) throw new Error(response.status === 410
    ? 'Feed expired. Pull down to refresh.' : 'Feed unavailable. Check the API and retry.');
  const data = await response.json() as FeedResponse;
  if (!Array.isArray(data.items) || !(data.nextCursor === null || typeof data.nextCursor === 'string'))
    throw new Error('Invalid API feed response');
  return data;
}
