import express from "express";

const app = express();
const port = Number.parseInt(process.env.PORT || "7000", 10);
const CLOUDFLARE_ORIGIN = "https://peenoise.fkye.workers.dev";

app.disable("x-powered-by");

// Render is now only a migration forwarder. Preserve the full path and query
// string so every old Render URL lands on the equivalent Cloudflare endpoint.
app.use((req, res) => {
  const target = `${CLOUDFLARE_ORIGIN}${req.originalUrl}`;
  res.redirect(308, target);
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Peenoise Render forwarder listening on port ${port}`);
  console.log(`Forwarding all requests to ${CLOUDFLARE_ORIGIN}`);
});

server.on("error", (error) => {
  console.error("Failed to start Render forwarder:", error);
  process.exit(1);
});
