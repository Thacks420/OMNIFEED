# OmniFeed

**All your social media. One feed. Your algorithm.** Android-first Expo app, NestJS API, and shared normalized feed contract.

## Implemented

- Reddit OAuth + newest-first subreddit posts.
- YouTube Data API v3 search ordered by publication date, with optional query and region.
- Chronological merge with native upstream continuation; the old 50-post discovery cap is removed.
- Replayable opaque cursors, deduplication, platform filters, request validation and source failure isolation.
- Durable cursor sessions for a single API process, including recovery after restart.
- Android load more, refresh, retry, expired-feed recovery, stale-request cancellation, source warnings and original-post links.
- GitHub validation for TypeScript, real Nest HTTP/connector fixture tests, Android bundles and native emulator smoke tests.

## Set up

Use Node 24 and npm. From the repository root:

```bash
npm run setup
npm ci
```

`setup` creates missing environment files and preserves existing ones. For a physical Android phone, set your computer's LAN address:

```bash
npm run setup -- --api-url=http://192.168.1.10:3000
```

Add provider credentials to **apps/api/.env only**:

```env
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_USER_AGENT=android:omnifeed:v0.1.0 (by /u/YOUR_REDDIT_USERNAME)
REDDIT_SUBREDDIT=popular
YOUTUBE_API_KEY=your_api_key
YOUTUBE_REGION=IN
FEED_SESSION_DIR=.data/feed-sessions
```

Enable YouTube Data API v3 in your Google Cloud project. Credentials never belong in the mobile app. Neither `.env` nor cursor-session data is committed.

Start two terminals:

```bash
npm run dev:api
```

```bash
npm run dev:mobile
```

Open the Expo app on Android. Phone and computer must be on the same LAN. Android emulator uses `http://10.0.2.2:3000`. If the API is unavailable, the app explicitly displays offline demo posts and offers refresh. The API binds `0.0.0.0` for LAN access.

## API contract

- `GET /health`
- `GET /feed`
- `GET /feed?platform=reddit&subreddit=python`
- `GET /feed?platform=youtube&query=python&region=IN`
- `GET /feed?limit=25&cursor=OPAQUE_FEED_CURSOR`

`limit` is an integer from 1 to 50, default 25. Pass `nextCursor` unchanged and preserve **all original filters and the limit**. Native provider tokens and v1 snapshot cursors are not accepted by the mobile API. X and Instagram return empty feeds until adapters are registered.

```json
{
  "items": [],
  "nextCursor": null,
  "warnings": [{ "platform": "reddit", "message": "Source unavailable for this feed. Refresh to retry." }]
}
```

`warnings` is optional. Existing `items`/`nextCursor` clients remain compatible.

The engine buffers newest-first source pages, selects the next chronological head, and refills only exhausted buffers using each provider's token. Feed start time anchors YouTube `publishedBefore` and excludes later arrivals. Duplicate IDs and invalid timestamps are excluded. Equal-time posts are preserved; the tie order within an upstream batch is deterministic. Source APIs can change, omit or limit their own results; this is not an archive of all public posts.

A source that fails is excluded from the current session, with a warning; refresh retries it. All unavailable sources return 503. Invalid inputs return 400. Expired/evicted cursors return 410 and the app offers refresh. Replaying a cursor returns its cached page, and concurrent requests to the same cursor share a fetch.

YouTube now uses `search.list` with `order=date`, rather than `mostPopular`, so it consumes search quota on every upstream page. See [official search documentation](https://developers.google.com/youtube/v3/docs/search/list). Reddit uses `/new`, rather than `/hot`, to support chronological continuation.

## Cursor storage

API sessions are atomically saved under `FEED_SESSION_DIR`, with a 10-minute lifetime and at most 100 retained sessions. Use a persistent volume to recover sessions across server restarts. A session stores buffered posts, native tokens, seen IDs and replay pages. Storage and locking support **one API process**; multiple replicas need a shared transactional `SessionStore` and distributed coordination before deployment. This prototype has no user authentication or account-specific feeds.

## Validation

```bash
npm test
npm run typecheck
npm run build:api
npm run test:api
```

`npm test` runs dependency-free engine/mobile HTTP tests. `test:api` starts the actual compiled Nest server and exercises Reddit OAuth, normalization, YouTube search/video lookup, native pagination, filters, errors and partial failures using test-only intercepted provider responses. It requires `build:api` first. No live credentials are used by tests.

GitHub Actions additionally exports the Android bundle and builds an APK for an Android 35 emulator. The native smoke script checks header safe-area positioning, launch, both platform tabs and loading the second page; screenshots, UI XML, logcat and a test APK are retained as workflow artifacts. The fixture preload is only supplied by test commands and is never enabled by normal app startup.

For local native HTTP testing, set `OMNIFEED_LOCAL_HTTP=1` when prebuilding the Android app. A config plugin then permits cleartext HTTP in that build. Hosted APIs should use HTTPS. CI APKs point at the emulator API address and are test builds, not a production release.

See [VALIDATION.md](VALIDATION.md) for observed results and remaining credential-dependent checks.

## Next milestones

User OAuth/connected accounts, database-backed personalization, bookmarks/search UI, X, Instagram professional accounts, and custom ranking remain later roadmap items. See [ROADMAP.md](ROADMAP.md).
