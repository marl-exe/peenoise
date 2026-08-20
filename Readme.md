# Peenoise

Peenoise is a personal Stremio catalog and metadata addon focused on Filipino movies. It discovers recent Filipino-language releases from TMDB, exposes them through Stremio-compatible catalog and metadata endpoints, and includes a custom web landing page for installation and discovery.

> Peenoise is an independent community addon and is not affiliated with or endorsed by Stremio.

## Live Addon

- Website: https://peenoise.onrender.com/
- Manifest: https://peenoise.onrender.com/manifest.json
- Stremio install URL: `stremio://peenoise.onrender.com/manifest.json`

Open the website and use the **Install in Stremio** button, or add the manifest URL manually in Stremio.

## Features

- Latest Filipino movie catalog sourced from TMDB
- Stremio `catalog`, `meta`, and `stream` resources
- IMDb IDs when available, with `tmdb:<id>` fallback
- TMDB-to-IMDb and IMDb-to-TMDB ID resolution
- Movie posters, backdrops, descriptions, genres, cast, directors, runtime, release information, language, and country metadata
- Custom Express landing page with live addon status
- Dynamic homepage movie posters
- Hybrid homepage mode: manually pinned IMDb titles first, then automatic latest releases
- Server-side TMDB API access so the API key is never exposed to browser code
- In-memory mapping and homepage caching
- Render-compatible deployment using `process.env.PORT`

## Important: Streaming

Peenoise currently provides **catalog and metadata discovery only**. Its stream handler intentionally returns an empty stream list.

Movies use IMDb IDs whenever TMDB provides one, which allows other installed Stremio stream addons to match the same title and provide streams independently.

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
| `HOMEPAGE_MOVIES` | No | Comma-separated IMDb IDs to pin on the landing page |

Example hybrid homepage configuration:

```env
HOMEPAGE_MOVIES=tt1234567,tt2345678,tt3456789
```

Pinned titles are displayed first in the configured order. Any remaining homepage slots are filled automatically from the latest Filipino movie catalog, up to six movies total.

## Main Endpoints

| Endpoint | Purpose |
| --- | --- |
| `/` | Peenoise landing and installation page |
| `/manifest.json` | Stremio addon manifest |
| `/catalog/movie/filipino_movies.json` | Filipino movie catalog |
| `/meta/movie/:id.json` | Movie metadata |
| `/stream/movie/:id.json` | Valid Stremio stream endpoint; currently returns no streams |
| `/homepage-movies.json` | Landing-page movie selection API |

## Production Deployment

The project is currently deployed on Render. A typical Render Web Service configuration is:

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
```

Configure `TMDB_API_KEY` in the Render environment. Do not commit `.env` files or API secrets to the repository.

## Security

Dependency auditing can be checked with:

```bash
npm audit --omit=dev
```

The project has been migrated from the legacy `stremio-addon-sdk` package to `@stremio-addon/compat` and uses ES modules.

## TMDB Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB.

TMDB data and artwork remain subject to TMDB's terms and attribution requirements.

## Disclaimer

Peenoise does not host, upload, or provide movie video files. Catalog and metadata information is retrieved from TMDB. Availability of playback depends on other Stremio addons or services installed by the user.

## License

See [LICENSE](LICENSE) for the repository license terms.

## Upstream / Attribution

Peenoise was originally based on the `johnchrisdc/stremio_addon` project.

Original project:
https://github.com/johnchrisdc/stremio_addon

The original code is licensed under the BSD 3-Clause License.
Copyright (c) 2024, Dindo Quitor.

Peenoise includes subsequent modifications, modernization, UI changes, dependency updates, and additional functionality.
