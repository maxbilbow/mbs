import type { Express } from "express";
import { activatePlugin, deactivatePlugin, findDevelompentPlugins } from "../data/Plugins.ts";

export function setUpPluginsApi(app: Express) {

    app.get("/api/plugins", (req, res) => {
        const plugins = findDevelompentPlugins();
        res.json(plugins);
    });

    app.post("/api/plugins/activate/:type/:uuid/:version", (req, res) => {
        const { type, uuid, version } = req.params;
        activatePlugin(type as "behaviour" | "resource", uuid, version.split('.').map(Number) as unknown as readonly [number, number, number]);
        res.json({ success: true });
    });

    app.post("/api/plugins/deactivate/:type/:uuid/:version", (req, res) => {
        const { type, uuid, version } = req.params;
        deactivatePlugin(type as "behaviour" | "resource", uuid);
        res.json({ success: true });
    });

    app.post("/api/plugins/:uuid/:version/toggle", (req, res) => {
        const { uuid, version } = req.params;
        const versionTuple = version.split('.').map(Number) as unknown as readonly [number, number, number];
        const plugins = findDevelompentPlugins();
        const plugin = Object.values(plugins).find((plugin) => {
            return plugin.versions.some((v) => v.uuid === uuid && v.version.every((num, index) => num === versionTuple[index]));
        });
        if (!plugin) {
            res.status(404).json({ error: "Plugin not found" });
            return;
        }
        const isActive = plugin.versions.some((v) => v.uuid === uuid && v.version.every((num, index) => num === versionTuple[index]) && v.active)
            || plugin.versions.some((v) => v.uuid === uuid && v.version.every((num, index) => num === versionTuple[index]) && v.active);

        if (isActive) {
            deactivatePlugin(plugin.type, uuid);
        }
        else {
            activatePlugin(plugin.type, uuid, versionTuple);
        }
        console.log(`Plugin ${plugin.name} version ${version} is now ${isActive ? "deactivated" : "activated"}`);
        res.json({ success: true, active: !isActive });
    });

}