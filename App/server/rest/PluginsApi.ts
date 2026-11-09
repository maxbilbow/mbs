import type { Express } from "express";
import { createPluginStore } from "../data/Plugins.ts";
import { createMutationGate } from "./MutationGate.ts";

export function setUpPluginsApi(
  app: Express,
  store = createPluginStore(),
  mutate = createMutationGate(),
) {
  app.get("/plugins", (_req, res) => {
    res.json(store.findDevelompentPlugins());
  });

  for (const action of ["order", "favourite"] as const) {
    app.post(
      `/plugins/${action}`,
      mutate((req, res) => {
        const { uuids, favourite } = req.body ?? {};
        if (
          !Array.isArray(uuids) ||
          !uuids.every((uuid) => typeof uuid === "string" && uuid.length > 0) ||
          new Set(uuids).size !== uuids.length ||
          (action === "favourite" &&
            (!uuids.length || typeof favourite !== "boolean"))
        ) {
          res
            .status(400)
            .json({ error: "Invalid plugin UUIDs or favourite state" });
          return;
        }
        if (action === "order") store.reorderPlugins(uuids);
        else store.setFavourite(uuids, favourite);
        res.json({ success: true });
      }),
    );
  }

  function findVersion(uuid: string, version: string, type?: string) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) return;
    return store
      .findDevelompentPlugins()
      .filter((plugin) => !type || plugin.type === type)
      .flatMap((plugin) => plugin.versions)
      .find((pack) => pack.uuid === uuid && pack.version.join(".") === version);
  }

  for (const action of ["activate", "deactivate"] as const) {
    app.post(
      `/plugins/${action}/:type/:uuid/:version`,
      mutate((req, res) => {
        const { type, uuid, version } = req.params;
        if (
          (type !== "behaviour" && type !== "resource") ||
          typeof uuid !== "string" ||
          typeof version !== "string" ||
          !/^\d+\.\d+\.\d+$/.test(version)
        ) {
          res.status(400).json({ error: "Invalid pack type or version" });
          return;
        }
        const pack = findVersion(uuid, version, type);
        if (!pack) {
          res.status(404).json({ error: "Plugin version not found" });
          return;
        }
        if (action === "activate")
          store.activatePlugin(pack.type, uuid, pack.version);
        else store.deactivatePlugin(pack.type, uuid);
        res.json({ success: true });
      }),
    );
  }

  app.post(
    "/plugins/:uuid/:version/toggle",
    mutate((req, res) => {
      const { uuid, version } = req.params;
      if (
        typeof uuid !== "string" ||
        typeof version !== "string" ||
        !/^\d+\.\d+\.\d+$/.test(version)
      ) {
        res.status(400).json({ error: "Invalid pack version" });
        return;
      }
      const pack = findVersion(uuid, version);
      if (!pack) {
        res.status(404).json({ error: "Plugin version not found" });
        return;
      }
      if (pack.active) store.deactivatePlugin(pack.type, uuid);
      else store.activatePlugin(pack.type, uuid, pack.version);
      res.json({ success: true, active: !pack.active });
    }),
  );
}
