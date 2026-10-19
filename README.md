# OmniFeed

**All your social media. One feed. Your algorithm.**

This is the v0.1 starter scaffold for an Android-first unified social feed.

## Current scope

- React Native + Expo Android app
- NestJS API
- Shared normalized `OmniPost` model
- Real Reddit Data API connector via OAuth
- Mock YouTube feed (next connector milestone)
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

## Reddit setup

Reddit currently requires OAuth-authenticated API traffic. Create a Reddit Data API app that can use application-only `client_credentials`, then copy the server template:

```bash
cp apps/api/.env.example apps/api/.env
```

Fill in:

```env
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_USER_AGENT=android:omnifeed:v0.1.0 (by /u/YOUR_REDDIT_USERNAME)
REDDIT_SUBREDDIT=popular
```

`REDDIT_CLIENT_SECRET` belongs on the server only. Never put it in the Expo/Android environment or commit `apps/api/.env`.

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

Reddit responses are normalized into the shared `OmniPost` format and return Reddit's listing cursor as `nextCursor`.

## Next milestone

1. YouTube Data API connector
2. Cursor-based multi-platform feed orchestration
3. User OAuth / connected accounts
4. PostgreSQL persistence
5. Search + bookmarks
6. X connector
7. Instagram professional-account connector

X and Instagram are intentionally later milestones because their API access and feed capabilities are more constrained.
