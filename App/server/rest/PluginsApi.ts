import type { Express } from "express";
import { createPluginStore } from "../data/Plugins.ts";

export function setUpPluginsApi(app: Express, store = createPluginStore()) {
  app.get("/plugins", (_req, res) => {
    res.json(store.findDevelompentPlugins());
  });

  function findVersion(uuid: string, version: string, type?: string) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) return;
    return store
      .findDevelompentPlugins()
      .filter((plugin) => !type || plugin.type === type)
      .flatMap((plugin) => plugin.versions)
      .find((pack) => pack.uuid === uuid && pack.version.join(".") === version);
  }

  for (const action of ["activate", "deactivate"] as const) {
    app.post(`/plugins/${action}/:type/:uuid/:version`, (req, res) => {
      const { type, uuid, version } = req.params;
      if (
        (type !== "behaviour" && type !== "resource") ||
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
    });
  }

  app.post("/plugins/:uuid/:version/toggle", (req, res) => {
    const { uuid, version } = req.params;
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
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
  });
}
