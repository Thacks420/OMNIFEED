import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FeedEngine } from '../src/feed/feed-engine.ts';
import { FileSessionStore } from '../src/feed/file-session-store.ts';

const now = () => Date.parse('2026-10-19T00:00:00Z');
function source(platform, total = 130) {
  const calls = [];
  return { platform, calls, fetch: async o => {
    calls.push(o.cursor);
    const offset = Number(o.cursor ?? 0);
    return { items: Array.from({ length: Math.min(50, total - offset) }, (_, i) => ({
      id: `${platform}-${offset + i}`, platform, text: 'fixture', author: { id: 'a', name: 'A' },
      stats: {}, originalUrl: 'https://example.com',
      createdAt: new Date(now() - (offset + i) * 2000 - (platform === 'youtube' ? 1000 : 0)).toISOString(),
    })), nextCursor: offset + 50 < total ? String(offset + 50) : null };
  } };
}

test('native continuation merges 260 posts without gaps, duplicates or order inversions', async () => {
  const reddit = source('reddit'), youtube = source('youtube');
  const engine = new FeedEngine([reddit, youtube], now);
  const all = []; let cursor;
  do {
    const page = await engine.getFeed({ limit: 25, cursor });
    all.push(...page.items); cursor = page.nextCursor ?? undefined;
  } while (cursor);
  assert.equal(all.length, 260);
  assert.equal(new Set(all.map(p => p.id)).size, 260);
  assert.ok(all.every((p, i) => !i || Date.parse(all[i - 1].createdAt) >= Date.parse(p.createdAt)));
  assert.deepEqual(reddit.calls, [undefined, '50', '100']);
  assert.deepEqual(youtube.calls, [undefined, '50', '100']);
});

test('durable session survives engine restart and cursor replay is identical', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'omnifeed-test-'));
  try {
    const store = new FileSessionStore(directory);
    const firstEngine = new FeedEngine([source('reddit')], now, 60000, 100, store);
    const first = await firstEngine.getFeed({ limit: 25 });
    const restarted = new FeedEngine([source('reddit')], now, 60000, 100, new FileSessionStore(directory));
    const next = await restarted.getFeed({ limit: 25, cursor: first.nextCursor });
    assert.equal(next.items[0].id, 'reddit-25');
    assert.deepEqual(await firstEngine.getFeed({ limit: 25, cursor: first.nextCursor }), next);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('concurrent requests to the same cursor fetch a provider continuation once', async () => {
  const reddit = source('reddit', 120);
  const engine = new FeedEngine([reddit], now);
  const first = await engine.getFeed({ limit: 50 });
  const [a, b] = await Promise.all([
    engine.getFeed({ limit: 50, cursor: first.nextCursor }),
    engine.getFeed({ limit: 50, cursor: first.nextCursor }),
  ]);
  assert.deepEqual(a, b);
  assert.deepEqual(reddit.calls, [undefined, '50']);
});

test('empty upstream pages continue using their native token', async () => {
  const reddit = source('reddit', 1);
  const fetch = reddit.fetch;
  reddit.fetch = o => o.cursor ? fetch({ ...o, cursor: undefined })
    : Promise.resolve({ items: [], nextCursor: 'skip-empty' });
  assert.equal((await new FeedEngine([reddit], now).getFeed()).items.length, 1);
});

test('newer posts appearing after the session anchor do not jump into later pages', async () => {
  const reddit = source('reddit', 100), fetch = reddit.fetch;
  reddit.fetch = async o => {
    const result = await fetch(o);
    if (o.cursor) result.items.unshift({ ...result.items[0], id: 'new-arrival', createdAt: new Date(now() + 1000).toISOString() });
    return result;
  };
  const engine = new FeedEngine([reddit], now);
  const first = await engine.getFeed({ limit: 50 });
  const second = await engine.getFeed({ limit: 50, cursor: first.nextCursor });
  assert.equal(second.items.length, 50);
  assert.ok(second.items.every(p => p.id !== 'new-arrival'));
});

test('mid-feed provider failure preserves the other source and reports a warning', async () => {
  const reddit = source('reddit', 100), youtube = source('youtube', 100), fetch = youtube.fetch;
  youtube.fetch = o => o.cursor ? Promise.reject(new Error('quota')) : fetch(o);
  const engine = new FeedEngine([reddit, youtube], now);
  let page = await engine.getFeed({ limit: 50 });
  page = await engine.getFeed({ limit: 50, cursor: page.nextCursor });
  page = await engine.getFeed({ limit: 50, cursor: page.nextCursor });
  assert.ok(page.items.every(p => p.platform === 'reddit'));
  assert.equal(page.warnings[0].platform, 'youtube');
});

test('a cursor rejects page-size changes and empty or oversized parameters', async () => {
  const engine = new FeedEngine([source('reddit')], now);
  const first = await engine.getFeed({ limit: 25 });
  await assert.rejects(engine.getFeed({ limit: 50, cursor: first.nextCursor }), { status: 400 });
  await assert.rejects(engine.getFeed({ cursor: '' }), { status: 400 });
  await assert.rejects(engine.getFeed({ query: 'a'.repeat(2049) }), { status: 400 });
});
