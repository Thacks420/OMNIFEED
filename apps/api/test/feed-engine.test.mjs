import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FeedEngine } from '../src/feed/feed-engine.ts';

const post = (id, day, platform = 'reddit') => ({
  id, platform, createdAt: `2026-10-${String(day).padStart(2, '0')}T00:00:00Z`,
  author: { id: 'author', name: 'Author' }, text: id, stats: {}, originalUrl: 'https://example.com',
});
const connector = (platform, items) => ({ platform, fetch: async () => ({ items, nextCursor: null }) });
const fails = { platform: 'youtube', fetch: async () => { throw new Error('provider outage'); } };

test('snapshot pages are chronological, complete, deterministic and replayable', async () => {
  const engine = new FeedEngine([
    connector('reddit', [post('r1', 1), post('r3', 3), post('r3', 3)]),
    connector('youtube', [post('y4', 4, 'youtube'), post('y2', 2, 'youtube')]),
  ]);
  const first = await engine.getFeed({ limit: 2 });
  assert.deepEqual(first.items.map(p => p.id), ['y4', 'r3']);
  const second = await engine.getFeed({ limit: 2, cursor: first.nextCursor });
  assert.deepEqual(second.items.map(p => p.id), ['y2', 'r1']);
  assert.equal(second.nextCursor, null);
  assert.deepEqual(await engine.getFeed({ limit: 2, cursor: first.nextCursor }), second);
});
test('platform filtering invokes only the selected connector', async () => {
  const engine = new FeedEngine([connector('reddit', [post('r', 1)]), fails]);
  assert.equal((await engine.getFeed({ platform: 'reddit' })).items.length, 1);
  assert.deepEqual(await engine.getFeed({ platform: 'instagram' }), { items: [], nextCursor: null });
});
test('one source failure is isolated, all failures return 503', async () => {
  const engine = new FeedEngine([connector('reddit', [post('r', 1)]), fails]);
  assert.equal((await engine.getFeed()).items.length, 1);
  await assert.rejects(new FeedEngine([fails]).getFeed(), { status: 503 });
});
test('rejects invalid parameters and native tokens', async () => {
  const engine = new FeedEngine([]);
  for (const limit of [0, -1, 51, 1.5, NaN, Infinity])
    await assert.rejects(engine.getFeed({ limit }), { status: 400 });
  await assert.rejects(engine.getFeed({ platform: 'invalid' }), { status: 400 });
  await assert.rejects(engine.getFeed({ cursor: 't3_native' }), { status: 400 });
});
test('cursor binds filters and expires without upstream refetch', async () => {
  let now = Date.parse('2026-10-19T00:00:00Z');
  const engine = new FeedEngine([connector('reddit', [post('r1', 1), post('r2', 2)])], () => now, 100);
  const first = await engine.getFeed({ limit: 1, subreddit: 'python' });
  await assert.rejects(engine.getFeed({ cursor: first.nextCursor, subreddit: 'other' }), { status: 400 });
  now += 100;
  await assert.rejects(engine.getFeed({ cursor: first.nextCursor, subreddit: 'python' }), { status: 410 });
});
test('bounded cache eviction produces an explicit refresh response', async () => {
  const engine = new FeedEngine([connector('reddit', [post('a', 1), post('b', 2)])], Date.now, 60000, 1);
  const first = await engine.getFeed({ limit: 1 });
  await engine.getFeed({ limit: 1 });
  await assert.rejects(engine.getFeed({ cursor: first.nextCursor }), { status: 410 });
});
test('empty source succeeds and invalid dates are excluded', async () => {
  const engine = new FeedEngine([connector('reddit', [{ ...post('bad', 1), createdAt: 'invalid' }])]);
  assert.deepEqual(await engine.getFeed(), { items: [], nextCursor: null });
});
test('adapter receives discovery limit and query options, never a feed cursor', async () => {
  let received;
  const engine = new FeedEngine([{ platform: 'youtube', fetch: async options => {
    received = options; return { items: [], nextCursor: null };
  } }]);
  await engine.getFeed({ platform: 'youtube', limit: 1, query: 'python', region: 'IN' });
  assert.equal(received.limit, 50);
  assert.equal(received.region, 'IN');
  assert.equal(received.query, 'python');
  assert.equal(received.cursor, undefined);
});
