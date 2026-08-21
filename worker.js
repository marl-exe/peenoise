import addonInterface, {
  getAdultHomepageMovies,
  isAdultMovie,
} from "./addon.js";

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

const resourceNames = new Set();
if ((addonInterface.manifest.catalogs || []).length > 0) {
  resourceNames.add("catalog");
}
for (const resource of addonInterface.manifest.resources || []) {
  resourceNames.add(typeof resource === "string" ? resource : resource.name);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json; charset=utf-8",
};

function getCacheControl(result) {
  const directives = [];

  if (Number.isInteger(result?.cacheMaxAge)) {
    directives.push(`max-age=${result.cacheMaxAge}`);
  }
  if (Number.isInteger(result?.staleRevalidate)) {
    directives.push(`stale-while-revalidate=${result.staleRevalidate}`);
  }
  if (Number.isInteger(result?.staleError)) {
    directives.push(`stale-if-error=${result.staleError}`);
  }

  return directives.length ? `${directives.join(", ")}, public` : null;
}

function jsonResponse(payload, init = {}) {
  const headers = new Headers(init.headers || {});
  for (const [key, value] of Object.entries(jsonHeaders)) {
    if (!headers.has(key)) headers.set(key, value);
  }

  return new Response(JSON.stringify(payload), {
    ...init,
    headers,
  });
}

async function getHomepageMovies() {
  const now = Date.now();

  if (homepageMoviesCache.payload && homepageMoviesCache.expiresAt > now) {
    return homepageMoviesCache.payload;
  }

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

  let latestMovies = [];
  try {
    latestMovies = await getAdultHomepageMovies(MAX_HOMEPAGE_MOVIES);
  } catch (error) {
    console.warn("Unable to load R-18 homepage movies:", error.message);
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

function parseResourcePath(pathname) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 3 && segments.length !== 4) return null;

  const resource = segments[0];
  if (!resourceNames.has(resource)) return null;

  const finalSegment = segments.at(-1);
  if (!finalSegment.endsWith(".json")) return null;

  try {
    const type = decodeURIComponent(segments[1]);
    const id = decodeURIComponent(
      (segments.length === 3 ? finalSegment : segments[2]).replace(/\.json$/, "")
    );

    const rawExtra =
      segments.length === 4 ? finalSegment.replace(/\.json$/, "") : "";
    const extra = rawExtra
      ? Object.fromEntries(new URLSearchParams(rawExtra))
      : {};

    return { resource, type, id, extra };
  } catch {
    return null;
  }
}

async function handleProtocolRequest(request, url) {
  if (url.pathname === "/manifest.json") {
    return jsonResponse(addonInterface.manifest);
  }

  const params = parseResourcePath(url.pathname);
  if (!params) return null;

  try {
    const result = await addonInterface.get(
      params.resource,
      params.type,
      params.id,
      params.extra,
      null
    );

    if (result?.redirect) {
      return new Response(null, {
        status: 307,
        headers: {
          ...corsHeaders,
          Location: result.redirect,
        },
      });
    }

    const headers = new Headers(jsonHeaders);
    const cacheControl = getCacheControl(result);
    if (cacheControl) headers.set("Cache-Control", cacheControl);

    return new Response(JSON.stringify(result), { headers });
  } catch (error) {
    console.error("Stremio protocol request failed:", error);
    return jsonResponse({ err: "handler error" }, { status: 500 });
  }
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return jsonResponse({ error: "Method not allowed" }, { status: 405 });
    }

    const url = new URL(request.url);

    if (url.pathname === "/homepage-movies.json") {
      try {
        const payload = await getHomepageMovies();
        return jsonResponse(payload, {
          headers: {
            "Cache-Control": "public, max-age=300, stale-while-revalidate=900",
          },
        });
      } catch (error) {
        console.error("Failed to build homepage movie list:", error);
        return jsonResponse(
          { error: "Unable to load homepage movies" },
          { status: 500 }
        );
      }
    }

    const protocolResponse = await handleProtocolRequest(request, url);
    if (protocolResponse) return protocolResponse;

    return jsonResponse({ error: "Not found" }, { status: 404 });
  },
};
