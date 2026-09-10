# Fantasy Intel Yahoo Extension

Standalone Chrome extension source for the Fantasy Intel Yahoo league sync.

## Current frozen build

Version: **2.4.0**

Current private test configuration:
- Yahoo league: Battle of the Kings
- Yahoo league ID: 497223
- My team: House of the Dragon
- Yahoo team ID: 6
- Supabase project: FantasyIntel

This repository is intentionally frozen around the working private build before the extension is generalized for other users.

## What it does

- Detects the Fantasy Intel extension on Yahoo Fantasy Football.
- Shows a connected overlay directly on Yahoo.
- Syncs all league teams and rosters.
- Uses the Yahoo Players page plus the existing Fantasy Intel player catalog.
- Syncs the full Week 1-18 matchup schedule.
- Saves league ownership and matchup data to FantasyIntel Supabase.
- Shows clear on-page diagnostic errors if a sync fails.
- Opens the existing Fantasy Intel league dashboard as an optional external view.

## Chrome development install

1. Clone this repository.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the repository root folder.
6. Open Yahoo Fantasy Football and refresh the page.

After future code updates:
1. `git pull`
2. Go to `chrome://extensions`
3. Click **Reload** on Fantasy Intel Yahoo League Sync

## Files

- `manifest.json` - Chrome Manifest V3 configuration.
- `background.js` - extension service worker and message bridge.
- `league-sync.js` - Yahoo roster/player/matchup sync engine.
- `overlay.js` - Fantasy Intel connected panel and diagnostic UI injected into Yahoo.
- `popup.html` - toolbar popup.
- `popup.css` - toolbar popup styles.
- `popup.js` - toolbar popup behavior.

## Important

This version is still configured specifically for the private Battle of the Kings league and the current FantasyIntel Supabase project.

Do **not** publish this build publicly yet. The next phase is to:
- remove hard-coded league/team identifiers,
- add per-user league setup,
- secure Supabase with proper authentication and row-level security,
- move production Yahoo access to an API/OAuth-backed flow,
- then publish through the Chrome Web Store for automatic updates.

## Source of truth

From this point forward, this standalone repository should be treated as the source of truth for the extension. Do not edit the old `football-playoffs-app/extension` copy when developing new extension versions.
