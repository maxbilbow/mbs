import { system, BlockVolume } from "@minecraft/server";

export const NEAR_RADIUS = 6;
export const FAR_RADIUS = 15;
export const FAR_STEP = 3;

const SCAN_LIMIT = 48;
const ACCEPT_DY = 16;
const SIDE_WEIGHT = 1.5;
const WATER_PENALTY = 8;
const SURFACE_WATER_PENALTY = 100;
const CANOPY_LIMIT = 12;
const ROOF_MARGIN = 8;

const STOP_RAY = { includeLiquidBlocks: true, includePassableBlocks: false };
const AIR = ["minecraft:air"];
const LAVA = ["minecraft:lava", "minecraft:flowing_lava"];
const HAZARDS = [
  "minecraft:fire",
  "minecraft:soul_fire",
  "minecraft:sweet_berry_bush",
  "minecraft:powder_snow",
  "minecraft:wither_rose",
  "minecraft:web",
  "minecraft:end_portal",
  "minecraft:portal",
];
const UNSAFE_FLOORS = new Set([
  ...LAVA,
  ...HAZARDS,
  "minecraft:magma",
  "minecraft:campfire",
  "minecraft:soul_campfire",
  "minecraft:cactus",
  "minecraft:pointed_dripstone",
]);
const CANOPY = /leaves|_log$|_wood$|_stem$|mangrove_roots|bamboo/;

export function clampToWorld(dimension, location, headroom) {
  const { min, max } = dimension.heightRange;
  return {
    x: location.x,
    y: Math.min(Math.max(Math.floor(location.y), min), max - headroom),
    z: location.z,
  };
}

export function searchBox(target, radius) {
  const x = Math.floor(target.x);
  const y = Math.floor(target.y);
  const z = Math.floor(target.z);
  return {
    from: { x: x - radius - 1, y, z: z - radius - 1 },
    to: { x: x + radius + 1, y, z: z + radius + 1 },
  };
}

export function findSafeSpot(dimension, target, options) {
  return new Promise((resolve) => {
    system.runJob(
      (function* () {
        let spot;
        try {
          spot = yield* searchColumns(dimension, target, options);
        } finally {
          resolve(spot);
        }
      })(),
    );
  });
}

export function isNearLava(dimension, spot) {
  const { min, max } = dimension.heightRange;
  const volume = new BlockVolume(
    { x: spot.x - 1, y: Math.max(spot.y - 1, min), z: spot.z - 1 },
    { x: spot.x + 1, y: Math.min(spot.y + 1, max - 1), z: spot.z + 1 },
  );
  try {
    return dimension.containsBlock(volume, { includeTypes: LAVA }, true);
  } catch {
    return false;
  }
}

function* searchColumns(
  dimension,
  target,
  { headroom, arrival, surface = false, radius = NEAR_RADIUS, step = 1 },
) {
  const bounds = {
    min: dimension.heightRange.min,
    max: dimension.heightRange.max - 1,
  };
  const origin = {
    x: Math.floor(target.x),
    y: Math.floor(target.y),
    z: Math.floor(target.z),
  };
  const need = { headroom, bounds, arrival, surface };
  let best;

  for (let ring = 0; ring * step <= radius; ring++) {
    if (best && best.score <= ring * step * SIDE_WEIGHT) break;

    for (const [dx, dz] of ringOffsets(ring)) {
      const x = origin.x + dx * step;
      const z = origin.z + dz * step;
      const spot = evaluateColumn(dimension, x, z, origin.y, need);

      if (spot) {
        const dy = spot.surface ? 0 : Math.abs(spot.y - origin.y);
        const wet = need.surface ? SURFACE_WATER_PENALTY : WATER_PENALTY;
        if (ring === 0 && !spot.water && (spot.landed || dy <= ACCEPT_DY)) {
          return spot;
        }
        const score =
          dy +
          Math.hypot(x - origin.x, z - origin.z) * SIDE_WEIGHT +
          (spot.water ? wet : 0);
        if (!best || score < best.score) best = { ...spot, score };
      }
      yield;
    }
  }
  return best;
}

function ringOffsets(ring) {
  if (ring === 0) return [[0, 0]];

  const cells = [];
  for (let i = -ring; i <= ring; i++) cells.push([i, -ring], [i, ring]);
  for (let i = 1 - ring; i < ring; i++) cells.push([-ring, i], [ring, i]);
  return cells;
}

function evaluateColumn(dimension, x, z, y, need) {
  const { bounds } = need;
  try {
    if (need.surface) {
      const spot = surfaceSpot(dimension, x, z, need);
      if (spot !== null) return spot;
    }

    const floor = stopAtOrBelow(dimension, x, y, z, y - bounds.min + 1);
    const targetFree = !floor || floor.y < y;
    let below;
    let above;

    if (targetFree) {
      if (floor) {
        below = spotOnFloor(dimension, floor, need);
        if (below && !below.water) return { ...below, landed: true };
      }
      const ceiling = stopAtOrAbove(dimension, x, y + 1, z, SCAN_LIMIT);
      if (ceiling) above = spotAbove(dimension, x, ceiling.y, z, y, need);
    } else {
      above = spotAbove(dimension, x, y, z, y, need);
      if (!floor.isLiquid) below = spotBelow(dimension, x, y, z, need);
    }

    if (!below || !above) return below ?? above;
    return above.y - y < y - below.y ? above : below;
  } catch {
    return undefined;
  }
}

function surfaceSpot(dimension, x, z, need) {
  const top = dimension.getTopmostBlock({ x, z });
  if (!top) return undefined;
  const roof = need.bounds.max - ROOF_MARGIN;
  if (top.typeId === "minecraft:bedrock" && top.y >= roof) return null;
  if (top.y + 1 > need.bounds.max) return undefined;

  const height = top.y - need.bounds.min + 1;
  let floor = stopAtOrBelow(dimension, x, top.y, z, height);
  if (!floor) return undefined;

  for (let i = 0; floor && CANOPY.test(floor.typeId) && i < CANOPY_LIMIT; i++) {
    const depth = floor.y - need.bounds.min;
    floor = stopAtOrBelow(dimension, x, floor.y - 1, z, depth);
  }
  if (!floor || CANOPY.test(floor.typeId)) return undefined;

  const spot = spotOnFloor(dimension, floor, need);
  return spot && { ...spot, landed: true, surface: true };
}

function spotAbove(dimension, x, startY, z, originY, need) {
  const topY = Math.min(originY + SCAN_LIMIT, need.bounds.max);
  if (startY > topY) return undefined;

  let airY;
  for (const location of airColumn(dimension, x, startY, topY, z)) {
    if (airY === undefined || location.y < airY) airY = location.y;
  }
  if (airY === undefined) return undefined;

  const base = stopAtOrBelow(dimension, x, airY - 1, z, airY - need.bounds.min);
  if (!base || base.y >= airY) return undefined;
  return spotOnFloor(dimension, base, need);
}

function spotBelow(dimension, x, originY, z, need) {
  const bottomY = Math.max(originY - SCAN_LIMIT, need.bounds.min + 1);
  if (bottomY > originY) return undefined;

  let airY;
  for (const location of airColumn(dimension, x, bottomY, originY, z)) {
    if (airY === undefined || location.y > airY) airY = location.y;
  }
  if (airY === undefined) return undefined;

  const depth = airY - need.bounds.min + 1;
  const floor = stopAtOrBelow(dimension, x, airY, z, depth);
  if (!floor) return undefined;
  return spotOnFloor(dimension, floor, need);
}

function spotOnFloor(dimension, floor, { headroom, bounds, arrival }) {
  if (UNSAFE_FLOORS.has(floor.typeId)) return undefined;

  const { x, z } = floor;
  const y = floor.y + 1;
  if (y + headroom - 1 > bounds.max) return undefined;
  if (!isClear(dimension, x, y, z, headroom)) return undefined;
  if (arrival && !isClear(dimension, x + arrival.x, y, z + arrival.z, 2)) {
    return undefined;
  }
  return { x, y, z, water: floor.isLiquid };
}

function isClear(dimension, x, y, z, height) {
  const blocker = stopAtOrAbove(dimension, x, y, z, height + 1);
  if (blocker && blocker.y < y + height) return false;

  const body = new BlockVolume({ x, y, z }, { x, y: y + 1, z });
  return !dimension.containsBlock(body, { includeTypes: HAZARDS }, true);
}

function airColumn(dimension, x, fromY, toY, z) {
  const volume = new BlockVolume({ x, y: fromY, z }, { x, y: toY, z });
  return dimension
    .getBlocks(volume, { includeTypes: AIR }, true)
    .getBlockLocationIterator();
}

function stopAtOrBelow(dimension, x, y, z, maxDistance) {
  const options = { ...STOP_RAY, maxDistance };
  const hit = dimension.getBlockBelow({ x, y: y + 1, z }, options);
  if (!hit || hit.y <= y) return hit;
  return dimension.getBlockBelow({ x, y, z }, options);
}

function stopAtOrAbove(dimension, x, y, z, maxDistance) {
  const options = { ...STOP_RAY, maxDistance };
  const hit = dimension.getBlockAbove({ x, y: y - 1, z }, options);
  if (!hit || hit.y >= y) return hit;
  return dimension.getBlockAbove({ x, y, z }, options);
}
