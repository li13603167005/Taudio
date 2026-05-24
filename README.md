# Taudio

Taudio is a local-first personal AI radio prototype. It combines an AI DJ, a music recommendation layer, user taste profiles, weather context, playback history, and a mobile-friendly web UI.

The goal is not to build another playlist app. Taudio explores what a private radio companion could feel like: it recommends music for the current moment, explains the choice, remembers taste preferences, and keeps a queue moving without exposing personal API keys to the browser.

## What It Does

- Runs a local Node.js server and serves a PWA-style web client.
- Uses DeepSeek as the optional AI brain for DJ copy and intent handling.
- Uses OpenWeather as optional real-time weather context.
- Integrates with `NeteaseCloudMusicApiEnhanced/api-enhanced` as an external music source.
- Supports a NetEase login cookie for personal/member playback resolution.
- Stores local chat/playback state in SQLite.
- Keeps per-user listening preference documents under `user/profiles/`.
- Falls back to local synthetic demo audio when real music providers are not configured.

## Architecture

```text
Browser PWA
  ├─ radio UI, queue, user profile editor
  ├─ browser speechSynthesis for DJ voice
  └─ single audio element for music playback

Taudio Node Server
  ├─ server/app.js          HTTP routes, static files, WebSocket stream
  ├─ server/router.js       intent routing and radio response orchestration
  ├─ server/music.js        local catalog + NetEase recommendation/playback adapter
  ├─ server/brain.js        local rules or DeepSeek-backed AI brain
  ├─ server/companion.js    current-song discussion and grounded replies
  ├─ server/context.js      taste, weather, routine, recent plays
  ├─ server/state.js        SQLite messages, plays, plans, prefs
  └─ server/users.js        user profile documents

External Services
  ├─ DeepSeek API           optional AI brain
  ├─ OpenWeather API        optional weather context
  └─ NetEase enhanced API   optional music source, run separately
```

## Requirements

- Node.js `>=24`
- A modern browser
- Optional: DeepSeek API key
- Optional: OpenWeather API key
- Optional: a running `NeteaseCloudMusicApiEnhanced/api-enhanced` service

Node `>=24` is required because the project uses the built-in `node:sqlite` module.

## Quick Start

```bash
npm install
cp .env.example .env
npm start
```

Open:

```text
http://127.0.0.1:8080
```

Run the built-in checks:

```bash
npm run check
```

## Environment Variables

Copy `.env.example` to `.env` and fill only the values you need.

Important variables:

```text
HOST=127.0.0.1
PORT=8080
TAUDIO_TIMEZONE=Asia/Shanghai

BRAIN_PROVIDER=local
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash

MUSIC_PROVIDER=netease-enhanced
NETEASE_API_BASE=http://127.0.0.1:3000
NETEASE_COOKIE=
NETEASE_LEVEL=exhigh

TTS_PROVIDER=browser

OPENWEATHER_API_KEY=
OPENWEATHER_CITY=Shanghai
```

`.env` is intentionally ignored by git. Do not commit API keys, NetEase cookies, proxy settings, or account information.

Older local `.env` files that still use the previous `CLAUDIO_*` variable names are read as a fallback, but new setups should use `TAUDIO_*`.

## DeepSeek

Set:

```text
BRAIN_PROVIDER=deepseek
DEEPSEEK_API_KEY=your_key_here
```

If the key is missing, Taudio can still run with the local rules fallback.

## OpenWeather

Set:

```text
OPENWEATHER_API_KEY=your_key_here
OPENWEATHER_CITY=Hangzhou
```

You can also use latitude and longitude:

```text
OPENWEATHER_LAT=
OPENWEATHER_LON=
```

## NetEase Music Source

This repository does not include the NetEase API service. Run it separately:

```bash
git clone https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced.git
cd api-enhanced
npm install
node app.js
```

Then set Taudio:

```text
MUSIC_PROVIDER=netease-enhanced
NETEASE_API_BASE=http://127.0.0.1:3000
```

For personal/member playback, generate a local NetEase cookie:

```bash
npm run netease:login
```

Open the generated login page, scan the QR code with the NetEase app, and keep the resulting `NETEASE_COOKIE` only in `.env`.

## User Profiles

Runtime user files are private and ignored:

```text
user/users.json
user/profiles/*.md
```

A publishable example is included at:

```text
user/profiles/default.example.md
```

The app will create local profile files automatically when it runs.

## Repository Safety

The following are intentionally not committed:

- `.env` and all real API keys
- `NETEASE_COOKIE`
- SQLite runtime database: `server/state.db`
- generated login QR page: `public/netease-login.html`
- generated audio/TTS cache: `cache/`
- logs: `*.log`
- personal user profiles and user index
- third-party `api-enhanced` source code and `node_modules`

Before pushing, run:

```bash
npm run check
git status --short
```

Then scan for accidental secrets:

```bash
rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' --glob '!cache/**' "API_KEY|COOKIE|SECRET|TOKEN|Bearer|sk-"
```

Only placeholders in `.env.example`, code references, and documentation should appear.

## Current Limitations

- Taudio is still a prototype, not a production streaming service.
- Music playback depends on the external NetEase enhanced API and account availability.
- Browser TTS quality depends on the device/browser voice engine.
- Public deployment requires an authentication layer before exposing personal music/account routes.

## License

No open-source license has been selected yet. Treat this repository as source-available unless a license file is added.
