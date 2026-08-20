const { addonBuilder } = require("stremio-addon-sdk");
const axios = require("axios");
require("dotenv").config();

const CONFIG = {
  TMDB_API_KEY: process.env.TMDB_API_KEY,
  TMDB_BASE_URL: "https://api.themoviedb.org/3",
  IMAGE_BASE_URL: "https://image.tmdb.org/t/p",
  ITEMS_PER_PAGE: 20,
  MAX_CAST_MEMBERS: 5,
  DEFAULT_LANGUAGE: "tl",
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
  version: "1.1.0",
  name: process.env.ADDON_NAME || "Pinoy Movies",
  description: "Latest Filipino movies from TMDB.",
  types: ["movie"],
  catalogs: [
    {
      type: "movie",
      id: "filipino_movies",
      name: "Latest Pinoy Movies",
      extra: [{ name: "skip", isRequired: false }],
    },
  ],
  resources: [
    "catalog",
    { name: "meta", types: ["movie"], idPrefixes: ["tt", "tmdb:"] },
    { name: "stream", types: ["movie"], idPrefixes: ["tt"] },
  ],
  logo: "https://res.cloudinary.com/dlvr5hpzp/image/upload/v1729859442/Vivamax_app_icon_mfsyys.jpg",
};

const builder = new addonBuilder(manifest);

const tmdbToStremioIdCache = new Map();
const imdbToTmdbIdCache = new Map();

const getImageUrl = (path, size = "w500") =>
  path ? `${CONFIG.IMAGE_BASE_URL}/${size}${path}` : undefined;

const isImdbId = (id) => /^tt\d+$/.test(id);

const parseTmdbId = (id) => {
  const match = /^tmdb:(\d+)$/.exec(id);
  return match ? match[1] : null;
};

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

builder.defineCatalogHandler(async ({ type, id, extra = {} }) => {
  if (type !== "movie" || id !== "filipino_movies") {
    return { metas: [] };
  }

  try {
    const skip = Math.max(0, Number.parseInt(extra.skip || "0", 10) || 0);
    const page = Math.floor(skip / CONFIG.ITEMS_PER_PAGE) + 1;

    const { data } = await tmdbClient.get("/discover/movie", {
      params: {
        page,
        sort_by: "primary_release_date.desc",
        with_original_language: CONFIG.DEFAULT_LANGUAGE,
        include_adult: false,
        include_video: false,
        "primary_release_date.lte": new Date().toISOString().slice(0, 10),
      },
    });

    const movies = (data.results || []).filter(
      (movie) => movie?.id && movie?.title && movie?.poster_path
    );

    const metas = await Promise.all(
      movies.map(async (movie) => ({
        id: await getStremioIdForTmdbMovie(movie.id),
        type: "movie",
        name: movie.title,
        poster: getImageUrl(movie.poster_path, "w500"),
        posterShape: "poster",
        background: getImageUrl(movie.backdrop_path, "w1280"),
        releaseInfo: toReleaseInfo(movie.release_date),
        description: movie.overview || undefined,
      }))
    );

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
  if (type !== "movie" || !isImdbId(id)) {
    return { streams: [] };
  }

  // This addon supplies catalog/metadata only. Returning an empty stream list
  // keeps the stream resource valid; other installed stream addons can match
  // this same IMDb ID and provide their own streams.
  return { streams: [] };
});

module.exports = builder.getInterface();
