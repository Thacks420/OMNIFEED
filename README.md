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
- `GET /feed?platform=reddit&subreddit=python&limit=25&cursor=t3_...`
- `GET /feed?platform=youtube`
- `GET /feed?platform=youtube&region=IN&limit=25`
- `GET /feed?platform=youtube&query=python&region=IN`
- `GET /feed?platform=youtube&cursor=YOUTUBE_PAGE_TOKEN`

Reddit and YouTube responses are normalized into the shared `OmniPost` format. Platform-specific requests return the platform's native pagination token as `nextCursor`.

The combined `GET /feed` currently merges whichever configured connectors succeed and sorts them by `createdAt`. Cross-platform cursor pagination is the next architecture milestone.

## Next milestone

1. Cursor-based multi-platform feed orchestration
2. User OAuth / connected accounts
3. PostgreSQL persistence
4. Search + bookmarks
5. X connector
6. Instagram professional-account connector
7. Custom/AI feed ranking

X and Instagram are intentionally later milestones because their API access and feed capabilities are more constrained.
