# Fantasy Intel Yahoo Extension

Standalone Chrome extension source for the Fantasy Intel Yahoo league sync.

## Current development build

Version: **2.5.0**

Current private test configuration:
- Yahoo league: Battle of the Kings
- Yahoo league ID: 497223
- My team: detected automatically from the Yahoo team URL and remembered in Chrome storage
- Supabase project: FantasyIntel

The `frozen-v2.4.0` branch preserves the original working private build. Main now begins the dynamic-team phase so multiple managers in the same Yahoo league can use the extension.

## What it does

- Detects the Fantasy Intel extension on Yahoo Fantasy Football.
- Shows a connected overlay directly on Yahoo.
- Detects the current manager's Yahoo team from that browser's team page.
- Syncs all league teams and rosters.
- Uses the Yahoo Players page plus the existing Fantasy Intel player catalog.
- Syncs the full Week 1-18 matchup schedule.
- Saves league ownership and matchup data to FantasyIntel Supabase.
- Shows clear on-page diagnostic errors if a sync fails.
- Opens the existing Fantasy Intel league dashboard as an optional external view and passes the detected team ID to it.

## Same-league testing

For Battle of the Kings:
- `/f1/497223/6` identifies **House of the Dragon** as the local user's team.
- `/f1/497223/1` identifies **TEAM DOG SCIENCE** as the local user's team.

The identity is stored locally in that Chrome profile. It is no longer written to the shared league-team row as a global `is_my_team` value.

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

- `manifest.json` - Chrome Manifest V3 configuration.
- `background.js` - extension service worker and message bridge.
- `league-sync.js` - Yahoo roster/player/matchup sync engine and local team identity detection.
- `overlay.js` - Fantasy Intel connected panel and diagnostic UI injected into Yahoo.
- `popup.html` - toolbar popup.
- `popup.css` - toolbar popup styles.
- `popup.js` - toolbar popup behavior.

## Important

This version is still configured specifically for the private Battle of the Kings league and the current FantasyIntel Supabase project, but the user/team is no longer hard-coded.

Do **not** publish this build publicly yet. The next phase is to:
- remove the hard-coded league identifier,
- add per-user league setup,
- secure Supabase with proper authentication and row-level security,
- move production Yahoo access to an API/OAuth-backed flow,
- then publish through the Chrome Web Store for automatic updates.

## Source of truth

From this point forward, this standalone repository is the source of truth for the extension. Do not edit the old `football-playoffs-app/extension` copy when developing new extension versions.
