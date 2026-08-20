const path = require("path");
const express = require("express");
const { getRouter } = require("stremio-addon-sdk");
const addonInterface = require("./addon");

const app = express();
const port = Number.parseInt(process.env.PORT || "7000", 10);
const publicDir = path.join(__dirname, "public");

app.disable("x-powered-by");

// Serve the custom Peenoise landing page and static assets from /
app.use(
  express.static(publicDir, {
    index: "index.html",
    maxAge: "1h",
  })
);

// Keep all Stremio protocol endpoints intact:
// /manifest.json, /catalog/..., /meta/..., /stream/...
app.use(getRouter(addonInterface));

// Simple JSON 404 for anything that is neither a static asset nor addon route.
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Peenoise listening on port ${port}`);
  console.log(`Manifest: http://127.0.0.1:${port}/manifest.json`);
});

server.on("error", (error) => {
  console.error("Failed to start addon:", error);
  process.exit(1);
});
