import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { PackVersionInfo, PluginInfo } from "../../model/Plugins.ts";

const BEHAVIOUR_PACKS_DIR = resolve(import.meta.dirname, "../../../development_behavior_packs");
const RESOURCE_PACKS_DIR = resolve(import.meta.dirname, "../../../development_resource_packs");
const WORLD_DATA_DIR = resolve(import.meta.dirname, "../../../worlds/Bedrock level");


export function activatePlugin(type: "behaviour" | "resource", uuid: string, version: readonly [number, number, number]) {
    if (isActive({ uuid, version }, type)) {
        return;
    }
    const worldData = getWorldData(type);
    worldData.push({ pack_id: uuid, version });
    saveWorldData(type, worldData);
}

export function deactivatePlugin(type: "behaviour" | "resource", uuid: string) {
    const worldData = getWorldData(type);
    const newWorldData = worldData.filter((pack) => pack.pack_id !== uuid);
    saveWorldData(type, newWorldData);
}

export function findDevelompentPlugins() {
    const behaviourPacks = readdirSync(BEHAVIOUR_PACKS_DIR, { withFileTypes: true }).filter((dirent) => dirent.isDirectory()).map(({ name }) => findPluginInfo(name, "behaviour"));

    const resourcePacks = readdirSync(RESOURCE_PACKS_DIR, { withFileTypes: true }).filter((dirent) => dirent.isDirectory()).map(({ name }) => findPluginInfo(name, "resource"));

    const groupedPluginVersions = Object.groupBy([...behaviourPacks, ...resourcePacks], (pack) => pack.uuid);
    // Group by uuid
    const groupedPlugins: { [uuid: string]: PluginInfo } = {};

    for (const [uuid, versions] of Object.entries(groupedPluginVersions)) {
        if (!versions) continue;
        if (!groupedPlugins[uuid]) {
            const [{ name, description, type }] = versions;
            groupedPlugins[uuid] = {
                uuid,
                name,
                description,
                type,
                versions,
            }
        }

    }
    return Object.values(groupedPlugins).sort((a, b) => a.name.localeCompare(b.name));
}

function findPluginInfo(name: string, type: "behaviour" | "resource"): PackVersionInfo {
    const dir = type === "behaviour" ? BEHAVIOUR_PACKS_DIR : RESOURCE_PACKS_DIR;
    const jsonContent = readFileSync(join(dir, name, "manifest.json"), "utf-8");
    try {
        const { header } = JSON.parse(jsonContent.trim());
        return {
            uuid: header.uuid,
            name: header.name === "pack.name" ? name : header.name,
            folder: name,
            version: header.version,
            description: header.description,
            active: isActive(header, type),
            type,
        } as const;
    } catch (e) {
        console.error(`Failed to read manifest for ${type} pack "${name}":`, e, jsonContent);
        return {
            uuid: `invalid-${type}-${name}-${Date.now()}`,
            name: `${name} (Invalid Manifest)`,
            folder: name,
            version: [0, 0, 0] as const,
            description: "Failed to read manifest",
            active: false,
            type,
        } as const;
    }
}

function isActive({ uuid, version }: { uuid: string, version: readonly [number, number, number] }, type: "behaviour" | "resource") {
    const worldData = getWorldData(type);
    return worldData.some((pack) => pack.pack_id === uuid && pack.version.join('.') === version.join('.'));
}

function getWorldData(type: "behaviour" | "resource") {
    const filename = type === "behaviour" ? "world_behaviour_packs.json" : "world_resource_packs.json";
    const worldFile = join(WORLD_DATA_DIR, filename);
    return JSON.parse(readFileSync(worldFile, "utf-8")) as { pack_id: string, version: readonly [number, number, number] }[];
}

function saveWorldData(type: "behaviour" | "resource", data: { pack_id: string, version: readonly [number, number, number] }[]) {
    const filename = type === "behaviour" ? "world_behaviour_packs.json" : "world_resource_packs.json";
    const worldFile = join(WORLD_DATA_DIR, filename);
    writeFileSync(worldFile, JSON.stringify(data, null, 2));
}

if (import.meta.main) {
    const activePlugins = findDevelompentPlugins()
    // .flatMap((plugin) => [...plugin.behaviourPack?.versions.filter((v) => v.active) ?? [], ...plugin.resourcePack?.versions.filter((v) => v.active) ?? []]);

    const groupedPlugins = Object.groupBy(activePlugins, (plugin) => plugin.name);
    console.log("Active Behaviour Packs:");
    for (const [name, plugin] of Object.entries(groupedPlugins)) {
        console.log(`- ${name} (v${plugin?.map((p) => p.versions?.map((v) => v.version.join('.'))).join(', ')})`);
    }
}
