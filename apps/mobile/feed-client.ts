import type { FeedResponse, Platform } from '@omnifeed/core';

export class FeedClientError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export async function requestFeed(
  baseUrl: string,
  options: { platform?: Platform; cursor?: string; signal?: AbortSignal } = {},
): Promise<FeedResponse> {
  const params = new URLSearchParams({ limit: '25' });
  if (options.platform) params.set('platform', options.platform);
  if (options.cursor) params.set('cursor', options.cursor);
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/feed?${params}`, { signal: options.signal });
  if (!response.ok) throw new FeedClientError(response.status, response.status === 410
    ? 'Feed expired. Pull down to refresh.' : 'Feed unavailable. Check the API and retry.');
  const data = await response.json() as FeedResponse;
  if (!data || !Array.isArray(data.items) || !(data.nextCursor === null || typeof data.nextCursor === 'string'))
    throw new Error('Invalid API feed response');
  if (data.items.some(p => !p || typeof p.id !== 'string' || !['reddit', 'youtube', 'x', 'instagram'].includes(p.platform)
    || !p.author || typeof p.author.name !== 'string' || typeof p.text !== 'string' || !p.stats
    || typeof p.originalUrl !== 'string' || !/^https?:\/\//.test(p.originalUrl) || !Number.isFinite(Date.parse(p.createdAt))))
    throw new Error('Invalid API post response');
  if (data.warnings !== undefined && (!Array.isArray(data.warnings)
    || data.warnings.some(w => !w || typeof w.platform !== 'string' || typeof w.message !== 'string')))
    throw new Error('Invalid API warning response');
  return data;
}
