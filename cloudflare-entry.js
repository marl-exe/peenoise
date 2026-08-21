import * as process from "node:process";

let workerModulePromise;

export default {
  async fetch(request, env, ctx) {
    // Use the runtime binding directly. Importing node:process here ensures the
    // same Node compatibility process module is populated before addon.js is
    // dynamically evaluated.
    if (typeof env.TMDB_API_KEY !== "string" || !env.TMDB_API_KEY) {
      console.error("TMDB_API_KEY Worker secret binding is missing");
      return new Response(
        JSON.stringify({ error: "TMDB_API_KEY Worker secret binding is missing" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }
      );
    }

    process.env.TMDB_API_KEY = env.TMDB_API_KEY;

    workerModulePromise ??= import("./worker.js");
    const { default: worker } = await workerModulePromise;
    return worker.fetch(request, env, ctx);
  },
};
