# OmniFeed

**All your social media. One feed. Your algorithm.**

This is the v0.1 starter scaffold for an Android-first unified social feed.

## Current scope

- React Native + Expo Android app
- NestJS API
- Shared normalized `OmniPost` model
- Real Reddit Data API connector via OAuth
- Real YouTube Data API v3 connector
- Platform tabs/filters
- Mobile fallback demo data when API is offline
- Stable snapshot pagination with load more, refresh, and retry

## Monorepo

```text
apps/
  mobile/       Expo / React Native Android app
  api/          NestJS API + platform connectors
packages/
  core/         Shared normalized feed types
```

## Requirements

- Node.js 22.13+
- npm
- Android phone/emulator
- Reddit Data API app credentials for live Reddit posts
- YouTube Data API v3 key for live YouTube videos

## Server environment

Copy the server template:

```bash
cp apps/api/.env.example apps/api/.env
```

### Reddit

Reddit requires OAuth-authenticated API traffic. Configure:

```env
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_USER_AGENT=android:omnifeed:v0.1.0 (by /u/YOUR_REDDIT_USERNAME)
REDDIT_SUBREDDIT=popular
```

### YouTube

Enable **YouTube Data API v3** in a Google Cloud project, create an API key, then configure:

```env
YOUTUBE_API_KEY=your_api_key
YOUTUBE_REGION=US
```

`YOUTUBE_REGION` is an ISO 3166-1 alpha-2 region such as `US`, `IN`, or `GB`. The default YouTube feed uses the official `mostPopular` chart for that region. Passing `query=` switches the connector to YouTube search.

All Reddit and YouTube credentials belong on the server only. Never put them in the Expo/Android environment or commit `apps/api/.env`.

## Run

```bash
npm install
npm run dev:api
```

In a second terminal:

```bash
npm run dev:mobile
```

### Physical Android phone

Copy `apps/mobile/.env.example` to `apps/mobile/.env` and replace the API URL with your computer's LAN IP:

```env
EXPO_PUBLIC_API_URL=http://192.168.x.x:3000
```

Phone and PC must be on the same network for local API testing.

## API

- `GET /health`
- `GET /feed`
- `GET /feed?platform=reddit`
- `GET /feed?platform=reddit&subreddit=python`
- `GET /feed?platform=reddit&subreddit=python&limit=25&cursor=OPAQUE_FEED_CURSOR`
- `GET /feed?platform=youtube`
- `GET /feed?platform=youtube&region=IN&limit=25`
- `GET /feed?platform=youtube&query=python&region=IN`
- `GET /feed?platform=youtube&cursor=OPAQUE_FEED_CURSOR`

Reddit and YouTube responses are normalized into the shared `OmniPost` format. Every feed uses the same opaque `nextCursor`; pass it back unchanged, with the same platform, subreddit, query, and region parameters. Native Reddit/YouTube tokens are no longer accepted. `limit` defaults to 25 and must be an integer from 1 to 50.

Issue #3 first iteration uses a **bounded discovery snapshot**: fetch up to 50 posts per selected connector, deduplicate, sort descending by `createdAt` (ties by ID/platform), and paginate that immutable list. Reddit hot and YouTube mostPopular are ranked endpoints, so sorting individual upstream pages would not provide chronological pagination. This implementation guarantees chronological order only within the fetched snapshot, not across the provider's entire history. Refresh creates a new snapshot. Upstream continuation beyond this window is still future work.

Snapshots expire after 10 minutes; at most 100 are retained in memory. Expiry, eviction, or server restart returns HTTP 410; refresh to restart. Cursors are process-local, so multi-instance deployments require sticky routing or a shared snapshot store. Invalid cursors/filters/limits return 400. One failing connector does not discard the successful connector's posts; all selected connectors failing returns 503. A partially failed snapshot stays fixed until refresh. X and Instagram currently return empty results and can be added through the `FeedConnector` interface without changing `FeedResponse`.

### Checks

```bash
npm test
npm run typecheck
npm run build:api
```

`npm test` uses Node's experimental TypeScript transform and does not require npm dependencies. It covers the orchestration engine and the mobile HTTP client's flow through a real local HTTP test server with fixture connectors. It does not launch Nest, Metro, Expo Go, or an Android emulator.

For Android: start the API and Expo, set the physical phone's LAN API URL above, and test All/Reddit/YouTube, Load more, pull-to-refresh, source outages, API-offline demo, and switching tabs during a request. Android emulator uses `http://10.0.2.2:3000`. The Expo entry is workspace-local `index.js`; shared core declarations are built before starting either app.

## Next milestone

1. Cursor-based multi-platform feed orchestration
2. User OAuth / connected accounts
3. PostgreSQL persistence
4. Search + bookmarks
5. X connector
6. Instagram professional-account connector
7. Custom/AI feed ranking

X and Instagram are intentionally later milestones because their API access and feed capabilities are more constrained.
