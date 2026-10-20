import { randomUUID } from 'node:crypto';
import type { FeedResponse, OmniPost, Platform } from '@omnifeed/core';

export interface FeedOptions {
  platform?: Platform; cursor?: string; limit?: number;
  subreddit?: string; query?: string; region?: string;
  before?: string;
}
// Adapters must return newest-first pages and preserve native continuation tokens.
export interface FeedConnector {
  platform: Platform;
  fetch(options: FeedOptions): Promise<FeedResponse>;
}
export class FeedError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
interface Source {
  platform: Platform; buffer: OmniPost[]; cursor?: string;
  done: boolean; failed: boolean; tokens: string[];
}
export interface FeedSession {
  key: string; expires: number; before: string; limit: number;
  sources: Source[]; seen: string[]; last?: OmniPost;
  pages: Record<string, FeedResponse>; offset: number;
}
export interface SessionStore {
  get(id: string): FeedSession | undefined;
  set(id: string, session: FeedSession): void;
  prune(now: number, capacity: number): void;
}
export class MemorySessionStore implements SessionStore {
  private sessions = new Map<string, FeedSession>();
  get(id: string) { const s = this.sessions.get(id); return s ? structuredClone(s) : undefined; }
  set(id: string, session: FeedSession) { this.sessions.set(id, structuredClone(session)); }
  prune(now: number, capacity: number) {
    for (const [id, session] of this.sessions) if (session.expires <= now) this.sessions.delete(id);
    while (this.sessions.size >= capacity) this.sessions.delete(this.sessions.keys().next().value!);
  }
}
const compare = (a: OmniPost, b: OmniPost) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
  || a.id.localeCompare(b.id) || a.platform.localeCompare(b.platform);

export class FeedEngine {
  private readonly inFlight = new Map<string, Promise<FeedResponse>>();
  constructor(
    private readonly connectors: FeedConnector[],
    private readonly now = Date.now,
    private readonly ttl = 10 * 60_000,
    private readonly capacity = 100,
    private readonly store: SessionStore = new MemorySessionStore(),
  ) {}
  async getFeed(options: FeedOptions = {}): Promise<FeedResponse> {
    const limit = options.limit ?? 25;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new FeedError(400, 'limit must be an integer between 1 and 50');
    if (options.platform !== undefined && !['reddit', 'youtube', 'x', 'instagram'].includes(options.platform))
      throw new FeedError(400, 'Invalid platform');
    for (const field of ['cursor', 'subreddit', 'query', 'region'] as const)
      if (options[field] !== undefined && (typeof options[field] !== 'string' || options[field]!.length > 2048))
        throw new FeedError(400, `Invalid ${field}`);
    const key = JSON.stringify([options.platform ?? null, options.subreddit ?? null,
      options.query ?? null, options.region ?? null, limit]);
    if (options.cursor !== undefined) {
      const match = /^v2\.([a-f0-9-]{36})\.([1-9]\d*)$/.exec(options.cursor);
      if (!match) throw new FeedError(400, 'Invalid feed cursor');
      const id = match[1], offset = Number(match[2]);
      const session = this.store.get(id);
      if (!session || session.expires <= this.now()) throw new FeedError(410, 'Feed expired; refresh to start again');
      if (session.key !== key || !Number.isSafeInteger(offset) || offset > session.offset || offset % limit !== 0)
        throw new FeedError(400, 'Cursor does not match this feed');
      const flightKey = `${id}:${offset}`;
      const running = this.inFlight.get(flightKey);
      if (running) return running;
      if (session.pages[String(offset)]) return session.pages[String(offset)];
      const work = this.page(id, session, offset, options);
      this.inFlight.set(flightKey, work);
      try { return await work; } finally { this.inFlight.delete(flightKey); }
    }
    const selected = this.connectors.filter(c => !options.platform || c.platform === options.platform);
    if (!selected.length) return { items: [], nextCursor: null };
    this.store.prune(this.now(), this.capacity);
    const session: FeedSession = {
      key, expires: this.now() + this.ttl, before: new Date(this.now()).toISOString(), limit,
      sources: selected.map(c => ({ platform: c.platform, buffer: [], done: false, failed: false, tokens: [] })),
      seen: [], pages: {}, offset: 0,
    };
    return this.page(randomUUID(), session, 0, options);
  }
  private async page(id: string, session: FeedSession, offset: number, options: FeedOptions): Promise<FeedResponse> {
    const items: OmniPost[] = [];
    const seen = new Set(session.seen);
    // Limit work for providers that return empty pages with continuation tokens.
    let rounds = 0;
    while (items.length < session.limit && rounds++ < 100) {
      const empty = session.sources.filter(s => !s.buffer.length && !s.done && !s.failed);
      await Promise.all(empty.map(async source => {
        try {
          const connector = this.connectors.find(c => c.platform === source.platform)!;
          const result = await connector.fetch({ ...options, cursor: source.cursor, limit: 50, before: session.before });
          source.buffer = result.items.filter(p => p.platform === source.platform
            && Number.isFinite(Date.parse(p.createdAt)) && Date.parse(p.createdAt) <= Date.parse(session.before)
            && !seen.has(`${p.platform}:${p.id}`)
            && (!session.last || Date.parse(p.createdAt) <= Date.parse(session.last.createdAt))).sort(compare);
          if (!result.nextCursor) source.done = true;
          else if (source.tokens.includes(result.nextCursor)) { source.done = true; source.failed = true; }
          else { source.cursor = result.nextCursor; source.tokens.push(result.nextCursor); }
        } catch { source.failed = true; }
      }));
      if (session.sources.every(s => s.failed && !s.buffer.length) && !items.length)
        throw new FeedError(503, 'Feed sources are unavailable; check server configuration or retry');
      // Do not emit older items while a healthy source still needs its head page.
      if (session.sources.some(s => !s.buffer.length && !s.done && !s.failed)) continue;
      const available = session.sources.filter(s => s.buffer.length).sort((a, b) => compare(a.buffer[0], b.buffer[0]));
      if (!available.length) break;
      const item = available[0].buffer.shift()!;
      const identity = `${item.platform}:${item.id}`;
      if (seen.has(identity)) continue;
      if (session.last && Date.parse(item.createdAt) > Date.parse(session.last.createdAt)) continue;
      items.push(item); seen.add(identity); session.last = item;
    }
    if (rounds > 100) throw new FeedError(503, 'Sources made no progress; retry or refresh');
    session.seen = [...seen]; session.offset = offset + items.length;
    const more = session.sources.some(s => s.buffer.length || (!s.done && !s.failed));
    const response: FeedResponse = { items, nextCursor: more ? `v2.${id}.${session.offset}` : null };
    const failed = session.sources.filter(s => s.failed).map(s => s.platform);
    if (failed.length) response.warnings = failed.map(platform => ({ platform, message: 'Source unavailable for this feed. Refresh to retry.' }));
    session.pages[String(offset)] = response;
    this.store.set(id, session);
    return response;
  }
}
