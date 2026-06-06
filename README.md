# Media Tracker

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/christt105)

An Obsidian plugin to track **movies, TV shows, seasons and video games** in one
place. It pulls rich metadata and artwork from **TMDB**, **IGDB**, **Steam** and
**SteamGridDB**, and creates clean, customizable notes for every entry.

This plugin replaces the QuickAdd + Templater + Movie Search script bundle from the
[Media Tracker Obsidian Template](https://github.com/christt105/media-tracker-obsidian-template):
everything is now a single, comfortable plugin with native settings — no scripts to
wire up, no extra plugins required.

## Features

- **Movies & TV shows** — search TMDB and create a note with poster, banner, genres,
  cast, director, overview and more.
- **Video games** — search IGDB and create a note with cover, screenshot/banner,
  developer, platforms, genres and Steam app id. Official Steam artwork is used
  automatically when the game is on Steam.
- **Seasons** — from an open TV show note, generate a linked season note in one
  command. Season air date and poster are pulled from TMDB when available, and a
  link is added back to the show automatically.
- **Update images** — replace the cover (poster) or banner (backdrop) of any note by
  picking from a paged image gallery. Sources: TMDB (movies/TV/seasons), official
  Steam art, and SteamGridDB community art (games).
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

Two ribbon icons are also added: 🎬 *Add movie or TV show* and 🎮 *Add video game*.
Assign your own hotkeys in **Settings → Hotkeys** (search for "Media Tracker").

## Setup

Open **Settings → Media Tracker** and fill in the API keys for the services you want
to use. None of them are mandatory — configure only what you need.

### TMDB (movies & TV shows)

1. [Create a TMDB account and request an API key](https://www.themoviedb.org/settings/api).
2. Paste either the **v3 API key** or the **v4 read access token** into *TMDB API key*.

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
`main_actors`, `homepage`, `tagline`, `youtube_url`, `number_of_seasons`, `igdb_id`,
`steam_appid`, `steamgriddb_id`, `developer`, `platforms`, `game_modes`,
`season_number`, `series_file`.

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

## Installation (manual)

1. Download `main.js`, `manifest.json` and `styles.css` from the
   [latest release](https://github.com/christt105/hugo-mediatracker-plugin/releases).
2. Copy them into `<vault>/.obsidian/plugins/media-tracker/`.
3. Reload Obsidian and enable **Media Tracker** in *Settings → Community plugins*.

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
- [IGDB](https://www.igdb.com/)
- [Steam](https://store.steampowered.com/)
- [SteamGridDB](https://www.steamgriddb.com/)

## License

[MIT](LICENSE)
