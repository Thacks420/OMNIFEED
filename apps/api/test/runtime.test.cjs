const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

test('built Nest API: health, native connector pagination, filters, validation and source outages', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'omnifeed-runtime-'));
  const port = 3197;
  const child = spawn(process.execPath, ['--require', resolve('scripts/provider-fixtures.cjs'), resolve('apps/api/dist/main.js')], {
    env: { ...process.env, PORT: String(port), FEED_SESSION_DIR: directory,
      REDDIT_CLIENT_ID: 'fixture', REDDIT_CLIENT_SECRET: 'fixture', YOUTUBE_API_KEY: 'fixture' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = ''; child.stdout.on('data', d => logs += d); child.stderr.on('data', d => logs += d);
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(`API exited: ${logs}`);
      try { ready = (await fetch(`${base}/health`)).ok; } catch {}
      if (ready) break;
      await delay(100);
    }
    assert.ok(ready, logs);
    assert.equal((await (await fetch(`${base}/health`)).json()).ok, true);
    let cursor; const posts = [];
    do {
      const params = new URLSearchParams({ limit: '50' }); if (cursor) params.set('cursor', cursor);
      const response = await fetch(`${base}/feed?${params}`);
      assert.equal(response.status, 200, await response.clone().text());
      const page = await response.json(); posts.push(...page.items); cursor = page.nextCursor;
    } while (cursor);
    assert.equal(posts.length, 240);
    assert.equal(new Set(posts.map(p => p.id)).size, 240);
    assert.ok(posts.every((p, i) => !i || Date.parse(posts[i - 1].createdAt) >= Date.parse(p.createdAt)));
    for (const platform of ['reddit', 'youtube']) {
      const page = await (await fetch(`${base}/feed?platform=${platform}`)).json();
      assert.ok(page.items.length && page.items.every(p => p.platform === platform));
    }
    assert.equal((await fetch(`${base}/feed?platform=wrong`)).status, 400);
    assert.equal((await fetch(`${base}/feed?limit=0`)).status, 400);
    assert.equal((await fetch(`${base}/feed?cursor=bad`)).status, 400);
    assert.equal((await fetch(`${base}/feed?cursor=v2.00000000-0000-0000-0000-000000000000.25`)).status, 410);
    const partial = await (await fetch(`${base}/feed?subreddit=fail`)).json();
    assert.ok(partial.items.every(p => p.platform === 'youtube'));
    assert.equal(partial.warnings[0].platform, 'reddit');
    assert.equal((await fetch(`${base}/feed?subreddit=fail&query=fail`)).status, 503);
  } finally {
    child.kill(); await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});
