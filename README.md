# OmniFeed

**All your social media. One feed. Your algorithm.**

This is the v0.1 starter scaffold for an Android-first unified social feed.

## Current scope

- React Native + Expo Android app
- NestJS API
- Shared normalized `OmniPost` model
- Mock Reddit + YouTube unified feed
- Platform tabs/filters
- Mobile fallback demo data when API is offline

## Monorepo

```text
apps/
  mobile/       Expo / React Native Android app
  api/          NestJS API
packages/
  core/         Shared normalized feed types
```

## Requirements

- Node.js 22.13+
- npm
- Android phone/emulator

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
- `GET /feed?platform=youtube`

## Next milestone

Replace mock data with real connectors:

1. Reddit connector
2. YouTube Data API connector
3. Cursor-based merged feed
4. OAuth / connected accounts
5. PostgreSQL persistence
6. Search + bookmarks

X and Instagram are intentionally later milestones because their API access and feed capabilities are more constrained.
