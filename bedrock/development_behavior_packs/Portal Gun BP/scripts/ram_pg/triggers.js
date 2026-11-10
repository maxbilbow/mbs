import * as mc from "@minecraft/server";
import * as fh from "./fluidHandle";
import * as pg from "./portalGun";
import { ID, portalGuns, portalGunDP, PORTAL_MODES } from "../utils/ids&variables";
import { switchHair } from "../utils/utils";

export function beforePlayerInteractWithBlock(event) {
  if (event.isFirstEvent !== true) return;
  const { block, itemStack, player } = event;

  mc.system.run(() => {
    if (ID.components.solutions.includes(block.typeId)) {
      fh.handleSolutionBlock(player, itemStack, block);
    }
  });
}

const INERT_TYPES = ["ram_pg:gun_display", "ram_pg:shock_body"];

export function beforeEffectAdd(event) {
  const { entity } = event;

  if (ID.portals.includes(entity.typeId) || INERT_TYPES.includes(entity.typeId)) {
    event.cancel = true;
  }
}

export function projectileHitEntity(data) {
  const entityHit = data.getEntityHit().entity;

  if (data.projectile.typeId === "minecraft:fishing_hook") {
    const typeFamily = entityHit.getComponent("minecraft:type_family");
    if (typeFamily?.hasTypeFamily("ram_pg:portal")) {
      data.projectile.remove();
    }
  }
}

export function entityItemDrop(event) {
  const player = event.entity;
  const items = event.items;

  if (player.typeId !== "minecraft:player") return;

  pg.waypointHandler(player, items);
}

 
function isAimingAtPortal(player, maxDistance = 6) {
  const hits = player.getEntitiesFromViewDirection({ maxDistance });
 
  return hits.some((hit) => {
    const typeFamily = hit.entity.getComponent("minecraft:type_family");
    return typeFamily?.hasTypeFamily("ram_pg:portal") ?? false;
  });
}
 
export function entityHitBlock(event) {
  const player = event.damagingEntity;
  if (player.typeId !== "minecraft:player") return;

  const inventoryComp = player.getComponent("inventory");
  const inventory = inventoryComp?.container;
  if (!inventory) return;

  const item = inventory.getItem(player.selectedSlotIndex);
  if (!item) return;

  if (ID.hair.includes(item.typeId)) {
    switchHair(player, item, inventory);
    return;
  }

  if (!ID.portalGunsIds.includes(item.typeId)) return;
  if (isAimingAtPortal(player)) return;
  trySwitchLocation(player, item, inventory);
}

export function playerJumpInput(event) {
  const { player } = event;
  if (!player.isSneaking) return;
  const inventory = player.getComponent("inventory")?.container;
  if (!inventory) return;

  const item = inventory.getItem(player.selectedSlotIndex);
  if (!item || !ID.portalGunsIds.includes(item.typeId)) return;
  if (item.getDynamicProperty(portalGunDP.mode) !== PORTAL_MODES.TARGET) return;
  trySwitchLocation(player, item, inventory, true);
}

export function playerSwingStart(event) {
  const { player } = event;
  const inventory = player.getComponent("inventory")?.container;
  if (!inventory) return;

  const item = inventory.getItem(player.selectedSlotIndex);
  if (!item || !ID.portalGunsIds.includes(item.typeId)) return;
  if (isAimingAtPortal(player)) return;
  trySwitchLocation(player, item, inventory);
}

const LOCATION_SWITCH_COOLDOWN = 4;
const lastLocationSwitch = new Map();

function trySwitchLocation(player, item, inventory, jump = false) {
  const tick = mc.system.currentTick;
  const last = lastLocationSwitch.get(player.id);
  if (last !== undefined && tick - last < LOCATION_SWITCH_COOLDOWN) return;
  lastLocationSwitch.set(player.id, tick);
  if (!jump && player.isSneaking && item.getDynamicProperty(portalGunDP.behavior.swingModeChange) !== false) {
    pg.cycleMode(player, item);
    return;
  }
  if (item.getDynamicProperty(portalGunDP.mode) === PORTAL_MODES.TARGET) {
    pg.markTarget(player, item, inventory);
    return;
  }
  pg.switchLocation(player, item, inventory);
}
