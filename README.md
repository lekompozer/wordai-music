# WordAI Music

A standalone desktop music player built with Next.js + Tauri v2.

Turn any TikTok or YouTube video into MP3. Build unlimited playlists, seamless DJ-style crossfade playback — no ads, no premium required.

## Platforms
- macOS (Apple Silicon + Intel)
- Windows (x64)
- Linux (AppImage, .deb)

## Development

```bash
# Install dependencies
npm install

# Start dev environment (Tauri + Next.js hot reload)
npm run dev:desktop
# or
bash scripts/dev.sh
```

Requires `.env.local` with Firebase + Google OAuth credentials. See `.env.local.example`.

## Production Build

```bash
bash scripts/build-desktop.sh
```

## Release

1. Manual trigger: GitHub Actions → **Release WordAI Music** → choose bump type
2. Automatically creates tag, triggers **Build WordAI Music Desktop** on all 4 platforms
3. GitHub Release is created as draft with all artifacts

## GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase config |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase config |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase config |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase config |
| `NEXT_PUBLIC_API_URL` | Backend URL (default: `https://ai.wordai.pro`) |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth Desktop client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Desktop client secret |
| `TAURI_SIGNING_PRIVATE_KEY` | Tauri update signing key (optional but recommended) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Key password (if set) |

## Architecture

```
src/
  app/                    ← Next.js App Router (single page)
  components/
    MusicHeader.tsx       ← Draggable title bar + Login button
    MusicApp.tsx          ← Top-level shell (replaces HomeShell)
    MusicPlayerClient.tsx ← Desktop player (AudioMotion visualizer)
    MusicPlayerMobile.tsx ← Mobile player (future mobile app)
    MusicSidebar.tsx      ← Channel browser + playlist + YouTube import
  contexts/
    AppContext.tsx         ← Theme + Language providers
    WordaiAuthContext.tsx  ← Firebase auth (Tauri + Web + Capacitor)
  services/
    musicService.ts        ← Backend API calls
    musicPlaylistService.ts← Playlist CRUD
    musicChannelService.ts ← Community channels
  lib/
    wordai-firebase.ts     ← Firebase init (shared project with wordai.pro)
    audioCache.ts          ← Session + IndexedDB audio blob cache

src-tauri/
  src/
    lib.rs                 ← Tauri app entry, command registry
    google_auth.rs         ← Google OAuth via local HTTP server
  capabilities/main.json   ← Permissions
  tauri.conf.json          ← App config, identifier: pro.wordai.music
```

## Future: Mobile App

`MusicPlayerMobile.tsx` already exists and will become the Capacitor iOS/Android app.
When ready: `npm run cap:sync && npm run cap:android`.
