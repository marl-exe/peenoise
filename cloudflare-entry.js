let workerModulePromise;

export default {
  async fetch(request, env, ctx) {
    // Cloudflare validates a new Worker version before runtime bindings such as
    // secrets are attached. Delay loading the application until the first real
    // request, when TMDB_API_KEY is available in the Worker environment.
    if (!process.env.TMDB_API_KEY && typeof env.TMDB_API_KEY === "string") {
      process.env.TMDB_API_KEY = env.TMDB_API_KEY;
    }

    workerModulePromise ??= import("./worker.js");
    const { default: worker } = await workerModulePromise;
    return worker.fetch(request, env, ctx);
  },
};
