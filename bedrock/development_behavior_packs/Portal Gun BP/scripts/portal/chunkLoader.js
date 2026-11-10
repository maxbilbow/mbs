import { system, world } from "@minecraft/server";

const AREA_PREFIX = "ram_pg_area_";
const LEGACY_AREA_PREFIX = "portal_";
const LOAD_TIMEOUT_TICKS = 200;
const IDLE_TICKS = 200;
const EVICT_IDLE_TICKS = 40;
const PORTAL_MARGIN = 2;

const areas = new Map();
let areaCount = 0;

export function areChunksLoaded(dimension, from, to) {
  const y = clampY(dimension, from.y);
  for (let x = chunkOrigin(from.x); x <= to.x; x += 16) {
    for (let z = chunkOrigin(from.z); z <= to.z; z += 16) {
      if (!dimension.isChunkLoaded({ x, y, z })) return false;
    }
  }
  return true;
}

export function keepLoaded(
  key,
  dimension,
  from,
  to,
  { force = false, pinned = false } = {},
) {
  const box = normalizeBox(dimension, from, to);
  const entry = areas.get(key);

  if (entry) {
    if (entry.dimensionId === dimension.id && sameBox(entry.box, box)) {
      entry.lastUsed = system.currentTick;
      entry.pinned = entry.pinned || pinned;
      return entry.ready;
    }
    releaseArea(key);
  }

  if (!force && areChunksLoaded(dimension, box.from, box.to)) {
    return Promise.resolve(true);
  }
  return createArea(key, dimension, box, pinned);
}

export function keepPortalLoaded(portalId, dimension, location, force = false) {
  const from = {
    x: location.x - PORTAL_MARGIN,
    y: location.y,
    z: location.z - PORTAL_MARGIN,
  };
  const to = {
    x: location.x + PORTAL_MARGIN,
    y: location.y,
    z: location.z + PORTAL_MARGIN,
  };
  return keepLoaded(`portal:${portalId}`, dimension, from, to, { force });
}

export function releaseArea(key) {
  const entry = areas.get(key);
  if (!entry) return;

  areas.delete(key);
  try {
    world.tickingAreaManager.removeTickingArea(entry.id);
  } catch {}
}

export function sweepChunkAreas() {
  const now = system.currentTick;
  for (const [key, entry] of areas) {
    if (!entry.pinned && now - entry.lastUsed > IDLE_TICKS) releaseArea(key);
  }
}

export function clearStaleChunkAreas() {
  const manager = world.tickingAreaManager;
  for (const area of manager.getAllTickingAreas()) {
    const id = area.identifier;
    if (id.startsWith(AREA_PREFIX) || id.startsWith(LEGACY_AREA_PREFIX)) {
      manager.removeTickingArea(id);
    }
  }
}

function createArea(key, dimension, box, pinned) {
  const manager = world.tickingAreaManager;
  const options = { dimension, from: box.from, to: box.to };

  if (!hasCapacity(manager, options)) {
    evictIdleAreas();
    if (!hasCapacity(manager, options)) return Promise.resolve(false);
  }

  const entry = {
    id: `${AREA_PREFIX}${system.currentTick}_${areaCount++}`,
    dimensionId: dimension.id,
    box,
    lastUsed: system.currentTick,
    pinned,
    ready: undefined,
  };

  let creation;
  try {
    creation = manager.createTickingArea(entry.id, options);
  } catch {
    return Promise.resolve(false);
  }

  areas.set(key, entry);
  entry.ready = Promise.race([
    creation.then(
      () => true,
      () => false,
    ),
    system.waitTicks(LOAD_TIMEOUT_TICKS).then(() => false),
  ]).then((loaded) => {
    if (areas.get(key) !== entry) return loaded;
    if (loaded) entry.lastUsed = system.currentTick;
    else releaseArea(key);
    return loaded;
  });
  return entry.ready;
}

function evictIdleAreas() {
  const now = system.currentTick;
  for (const [key, entry] of areas) {
    if (!entry.pinned && now - entry.lastUsed > EVICT_IDLE_TICKS) {
      releaseArea(key);
    }
  }
}

function hasCapacity(manager, options) {
  try {
    return manager.hasCapacity(options);
  } catch {
    return false;
  }
}

function normalizeBox(dimension, from, to) {
  return {
    from: {
      x: Math.floor(Math.min(from.x, to.x)),
      y: clampY(dimension, Math.min(from.y, to.y)),
      z: Math.floor(Math.min(from.z, to.z)),
    },
    to: {
      x: Math.floor(Math.max(from.x, to.x)),
      y: clampY(dimension, Math.max(from.y, to.y)),
      z: Math.floor(Math.max(from.z, to.z)),
    },
  };
}

function sameBox(a, b) {
  return (
    a.from.x === b.from.x &&
    a.from.y === b.from.y &&
    a.from.z === b.from.z &&
    a.to.x === b.to.x &&
    a.to.y === b.to.y &&
    a.to.z === b.to.z
  );
}

function clampY(dimension, y) {
  const { min, max } = dimension.heightRange;
  return Math.min(Math.max(Math.floor(y), min), max - 1);
}

function chunkOrigin(value) {
  return Math.floor(value / 16) * 16;
}
