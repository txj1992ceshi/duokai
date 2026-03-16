# Browser Studio

Electron desktop MVP for local browser profile management.

## Included in v1

- Local profile CRUD with isolated user data directories
- Proxy CRUD with HTTP, HTTPS, and SOCKS5 support
- Basic environment configuration for language, timezone, resolution, UA, and WebRTC mode
- Profile launch and stop controls backed by Playwright Chromium
- SQLite-backed audit and runtime logs
- macOS and Windows packaging via `electron-builder`

## Tech stack

- `Electron`
- `React + Vite`
- `SQLite` via `better-sqlite3`
- `Playwright Chromium`

## Commands

```bash
npm install
npm run install:chromium
npm run dev
```

Production build:

```bash
npm run build:dir
```

Full packaged build:

```bash
npm run build
```

## Notes

- Chromium is resolved from Playwright, so `npm run install:chromium` is required on a fresh machine.
- Profile data and SQLite state are stored under the app user data directory, not in the repo.
- The current release flow is unsigned/internal-use oriented. Formal signing and notarization can be added later.
