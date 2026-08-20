const fs = require("fs");
const path = require("path");
const express = require("express");
const { getRouter } = require("stremio-addon-sdk");
const addonInterface = require("./addon");

const app = express();
const port = Number.parseInt(process.env.PORT || "7000", 10);
const publicDir = path.join(__dirname, "public");
const indexFile = path.join(publicDir, "index.html");

const adsenseScript = `
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6812141646808986"
       crossorigin="anonymous"></script>`;

app.disable("x-powered-by");

// Serve the homepage with the Google AdSense loader inserted into <head>.
app.get("/", (req, res, next) => {
  fs.readFile(indexFile, "utf8", (error, html) => {
    if (error) return next(error);

    const page = html.includes("ca-pub-6812141646808986")
      ? html
      : html.replace("</head>", `${adsenseScript}\n</head>`);

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
