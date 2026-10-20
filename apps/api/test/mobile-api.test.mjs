import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { FeedEngine } from '../src/feed/feed-engine.ts';
import { requestFeed } from '../../mobile/feed-client.ts';

test('mobile HTTP client loads two pages and platform filter through the feed engine', async () => {
  const connectors = ['reddit', 'youtube'].map(platform => ({ platform, fetch: async () => ({
    items: Array.from({ length: 20 }, (_, i) => ({
      id: `${platform}-${i}`, platform, author: { id: 'a', name: 'A' }, text: 'post', stats: {},
      originalUrl: 'https://example.com', createdAt: new Date(1700000000000 + i * 1000).toISOString(),
    })), nextCursor: null,
  }) }));
  const engine = new FeedEngine(connectors);
  const server = createServer(async (req, res) => {
    const params = new URL(req.url, 'http://localhost').searchParams;
    try {
      const result = await engine.getFeed({ platform: params.get('platform') ?? undefined,
        cursor: params.get('cursor') ?? undefined, limit: Number(params.get('limit')) });
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result));
    } catch (error) { res.statusCode = error.status ?? 500; res.end('{}'); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/`;
  try {
    const first = await requestFeed(url);
    assert.equal(first.items.length, 25);
    const second = await requestFeed(url, { cursor: first.nextCursor });
    assert.equal(second.items.length, 15);
    assert.equal(second.nextCursor, null);
    assert.equal(new Set([...first.items, ...second.items].map(p => p.id)).size, 40);
    const filtered = await requestFeed(url, { platform: 'reddit' });
    assert.equal(filtered.items.length, 20);
    assert.ok(filtered.items.every(p => p.platform === 'reddit'));
    await assert.rejects(requestFeed(url, { platform: 'youtube', cursor: first.nextCursor }), /unavailable/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('mobile client exposes expired cursors and malformed responses', async () => {
  const server = createServer((req, res) => {
    if (req.url.includes('cursor=')) { res.statusCode = 410; res.end('{}'); }
    else { res.setHeader('Content-Type', 'application/json'); res.end('{}'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    await assert.rejects(requestFeed(url, { cursor: 'expired' }), /expired/);
    await assert.rejects(requestFeed(url), /Invalid API/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(requestFeed(url, { signal: controller.signal }), { name: 'AbortError' });
  } finally { await new Promise(resolve => server.close(resolve)); }
});
