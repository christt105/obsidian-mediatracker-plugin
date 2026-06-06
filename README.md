# Media Tracker

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/christt105)

An Obsidian plugin to track **movies, TV shows, seasons and video games** in one
place. It pulls rich metadata and artwork from **TMDB**, **TheTVDB**, **IGDB**,
**Steam** and **SteamGridDB**, and creates clean, customizable notes for every entry.

This plugin replaces the QuickAdd + Templater + Movie Search script bundle from the
[Media Tracker Obsidian Template](https://github.com/christt105/media-tracker-obsidian-template):
everything is now a single, comfortable plugin with native settings — no scripts to
wire up, no extra plugins required.

## Features

- **Movies & TV shows** — search **TMDB or TheTVDB** and create a note with poster,
  banner, genres, cast, director, overview and more. Pick a provider per media kind;
  ids from both services are cross-stored so artwork can come from either.
- **Season-accurate TV** — TheTVDB respects season numbering (great for anime and
  split-cour shows where TMDB groups everything under one season).
- **Video games** — search IGDB and create a note with cover, screenshot/banner,
  developer, platforms, genres and Steam app id. Official Steam artwork is used
  automatically when the game is on Steam.
- **Seasons** — from an open TV show note, generate a linked season note in one
  command. Season air date and poster are pulled from TMDB when available, and a
  link is added back to the show automatically.
- **Update images** — replace the cover (poster) or banner (backdrop) of any note by
  picking from a paged image gallery. Sources: TMDB and TheTVDB (movies/TV/seasons),
  official Steam art, and SteamGridDB community art (games). Falls back across
  providers automatically.
- **Search Steam App ID** — look up and store the Steam app id for the active note.
- **Fully customizable** — per-type folders, file name format, default status,
  frontmatter property case, season label/property and optional custom templates.

## Commands

| Command | Description |
| --- | --- |
| **Add movie or TV show** | Search TMDB and create a note. |
| **Add video game** | Search IGDB and create a note. |
| **Create season (from active show note)** | Create a season note linked to the open TV show. |
| **Search Steam App ID (for active note)** | Find and store `steam_appid`. |
| **Update images (cover / banner)** | Pick a new cover or banner for the active note. |
| **Create media views (Bases gallery & table)** | Generate a `.base` file with ready-made gallery and table views. |

Two ribbon icons are also added: 🎬 *Add movie or TV show* and 🎮 *Add video game*.
Assign your own hotkeys in **Settings → Hotkeys** (search for "Media Tracker").

## Setup

Open **Settings → Media Tracker** and fill in the API keys for the services you want
to use. Configure only what you need — but **at least one of TMDB or TheTVDB** is
required for movies/TV.

### Providers

Under **Providers**, choose which service supplies movies and TV shows:

- **Movie provider** and **TV show provider** — each *Auto*, *TMDB* or *TheTVDB*.
- *Auto* uses **TMDB for movies** and **TheTVDB for shows** when both are configured,
  otherwise whichever key you set.
- A typical setup (like Jellyfin): movies → TMDB, shows → TheTVDB. The combined
  "Add movie or TV show" search then queries both and merges the results.

Both `tmdb_id` and `thetvdb_id` are stored on each note when available, so updating
images can use whichever provider has the artwork (and respects seasons).

### TMDB (movies & TV shows)

1. [Create a TMDB account and request an API key](https://www.themoviedb.org/settings/api).
2. Paste either the **v3 API key** or the **v4 read access token** into *TMDB API key*.

### TheTVDB (TV shows & seasons)

TheTVDB v4 API keys are **per-project**, not per-user, so the plugin can bundle one
project key (the same approach Jellyfin uses). If a key is bundled you can leave the
field empty; otherwise:

1. Register a project at [TheTVDB API information](https://www.thetvdb.com/api-information)
   to get a **v4 API key**.
2. Paste it into *TheTVDB API key*. For a personal / user-supported key, also enter
   your **subscriber PIN** (from your TheTVDB account) in *TheTVDB subscriber PIN*.

The login token is fetched and refreshed automatically. Titles and overviews are
localized to your preferred locale (falling back to English, then the original
language) using TheTVDB's translations.

### IGDB (video games)

1. Log in to the [Twitch developer console](https://dev.twitch.tv/console/apps).
2. Register a new application:
   - **OAuth Redirect URL:** `http://localhost`
   - **Category:** Application Integration
   - **Client Type:** Confidential
3. Open *Manage* and copy the **Client ID** and **Client Secret** into the settings.

The OAuth token is fetched and refreshed automatically.

### SteamGridDB (artwork)

Generate an API key from your
[SteamGridDB preferences](https://www.steamgriddb.com/profile/preferences/api) and
paste it into *SteamGridDB API key*. Used by **Update images** for game artwork.

## Customization

| Setting | What it does |
| --- | --- |
| Movies / TV / Seasons / Games folder | Where each kind of note is created. |
| File name format | `{{title}}`, `{{year}}`, `{{release_date}}` placeholders. |
| Default status | Status assigned to new entries (e.g. `Not Started`). |
| Frontmatter property case | `snake_case` or `camelCase` keys. |
| Seasons list property | Property on the show note holding season links. |
| Season label | Word used in season file names (`Season`, `Temporada`, ...). |
| Custom templates | Optional template file per media type. |

### Custom templates

Leave the template fields empty to use the built-in frontmatter (compatible with the
Media Tracker template / Hugo theme). To take full control, point a media type at a
template note that uses `{{variable}}` placeholders. Arrays such as genres are joined
with commas.

Available variables include: `title`, `original_title`, `type`, `release_date`,
`year`, `overview`, `cover`, `banner`, `genres`, `rating`, `tmdb_id`, `director`,
`main_actors`, `homepage`, `tagline`, `youtube_url`, `number_of_seasons`, `tmdb_id`,
`thetvdb_id`, `igdb_id`, `steam_appid`, `steamgriddb_id`, `developer`,
`available_platforms`, `game_modes`, `season_number`, `series_file`.

> [!NOTE]
> For games, `available_platforms` holds the platforms the game is released on (from
> IGDB). The separate `platforms` property is left empty for you to record the
> platform(s) you actually played it on.

## Generated frontmatter

Notes are created with frontmatter compatible with the Media Tracker Hugo theme, e.g.
a movie:

```yaml
---
title: Back to the Future
type: movie
date: ""
rewatches: []
release_date: "1985-07-03"
status: Not Started
cover: https://image.tmdb.org/t/p/original/...jpg
banner: https://image.tmdb.org/t/p/original/...jpg
rating: ""
genres:
  - Adventure
  - Comedy
  - Science Fiction
tmdb_id: 105
tags: []
related: []
overview: "Eighties teenager Marty McFly..."
---
```

## Installation

### With BRAT (recommended)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) installs and auto-updates the
plugin straight from this repository:

1. Install **BRAT** from *Settings → Community plugins → Browse* and enable it.
2. Run the command **BRAT: Add a beta plugin for testing** (or *Settings → BRAT →
   Add Beta Plugin*).
3. Enter `christt105/hugo-mediatracker-plugin` and confirm. BRAT grabs the latest
   release, so leave the version as *latest*.
4. Enable **Media Tracker** in *Settings → Community plugins* and add your API keys.

> Requires Obsidian **1.6.6+**.

### Manual

1. Download `main.js`, `manifest.json` and `styles.css` from the
   [latest release](https://github.com/christt105/hugo-mediatracker-plugin/releases).
2. Copy them into `<vault>/.obsidian/plugins/media-tracker/`.
3. Reload Obsidian and enable **Media Tracker** in *Settings → Community plugins*.

## Recommended companion plugins

- [**Pretty Properties**](https://obsidian.md/plugins?id=pretty-properties) — renders
  the `cover` and `banner` properties as proper images/banners, giving each note a
  rich, gallery-like look. Highly recommended for the best visualization.
- [**Bases**](https://help.obsidian.md/bases) (core plugin) — run **Create media
  views** to generate a `.base` with gallery and table views of your whole library.

## Development

```bash
npm install
npm run dev      # watch + rebuild
npm run build    # type-check + production build
npm run lint     # eslint (obsidianmd ruleset)
```

### Releasing

Releases are automated by `.github/workflows/release.yml` (from the official
Obsidian sample plugin). Bump the version and push a tag:

```bash
npm version patch   # updates manifest.json + versions.json via version-bump.mjs
git push --follow-tags
```

Pushing a tag builds the plugin and creates a **draft GitHub release** with
`main.js`, `manifest.json` and `styles.css` attached, ready to publish.
A separate `lint.yml` workflow type-checks and lints every push and PR.

## Credits

This plugin builds on the work of several open-source projects:

- [**Movie Search**](https://github.com/Gubchik123/obsidian-movie-search-plugin) by
  Gubchik123 — the TMDB integration patterns (multi-search, v3/v4 token handling,
  trailer selection, template variables and settings layout) are adapted from it.
- [**obsidian-sample-plugin**](https://github.com/obsidianmd/obsidian-sample-plugin) —
  project scaffolding, build setup and release workflow.
- The QuickAdd / Templater scripts from the
  [Media Tracker Obsidian Template](https://github.com/christt105/media-tracker-obsidian-template)
  (IGDB script originally by christt105 / Elaws), which this plugin replaces.

## Attribution

This project uses data and images from:

- [The Movie Database (TMDB)](https://www.themoviedb.org/)
- [TheTVDB](https://www.thetvdb.com/)
- [IGDB](https://www.igdb.com/)
- [Steam](https://store.steampowered.com/)
- [SteamGridDB](https://www.steamgriddb.com/)

## License

[MIT](LICENSE)
