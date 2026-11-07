import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { PackVersionInfo, PluginInfo } from "../../model/Plugins.ts";
import { BEDROCK_ROOT } from "../../../scripts/paths.ts";
import { Logger } from "tslog";
import { getWorldName } from "./WorldProperties.ts";
export { getWorldName } from "./WorldProperties.ts";

export function createPluginStore(
  runtimeRoot = BEDROCK_ROOT,
  worldName?: string,
) {
  const BEHAVIOUR_PACKS_DIR = resolve(
    runtimeRoot,
    "development_behavior_packs",
  );
  const RESOURCE_PACKS_DIR = resolve(runtimeRoot, "development_resource_packs");
  const logger = new Logger({ name: "Plugins" });

  function worldDataDirectory() {
    return resolve(
      runtimeRoot,
      "worlds",
      worldName ?? getWorldName(runtimeRoot),
    );
  }

  function activatePlugin(
    type: "behaviour" | "resource",
    uuid: string,
    version: readonly [number, number, number],
  ) {
    if (isActive({ uuid, version }, type)) {
      return;
    }
    const worldData = getWorldData(type).filter(
      (pack) => pack.pack_id !== uuid,
    );
    worldData.push({ pack_id: uuid, version });
    saveWorldData(type, worldData);
  }

  function deactivatePlugin(type: "behaviour" | "resource", uuid: string) {
    const worldData = getWorldData(type);
    const newWorldData = worldData.filter((pack) => pack.pack_id !== uuid);
    saveWorldData(type, newWorldData);
  }

  function findDevelompentPlugins() {
    const behaviourPacks = readdirSync(BEHAVIOUR_PACKS_DIR, {
      withFileTypes: true,
    })
      .filter((dirent) => dirent.isDirectory())
      .map(({ name }) => findPluginInfo(name, "behaviour"));

    const resourcePacks = readdirSync(RESOURCE_PACKS_DIR, {
      withFileTypes: true,
    })
      .filter((dirent) => dirent.isDirectory())
      .map(({ name }) => findPluginInfo(name, "resource"));

    const groupedPluginVersions = Object.groupBy(
      [...behaviourPacks, ...resourcePacks],
      (pack) => pack.uuid,
    );
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
        };
      }
    }
    return Object.values(groupedPlugins).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  function findPluginInfo(
    name: string,
    type: "behaviour" | "resource",
  ): PackVersionInfo {
    const dir = type === "behaviour" ? BEHAVIOUR_PACKS_DIR : RESOURCE_PACKS_DIR;
    const jsonContent = readFileSync(join(dir, name, "manifest.json"), "utf-8");
    let pack: Omit<PackVersionInfo, "active">;
    try {
      const { header } = JSON.parse(jsonContent.trim());
      pack = {
        uuid: header.uuid,
        name: header.name === "pack.name" ? name : header.name,
        folder: name,
        version: header.version,
        description: header.description,
        type,
      } as const;
    } catch (e) {
      console.error(
        `Failed to read manifest for ${type} pack "${name}":`,
        e,
        jsonContent,
      );
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
    return { ...pack, active: isActive(pack, type) };
  }

  function isActive(
    {
      uuid,
      version,
    }: { uuid: string; version: readonly [number, number, number] },
    type: "behaviour" | "resource",
  ) {
    const worldData = getWorldData(type);
    return worldData.some(
      (pack) =>
        pack.pack_id === uuid && pack.version.join(".") === version.join("."),
    );
  }

  function getWorldData(type: "behaviour" | "resource") {
    const WORLD_DATA_DIR = worldDataDirectory();
    const filename =
      type === "behaviour"
        ? "world_behaviour_packs.json"
        : "world_resource_packs.json";
    const worldFile = join(WORLD_DATA_DIR, filename);
    if (!existsSync(WORLD_DATA_DIR))
      throw new Error(`World directory not found: ${WORLD_DATA_DIR}`);
    // Bedrock does not create pack-list files until packs have been assigned.
    if (!existsSync(worldFile)) {
      logger.debug(
        `No ${type} pack list for ${WORLD_DATA_DIR}; no packs assigned.`,
      );
      return [];
    }
    return JSON.parse(readFileSync(worldFile, "utf-8")) as {
      pack_id: string;
      version: readonly [number, number, number];
    }[];
  }

  function saveWorldData(
    type: "behaviour" | "resource",
    data: { pack_id: string; version: readonly [number, number, number] }[],
  ) {
    const WORLD_DATA_DIR = worldDataDirectory();
    const filename =
      type === "behaviour"
        ? "world_behaviour_packs.json"
        : "world_resource_packs.json";
    const worldFile = join(WORLD_DATA_DIR, filename);
    writeFileSync(worldFile, JSON.stringify(data, null, 2));
  }
  return { activatePlugin, deactivatePlugin, findDevelompentPlugins };
}

export function findDevelompentPlugins() {
  return createPluginStore().findDevelompentPlugins();
}
