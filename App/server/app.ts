import express from "express";
import { join } from "node:path";
import { REPO_ROOT } from "../../scripts/paths.ts";
import * as MbsCtrl from "./mbs/MbsCtrl.ts";
import { createPluginStore } from "./data/Plugins.ts";
import { setUpMbsApi } from "./rest/MbsApi.ts";
import { setUpPluginsApi } from "./rest/PluginsApi.ts";
import { createWorldStore } from "./data/Worlds.ts";
import { setUpWorldsApi } from "./rest/WorldsApi.ts";
import { setUpUsersApi } from "./rest/UsersApi.ts";
import { createMutationGate } from "./rest/MutationGate.ts";
import { Logger } from "tslog";
import { createLogReader } from "./data/Logs.ts";

export function createApp(
  options: {
    plugins?: ReturnType<typeof createPluginStore>;
    control?: typeof MbsCtrl;
    worlds?: ReturnType<typeof createWorldStore>;
    logs?: ReturnType<typeof createLogReader>;
  } = {},
) {
  const app = express();
  const routes = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const allowedOrigins = [
      "http://192.168.0.18:8080",
      "https://mbs.maxbilbow.com",
    ];
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With",
    );
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    if (req.method === "OPTIONS") {
      res.header("Access-Control-Max-Age", "86400");
      res.sendStatus(204);
      return;
    }
    next();
  });
  const mutate = createMutationGate();
  setUpPluginsApi(routes, options.plugins, mutate);
  setUpMbsApi(routes, options.control, mutate, options.logs);
  const worlds = options.worlds ?? createWorldStore(undefined, options.control);
  setUpWorldsApi(routes, worlds, mutate);
  setUpUsersApi(routes, worlds.users, worlds, mutate);
  // Support both direct /api requests and proxies that strip /api.
  app.use("/api", routes);
  app.use(routes);
  app.use(express.static(join(REPO_ROOT, "App/www")));
  const logger = new Logger({ name: "ApiError" });
  app.use(
    (
      error: Error & { status?: number; expose?: boolean },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      logger.error(error);
      const status =
        error.status && error.status >= 400 && error.status < 500
          ? error.status
          : 500;
      res.status(status).json({
        error:
          status === 500 && !error.expose
            ? "Internal server error"
            : error.message,
      });
    },
  );
  return app;
}
