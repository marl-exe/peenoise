import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { getRouter } from "@stremio-addon/compat";
import addonInterface, {
  getAdultHomepageMovies,
  isAdultMovie,
} from "./addon.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number.parseInt(process.env.PORT || "7000", 10);
const publicDir = path.join(__dirname, "public");
const indexFile = path.join(publicDir, "index.html");
const MAX_HOMEPAGE_MOVIES = 6;
const HOMEPAGE_CACHE_MS = 15 * 60 * 1000;

const pinnedMovieIds = Array.from(
  new Set(
    (process.env.HOMEPAGE_MOVIES || "")
      .split(",")
      .map((id) => id.trim().toLowerCase())
      .filter((id) => /^tt\d+$/.test(id))
  )
).slice(0, MAX_HOMEPAGE_MOVIES);

let homepageMoviesCache = {
  expiresAt: 0,
  payload: null,
};

const adsenseScript = `
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6812141646808986"
       crossorigin="anonymous"></script>`;

const homepageScript = `
  <script defer src="/homepage.js"></script>`;

app.disable("x-powered-by");

async function getHomepageMovies() {
  const now = Date.now();

  if (homepageMoviesCache.payload && homepageMoviesCache.expiresAt > now) {
    return homepageMoviesCache.payload;
  }

  // Resolve manually pinned IMDb IDs first, but only keep titles that TMDB
  // explicitly marks as adult content. The API key remains server-side.
  const pinnedResults = await Promise.all(
    pinnedMovieIds.map(async (id) => {
      try {
        if (!(await isAdultMovie(id))) return null;

        const response = await addonInterface.get("meta", "movie", id, {}, null);
        const meta = response?.meta;
        return meta?.id && meta?.poster ? meta : null;
      } catch (error) {
        console.warn(`Unable to resolve pinned homepage movie ${id}:`, error.message);
        return null;
      }
    })
  );

  const resolvedPinned = pinnedResults.filter(Boolean);

  // Fill remaining positions from a dedicated adult-only TMDB feed. This is
  // intentionally separate from the Stremio catalog, which remains mixed.
  let latestMovies = [];
  try {
    latestMovies = await getAdultHomepageMovies(MAX_HOMEPAGE_MOVIES);
  } catch (error) {
    console.warn("Unable to load adult homepage movies:", error.message);
  }

  const selected = [];
  const seenIds = new Set();

  const addMovie = (movie) => {
    if (!movie?.id || !movie?.poster || seenIds.has(movie.id)) return;
    if (selected.length >= MAX_HOMEPAGE_MOVIES) return;

    seenIds.add(movie.id);
    selected.push({
      id: movie.id,
      name: movie.name,
      poster: movie.poster,
      background: movie.background,
      releaseInfo: movie.releaseInfo,
      description: movie.description,
    });
  };

  resolvedPinned.forEach(addMovie);
  latestMovies.forEach(addMovie);

  const payload = {
    movies: selected,
    pinnedConfigured: pinnedMovieIds.length,
    pinnedCount: resolvedPinned.length,
    generatedAt: new Date().toISOString(),
  };

  homepageMoviesCache = {
    payload,
    expiresAt: now + HOMEPAGE_CACHE_MS,
  };

  return payload;
}

// JSON endpoint used only by the landing page. Hybrid selection order:
// 1) adult HOMEPAGE_MOVIES IMDb IDs, in the configured order
// 2) latest adult-only TMDB movies until six slots are filled
app.get("/homepage-movies.json", async (req, res) => {
  try {
    const payload = await getHomepageMovies();
    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=900");
    res.json(payload);
  } catch (error) {
    console.error("Failed to build homepage movie list:", error);
    res.status(500).json({ error: "Unable to load homepage movies" });
  }
});

// Serve the homepage with Google AdSense and the dynamic poster loader inserted
// into <head>, while keeping the checked-in HTML easy to edit independently.
app.get("/", (req, res, next) => {
  fs.readFile(indexFile, "utf8", (error, html) => {
    if (error) return next(error);

    let page = html;

    if (!page.includes("ca-pub-6812141646808986")) {
      page = page.replace("</head>", `${adsenseScript}\n</head>`);
    }

    if (!page.includes('src="/homepage.js"')) {
      page = page.replace("</head>", `${homepageScript}\n</head>`);
    }

    res.type("html").send(page);
  });
});

// Serve the remaining static assets without automatically serving index.html.
app.use(
  express.static(publicDir, {
    index: false,
    maxAge: "1h",
  })
);

// Keep all Stremio protocol endpoints intact:
// /manifest.json, /catalog/..., /meta/..., /stream/...
app.use(getRouter(addonInterface));

// Simple JSON 404 for anything that is neither a static asset nor addon route.
app.use((req, res) => {
  // @stremio-addon/compat continues to the next Express middleware after it
  // sends a protocol response, so avoid writing a second response here.
  if (res.headersSent) return;
  res.status(404).json({ error: "Not found" });
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Peenoise listening on port ${port}`);
  console.log(`Manifest: http://127.0.0.1:${port}/manifest.json`);
  console.log(
    pinnedMovieIds.length
      ? `Homepage pinned movies: ${pinnedMovieIds.join(", ")}`
      : "Homepage pinned movies: none (showing latest adult titles)"
  );
});

server.on("error", (error) => {
  console.error("Failed to start addon:", error);
  process.exit(1);
});
