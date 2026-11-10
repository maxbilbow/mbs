import { BlockTypes, BlockVolume, EquipmentSlot, world } from "@minecraft/server";
import { HISTORY_LIMIT, ID, LOCATION_LIMIT, portalGunDP, portalGuns, worldDP } from "../utils/ids&variables";

const ID_PATTERN = /^[A-Z]{1,2}-[1-9]\d{0,3}$/;
const LEGACY_ID_PATTERN = /^\d{1,4}$/;
const ID_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const ID_REGISTRY_LIMIT = 4000;
const MAX_PROPERTY_LENGTH = 32000;
const ENTITY_SCAN_RADIUS = 24;
const BLOCK_SCAN_HORIZONTAL = 16;
const BLOCK_SCAN_VERTICAL = 8;
const SHULKER_COLORS = [
  "white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray",
  "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black",
];
const CONTAINER_CANDIDATES = [
  "minecraft:chest",
  "minecraft:trapped_chest",
  "minecraft:barrel",
  "minecraft:hopper",
  "minecraft:dropper",
  "minecraft:dispenser",
  "minecraft:crafter",
  "minecraft:undyed_shulker_box",
  ...SHULKER_COLORS.map((color) => `minecraft:${color}_shulker_box`),
  ...["", "exposed_", "weathered_", "oxidized_", "waxed_", "waxed_exposed_", "waxed_weathered_", "waxed_oxidized_"].map(
    (prefix) => `minecraft:${prefix}copper_chest`,
  ),
];

let containerTypes;

function containerBlockTypes() {
  if (!containerTypes) {
    containerTypes = CONTAINER_CANDIDATES.filter((typeId) => {
      try {
        return BlockTypes.get(typeId) !== undefined;
      } catch {
        return false;
      }
    });
  }
  return containerTypes;
}

export function normalizeGunId(text) {
  return String(text ?? "").trim().toUpperCase();
}

export function isValidGunId(text) {
  const id = normalizeGunId(text);
  return ID_PATTERN.test(id) || LEGACY_ID_PATTERN.test(id);
}

export function sameGunId(a, b) {
  if (a === undefined || a === null || b === undefined || b === null) return false;
  return normalizeGunId(a) === normalizeGunId(b);
}

function readRegistry() {
  try {
    const list = JSON.parse(world.getDynamicProperty(worldDP.gunIds) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function randomGunId() {
  const letterCount = Math.random() < 0.75 ? 1 : 2;
  let letters = "";
  for (let i = 0; i < letterCount; i++) letters += ID_LETTERS[Math.floor(Math.random() * ID_LETTERS.length)];
  return `${letters}-${1 + Math.floor(Math.random() * 9999)}`;
}

export function generateGunId() {
  const registry = readRegistry();
  const taken = new Set(registry);
  let id = randomGunId();
  for (let attempt = 0; attempt < 64 && taken.has(id); attempt++) id = randomGunId();
  registry.push(id);
  try {
    world.setDynamicProperty(worldDP.gunIds, JSON.stringify(registry.slice(-ID_REGISTRY_LIMIT)));
  } catch {}
  return id;
}

export function isGunItem(item) {
  if (!item) return false;
  return (
    portalGuns.some((gun) => gun.typeId === item.typeId) ||
    ID.dischargedPortalGuns.includes(item.typeId) ||
    ID.components.portalGunBases.includes(item.typeId)
  );
}

function matchesId(item, id) {
  return isGunItem(item) && sameGunId(item.getDynamicProperty(portalGunDP.id), id);
}

function scanContainer(container, id, found, where) {
  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (matchesId(item, id)) found.push({ item, where, write: (next) => container.setItem(slot, next) });
  }
}

function scanPlayers(id, found) {
  for (const player of world.getAllPlayers()) {
    const where = { kind: "player", name: player.name };
    const container = player.getComponent("inventory")?.container;
    if (container) scanContainer(container, id, found, where);
    const equippable = player.getComponent("equippable");
    const offhand = equippable?.getEquipment(EquipmentSlot.Offhand);
    if (matchesId(offhand, id)) {
      found.push({ item: offhand, where, write: (next) => equippable.setEquipment(EquipmentSlot.Offhand, next) });
    }
  }
}

function scanEntities(id, found, dimension, center) {
  for (const entity of dimension.getEntities({ location: center, maxDistance: ENTITY_SCAN_RADIUS })) {
    if (entity.typeId === "minecraft:player") continue;
    if (entity.typeId === "minecraft:item") {
      const stack = entity.getComponent("item")?.itemStack;
      if (matchesId(stack, id)) {
        found.push({
          item: stack,
          where: { kind: "ground" },
          write: (next) => {
            const location = entity.location;
            entity.remove();
            dimension.spawnItem(next, location);
          },
        });
      }
      continue;
    }
    const container = entity.getComponent("inventory")?.container;
    if (container) scanContainer(container, id, found, { kind: "entity" });
  }
}

function scanBlocks(id, found, dimension, center) {
  const types = containerBlockTypes();
  if (!types.length) return;
  const { min, max } = dimension.heightRange;
  const x = Math.floor(center.x);
  const y = Math.floor(center.y);
  const z = Math.floor(center.z);
  const volume = new BlockVolume(
    { x: x - BLOCK_SCAN_HORIZONTAL, y: Math.max(min, y - BLOCK_SCAN_VERTICAL), z: z - BLOCK_SCAN_HORIZONTAL },
    { x: x + BLOCK_SCAN_HORIZONTAL, y: Math.min(max - 1, y + BLOCK_SCAN_VERTICAL), z: z + BLOCK_SCAN_HORIZONTAL },
  );
  const blocks = dimension.getBlocks(volume, { includeTypes: types }, true);
  for (const location of blocks.getBlockLocationIterator()) {
    const container = dimension.getBlock(location)?.getComponent("minecraft:inventory")?.container;
    if (container) scanContainer(container, id, found, { kind: "block", location });
  }
}

export function findGunsById(id, origin) {
  const found = [];
  scanPlayers(id, found);
  if (found.length || !origin) return found;
  try {
    scanEntities(id, found, origin.dimension, origin.location);
  } catch {}
  try {
    scanBlocks(id, found, origin.dimension, origin.location);
  } catch {}
  return found;
}

function readList(item, property) {
  const json = item.getDynamicProperty(property);
  if (json === undefined) return [];
  const list = JSON.parse(json);
  if (!Array.isArray(list)) throw new Error("not a list");
  return list;
}

function isValidLocation(entry) {
  return (
    entry !== null &&
    typeof entry === "object" &&
    typeof entry.dimensionId === "string" &&
    [entry.x, entry.y, entry.z].every((value) => Number.isFinite(value))
  );
}

function locationKey(entry) {
  return `${entry.dimensionId}|${entry.x}|${entry.y}|${entry.z}`;
}

function newEntryId(taken) {
  let id;
  do id = Math.floor(Math.random() * 1000000000);
  while (taken.has(id));
  return id;
}

export function mergeEntries(destination, incoming, limit, renewIds) {
  const merged = [...destination];
  const keys = new Set(destination.filter(isValidLocation).map(locationKey));
  const ids = new Set(destination.map((entry) => entry?.id));
  const stats = { added: 0, duplicates: 0, invalid: 0, overflow: 0 };
  for (const entry of incoming) {
    if (!isValidLocation(entry)) {
      stats.invalid++;
      continue;
    }
    const key = locationKey(entry);
    if (keys.has(key)) {
      stats.duplicates++;
      continue;
    }
    if (merged.length >= limit) {
      stats.overflow++;
      continue;
    }
    const copy = JSON.parse(JSON.stringify(entry));
    if (renewIds && (copy.id === undefined || ids.has(copy.id))) copy.id = newEntryId(ids);
    ids.add(copy.id);
    keys.add(key);
    merged.push(copy);
    stats.added++;
  }
  return { list: merged, stats };
}

const PARTS = {
  locations: { property: portalGunDP.savedLocations, limit: LOCATION_LIMIT, renewIds: true },
  history: { property: portalGunDP.historyLocations, limit: HISTORY_LIMIT, renewIds: false },
};

export function transferGunData(sourceItem, destinationItem, parts, limits = {}) {
  const updates = [];
  const results = {};
  for (const part of parts) {
    const { property, renewIds } = PARTS[part];
    const limit = limits[part] ?? PARTS[part].limit;
    let source;
    let destination;
    try {
      source = readList(sourceItem, property);
    } catch {
      return { error: "corrupt_source", part };
    }
    try {
      destination = readList(destinationItem, property);
    } catch {
      return { error: "corrupt_target", part };
    }
    const { list, stats } = mergeEntries(destination, source, limit, renewIds);
    const json = JSON.stringify(list);
    if (json.length > MAX_PROPERTY_LENGTH) return { error: "too_large", part };
    results[part] = { ...stats, total: source.length };
    if (stats.added) updates.push([property, json]);
  }
  for (const [property, json] of updates) destinationItem.setDynamicProperty(property, json);
  return { results, changed: updates.length > 0 };
}
