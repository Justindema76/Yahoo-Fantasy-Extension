# Fantasy Intel Yahoo Extension

Standalone Chrome Manifest V3 extension plus a normal HTML/CSS/JavaScript Fantasy Intel user app.

## Current build

Version: **3.0.0**

Current private test configuration:
- Yahoo league: Battle of the Kings
- Yahoo league ID: `497223`
- My team: detected from the Yahoo team URL and remembered per browser
- Supabase project: FantasyIntel
- House of the Dragon: Yahoo Team `6`
- TEAM DOG SCIENCE: Yahoo Team `1`

A backup of the pre-refactor build is preserved on branch:
`backup/pre-local-organize-2026-09-10`

## Product split

The repository now has two clear responsibilities.

### Yahoo connector

Root extension files handle Yahoo:
- `manifest.json`
- `background.js`
- `league-sync.js`
- `overlay.js`
- `popup.html`
- `popup.css`
- `popup.js`

They detect the current Yahoo manager, sync teams/rosters/matchups, and open Fantasy Intel.

### Fantasy Intel user app

The user-facing app lives under `app/`:

```text
app/
  index.html
  css/
    app.css
  js/
    config.js
    runtime.js
    api.js
    utils.js
    main.js
    views/
      team.js
      matchups.js
      league.js
```

The app contains only the user experience:
- MY TEAM
- MATCHUPS
- LEAGUE

It does not expose the private Fantasy Intel admin/research navigation from the older Vercel application.

## Identity model

There is no global `is_my_team` assumption in the UI.

The extension identifies the manager from Yahoo:

- `/f1/497223/6` -> House of the Dragon
- `/f1/497223/1` -> TEAM DOG SCIENCE

That identity is stored locally in the browser. The same shared league data can therefore render a different MY TEAM for each manager.

## Run the user app locally

No dependency install is required.

From the repository root:

```bash
npm run dev
```

The included zero-dependency Node server starts on port `4173`.

Open:

```text
House of the Dragon
http://localhost:4173/app/?league=497223&team=6

TEAM DOG SCIENCE
http://localhost:4173/app/?league=497223&team=1

Choose a team manually
http://localhost:4173/app/?league=497223
```

Local mode reads the same synced Supabase data and lets you test MY TEAM, MATCHUPS and LEAGUE in a normal browser URL.

Yahoo scraping/sync itself still belongs to the extension. In LOCAL DEV mode, press REFRESH after syncing Yahoo from the extension.

## Load the Chrome extension

1. Clone this repository.
2. Open `chrome://extensions`.
3. Turn on Developer mode.
4. Click **Load unpacked**.
5. Select the repository root.
6. Open your own Yahoo team page once.
7. Refresh Yahoo.

After code updates:

```bash
git pull
```

Then click **Reload** for Fantasy Intel in `chrome://extensions`.

## Opening Fantasy Intel from Yahoo

The Yahoo overlay no longer navigates directly to an internal extension URL from the Yahoo webpage.

It sends an `OPEN_APP` message to `background.js`, and the service worker opens:

```text
app/index.html?league=497223&team=<detected-team>
```

This avoids the direct `window.open(chrome-extension://...)` path that was producing `ERR_BLOCKED_BY_CLIENT` during testing.

## Local/runtime bridge

`app/js/runtime.js` allows the same app code to run in two modes:

- **EXTENSION** - reads Chrome storage, can trigger Yahoo sync, can open Yahoo with Chrome tabs API.
- **LOCAL DEV** - reads `?league=` and `?team=` from the normal localhost URL and stores the selected team in localStorage.

This is deliberate. We can develop the UI locally without continually reloading Chrome, while the installed extension remains the Yahoo connector.

## Current limitation before public release

Version 3.0.0 is still intentionally tied to Battle of the Kings and the current FantasyIntel Supabase project. It is ready for Justin + same-league friend testing, not public Chrome Web Store distribution.

Before public release we still need to:
- discover any Yahoo league dynamically instead of hard-coding `497223`
- create a proper league registry instead of the temporary `battle-of-the-kings-2026` mapping
- add authentication/user memberships
- secure shared data with Supabase RLS
- stop exposing any writable shared-data path through a public anonymous client
- publish through the Chrome Web Store for automatic updates

## Source of truth

`Justindema76/Yahoo-Fantasy-Extension` is the only extension source of truth going forward.
