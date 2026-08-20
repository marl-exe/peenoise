# Peenoise — Philippine R-18 Movies for Stremio

Peenoise is an independent Stremio catalog and metadata addon focused on Philippine movies carrying a Philippine **R-18** certification in TMDB. It exposes those titles through Stremio-compatible catalog and metadata endpoints and includes a lightweight web landing page for installation and discovery.

> **18+ only.** The catalog is intended for adults. Peenoise is an independent community addon and is not affiliated with or endorsed by Stremio.

## Live Addon

- Website: https://peenoise.onrender.com/
- Manifest: https://peenoise.onrender.com/manifest.json
- Stremio install URL: `stremio://peenoise.onrender.com/manifest.json`

Open the website and use the **Install in Stremio** button, or add the manifest URL manually in Stremio.

## Catalog Rules

The Stremio catalog is built from TMDB movie discovery using these rules:

- Region: `PH`
- Certification country: `PH`
- Certification: `R-18`
- Origin country: `PH`
- Release date: today or earlier
- Poster: required
- Adult entries: included
- Video-only entries: excluded
- Sort order: newest release date first

The addon loads all matching TMDB result pages, de-duplicates titles, caches the result set, and serves Stremio in pages as the user scrolls.

## Features

- Philippine R-18 movie catalog sourced from TMDB
- Stremio `catalog`, `meta`, and `stream` resources
- IMDb IDs when available, with `tmdb:<id>` fallback
- TMDB-to-IMDb and IMDb-to-TMDB ID resolution
- Posters, backdrops, descriptions, genres, cast, directors, runtime, release information, language, and country metadata
- Dynamic R-18 homepage poster preview
- Optional manually pinned homepage titles, validated against Philippine R-18 certification
- Server-side TMDB API access so the API key is never exposed to browser code
- In-memory ID mapping plus catalog and homepage caching
- Render-compatible deployment using `process.env.PORT`

## Important: Streaming

Peenoise currently provides **catalog and metadata discovery only**. Its stream handler intentionally returns an empty stream list.

Movies use IMDb IDs whenever TMDB provides one, which allows other installed Stremio stream addons to recognize the same title and provide streams independently.

## Tech Stack

- Node.js 18+
- JavaScript / ES modules
- Express
- `@stremio-addon/compat`
- Axios
- dotenv
- TMDB API
- Render

## Local Setup

Clone the repository and install dependencies:

```bash
git clone https://github.com/marl-exe/peenoise.git
cd peenoise
npm install
```

Create a local `.env` file:

```env
TMDB_API_KEY=your_tmdb_api_key
PORT=7000
```

Then start the addon:

```bash
npm start
```

Open:

```text
http://localhost:7000/
http://localhost:7000/manifest.json
http://localhost:7000/homepage-movies.json
http://localhost:7000/catalog/movie/filipino_movies.json
```

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `TMDB_API_KEY` | Yes | TMDB API key used by the server |
| `PORT` | No | HTTP port. Defaults to `7000`; Render supplies this automatically |
| `ADDON_ID` | No | Overrides the default Stremio addon ID |
| `ADDON_NAME` | No | Overrides the default addon display name |
| `ADDON_LOGO` | No | Overrides the addon logo URL |
| `HOMEPAGE_MOVIES` | No | Comma-separated IMDb IDs to pin on the landing page; only Philippine R-18 titles are accepted |

Example:

```env
HOMEPAGE_MOVIES=tt1234567,tt2345678,tt3456789
```

Valid pinned R-18 titles are displayed first in the configured order. Any remaining homepage slots are filled from the newest titles in the same Philippine R-18 catalog, up to six movies total.

## Main Endpoints

| Endpoint | Purpose |
| --- | --- |
| `/` | Peenoise landing and installation page |
| `/manifest.json` | Stremio addon manifest |
| `/catalog/movie/filipino_movies.json` | Philippine R-18 movie catalog |
| `/meta/movie/:id.json` | Movie metadata |
| `/stream/movie/:id.json` | Valid Stremio stream endpoint; currently returns no streams |
| `/homepage-movies.json` | Landing-page R-18 movie selection API |

## Production Deployment

The project is currently deployed on Render. A typical Render Web Service configuration is:

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
```

Configure `TMDB_API_KEY` in the Render environment. Do not commit `.env` files or API secrets to the repository.

## Security

Run dependency and syntax checks with:

```bash
npm audit --omit=dev
npm test
```

The project uses `@stremio-addon/compat` and ES modules.

## TMDB Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB.

TMDB data and artwork remain subject to TMDB's terms and attribution requirements.

## Disclaimer

Peenoise does not host, upload, or provide movie video files. Catalog and metadata information is retrieved from TMDB. Ratings and certifications depend on the data available in TMDB. Playback availability depends on other Stremio addons or services installed by the user.

## License

See [LICENSE](LICENSE) for the repository license terms.

## Upstream / Attribution

Peenoise was originally based on the `johnchrisdc/stremio_addon` project.

Original project:
https://github.com/johnchrisdc/stremio_addon

The original code is licensed under the BSD 3-Clause License.
Copyright (c) 2024, Dindo Quitor.

Peenoise includes subsequent modifications, modernization, UI changes, dependency updates, and additional functionality.
