// Test-only preload: all upstream requests are intercepted; never enabled by the app.
const { URL } = require('node:url');
const total = 120;
const created = (index, youtube = false) => new Date(Date.now() - 3600000 - index * 3000 - (youtube ? 1500 : 0)).toISOString();
const json = body => Promise.resolve(new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }));
global.fetch = async input => {
  const url = new URL(String(input));
  if (url.hostname === 'www.reddit.com' && url.pathname.endsWith('/access_token'))
    return json({ access_token: 'fixture-token', expires_in: 3600, token_type: 'bearer' });
  if (url.hostname === 'oauth.reddit.com') {
    if (!url.pathname.endsWith('/new')) throw new Error('Reddit must use chronological /new');
    if (url.pathname.includes('/fail/')) return new Response('{}', { status: 503 });
    const offset = Number((url.searchParams.get('after') ?? 't3_0').slice(3));
    const count = Math.min(Number(url.searchParams.get('limit')), total - offset);
    return json({ data: { after: offset + count < total ? `t3_${offset + count}` : null,
      children: Array.from({ length: count }, (_, i) => ({ kind: 't3', data: {
        id: String(offset + i), name: `t3_${offset + i}`, author: 'fixture', title: `Fixture reddit ${offset + i}`,
        subreddit: 'testing', permalink: `/r/testing/comments/${offset + i}`, selftext: 'API fixture post',
        created_utc: Date.parse(created(offset + i)) / 1000, score: 5, num_comments: 1,
      } })) } });
  }
  if (url.hostname === 'www.googleapis.com' && url.pathname.endsWith('/search')) {
    if (url.searchParams.get('order') !== 'date') throw new Error('YouTube search must order by date');
    if (url.searchParams.get('q') === 'fail') return new Response('{}', { status: 503 });
    const offset = Number(url.searchParams.get('pageToken') ?? 0);
    const count = Math.min(Number(url.searchParams.get('maxResults')), total - offset);
    return json({ nextPageToken: offset + count < total ? String(offset + count) : undefined,
      items: Array.from({ length: count }, (_, i) => ({ id: { videoId: String(offset + i) } })) });
  }
  if (url.hostname === 'www.googleapis.com' && url.pathname.endsWith('/videos')) {
    return json({ items: url.searchParams.get('id').split(',').map(id => ({ id,
      snippet: { publishedAt: created(Number(id), true), channelId: 'fixture-channel',
        channelTitle: 'Fixture channel', title: `Fixture youtube ${id}`, description: 'API fixture video' },
      statistics: { viewCount: '100', likeCount: '5', commentCount: '1' },
    })) });
  }
  throw new Error(`Unexpected upstream in fixture test: ${url.hostname}${url.pathname}`);
};
