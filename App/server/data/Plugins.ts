import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { PackVersionInfo, PluginInfo } from "../../model/Plugins.ts";
import { BEDROCK_ROOT } from "../../../scripts/paths.ts";
import { Logger } from "tslog";
import { getWorldName } from "./WorldProperties.ts";
import { getPluginMetadata, savePluginMetadata } from "./PluginMetadata.ts";
export { getWorldName } from "./WorldProperties.ts";

export function createPluginStore(
  runtimeRoot = BEDROCK_ROOT,
  worldName?: string,
  metadataPath = resolve(
    runtimeRoot === BEDROCK_ROOT ? import.meta.dirname : runtimeRoot,
    "PluginMetadata.json",
  ),
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
    const worldData = getWorldData(type);
    const index = worldData.findIndex(
      (pack) => pack.pack_id.toLowerCase() === uuid.toLowerCase(),
    );
    if (index < 0) worldData.push({ pack_id: uuid, version });
    else worldData[index] = { ...worldData[index], pack_id: uuid, version };
    saveWorldData(type, worldData);
  }

  function deactivatePlugin(type: "behaviour" | "resource", uuid: string) {
    const worldData = getWorldData(type);
    const newWorldData = worldData.filter(
      (pack) => pack.pack_id.toLowerCase() !== uuid.toLowerCase(),
    );
    saveWorldData(type, newWorldData);
  }

  function findDevelompentPlugins() {
    const metadata = existsSync(metadataPath)
      ? getPluginMetadata(metadataPath)
      : [];
    const activeOrder = getActiveOrder();
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
          authors: [...new Set(versions.flatMap((pack) => pack.authors))],
          type,
          versions,
          favourite: metadata.some(
            (entry) =>
              entry.favourite && (entry.bp === uuid || entry.rp === uuid),
          ),
          activeOrder: versions.some((pack) => pack.active)
            ? activeOrder.indexOf(uuid)
            : undefined,
        };
      }
    }
    return Object.values(groupedPlugins).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  function getActiveOrder(): string[] {
    const active = (["behaviour", "resource"] as const).flatMap((type) =>
      getWorldData(type).map((pack) => pack.pack_id.toLowerCase()),
    );
    const orderPath = join(worldDataDirectory(), "world_plugin_order.json");
    const saved: unknown = existsSync(orderPath)
      ? JSON.parse(readFileSync(orderPath, "utf8"))
      : [];
    if (!Array.isArray(saved) || !saved.every((id) => typeof id === "string")) {
      throw new Error(`Invalid plugin order in ${orderPath}`);
    }
    return [
      ...new Set([...saved.filter((id) => active.includes(id)), ...active]),
    ];
  }

  function reorderPlugins(uuids: readonly string[]) {
    const active = findDevelompentPlugins().filter((plugin) =>
      plugin.versions.some((pack) => pack.active),
    );
    if (
      uuids.length !== active.length ||
      new Set(uuids).size !== uuids.length ||
      uuids.some((uuid) => !active.some((plugin) => plugin.uuid === uuid))
    ) {
      throw Object.assign(
        new Error(
          "Order must contain every installed active pack exactly once. Refresh and try again.",
        ),
        { status: 409 },
      );
    }
    const lists = (["behaviour", "resource"] as const).map((type) => {
      const current = getWorldData(type);
      const ordered = uuids.flatMap((uuid) =>
        current.filter((pack) => pack.pack_id.toLowerCase() === uuid),
      );
      let index = 0;
      return {
        type,
        data: current.map((pack) =>
          uuids.includes(pack.pack_id.toLowerCase()) ? ordered[index++] : pack,
        ),
      };
    });
    for (const { type, data } of lists) saveWorldData(type, data);
    writeFileSync(
      join(worldDataDirectory(), "world_plugin_order.json"),
      JSON.stringify(uuids, null, 2),
    );
  }

  function setFavourite(uuids: readonly string[], favourite: boolean) {
    const plugins = findDevelompentPlugins();
    if (uuids.some((uuid) => !plugins.some((plugin) => plugin.uuid === uuid))) {
      throw Object.assign(new Error("Plugin not found"), { status: 404 });
    }
    const metadata = existsSync(metadataPath)
      ? [...getPluginMetadata(metadataPath)]
      : [];
    for (const uuid of uuids) {
      const entries = metadata.filter(
        (entry) => entry.bp === uuid || entry.rp === uuid,
      );
      if (entries.length) {
        for (const entry of entries) entry.favourite = favourite;
      } else {
        const plugin = plugins.find((plugin) => plugin.uuid === uuid)!;
        metadata.push({
          name: plugin.name,
          order: 0,
          [plugin.type === "behaviour" ? "bp" : "rp"]: uuid,
          favourite,
        });
      }
    }
    savePluginMetadata(metadata, metadataPath);
  }

  function findPluginInfo(
    name: string,
    type: "behaviour" | "resource",
  ): PackVersionInfo {
    const dir = type === "behaviour" ? BEHAVIOUR_PACKS_DIR : RESOURCE_PACKS_DIR;
    const jsonContent = readFileSync(join(dir, name, "manifest.json"), "utf-8");
    let pack: Omit<PackVersionInfo, "active">;
    try {
      const { header, metadata } = JSON.parse(jsonContent.trim());
      pack = {
        uuid: header.uuid.toLowerCase(),
        name: header.name === "pack.name" ? name : header.name,
        folder: name,
        version: header.version,
        description: header.description,
        authors: readAuthors(metadata, name),
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
        authors: [],
        active: false,
        type,
      } as const;
    }
    return { ...pack, active: isActive(pack, type) };
  }

  function readAuthors(metadata: unknown, name: string): string[] {
    if (metadata === undefined) return [];
    if (
      typeof metadata !== "object" ||
      metadata === null ||
      Array.isArray(metadata)
    ) {
      logger.warn(`Invalid metadata for pack "${name}"; authors unavailable.`);
      return [];
    }
    if (!("authors" in metadata)) return [];
    if (!Array.isArray(metadata.authors)) {
      logger.warn(`Invalid authors for pack "${name}"; expected an array.`);
      return [];
    }
    const authors: string[] = [];
    for (const author of metadata.authors) {
      if (typeof author !== "string" || !author.trim()) {
        logger.warn(
          `Invalid author entry for pack "${name}"; expected a name.`,
        );
        continue;
      }
      authors.push(author.trim());
    }
    return [...new Set(authors)];
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
        pack.pack_id.toLowerCase() === uuid.toLowerCase() &&
        pack.version.join(".") === version.join("."),
    );
  }

  function getWorldData(type: "behaviour" | "resource") {
    const WORLD_DATA_DIR = worldDataDirectory();
    const filename =
      type === "behaviour"
        ? "world_behavior_packs.json"
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
        ? "world_behavior_packs.json"
        : "world_resource_packs.json";
    const worldFile = join(WORLD_DATA_DIR, filename);
    writeFileSync(worldFile, JSON.stringify(data, null, 2));
  }
  return {
    activatePlugin,
    deactivatePlugin,
    findDevelompentPlugins,
    reorderPlugins,
    setFavourite,
  };
}

export function findDevelompentPlugins() {
  return createPluginStore().findDevelompentPlugins();
}
