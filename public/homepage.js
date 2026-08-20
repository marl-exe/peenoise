(() => {
  const MAX_MOVIES = 6;

  const addDynamicStyles = () => {
    if (document.getElementById("peenoise-homepage-movie-styles")) return;

    const style = document.createElement("style");
    style.id = "peenoise-homepage-movie-styles";
    style.textContent = `
      .poster.poster-live {
        background-size: cover !important;
        background-position: center !important;
        background-repeat: no-repeat !important;
        box-shadow: inset 0 -46px 45px rgba(0, 0, 0, .72);
        transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease;
      }

      .poster.poster-live:hover {
        transform: translateY(-3px) scale(1.015);
        border-color: rgba(239, 68, 68, .48);
        box-shadow: inset 0 -52px 48px rgba(0, 0, 0, .78), 0 10px 24px rgba(0, 0, 0, .28);
      }

      .poster.poster-live::after {
        display: none !important;
      }

      .poster-label {
        position: absolute;
        left: 8px;
        right: 8px;
        bottom: 8px;
        z-index: 2;
        color: #fff;
        text-shadow: 0 1px 5px rgba(0, 0, 0, .9);
      }

      .poster-title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: .68rem;
        line-height: 1.25;
        font-weight: 760;
      }

      .poster-year {
        margin-top: 2px;
        color: rgba(255, 255, 255, .72);
        font-size: .58rem;
        line-height: 1.2;
      }
    `;
    document.head.appendChild(style);
  };

  const setPreviewHeading = (hasPinnedMovies) => {
    const heading = document.getElementById("previewHeading");
    const subtitle = document.getElementById("previewSubtitle");

    if (heading) {
      heading.textContent = hasPinnedMovies
        ? "Featured Philippine R-18 Movies"
        : "Philippine R-18 Movies";
    }

    if (subtitle) {
      subtitle.textContent = hasPinnedMovies
        ? "Pinned R-18 picks + newest releases"
        : "Newest certified R-18 releases";
    }
  };

  const renderMovies = (movies) => {
    const posters = Array.from(document.querySelectorAll(".poster-grid .poster")).slice(0, MAX_MOVIES);

    movies.slice(0, MAX_MOVIES).forEach((movie, index) => {
      const poster = posters[index];
      if (!poster || !movie?.poster) return;

      const safePoster = String(movie.poster).replace(/"/g, "%22");
      poster.classList.add("poster-live");
      poster.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,.02) 45%, rgba(0,0,0,.72) 100%), url("${safePoster}")`;
      poster.setAttribute("role", "img");
      poster.setAttribute("aria-label", `${movie.name || "Movie"}${movie.releaseInfo ? ` (${movie.releaseInfo})` : ""}`);
      poster.title = `${movie.name || "Movie"}${movie.releaseInfo ? ` (${movie.releaseInfo})` : ""}`;

      const label = document.createElement("div");
      label.className = "poster-label";

      const title = document.createElement("div");
      title.className = "poster-title";
      title.textContent = movie.name || "Untitled";
      label.appendChild(title);

      if (movie.releaseInfo) {
        const year = document.createElement("div");
        year.className = "poster-year";
        year.textContent = movie.releaseInfo;
        label.appendChild(year);
      }

      poster.replaceChildren(label);
    });
  };

  const loadHomepageMovies = async () => {
    addDynamicStyles();

    try {
      const response = await fetch("/homepage-movies.json", {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Homepage movies request failed: ${response.status}`);
      }

      const data = await response.json();
      const movies = Array.isArray(data.movies) ? data.movies : [];

      setPreviewHeading((data.pinnedCount || 0) > 0);
      if (!movies.length) return;

      renderMovies(movies);
    } catch (error) {
      console.warn("Peenoise homepage posters could not be loaded:", error);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadHomepageMovies, { once: true });
  } else {
    loadHomepageMovies();
  }
})();
