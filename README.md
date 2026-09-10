# Fantasy Intel Yahoo Extension

Standalone Chrome Manifest V3 extension for Yahoo fantasy-football league sync and league viewing.

## Current development build

Version: **2.6.0**

Current private test configuration:
- Yahoo league: Battle of the Kings
- Yahoo league ID: 497223
- My team: detected automatically from the Yahoo team URL and remembered in Chrome storage
- Supabase project: FantasyIntel
- UI: owned by the Chrome extension itself; no React app and no Vercel page required

The `frozen-v2.4.0` branch preserves the original working private build. Main is the active standalone-extension build.

## Architecture

This project intentionally does **not** use React.

It runs with:
- Manifest V3
- plain HTML
- plain CSS
- plain JavaScript
- Chrome extension storage
- a background service worker
- Yahoo content scripts
- an extension-owned dashboard page

No React development server is required. No web server is required to render the dashboard.

## Extension UI

The extension now owns both of its interfaces:

- `overlay.js` - the connected/sync/diagnostic panel injected directly into Yahoo
- `popup.html`, `popup.css`, `popup.js` - the Chrome toolbar popup
- `dashboard/index.html`, `dashboard/dashboard.css`, `dashboard/dashboard.js` - the full league dashboard stored inside the extension

`OPEN DASHBOARD` now opens `chrome-extension://<extension-id>/dashboard/index.html` rather than the old Vercel league page.

## What it does

- Detects the extension on Yahoo Fantasy Football.
- Detects the current manager's Yahoo team from that browser's team URL.
- Remembers that team locally in that Chrome profile.
- Syncs all league teams and rosters.
- Uses Yahoo's Players page plus the existing Fantasy Intel player catalog.
- Syncs the Week 1-18 matchup schedule.
- Saves league ownership and matchup data to FantasyIntel Supabase.
- Shows clear on-page diagnostic errors if a sync fails.
- Displays all rosters and matchups in the extension-owned dashboard.
- Highlights the locally detected manager's team and matchups.
- Can launch a Yahoo sync directly from the dashboard when the Yahoo league is open in another tab.

## Same-league testing

For Battle of the Kings:
- `/f1/497223/6` identifies **House of the Dragon** on Justin's browser.
- `/f1/497223/1` identifies **TEAM DOG SCIENCE** on the other manager's browser.

The identity is stored locally in each Chrome profile. It is not treated as a global `is_my_team` value in the shared database.

## Chrome development install

1. Clone this repository.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the repository root folder.
6. Open your own Yahoo team page once and refresh it.

After future code updates:
1. `git pull`
2. Go to `chrome://extensions`
3. Click **Reload** on Fantasy Intel Yahoo League Sync

## Files

- `manifest.json` - Chrome Manifest V3 configuration
- `background.js` - service worker and message bridge
- `league-sync.js` - Yahoo roster/player/matchup sync engine and local team identity detection
- `overlay.js` - Yahoo connected panel and diagnostic UI
- `popup.html` / `popup.css` / `popup.js` - toolbar popup
- `dashboard/index.html` - standalone full dashboard
- `dashboard/dashboard.css` - dashboard styling
- `dashboard/dashboard.js` - dashboard data/UI logic

## Important

This build is now independent of the old `football-playoffs-app` UI, but it is still configured specifically for Battle of the Kings and the current FantasyIntel Supabase project.

Do **not** publish this build publicly yet. The next public-product phase is to:
- remove the hard-coded league identifier,
- let a user connect/select any Yahoo league,
- secure Supabase with authentication and row-level security,
- move production Yahoo access toward an OAuth/API-backed flow,
- publish through the Chrome Web Store for automatic updates.

## Source of truth

`Justindema76/Yahoo-Fantasy-Extension` is now the source of truth for the extension. Do not make new extension changes in `football-playoffs-app/extension`.
