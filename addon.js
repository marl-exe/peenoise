import { addonBuilder } from "@stremio-addon/compat";
import axios from "axios";

const CONFIG = {
  TMDB_API_KEY: process.env.TMDB_API_KEY,
  TMDB_BASE_URL: "https://api.themoviedb.org/3",
  IMAGE_BASE_URL: "https://image.tmdb.org/t/p",
  ITEMS_PER_PAGE: 20,
  MAX_CAST_MEMBERS: 5,
  DEFAULT_LANGUAGE: "tl",
  R18_CACHE_MS: 60 * 60 * 1000,
  CERTIFICATION_CHECK_CONCURRENCY: 5,
};

if (!CONFIG.TMDB_API_KEY) {
  throw new Error("TMDB_API_KEY environment variable is required");
}

const tmdbClient = axios.create({
  baseURL: CONFIG.TMDB_BASE_URL,
  params: {
    api_key: CONFIG.TMDB_API_KEY,
    language: CONFIG.DEFAULT_LANGUAGE,
  },
  timeout: 10000,
});

const manifest = {
  id: process.env.ADDON_ID || "org.filipinomoviesaddon.personal",
  version: "1.2.2",
  name: process.env.ADDON_NAME || "Pinoy Movies",
  description: "Philippines R-18 movies from TMDB.",
  types: ["movie"],
  catalogs: [
    {
      type: "movie",
      id: "filipino_movies",
      name: "Philippines R-18 Movies",
      extra: [{ name: "skip", isRequired: false }],
    },
  ],
  resources: [
    "catalog",
    { name: "meta", types: ["movie"], idPrefixes: ["tt", "tmdb:"] },
    { name: "stream", types: ["movie"], idPrefixes: ["tt", "tmdb:"] },
  ],
  logo: process.env.ADDON_LOGO || "https://peenoise.onrender.com/logo.svg",
};

const builder = new addonBuilder(manifest);

const tmdbToStremioIdCache = new Map();
const imdbToTmdbIdCache = new Map();
const phR18CertificationCache = new Map();

let r18CatalogCache = {
  expiresAt: 0,
  movies: null,
};

const getImageUrl = (path, size = "w500") =>
  path ? `${CONFIG.IMAGE_BASE_URL}/${size}${path}` : undefined;

const isImdbId = (id) => /^tt\d+$/.test(id);

const parseTmdbId = (id) => {
  const match = /^tmdb:(\d+)$/.exec(id);
  return match ? match[1] : null;
};

const isSupportedStreamId = (id) => isImdbId(id) || Boolean(parseTmdbId(id));

const normalizeCertification = (certification) =>
  String(certification || "")
    .trim()
    .toUpperCase()
    .replace(/[‐‑‒–—−]/g, "-");

const logApiError = (error, context) => {
  console.error(
    JSON.stringify({
      context,
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      timestamp: new Date().toISOString(),
    })
  );
};

const toReleaseInfo = (releaseDate) => {
  if (!releaseDate) return undefined;
  const year = Number.parseInt(releaseDate.slice(0, 4), 10);
  return Number.isFinite(year) ? String(year) : undefined;
};

const toReleased = (releaseDate) => {
  if (!releaseDate) return undefined;
  const date = new Date(`${releaseDate}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const getR18DiscoverParams = () => ({
  sort_by: "primary_release_date.desc",
  include_adult: true,
  include_video: false,
  region: "PH",
  certification_country: "PH",
  certification: "R-18",
  with_origin_country: "PH",
  "primary_release_date.lte": new Date().toISOString().slice(0, 10),
});

async function getStremioIdForTmdbMovie(tmdbId) {
  const key = String(tmdbId);

  if (tmdbToStremioIdCache.has(key)) {
    return tmdbToStremioIdCache.get(key);
  }

  try {
    const { data } = await tmdbClient.get(`/movie/${key}/external_ids`);
    const stremioId =
      data.imdb_id && isImdbId(data.imdb_id)
        ? data.imdb_id
        : `tmdb:${key}`;

    tmdbToStremioIdCache.set(key, stremioId);

    if (isImdbId(stremioId)) {
      imdbToTmdbIdCache.set(stremioId, key);
    }

    return stremioId;
  } catch (error) {
    logApiError(error, `external_ids:${key}`);
    const fallbackId = `tmdb:${key}`;
    tmdbToStremioIdCache.set(key, fallbackId);
    return fallbackId;
  }
}

async function resolveTmdbMovieId(stremioId) {
  const tmdbId = parseTmdbId(stremioId);
  if (tmdbId) return tmdbId;

  if (!isImdbId(stremioId)) {
    throw new Error(`Unsupported movie ID: ${stremioId}`);
  }

  if (imdbToTmdbIdCache.has(stremioId)) {
    return imdbToTmdbIdCache.get(stremioId);
  }

  const { data } = await tmdbClient.get(`/find/${stremioId}`, {
    params: { external_source: "imdb_id" },
  });

  const movie = data.movie_results?.[0];
  if (!movie?.id) {
    throw new Error(`No TMDB movie found for IMDb ID ${stremioId}`);
  }

  const resolvedId = String(movie.id);
  imdbToTmdbIdCache.set(stremioId, resolvedId);
  tmdbToStremioIdCache.set(resolvedId, stremioId);

  return resolvedId;
}

const toCatalogMeta = async (movie) => ({
  id: await getStremioIdForTmdbMovie(movie.id),
  type: "movie",
  name: movie.title,
  poster: getImageUrl(movie.poster_path, "w500"),
  posterShape: "poster",
  background: getImageUrl(movie.backdrop_path, "w1280"),
  releaseInfo: toReleaseInfo(movie.release_date),
  description: movie.overview || undefined,
});

async function hasPhilippinesR18Certification(tmdbId) {
  const key = String(tmdbId);

  if (phR18CertificationCache.has(key)) {
    return phR18CertificationCache.get(key);
  }

  try {
    const { data } = await tmdbClient.get(`/movie/${key}/release_dates`);
    const philippines = (data.results || []).find(
      (entry) => entry.iso_3166_1 === "PH"
    );

    const isR18 = (philippines?.release_dates || []).some(
      (release) => normalizeCertification(release.certification) === "R-18"
    );

    phR18CertificationCache.set(key, isR18);
    return isR18;
  } catch (error) {
    logApiError(error, `release_dates:${key}`);
    // Strict mode: if the certification cannot be verified, exclude the movie.
    return false;
  }
}

async function loadR18CatalogMovies() {
  const now = Date.now();

  if (r18CatalogCache.movies && r18CatalogCache.expiresAt > now) {
    return r18CatalogCache.movies;
  }

  const movies = [];
  const checkedIds = new Set();
  let page = 1;
  let totalPages = 1;

  do {
    const { data } = await tmdbClient.get("/discover/movie", {
      params: {
        ...getR18DiscoverParams(),
        page,
      },
    });

    totalPages = Math.min(Number(data.total_pages) || 1, 500);

    const candidates = (data.results || []).filter((movie) => {
      if (!movie?.id || !movie?.title || !movie?.poster_path) return false;
      if (checkedIds.has(movie.id)) return false;
      checkedIds.add(movie.id);
      return true;
    });

    for (
      let index = 0;
      index < candidates.length;
      index += CONFIG.CERTIFICATION_CHECK_CONCURRENCY
    ) {
      const batch = candidates.slice(
        index,
        index + CONFIG.CERTIFICATION_CHECK_CONCURRENCY
      );

      const verified = await Promise.all(
        batch.map(async (movie) => ({
          movie,
          isR18: await hasPhilippinesR18Certification(movie.id),
        }))
      );

      for (const result of verified) {
        if (result.isR18) movies.push(result.movie);
      }
    }

    page += 1;
  } while (page <= totalPages);

  r18CatalogCache = {
    movies,
    expiresAt: now + CONFIG.R18_CACHE_MS,
  };

  return movies;
}

export async function isAdultMovie(stremioId) {
  const tmdbId = await resolveTmdbMovieId(stremioId);
  return hasPhilippinesR18Certification(tmdbId);
}

export async function getAdultHomepageMovies(limit = 6) {
  const maxItems = Math.max(0, Number.parseInt(String(limit), 10) || 0);
  if (maxItems === 0) return [];

  const movies = await loadR18CatalogMovies();
  const selected = movies.slice(0, maxItems);
  return Promise.all(selected.map(toCatalogMeta));
}

builder.defineCatalogHandler(async ({ type, id, extra = {} }) => {
  if (type !== "movie" || id !== "filipino_movies") {
    return { metas: [] };
  }

  try {
    const skip = Math.max(0, Number.parseInt(extra.skip || "0", 10) || 0);
    const movies = await loadR18CatalogMovies();
    const pageMovies = movies.slice(skip, skip + CONFIG.ITEMS_PER_PAGE);
    const metas = await Promise.all(pageMovies.map(toCatalogMeta));

    return {
      metas,
      cacheMaxAge: 3600,
      staleRevalidate: 86400,
    };
  } catch (error) {
    logApiError(error, "catalog");
    return { metas: [] };
  }
});

builder.defineMetaHandler(async ({ type, id }) => {
  if (type !== "movie") {
    return { meta: null };
  }

  try {
    const tmdbId = await resolveTmdbMovieId(id);

    const [movieDetails, credits] = await Promise.all([
      tmdbClient.get(`/movie/${tmdbId}`),
      tmdbClient.get(`/movie/${tmdbId}/credits`),
    ]);

    const movie = movieDetails.data;

    const cast = (credits.data.cast || [])
      .slice(0, CONFIG.MAX_CAST_MEMBERS)
      .map((actor) => actor.name)
      .filter(Boolean);

    const director = (credits.data.crew || [])
      .filter((member) => member.job === "Director")
      .map((member) => member.name)
      .filter(Boolean);

    return {
      meta: {
        id,
        type: "movie",
        name: movie.title,
        description: movie.overview || undefined,
        poster: getImageUrl(movie.poster_path, "w500"),
        posterShape: "poster",
        background: getImageUrl(movie.backdrop_path, "w1280"),
        genres: (movie.genres || []).map((genre) => genre.name).filter(Boolean),
        cast,
        director,
        releaseInfo: toReleaseInfo(movie.release_date),
        released: toReleased(movie.release_date),
        runtime:
          Number.isFinite(movie.runtime) && movie.runtime > 0
            ? `${movie.runtime}m`
            : undefined,
        language: movie.original_language || undefined,
        country: movie.production_countries?.[0]?.name || undefined,
      },
      cacheMaxAge: 86400,
      staleRevalidate: 604800,
    };
  } catch (error) {
    logApiError(error, `meta:${id}`);
    return { meta: null };
  }
});

builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== "movie" || !isSupportedStreamId(id)) {
    return { streams: [] };
  }

  // This addon supplies catalog/metadata only. Accepting both IMDb and TMDB IDs
  // keeps the stream resource valid for every movie in this catalog. Other
  // installed stream addons may still require IMDb IDs to provide playback.
  return { streams: [] };
});

export default builder.getInterface();
