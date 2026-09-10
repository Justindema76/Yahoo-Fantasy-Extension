# Fantasy Intel Yahoo Extension

Standalone Chrome Manifest V3 Yahoo connector plus a normal HTML/CSS/JavaScript Fantasy Intel user app.

## Current build

Version: **3.1.0**

Current private test configuration:
- Yahoo league: Battle of the Kings
- Yahoo league ID: `497223`
- My team: detected from the Yahoo team URL and remembered per browser
- Supabase project: FantasyIntel
- House of the Dragon: Yahoo Team `6`
- TEAM DOG SCIENCE: Yahoo Team `1`

## Repository layout

```text
Yahoo-Fantasy-Extension/
  manifest.json
  background.js
  league-sync.js
  overlay.js
  popup.html
  popup.css
  popup.js

  app/
    index.html
    css/app.css
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

  dev-server.js
  package.json
  VERSION
```

The extension handles Yahoo. The `app/` folder is the user-facing Fantasy Intel application and can run inside Chrome or as a normal localhost website.

## Canonical player identity

Starting with v3.1.0, `public.fantasy_players` is the authoritative player registry used by Fantasy Intel.

The extension reads players directly from Yahoo Fantasy Football and writes them into `fantasy_players`:

```text
Yahoo /players
Yahoo team rosters
        ↓
public.fantasy_players
        ↓ player_key + yahoo_player_key
fantasy_league_rosters
intel_items
planner_player_tags
        ↓
Fantasy Intel player cards
```

`draft_player_catalog` is now secondary enrichment only for rank, role and aliases. It is not the authoritative player identity source.

Every Yahoo roster row is connected to `fantasy_players.player_key`. `intel_items` also stores `player_key` and `yahoo_player_key`, so the app joins Intel to the actual Yahoo-synced player instead of guessing by display name.

Supabase also has automatic linking triggers:
- new Intel is linked to an existing Yahoo player when possible
- if Intel exists before Yahoo has synced that player, a later Yahoo player sync can attach the waiting Intel automatically
- suffix differences such as `Aaron Jones` vs `Aaron Jones Sr.` and `James Cook` vs `James Cook III` are normalized during linking

## Yahoo player sync

A Yahoo sync now:
1. detects the current manager/team
2. reads the Yahoo team list
3. walks the Yahoo `/players` pages
4. upserts those Yahoo players into `public.fantasy_players`
5. reads every team roster
6. ensures every rostered Yahoo player exists in `fantasy_players`
7. writes roster rows using that canonical `player_key`
8. syncs league matchups

This means the same Yahoo player identity is used by the extension, the local app and the Intel system.

## User app

The user application currently contains:
- MY TEAM
- MATCHUPS
- LEAGUE

It does not expose the private research/admin navigation from the older Vercel fantasy site.

The app loads:
- `fantasy_players`
- `fantasy_league_teams`
- `fantasy_league_rosters`
- `fantasy_league_matchups`
- `planner_player_tags`
- active `intel_items`

Intel lookup order is:
1. `player_key`
2. `yahoo_player_key`
3. normalized player name only as a final compatibility fallback

## Run locally

No dependency install is required.

From the repository root:

```bash
npm run dev
```

Open:

```text
House of the Dragon
http://localhost:4173/app/?league=497223&team=6

TEAM DOG SCIENCE
http://localhost:4173/app/?league=497223&team=1

Choose a team manually
http://localhost:4173/app/?league=497223
```

The local app reads the same Supabase data. Yahoo scraping itself still runs through the installed Chrome extension because it needs the manager's logged-in Yahoo browser session.

## Load the Chrome extension

1. Clone this repository.
2. Open `chrome://extensions`.
3. Turn on Developer mode.
4. Click **Load unpacked**.
5. Select the repository root.
6. Open your Yahoo team page once.
7. Refresh Yahoo.
8. Click **SYNC YAHOO**.

After code updates:

```bash
git pull
```

Then click **Reload** for Fantasy Intel in `chrome://extensions`.

## Identity model

There is no global `is_my_team` assumption.

For the current league:
- `/f1/497223/6` identifies House of the Dragon
- `/f1/497223/1` identifies TEAM DOG SCIENCE

Each Chrome profile remembers its own Yahoo team locally, while both managers use the same shared league/player/Intel data.

## Current public-release limitation

v3.1.0 is still intentionally tied to Battle of the Kings and the current FantasyIntel Supabase project for testing.

Before public Chrome Web Store distribution we still need to:
- detect arbitrary Yahoo league IDs dynamically
- create a generic league registry
- add authentication and user/league memberships
- secure shared data with Supabase RLS
- remove anonymous public write access

## Source of truth

`Justindema76/Yahoo-Fantasy-Extension` is the extension source of truth going forward.
