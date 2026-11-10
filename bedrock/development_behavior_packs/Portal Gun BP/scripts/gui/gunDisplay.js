import { world, system } from "@minecraft/server";

const DISPLAY_TYPE = "ram_pg:gun_display";
const DISPLAY_TAG = "ram_pg:gun_display";
const GUN_PROPERTY = "ram_pg:gun";
const DEBUG_PROPERTY = "ram_pg:debug";
const HIDE_DELAY_TICKS = 20;
const GUN_INDEX = {
  "ram_pg:standard_portal_gun": 0,
  "ram_pg:blue_standard_portal_gun": 1,
  "ram_pg:prototype_portal_gun": 2,
  "ram_pg:blue_prototype_portal_gun": 3,
  "ram_pg:evil_morty_portal_gun": 4,
  "ram_pg:blue_evil_morty_portal_gun": 5,
  "ram_pg:prime.portal_gun": 6,
  "ram_pg:standard_portal_gun_discharged": 7,
  "ram_pg:prototype_portal_gun_discharged": 8,
  "ram_pg:evil_morty_portal_gun_discharged": 9,
  "ram_pg:prime.portal_gun_discharged": 10,
  "ram_pg:yellow_standard_portal_gun": 11,
  "ram_pg:yellow_prototype_portal_gun": 12,
  "ram_pg:green_evil_morty_portal_gun": 13,
  "ram_pg:blue_prime.portal_gun": 14,
  "ram_pg:yellow_prime.portal_gun": 15,
};

const displays = new Map();
const pendingHides = new Map();
let debugVisible = false;

function entityId(entity) {
  const raw = entity.id ?? "0";
  return BigInt(raw).toString();
}

function cancelHide(playerId) {
  const runId = pendingHides.get(playerId);
  if (runId === undefined) return;
  system.clearRun(runId);
  pendingHides.delete(playerId);
}

function removeDisplay(playerId) {
  const display = displays.get(playerId);
  displays.delete(playerId);
  try {
    if (display?.isValid) display.remove();
  } catch {}
}

export function showGunDisplay(player, portalGunItem) {
  cancelHide(player.id);
  try {
    const spot = player.location;
    let display = displays.get(player.id);
    if (!display?.isValid) {
      display = player.dimension.spawnEntity(DISPLAY_TYPE, spot);
      display.addTag(DISPLAY_TAG);
      displays.set(player.id, display);
    } else {
      display.teleport(spot, { dimension: player.dimension });
    }
    display.setProperty(GUN_PROPERTY, GUN_INDEX[portalGunItem?.typeId] ?? 0);
    display.setProperty(DEBUG_PROPERTY, debugVisible);
    return entityId(display);
  } catch (error) {
    console.warn(`[ram_pg] gun display unavailable: ${error}`);
    return "";
  }
}

export function hideGunDisplay(player) {
  const playerId = player.id;
  cancelHide(playerId);
  const runId = system.runTimeout(() => {
    pendingHides.delete(playerId);
    removeDisplay(playerId);
  }, HIDE_DELAY_TICKS);
  pendingHides.set(playerId, runId);
}

export function toggleGunDisplayDebug() {
  debugVisible = !debugVisible;
  for (const display of displays.values()) {
    if (display.isValid) display.setProperty(DEBUG_PROPERTY, debugVisible);
  }
  return debugVisible;
}

export function sweepGunDisplays() {
  const players = world.getAllPlayers();
  const online = new Set(players.map((player) => player.id));
  const tracked = new Set();

  for (const [playerId, display] of displays) {
    if (online.has(playerId) && display.isValid) {
      tracked.add(display.id);
      continue;
    }
    cancelHide(playerId);
    displays.delete(playerId);
  }

  for (const dimensionId of new Set(players.map((player) => player.dimension.id))) {
    let dimension;
    try {
      dimension = world.getDimension(dimensionId);
    } catch {
      continue;
    }
    const strays = [
      ...dimension.getEntities({ type: DISPLAY_TYPE }),
      ...dimension.getEntities({ tags: [DISPLAY_TAG] }),
    ];
    for (const entity of strays) {
      if (!tracked.has(entity.id) && entity.isValid) entity.remove();
    }
  }
}
