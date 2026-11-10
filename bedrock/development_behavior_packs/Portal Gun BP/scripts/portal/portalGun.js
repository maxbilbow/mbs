import {
  Direction,
  GameMode,
  system,
  ItemStack,
  world,
} from "@minecraft/server";
import { openPortalGunMenu, openPasswordPrompt } from "../gui/pg_menu";
import { guardGunAccess } from "./security";
import { generateGunId } from "./gunData";
import {
  findPortalGunInInventory,
  linkPortals,
  removePortal,
  removeAllPortals,
  savePortalList,
  spawnPortal,
  getGunInstance,
  changePortalGunMode,
  isBasicItem,
} from "../utils/utils";

import {
  ID,
  portalGuns,
  playerDP,
  portalGunDP,
  portalDP,
  PORTAL_MODES,
  BLENDER_DIMENSION_ID,
  HIGH_PRESSURE_SPEED,
  HIGH_PRESSURE_RANGE,
  HISTORY_LIMIT,
  AUTO_CLOSE_DELAY_DEFAULT,
} from "../utils/ids&variables";
import { keepLoaded, keepPortalLoaded, releaseArea } from "./chunkLoader";
import {
  clampToWorld,
  findSafeSpot,
  isNearLava,
  searchBox,
  NEAR_RADIUS,
  FAR_RADIUS,
  FAR_STEP,
} from "./safePlacement";

const MAX_PORTALS = 10;

const EXIT_OFFSETS = [
  { x: 0, z: -1 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
];

/**
 * Initializes a portal gun item with default dynamic properties.
 *
 * @param {ItemStack} portalGunItem - The portal gun item to initialize.
 * @returns {string} - The unique ID assigned to the portal gun.
 */
function initializePortalGun(portalGunItem) {
  //Verify if the portal gun is a charged one.
  if (ID.portalGunsIds.includes(portalGunItem.typeId)) {
    const charge = portalGunItem.getDynamicProperty(portalGunDP.charge);
    if (charge === undefined) {
      portalGunItem.setDynamicProperty(portalGunDP.charge, 100);
    } else {
      portalGunItem.setDynamicProperty(portalGunDP.charge, charge);
    }
  } else {
    portalGunItem.setDynamicProperty(portalGunDP.charge, 0);
  }
  const portalGunId = generateGunId();
  portalGunItem.setDynamicProperty(portalGunDP.mode, PORTAL_MODES.FIFO);
  portalGunItem.setDynamicProperty(portalGunDP.id, portalGunId);
  portalGunItem.setDynamicProperty(portalGunDP.behavior.highPressure, false);
  portalGunItem.setDynamicProperty(portalGunDP.behavior.autoClose, true);
  portalGunItem.setDynamicProperty(portalGunDP.behavior.autoCloseDelay, AUTO_CLOSE_DELAY_DEFAULT);
  portalGunItem.setDynamicProperty(portalGunDP.behavior.swingModeChange, true);
  portalGunItem.setDynamicProperty(portalGunDP.behavior.safePlacement, true);
  portalGunItem.setDynamicProperty(portalGunDP.behavior.scale, 1);
  portalGunItem.setDynamicProperty(
    portalGunDP.behavior.fastLocationChange,
    true,
  );
  portalGunItem.setDynamicProperty(portalGunDP.behavior.tracker, true);
  portalGunItem.setDynamicProperty(portalGunDP.behavior.chargeBar, true);
  portalGunItem.setDynamicProperty(portalGunDP.behavior.floatingPortals, false);
  portalGunItem.setDynamicProperty(
    portalGunDP.behavior.floatingPortalsDistance,
    5,
  );
  portalGunItem.setDynamicProperty(portalGunDP.portalList, JSON.stringify([]));
  return portalGunId;
}

/**
 * Handles the use of a portal gun by a player.
 * Either opens the menu or fires a projectile depending on whether the player is sneaking.
 *
 * @param {Player} player - The player using the portal gun.
 * @param {ItemStack} portalGunItem - The portal gun item being used by the player.
 */
export function usePortalGun(player, portalGunItem) {
  const inventory = player.getComponent("inventory");
  if (!inventory || !inventory.container) {
    return;
  }
  const gunInstance = getGunInstance(portalGunItem);
  if (gunInstance === undefined) return;

  let portalGunId = portalGunItem.getDynamicProperty(portalGunDP.id);

  // Initialize the portal gun if it has no ID yet
  if (portalGunId === undefined) {
    portalGunId = initializePortalGun(portalGunItem);
    inventory.container.setItem(player.selectedSlotIndex, portalGunItem);
  }

  if (!guardGunAccess(player, portalGunItem, player.selectedSlotIndex, openPasswordPrompt)) return;

  const mode = portalGunItem.getDynamicProperty(portalGunDP.mode);
  if (gunInstance.basic && (mode === PORTAL_MODES.MULTI_PAIR || mode === PORTAL_MODES.ROOT)) {
    changePortalGunMode(player, inventory, portalGunItem, PORTAL_MODES.FIFO);
  }

  if (player.isSneaking) {
    gunInstance.openInterface(player, portalGunItem);
  } else {
    const charge = portalGunItem.getDynamicProperty(portalGunDP.charge);
    const scale = portalGunItem.getDynamicProperty(portalGunDP.behavior.scale);
    const cost = scale * 2;

    player.playAnimation("animation.ram_pg.player.portal_gun_shoot", {
      stopExpression: "v.is_first_person",
    });

    if (charge > 0) {
      const isInterspatial = portalGunItem.typeId.includes("blue");
      if (isInterspatial) {
        const gunMode = portalGunItem.getDynamicProperty(portalGunDP.mode);
        if (gunMode == PORTAL_MODES.CUSTOM) {
          const selectedLocationJson = portalGunItem.getDynamicProperty(
            portalGunDP.customLocation,
          );
          let selectedLocation;
          try {
            selectedLocation = JSON.parse(selectedLocationJson);
          } catch (e) {
            console.error("[ram_pg] Corrupted customLocation data:", e);
            player.sendMessage({
              translate: "ram_pg.error.interspatial_dimension_mismatch",
            });
            player.dimension.playSound("ram_pg:error_sound", player.location);
            return;
          }
          const dimensionId = selectedLocation.dimensionId;

          if (player.dimension.id !== dimensionId) {
            player.sendMessage({
              translate: "ram_pg.error.interspatial_dimension_mismatch",
            });
            player.dimension.playSound("ram_pg:error_sound", player.location);
            return;
          }
        }
      }
      if (gunInstance.chargedTubeId === ID.components.chargedTubes[0] && player.dimension.id !== THE_END) {
        const shotMode = portalGunItem.getDynamicProperty(portalGunDP.mode);
        let destination;
        try {
          if (shotMode === PORTAL_MODES.CUSTOM) destination = JSON.parse(portalGunItem.getDynamicProperty(portalGunDP.customLocation) ?? "null");
        } catch {}
        if (shotMode === PORTAL_MODES.TARGET) destination = readTargetLocation(portalGunItem);
        if (destination?.dimensionId === THE_END) {
          player.onScreenDisplay.setActionBar({ translate: "ram_pg.error.green_no_end" });
          player.dimension.playSound("ram_pg:error_sound", player.location);
          return;
        }
      }
      if (portalGunItem.getDynamicProperty(portalGunDP.mode) === PORTAL_MODES.TARGET) {
        const target = readTargetLocation(portalGunItem);
        if (!target || (isInterspatial && target.dimensionId !== player.dimension.id)) {
          player.onScreenDisplay.setActionBar({
            translate: target ? "ram_pg.error.interspatial_dimension_mismatch" : "ram_pg.target.none",
          });
          player.dimension.playSound("ram_pg:error_sound", player.location);
          return;
        }
      }
      if (player.getGameMode() !== GameMode.Creative) {
        portalGunItem = gunInstance.decreaseCharge(
          player,
          portalGunItem,
          charge,
          cost,
        );
      }
      player.setDynamicProperty(playerDP.portalGunId, portalGunId);
      portalGunItem.setDynamicProperty(portalGunDP.lastUser, player.name);
      inventory.container.setItem(player.selectedSlotIndex, portalGunItem);

      const floatingPortals = portalGunItem.getDynamicProperty(
        portalGunDP.behavior.floatingPortals,
      );
      const distance = portalGunItem.getDynamicProperty(
        portalGunDP.behavior.floatingPortalsDistance,
      );
      if (floatingPortals) {
        // Aiming at a block below eye level needs a downward angle, which
        // makes the straight-line ray to it longer than the horizontal
        // distance the player thinks of as "N blocks away" - pad the check
        // so a block right at the configured distance still gets detected,
        // instead of being missed and falling through to the floating-portal
        // math (which would place the portal on top of it).
        const hasBlockInFront = player.getBlockFromViewDirection({
          includeLiquidBlocks: false,
          includePassableBlocks: false,
          maxDistance: distance + 2,
        });

        if (!hasBlockInFront) {
          const highPressure = portalGunItem.getDynamicProperty(
            portalGunDP.behavior.highPressure,
          );
          const speedFactor = highPressure ? HIGH_PRESSURE_SPEED : 0.8;
          const placement = getFloatingPortalPlacement(
            player,
            distance,
            highPressure,
            scale,
          );
          const projectile = gunInstance.fireProjectile(player, portalGunItem);
          floatingProjectiles.add(projectile.id);

          system.runTimeout(() => {
            if (!player.isValid) {
              floatingProjectiles.delete(projectile.id);
              return;
            }

            if (projectile && projectile.isValid) {
              if (!floatingProjectiles.has(projectile.id)) return;
              floatingProjectiles.delete(projectile.id);
              projectile.remove();
              summonFloatingPortal(player, placement, gunInstance.projectileId);
            } else {
              floatingProjectiles.delete(projectile.id);
            }
          }, distance / speedFactor);
          return;
        }
      }

      const projectile = gunInstance.fireProjectile(player, portalGunItem);
      if (projectile && portalGunItem.getDynamicProperty(portalGunDP.behavior.highPressure)) {
        trackHighPressureShot(player, projectile);
      }
    } else {
      player.dimension.playSound("ram_pg:empty_portal_gun", player.location);
    }
  }
}

const THE_END = "minecraft:the_end";

export function readTargetLocation(portalGunItem) {
  const json = portalGunItem.getDynamicProperty(portalGunDP.targetLocation);
  if (!json) return undefined;
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

export const floatingProjectiles = new Set();
export const highPressureShots = new Set();

function trackHighPressureShot(player, projectile) {
  const hit = player.getBlockFromViewDirection({
    includeLiquidBlocks: false,
    includePassableBlocks: false,
    maxDistance: HIGH_PRESSURE_RANGE,
  });
  if (!hit) return;

  const head = player.getHeadLocation();
  const target = hit.block.location;
  const distance = Math.hypot(target.x + 0.5 - head.x, target.y + 0.5 - head.y, target.z + 0.5 - head.z);
  const projectileId = projectile.id;
  const projectileTypeId = projectile.typeId;
  const dimension = player.dimension;
  highPressureShots.add(projectileId);

  system.runTimeout(() => {
    if (!highPressureShots.delete(projectileId)) return;
    if (projectile.isValid) projectile.remove();
    if (!player.isValid || player.dimension.id !== dimension.id) return;
    const block = dimension.getBlock(target);
    if (!block) return;
    summonPortal(player, { block, face: hit.face }, projectileTypeId);
  }, Math.ceil(distance / HIGH_PRESSURE_SPEED) + 3);
}

/**
 * Scans downward from startY looking for the first solid block, so floating
 * portal placement can be clamped to a safe height instead of guessing from
 * a single fixed offset (which could land the portal inside the ground).
 *
 * @returns {number|undefined} The Y of the ground surface (top of the solid
 * block), or undefined if no solid block was found within maxDepth.
 */
function findGroundSurfaceY(dimension, x, z, startY, maxDepth = 10) {
  let y = Math.floor(startY);
  for (let i = 0; i < maxDepth; i++, y--) {
    const block = dimension.getBlock({ x, y, z });
    if (!block) return undefined;
    if (!block.isAir) return y + 1;
  }
  return undefined;
}

function getFloatingPortalPlacement(player, distance, highPressure, scale) {
  const headLocation = player.getHeadLocation();
  const viewDirection = player.getViewDirection();

  const location = {
    x: headLocation.x + viewDirection.x * distance,
    y: headLocation.y + viewDirection.y * distance,
    z: headLocation.z + viewDirection.z * distance,
  };
  let orientation;
  let rotation = 0;

  // Low pressure portals settle a bit toward the ground for a more natural look.
  if (!highPressure) {
    location.y -= distance / 4;
  }

  // Never let the portal end up closer to the ground than it needs to be to
  // walk through without clipping into the block below.
  const minClearance = scale > 1 ? 2 : 1;
  const groundY = findGroundSurfaceY(
    player.dimension,
    Math.floor(location.x),
    Math.floor(location.z),
    location.y,
  );
  if (groundY !== undefined) {
    location.y = Math.max(location.y, groundY + minClearance);
  }

  if (viewDirection.y > 0.5) {
    orientation = 1;
  } else if (viewDirection.y < -0.5) {
    orientation = 2;
  } else {
    orientation = 0;

    const dx = headLocation.x - location.x;
    const dz = headLocation.z - location.z;
    const angle = Math.atan2(dz, dx) * (180 / Math.PI);
    rotation = Math.floor(((angle + 315) % 360) / 90);
  }
  return { location, orientation, rotation };
}

function handlePortalGunHistory(portalGunItem, location) {
  if (isBasicItem(portalGunItem)) return portalGunItem;
  const historyJson = portalGunItem.getDynamicProperty(
    portalGunDP.historyLocations,
  );
  let history = historyJson ? JSON.parse(historyJson) : [];

  while (history.length >= HISTORY_LIMIT) {
    history.pop();
  }

  history.unshift(location);
  portalGunItem.setDynamicProperty(
    portalGunDP.historyLocations,
    JSON.stringify(history),
  );
  return portalGunItem;
}

function getPortalPlacement(player, target) {
  if (!target) return;

  let rotation = 0,
    orientation = 0,
    location = null;

  const block = target.block;
  if (!block?.isValid) {
    player.onScreenDisplay.setActionBar({
      translate: "ram_pg.error.invalid_block",
    });
    return;
  }
  const face = target.face;
  const ry = (player.getRotation().y + 180) % 360;

  switch (face) {
    case Direction.Up:
      location = block.above(1).center();
      orientation = 2;
      rotation = ry < 45 || ry >= 315 ? 0 : ry < 135 ? 1 : ry < 225 ? 2 : 3;
      break;
    case Direction.Down:
      location = block.below(1).center();
      orientation = 1;
      rotation = ry < 45 || ry >= 315 ? 0 : ry < 135 ? 1 : ry < 225 ? 2 : 3;
      break;
    case Direction.North:
      location = block.north(1).center();
      orientation = 0;
      rotation = 2;
      break;
    case Direction.West:
      location = block.west(1).center();
      orientation = 0;
      rotation = 1;
      break;
    case Direction.South:
      location = block.south(1).center();
      orientation = 0;
      rotation = 0;
      break;
    case Direction.East:
      location = block.east(1).center();
      orientation = 0;
      rotation = 3;
      break;
  }
  location.y -= 0.5;

  return { location, rotation, orientation };
}

/**
 * Handles custom portal mode placement for a portal gun.
 * It manages ticking areas, safe placement checks, and portal linking across dimensions.
 *
 * @param {Player} player - The player using the portal gun.
 * @param {ItemStack} portalGunItem - The portal gun item instance.
 * @param {Object} itemObject - Item slot info {slotIndex, ...}.
 * @param {Container} inventory - Player inventory container.
 * @param {Entity} newPortal - The newly created local portal entity.
 * @param {string[]} portalIds - The current list of linked portals.
 * @param {number} orientation - The current facing/orientation of the portal.
 * @param {number} rotation - The portal's visual rotation.
 * @param {number} scale - The portal's scale.
 * @param {string} portalGunId - Unique ID of the current portal gun.
 * @param {string} portalId - Unique ID for the portal being created.
 */
function handleCustomMode(
  player,
  portalGunItem,
  itemObject,
  inventory,
  newPortal,
  portalIds,
  orientation,
  rotation,
  scale,
  portalGunId,
  portalId,
  locationProperty = portalGunDP.customLocation,
) {
  const locJson = portalGunItem.getDynamicProperty(locationProperty);
  if (!locJson) return removePortal(newPortal, false);

  let loc;
  try {
    loc = JSON.parse(locJson);
  } catch (e) {
    console.error("[ram_pg] Corrupted customLocation data:", e);
    return removePortal(newPortal, false);
  }

  if (loc.dimensionId === BLENDER_DIMENSION_ID) {
    return openBlenderPortal(
      player,
      portalGunItem,
      itemObject,
      inventory,
      newPortal,
      portalIds,
      loc,
    );
  }

  const locId = loc.id;
  const safePlacement =
    locationProperty !== portalGunDP.targetLocation &&
    portalGunItem.getDynamicProperty(portalGunDP.behavior.safePlacement);
  const autoClose = portalGunItem.getDynamicProperty(
    portalGunDP.behavior.autoClose,
  );

  let dim;
  try {
    dim = world.getDimension(loc.dimensionId);
  } catch (err) {
    player.sendMessage({
      translate: "ram_pg.error.invalid_dimension",
      with: [loc.dimensionId],
    });
    return removePortal(newPortal, false);
  }

  if (portalIds.length > 1) {
    const root = world.getEntity(portalIds[0]);
    if (locId !== root?.getDynamicProperty(portalDP.locationId)) {
      removeAllPortals(player, portalGunItem, itemObject.slotIndex);
      portalIds = [newPortal.id];
    } else {
      newPortal.setDynamicProperty(portalDP.isRoot, false);
      linkPortals(portalIds[0], newPortal.id);
      const portalIdsJSON = root.getDynamicProperty(portalDP.childList);
      portalIds = portalIdsJSON ? JSON.parse(portalIdsJSON) : [];
      portalIds.push(newPortal.id);
      root.setDynamicProperty(portalDP.childList, JSON.stringify(portalIds));
      savePortalList(
        portalGunItem,
        portalIds,
        player,
        inventory,
        itemObject.slotIndex,
      );
      return;
    }
  }

  const exitOrientation = orientation === 1 ? 2 : orientation === 2 ? 1 : 0;
  const headroom = exitOrientation === 1 ? 3 : 2;
  const arrival =
    exitOrientation === 0 && dim.id !== newPortal.dimension.id
      ? EXIT_OFFSETS[rotation]
      : undefined;
  const target = clampToWorld(dim, loc, headroom);
  const areaKey = `custom:${newPortal.id}`;

  system.run(async () => {
    let customPortal;
    try {
      const spot = await findCustomSpot(
        player,
        dim,
        target,
        areaKey,
        safePlacement,
        headroom,
        arrival,
        loc.surface === true,
      );
      if (!newPortal.isValid) return;
      if (!spot) {
        removePortal(newPortal, false);
        return;
      }

      if (exitOrientation === 1) spot.y += 2;
      customPortal = spawnPortal(
        portalId,
        dim,
        spot,
        rotation,
        exitOrientation,
        scale,
        portalGunId,
        autoClose,
      );
      if (!customPortal) {
        removePortal(newPortal, false);
        return;
      }

      portalIds = [customPortal.id, newPortal.id];

      newPortal.setDynamicProperty(portalDP.isRoot, false);

      customPortal.setDynamicProperty(
        portalDP.childList,
        JSON.stringify(portalIds),
      );
      customPortal.setDynamicProperty(portalDP.locationId, locId);
      customPortal.setDynamicProperty(portalDP.isRoot, true);

      linkPortals(customPortal.id, newPortal.id);
      keepPortalLoaded(customPortal.id, dim, customPortal.location, true);

      // Re-locate the gun right before writing back: the player may have
      // switched slots, dismounted, or dropped it during the chunk-load /
      // safe-placement wait above. Writing to the slot captured at the top
      // of spawnAndLinkPortal would otherwise resurrect/duplicate the gun
      // in whatever now occupies that stale slot. findPortalGunInInventory
      // also matches dismounted base items (they keep the same portalGunDP.id),
      // so additionally require it to still be a fully assembled gun typeId.
      const currentItemObject = findPortalGunInInventory(player, portalGunId);
      const stillAssembled =
        currentItemObject &&
        portalGuns.some((gun) => gun.typeId === currentItemObject.item.typeId);
      if (stillAssembled) {
        portalGunItem = currentItemObject.item;
        portalGunItem.setDynamicProperty(
          portalGunDP.portalList,
          JSON.stringify(portalIds),
        );
        portalGunItem = handlePortalGunHistory(portalGunItem, loc);
        inventory.container.setItem(currentItemObject.slotIndex, portalGunItem);
      } else {
        // Gun is gone (dismounted/dropped/no longer assembled) - nobody to
        // own this pair. Remove both instead of leaving a fully linked,
        // functional portal pair that no gun will ever reference again.
        removePortal(newPortal, true);
      }
    } catch (e) {
      console.error("[ram_pg] Uncaught error placing custom portal:", e);
      removePortal(newPortal, true);
      if (customPortal) removePortal(customPortal, false);
    } finally {
      releaseArea(areaKey);
    }
  });
}

async function findCustomSpot(
  player,
  dim,
  target,
  areaKey,
  safePlacement,
  headroom,
  arrival,
  surface,
) {
  const near = searchBox(target, safePlacement ? NEAR_RADIUS : 0);
  if (!(await loadDestination(player, areaKey, dim, near))) {
    if (player.isValid) {
      player.onScreenDisplay.setActionBar({
        translate: "ram_pg.error.failed_to_load_chunk",
      });
    }
    return undefined;
  }

  const center = {
    x: Math.floor(target.x) + 0.5,
    y: target.y,
    z: Math.floor(target.z) + 0.5,
  };
  if (!safePlacement) return center;

  const need = { headroom, arrival, surface };
  let spot = await findSafeSpot(dim, target, need);
  if (!spot || (surface && spot.water)) {
    const far = searchBox(target, FAR_RADIUS);
    const farLoaded = await keepLoaded(areaKey, dim, far.from, far.to, {
      force: true,
      pinned: true,
    });
    if (farLoaded) {
      const farSpot = await findSafeSpot(dim, target, {
        ...need,
        radius: FAR_RADIUS,
        step: FAR_STEP,
      });
      if (farSpot && (!spot || !farSpot.water)) spot = farSpot;
    }
  }

  if (!spot) {
    if (player.isValid) {
      player.sendMessage({ translate: "ram_pg.error.no_safe_location" });
    }
    return center;
  }

  if (player.isValid) {
    const moved =
      spot.x !== Math.floor(target.x) ||
      spot.y !== target.y ||
      spot.z !== Math.floor(target.z);
    if (moved) {
      player.onScreenDisplay.setActionBar({
        translate: "ram_pg.info.safe_placement_adjusted",
        with: [String(spot.x), String(spot.y), String(spot.z)],
      });
    }
    if (isNearLava(dim, spot)) {
      player.sendMessage({ translate: "ram_pg.warning.lava_below" });
    }
  }
  return { x: spot.x + 0.5, y: spot.y, z: spot.z + 0.5 };
}

function loadDestination(player, areaKey, dim, box) {
  let settled = false;
  const loading = keepLoaded(areaKey, dim, box.from, box.to, {
    force: true,
    pinned: true,
  });
  loading.then(() => {
    settled = true;
  });
  system.runTimeout(() => {
    if (!settled && player.isValid) {
      player.onScreenDisplay.setActionBar({
        translate: "ram_pg.info.loading_destination",
      });
    }
  }, 10);
  return loading;
}

/**
 * The Blender Dimension isn't a real dimension, so nothing is spawned on the
 * other side: the local portal just blends whoever goes through it (see
 * portal/blender.js). Shots at the same Blender location pile up portals,
 * like custom-mode children of a single destination.
 *
 * @param {Player} player
 * @param {ItemStack} portalGunItem
 * @param {Object} itemObject - Item slot info {slotIndex, ...}.
 * @param {EntityInventoryComponent} inventory
 * @param {Entity} newPortal
 * @param {string[]} portalIds - The gun's portal list, including newPortal.
 * @param {Object} loc - The custom location aimed at the Blender Dimension.
 */
function openBlenderPortal(
  player,
  portalGunItem,
  itemObject,
  inventory,
  newPortal,
  portalIds,
  loc,
) {
  if (portalIds.length > 1) {
    const firstPortal = world.getEntity(portalIds[0]);
    if (loc.id !== firstPortal?.getDynamicProperty(portalDP.locationId)) {
      removeAllPortals(player, portalGunItem, itemObject.slotIndex);
      portalIds = [newPortal.id];
    }
  }

  newPortal.setDynamicProperty(portalDP.locationId, loc.id);
  newPortal.setDynamicProperty(portalDP.blenderPortal, true);

  portalGunItem = handlePortalGunHistory(portalGunItem, loc);
  savePortalList(
    portalGunItem,
    portalIds,
    player,
    inventory,
    itemObject.slotIndex,
  );
}

export function summonPortal(player, target, projectileTypeId) {
  const placement = getPortalPlacement(player, target);
  if (!placement) {
    player.sendMessage({ translate: "ram_pg.error.invalid_placement" });
    return;
  }
  spawnAndLinkPortal(player, placement, projectileTypeId);
}

export function summonFloatingPortal(player, placement, projectileTypeId) {
  if (!placement) {
    player.onScreenDisplay.setActionBar({
      translate: "ram_pg.error.no_safe_location",
    });
    return;
  }
  spawnAndLinkPortal(player, placement, projectileTypeId);
}

function spawnAndLinkPortal(player, placement, projectileTypeId) {
  const { location, rotation, orientation } = placement;

  system.run(() => {
    const inventory = player.getComponent("inventory");
    if (!inventory || !inventory.container) {
      return;
    }

    const ownerId = player.getDynamicProperty(playerDP.portalGunId);
    const itemObject = findPortalGunInInventory(player, ownerId);
    const portalGunItem = itemObject?.item;
    if (!portalGunItem) {
      player.sendMessage({ translate: "ram_pg.error.portal_gun_not_found" });
      return;
    }

    const gunInstance = getGunInstance(portalGunItem);
    if (!gunInstance) return;

    const portalGunMode = portalGunItem.getDynamicProperty(portalGunDP.mode);
    const portalGunId = portalGunItem.getDynamicProperty(portalGunDP.id);
    const scale = portalGunItem.getDynamicProperty(portalGunDP.behavior.scale);
    const autoClose = portalGunItem.getDynamicProperty(
      portalGunDP.behavior.autoClose,
    );

    const portalListJson = portalGunItem.getDynamicProperty(
      portalGunDP.portalList,
    );
    let portalIds = portalListJson ? JSON.parse(portalListJson) : [];

    let portalTypeId;
    if (projectileTypeId.includes("blue")) {
      portalTypeId = "ram_pg:blue_portal";
    } else if (projectileTypeId.includes("green")) {
      portalTypeId = "ram_pg:green_portal";
    } else {
      portalTypeId = "ram_pg:yellow_portal";
    }

    let newPortal = spawnPortal(
      portalTypeId,
      player.dimension,
      location,
      rotation,
      orientation,
      scale,
      portalGunId,
      autoClose,
    );
    if (!newPortal) {
      player.sendMessage({ translate: "ram_pg.error.failed_to_spawn_portal" });
      return;
    }

    portalIds.push(newPortal.id);

    switch (portalGunMode) {
      case PORTAL_MODES.FIFO:
        if (portalIds.length == 2) {
          linkPortals(portalIds[0], portalIds[1]);
        }
        if (portalIds.length > 2) {
          const oldestPortalId = portalIds.shift();
          const oldestPortal = world.getEntity(oldestPortalId);
          if (oldestPortal) {
            removePortal(oldestPortal, false);
          }
          linkPortals(portalIds[0], portalIds[1]);
        }
        savePortalList(
          portalGunItem,
          portalIds,
          player,
          inventory,
          itemObject.slotIndex,
        );
        break;

      case PORTAL_MODES.LIFO:
        if (portalIds.length == 2) {
          linkPortals(portalIds[0], portalIds[1]);
        }
        if (portalIds.length > 2) {
          const newerPortalId = portalIds.splice(1, 1)[0];
          const newerPortal = world.getEntity(newerPortalId);
          if (newerPortal) {
            removePortal(newerPortal, false);
          }
          linkPortals(portalIds[0], portalIds[1]);
        }
        savePortalList(
          portalGunItem,
          portalIds,
          player,
          inventory,
          itemObject.slotIndex,
        );
        break;

      case PORTAL_MODES.MULTI_PAIR:
        if (portalIds.length > MAX_PORTALS) {
          removeAllPortals(player, portalGunItem, itemObject.slotIndex);
          portalIds = [newPortal.id];
        } else if (portalIds.length % 2 == 0) {
          linkPortals(
            portalIds[portalIds.length - 2],
            portalIds[portalIds.length - 1],
          );
        }
        savePortalList(
          portalGunItem,
          portalIds,
          player,
          inventory,
          itemObject.slotIndex,
        );
        break;

      case PORTAL_MODES.ROOT:
        if (portalIds.length > MAX_PORTALS) {
          removeAllPortals(player, portalGunItem, itemObject.slotIndex);
          portalIds = [newPortal.id];
        }

        if (portalIds.length > 1) {
          const rootId = portalIds[0];
          const lastId = portalIds[portalIds.length - 1];
          const rootPortal = world.getEntity(rootId);

          rootPortal?.setDynamicProperty(
            portalDP.childList,
            JSON.stringify(portalIds),
          );

          newPortal.setDynamicProperty(portalDP.isRoot, false);
          linkPortals(rootId, lastId);
        } else {
          newPortal.setDynamicProperty(portalDP.isRoot, true);
          newPortal.setDynamicProperty(
            portalDP.childList,
            JSON.stringify(portalIds),
          );
        }
        savePortalList(
          portalGunItem,
          portalIds,
          player,
          inventory,
          itemObject.slotIndex,
        );
        break;

      case PORTAL_MODES.CUSTOM:
        if (portalIds.length > MAX_PORTALS) {
          removeAllPortals(player, portalGunItem, itemObject.slotIndex);
          portalIds = [newPortal.id];
        }
        handleCustomMode(
          player,
          portalGunItem,
          itemObject,
          inventory,
          newPortal,
          portalIds,
          orientation,
          rotation,
          scale,
          portalGunId,
          gunInstance.portalId,
        );
        break;

      case PORTAL_MODES.TARGET:
        if (portalIds.length > MAX_PORTALS) {
          removeAllPortals(player, portalGunItem, itemObject.slotIndex);
          portalIds = [newPortal.id];
        }
        handleCustomMode(
          player,
          portalGunItem,
          itemObject,
          inventory,
          newPortal,
          portalIds,
          orientation,
          rotation,
          scale,
          portalGunId,
          gunInstance.portalId,
          portalGunDP.targetLocation,
        );
        break;

      default:
        break;
    }
  });
}
