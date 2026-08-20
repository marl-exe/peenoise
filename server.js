const { serveHTTP } = require("stremio-addon-sdk");
const addonInterface = require("./addon");

const port = Number.parseInt(process.env.PORT || "7000", 10);

serveHTTP(addonInterface, { port })
  .then(({ url }) => {
    console.log("Addon active on:", url);
    console.log("Manifest:", `${url}/manifest.json`);
  })
  .catch((error) => {
    console.error("Failed to start addon:", error);
    process.exit(1);
  });
