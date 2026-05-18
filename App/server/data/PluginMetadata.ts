import { existsSync, readFile, readFileSync, writeFile, writeFileSync } from "node:fs";
import path from "node:path";
import type { PluginMetadata } from "../../model/PluginMetadata.ts";
import type { PluginInfo } from "../../model/Plugins.ts";
import { Logger } from "tslog";
import { findDevelompentPlugins } from "./Plugins.ts";

export function getPluginMetadata() {
    const metadataPath = path.join(import.meta.dirname, "PluginMetadata.json");
    if (!existsSync(metadataPath)) {
        throw new Error("PluginMetadata.json not found");
    }
    return JSON.parse(readFileSync(metadataPath, "utf-8")) as readonly PluginMetadata[];
}

export function savePluginMetadata(metadata: readonly PluginMetadata[]) {
    const metadataPath = path.join(import.meta.dirname, "PluginMetadata.json");
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
}

function findPluginMetadata(plugins: PluginInfo[]) {
    const logger = new Logger({ name: "findPluginMetadata" });
    const metadata = [...getPluginMetadata()];
    const pluginsWithoutMetadata = plugins.filter((plugin) => !metadata.some((m) => m.bp === plugin.uuid || m.rp === plugin.uuid));
    logger.debug(`Found ${pluginsWithoutMetadata.length} Plugins without metadata:`, pluginsWithoutMetadata.map((p) => formatName(p.name)));

    const groupedByName = Object.groupBy(pluginsWithoutMetadata, (p) => `${formatName(p.name)}@${p.versions[0].version.join(".")}`);
    for (const [name, group] of Object.entries(groupedByName)) {
        if (group.length !== 2) {
            continue;
        }
        const [pack1, pack2] = group;
        const p1Type = pack1.type === "behaviour" ? "bp" : "rp";
        const p2Type = pack2.type === "behaviour" ? "bp" : "rp";
        metadata.push({ name, [p1Type]: pack1.uuid, [p2Type]: pack2.uuid, order: 0 });

    }
    logger.debug(`After grouping by name, found ${metadata.length} metadata entries:`, metadata);
    // savePluginMetadata(metadata);
}

function formatName(name: string) {
    return name.replaceAll(/(?:§.|[\[\]])/g, "").replace(/(?:RP|BP)/, "").replace(/\+(?:.+)?$/, "").trim();//name.replace(/§.+$/, "")
}

if (import.meta.main) {
    findPluginMetadata(findDevelompentPlugins());
}
