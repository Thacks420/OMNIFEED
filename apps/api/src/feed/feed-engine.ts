import { randomUUID } from 'node:crypto';
import type { FeedResponse, OmniPost, Platform } from '@omnifeed/core';

export interface FeedOptions {
  platform?: Platform; cursor?: string; limit?: number;
  subreddit?: string; query?: string; region?: string;
}
export interface FeedConnector {
  platform: Platform;
  fetch(options: FeedOptions): Promise<FeedResponse>;
}
export class FeedError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
interface Snapshot { key: string; items: OmniPost[]; expires: number; }

export class FeedEngine {
  private readonly snapshots = new Map<string, Snapshot>();
  constructor(
    private readonly connectors: FeedConnector[],
    private readonly now = Date.now,
    private readonly ttl = 10 * 60_000,
    private readonly capacity = 100,
  ) {}
  async getFeed(options: FeedOptions = {}): Promise<FeedResponse> {
    const limit = options.limit ?? 25;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new FeedError(400, 'limit must be an integer between 1 and 50');
    if (options.platform && !['reddit', 'youtube', 'x', 'instagram'].includes(options.platform))
      throw new FeedError(400, 'Invalid platform');
    const key = JSON.stringify([options.platform ?? null, options.subreddit ?? null,
      options.query ?? null, options.region ?? null]);
    for (const [id, snapshot] of this.snapshots)
      if (snapshot.expires <= this.now()) this.snapshots.delete(id);
    if (options.cursor) {
      const match = /^v1\.([a-f0-9-]{36})\.([1-9]\d*)$/.exec(options.cursor);
      if (!match) throw new FeedError(400, 'Invalid feed cursor');
      const snapshot = this.snapshots.get(match[1]);
      if (!snapshot) throw new FeedError(410, 'Feed expired; refresh to start again');
      const offset = Number(match[2]);
      if (snapshot.key !== key || !Number.isSafeInteger(offset) || offset >= snapshot.items.length)
        throw new FeedError(400, 'Cursor does not match this feed');
      return this.page(match[1], snapshot, offset, limit);
    }
    const selected = this.connectors.filter(c => !options.platform || c.platform === options.platform);
    if (!selected.length) return { items: [], nextCursor: null };
    const results = await Promise.allSettled(selected.map(c =>
      Promise.resolve().then(() => c.fetch({ ...options, cursor: undefined, limit: 50 }))));
    if (results.every(r => r.status === 'rejected'))
      throw new FeedError(503, 'Feed sources are unavailable; check server configuration or retry');
    const unique = new Map<string, OmniPost>();
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      for (const item of result.value.items)
        if (Number.isFinite(Date.parse(item.createdAt))) unique.set(`${item.platform}:${item.id}`, item);
    }
    const items = [...unique.values()].sort((a, b) =>
      Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id) || a.platform.localeCompare(b.platform));
    const snapshot: Snapshot = { key, items, expires: this.now() + this.ttl };
    if (items.length <= limit) return { items, nextCursor: null };
    while (this.snapshots.size >= this.capacity)
      this.snapshots.delete(this.snapshots.keys().next().value!);
    const id = randomUUID();
    this.snapshots.set(id, snapshot);
    return this.page(id, snapshot, 0, limit);
  }
  private page(id: string, snapshot: Snapshot, offset: number, limit: number): FeedResponse {
    const end = Math.min(offset + limit, snapshot.items.length);
    return { items: snapshot.items.slice(offset, end),
      nextCursor: end < snapshot.items.length ? `v1.${id}.${end}` : null };
  }
}
