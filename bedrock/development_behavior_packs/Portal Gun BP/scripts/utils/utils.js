import { world, system, ItemStack } from "@minecraft/server";
import {
  portalSP,
  portalDP,
  ID,
  portalGunDP,
  portalGuns,
  worldDP,
  PORTAL_MODES,
  LOCATION_LIMIT,
  BASIC_LOCATION_LIMIT,
} from "../utils/ids&variables";

const portalGunSet = new Set([...ID.portalGunsIds, ...ID.dischargedPortalGuns]);

/**
 * Checks if an item type is a Portal Gun.
 * @param {string} typeId
 * @returns {boolean}
 */
export function isPortalGun(typeId) {
  return portalGunSet.has(typeId);
}

/**
 * Gets the currently selected item from a player's inventory.
 * @param {Player} player - The player whose inventory to check.
 * @returns {ItemStack | undefined} The selected item, or undefined if no item is selected.
 */
export function getSelectedItem(player) {
  return player
    .getComponent("inventory")
    .container.getItem(player.selectedSlotIndex);
}

/**
 * Calculates the Euclidean distance between two 3D locations.
 *
 * @param {Object} location1 - The first location.
 * @param {Object} location2 - The second location.
 * @returns {number} The distance between the two locations.
 */
export function calculateEuclideanDistance(location1, location2) {
  let deltaX = location1.x - location2.x;
  let deltaY = location1.y - location2.y;
  let deltaZ = location1.z - location2.z;
  let distance = Math.sqrt(deltaX ** 2 + deltaY ** 2 + deltaZ ** 2);
  return distance;
}

/**
 * Changes the mode of a Portal Gun and optionally removes all active portals linked to it.
 *
 * @param {Player} player - The player holding the Portal Gun.
 * @param {EntityInventoryComponent} inventory - The player’s inventory container.
 * @param {ItemStack} portalGunItem - The Portal Gun item being modified.
 * @param {string} mode - The new mode to set for the Portal Gun.
 * @param {boolean} [removePortals=true] - Whether to remove all portals linked to this Portal Gun.
 */
export function changePortalGunMode(
  player,
  inventory,
  portalGunItem,
  mode,
  removePortals = true,
) {
  portalGunItem.setDynamicProperty(portalGunDP.mode, mode);
  player.dimension.playSound("ram_pg:selection", player.location);

  const portalGunId = portalGunItem.getDynamicProperty(portalGunDP.id);
  const itemObject = findPortalGunInInventory(player, portalGunId);
  if (!itemObject) return;

  if (removePortals) removeAllPortals(player, portalGunItem, itemObject.slotIndex);
  inventory.container.setItem(itemObject.slotIndex, portalGunItem);
}

/**
 * Spawns a new portal entity in the specified dimension and location.
 *
 * @param {string} portalId - The ID of the portal entity to spawn.
 * @param {Dimension} dimension - The dimension where the portal will be created.
 * @param {Vector3} location - The world location to spawn the portal.
 * @param {number} rotation - The portal's rotation index (0–3).
 * @param {number} orientation - The orientation of the portal (0 = vertical).
 * @param {number} scale - The portal’s size.
 * @param {string} ownerId - The ID of the player or entity that owns this portal.
 * @param {boolean} [autoClose=false] - Whether the portal should automatically close after a delay.
 * @returns {Entity} The newly created portal entity.
 */
export function spawnPortal(
  portalId,
  dimension,
  location,
  rotation,
  orientation,
  scale,
  ownerId,
  autoClose = false,
) {
  const searchArea = {
    location: location,
    maxDistance: 1,
  };
  const queryOptions = {
    ...searchArea,

    excludeTypes: ["minecraft:player", ...ID.portals],
    excludeFamilies: ["ram_pg:inert"],
  };

  if (orientation == 0) {
    const blockBelow = dimension.getBlock({
      x: location.x,
      y: location.y - 1,
      z: location.z,
    });
    if (scale == 1) {
      if (blockBelow && blockBelow.typeId !== "minecraft:air") {
        location.y++;
      }
    } else if (scale > 1) {
      if (blockBelow && blockBelow.typeId !== "minecraft:air") {
        location.y += 2;
      }
    }
  }

  let newPortal = dimension.spawnEntity(portalId, location);
  registerActivePortal(newPortal.id);
  newPortal.setProperty(portalSP.rotation, rotation);
  newPortal.setProperty(portalSP.orientation, orientation);
  newPortal.setProperty(portalSP.scale, scale);
  newPortal.setDynamicProperty(portalDP.ownerPortalGun, ownerId);
  newPortal.setDynamicProperty(portalDP.autoClose, autoClose);
  newPortal.setDynamicProperty(
    portalDP.anchorLocation,
    JSON.stringify(newPortal.location),
  );

  const entitiesToDamage = newPortal.dimension.getEntities(queryOptions);
  for (const entity of entitiesToDamage) entity.applyDamage(20);
  return newPortal;
}

/**
 * Links two portals together so that entities can travel between them.
 *
 * @param {string} portalAId - The unique ID of the first portal entity.
 * @param {string} portalBId - The unique ID of the second portal entity.
 */
export function linkPortals(portalAId, portalBId) {
  const portalA = world.getEntity(portalAId);
  const portalB = world.getEntity(portalBId);
  if (portalA && portalB) {
    portalA.setDynamicProperty(portalDP.DualityPortalId, portalB.id);
    portalB.setDynamicProperty(portalDP.DualityPortalId, portalA.id);
    rememberDual(portalA, portalB);
    rememberDual(portalB, portalA);
  }
}

export function rememberDual(portal, dualPortal) {
  const record = JSON.stringify({
    dimensionId: dualPortal.dimension.id,
    x: dualPortal.location.x,
    y: dualPortal.location.y,
    z: dualPortal.location.z,
  });
  if (portal.getDynamicProperty(portalDP.dualLocation) !== record) {
    portal.setDynamicProperty(portalDP.dualLocation, record);
  }
}

export function readDualRecord(portal) {
  const record = portal.getDynamicProperty(portalDP.dualLocation);
  if (typeof record !== "string") return undefined;
  try {
    return JSON.parse(record);
  } catch {
    return undefined;
  }
}

/**
 * Removes a water or lava block at a given location, if present.
 *
 * @param {Dimension} dimension - The dimension where the block is located.
 * @param {Vector3} location - The coordinates of the block to check and remove.
 */
function removeFluidBlockAtLocation(dimension, location) {
  location = {
    x: Math.floor(location.x),
    y: Math.floor(location.y),
    z: Math.floor(location.z),
  };
  const block = dimension.getBlock(location);
  if (!block) return;
  const isInWater =
    block.typeId === "minecraft:water" ||
    block.typeId === "minecraft:flowing_water";
  const isInLava =
    block.typeId === "minecraft:lava" ||
    block.typeId === "minecraft:flowing_lava";
  if (isInWater || isInLava) {
    dimension.runCommand(
      `setblock ${location.x} ${location.y} ${location.z} air`,
    );
  }
}

/**
 * Removes a portal entity with its closing animation, optionally also removing its linked (dual) portal.
 *
 * @param {Entity} portalEntity - The portal entity to remove.
 * @param {boolean} [mustRemoveDual=true] - Whether the linked (dual) portal should also be removed.
 */
export function removePortal(portalEntity, mustRemoveDual = true) {
  if (!portalEntity?.isValid) return;

  let animation_length = 0.46;
  const tickDelay = animation_length * 20;

  let dualPortalID = portalEntity.getDynamicProperty(portalDP.DualityPortalId);
  let dualPortal;
  if (dualPortalID && mustRemoveDual) {
    dualPortal = world.getEntity(dualPortalID);
    if (dualPortal) {
      removeFluidBlockAtLocation(dualPortal.dimension, dualPortal.location);
      dualPortal.setProperty(portalSP.close, true);
    }
  }

  removeFluidBlockAtLocation(portalEntity.dimension, portalEntity.location);
  portalEntity.setProperty(portalSP.close, true);

  system.runTimeout(() => {
    unregisterActivePortal(portalEntity.id);
    if (portalEntity?.isValid) {
      portalEntity.remove();
    }

    if (mustRemoveDual && dualPortal) {
      unregisterActivePortal(dualPortal.id);
      if (dualPortal.isValid) {
        dualPortal.remove();
      }
    }
  }, tickDelay);
}

/**
 * Removes all portals linked to a given Portal Gun item.
 * Each portal is removed using {@link removePortal}.
 *
 * @param {Entity} player - The player holding the Portal Gun.
 * @param {ItemStack} portalGunItem - The Portal Gun item whose portals should be removed.
 * @param {number} [slotIndex=player.selectedSlotIndex] - The inventory slot index of the Portal Gun.
 */
export function removeAllPortals(
  player,
  portalGunItem,
  slotIndex = player.selectedSlotIndex,
) {
  const inventory = player.getComponent("inventory");
  const portalListJson = portalGunItem.getDynamicProperty(
    portalGunDP.portalList,
  );
  let portalIds = portalListJson ? JSON.parse(portalListJson) : [];

  if (portalIds.length > 0) {
    // Keep IDs that don't currently resolve to a loaded entity - they may
    // just be unloaded (different dimension / out of simulation range),
    // not destroyed. Dropping them here would orphan a live portal that
    // no removal action could ever reach again. They'll be caught the
    // next time this (or another removal action) runs while loaded.
    const remainingIds = portalIds.filter((portalId) => {
      const portalEntity = world.getEntity(portalId);
      if (!portalEntity) return true;
      removePortal(portalEntity, false);
      return false;
    });

    savePortalList(portalGunItem, remainingIds, player, inventory, slotIndex);
  }
}

/** * Saves the list of portal IDs to a Portal Gun item’s dynamic properties.
 *
 * @param {ItemStack} portalGunItem - The Portal Gun item to update.
 * @param {Array<string>} portalIds - An array of portal entity IDs to save.
 * @param {Player} player - The player holding the Portal Gun.
 * @param {EntityInventoryComponent} inventory - The player’s inventory component.
 * @param {number} [slotIndex=player.selectedSlotIndex] - The inventory slot index of the Portal Gun.
 */
export function savePortalList(
  portalGunItem,
  portalIds,
  player,
  inventory,
  slotIndex = player.selectedSlotIndex,
) {
  portalGunItem.setDynamicProperty(
    portalGunDP.portalList,
    JSON.stringify(portalIds),
  );
  inventory.container.setItem(slotIndex, portalGunItem);
}

/**
 * Searches the player’s inventory for a Portal Gun item with a specific ID.
 * @param {Player} player - The player whose inventory to search.
 * @param {string} portalGunId - The unique ID of the Portal Gun to find.
 * @returns {Object|undefined} An object containing the found item and its slot index, or undefined if not found.
 */
export function findPortalGunInInventory(player, portalGunId) {
  const inventory = player.getComponent("inventory");
  if (!inventory || !inventory.container) {
    return undefined;
  }
  const container = inventory.container;
  for (let i = 0; i < container.size; i++) {
    const item = container.getItem(i);

    if (
      item &&
      (portalGuns.some((gun) => gun.typeId === item.typeId) ||
        ID.dischargedPortalGuns.includes(item.typeId) ||
        ID.components.portalGunBases.includes(item.typeId))
    ) {
      let gunId = item.getDynamicProperty(portalGunDP.id);
      if (gunId == portalGunId) return { item, slotIndex: i };
    }
  }
  return undefined;
}

/**
 * Searches every online player's inventory for a Portal Gun item with a
 * specific ID, for cases where the player currently holding it isn't known
 * (e.g. auto-closing a portal after some other entity teleports through it,
 * or the gun owner isn't the one who triggered the removal).
 * @param {string} portalGunId - The unique ID of the Portal Gun to find.
 * @returns {Object|undefined} {player, item, slotIndex, inventory} or undefined if not found.
 */
export function findPortalGunOwnerInventory(portalGunId) {
  for (const player of world.getAllPlayers()) {
    const found = findPortalGunInInventory(player, portalGunId);
    if (found) {
      return {
        player,
        item: found.item,
        slotIndex: found.slotIndex,
        inventory: player.getComponent("inventory"),
      };
    }
  }
  return undefined;
}

/**
 * Searches the player’s inventory for an item with a specific item ID.
 * @param {Player} player - The player whose inventory to search.
 * @param {string} itemId - The item ID to find.
 * @return {Object|undefined} An object containing the found item stack and its slot index, or undefined if not found.
 */
export function findItemInInventory(player, itemId) {
  const inventory = player.getComponent("inventory");
  if (!inventory || !inventory.container) {
    return undefined;
  }
  const container = inventory.container;
  for (let i = 0; i < container.size; i++) {
    const itemStack = container.getItem(i);

    if (itemStack && itemStack.typeId === itemId) {
      return { itemStack, slotIndex: i };
    }
  }
  return undefined;
}

/**
 * Causes the entity to receive some effects.
 *
 * @param {Dimension} entity - Entity that will receive the effects
 * @param {string} projectileId - The ID of the projectile that caused the damage
 */
export function dealPortalFluidDamage(entity, projectile) {
  entity.addEffect("minecraft:fatal_poison", 300, {
    amplifier: 5,
    showParticles: true,
  });
  entity.addEffect("minecraft:slowness", 300, {
    amplifier: 5,
    showParticles: true,
  });

  if (
    projectile === "ram_pg:green_fluid_projectile" ||
    projectile === "ram_pg:green_fluid_projectile_high_pressure"
  ) {
    entity.dimension.spawnParticle(
      "ram_pg:green_fluid_poison_particle",
      entity.location,
    );
    entity.dimension.spawnParticle(
      "ram_pg:green_fluid_ground_drop",
      entity.location,
    );
  } else if (
    projectile === "ram_pg:blue_fluid_projectile" ||
    projectile === "ram_pg:blue_fluid_projectile_high_pressure"
  ) {
    entity.dimension.spawnParticle(
      "ram_pg:blue_fluid_poison_particle",
      entity.location,
    );
    entity.dimension.spawnParticle(
      "ram_pg:blue_fluid_ground_drop",
      entity.location,
    );
  } else if (
    projectile === "ram_pg:yellow_fluid_projectile" ||
    projectile === "ram_pg:yellow_fluid_projectile_high_pressure"
  ) {
    entity.dimension.spawnParticle(
      "ram_pg:yellow_fluid_poison_particle",
      entity.location,
    );
    entity.dimension.spawnParticle(
      "ram_pg:yellow_fluid_ground_drop",
      entity.location,
    );
  }
  entity.dimension.playSound("ram_pg:fluid_burn", entity.location);
}

/**
 * Retrieves the Portal Gun instance associated with a given Portal Gun item stack.
 *
 * @param {ItemStack} portalGunItem
 * @returns {Object|undefined} The gun object if found, otherwise undefined.
 */
export function isBasicItem(item) {
  return portalGuns.some(
    (gun) => gun.basic && (gun.typeId === item?.typeId || gun.dischargedVersionId === item?.typeId || gun.baseId === item?.typeId),
  );
}

export function locationLimit(item) {
  return isBasicItem(item) ? BASIC_LOCATION_LIMIT : LOCATION_LIMIT;
}

export function getGunInstance(portalGunItem) {
  const gunObject = portalGuns.find(
    (gun) =>
      gun.typeId === portalGunItem?.typeId ||
      gun.dischargedVersionId === portalGunItem?.typeId,
  );
  return gunObject;
}

/**
 * Sets the charge bar for a player based on their selected Portal Gun.
 * @param {Player} player - The player whose charge bar to update.
 * @param {ItemStack} portalGunItem - The Portal Gun item stack.
 * @returns {void}
 */
export function setChargeBar(player, portalGunItem) {
  if (!portalGunItem) return;
  const gunInstance = getGunInstance(portalGunItem);
  if (!gunInstance) return;

  const color = gunInstance.portalId.includes("blue")
    ? "blue"
    : gunInstance.portalId.includes("yellow")
      ? "yellow"
      : "green";
  const rawCharge = portalGunItem?.getDynamicProperty(portalGunDP.charge) ?? 0;
  const charge = rawCharge === 0 ? " " : rawCharge;
  player.onScreenDisplay.setTitle(`ram_pg:bar${charge}${color}`);
}

/**
 * Clears the charge bar for a player.
 * @param {Player} player - The player whose charge bar to clear.
 */
export function clearChargeBar(player) {
  player.onScreenDisplay.setTitle("ram_pg:bar0");
}

/**
 * Reads the ram_pg:activePortals registry, tolerating corrupted/missing data.
 */
function readActivePortalIds() {
  const json = world.getDynamicProperty(worldDP.activePortals);
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("[ram_pg] Corrupted ram_pg:activePortals data, resetting:", e);
    world.setDynamicProperty(worldDP.activePortals, JSON.stringify([]));
    return [];
  }
}

export function getActivePortalIds() {
  const ids = readActivePortalIds();

  // Only filter for this tick's own use - do NOT persist the shrunk list.
  // world.getEntity() returning undefined means "not currently loaded"
  // (different dimension, out of simulation range), not "destroyed" -
  // portals here are persistent/never_despawn, so writing back a pruned
  // list would permanently orphan a portal that's merely unloaded right
  // now. The only legitimate way an ID leaves this registry is a
  // deliberate unregisterActivePortal() call from an actual removal.
  return ids.filter((id) => !!world.getEntity(id));
}

/**
 * Registra um novo portal no registro global.
 */
export function registerActivePortal(portalId) {
  const ids = readActivePortalIds();
  ids.push(portalId);
  world.setDynamicProperty(worldDP.activePortals, JSON.stringify(ids));
}

/**
 * Remove um portal do registro global.
 */
export function unregisterActivePortal(portalId) {
  const ids = readActivePortalIds();
  const filtered = ids.filter((id) => id !== portalId);
  world.setDynamicProperty(worldDP.activePortals, JSON.stringify(filtered));
}

export function pinPortalInPlace(portal) {
  const velocity = portal.getVelocity();
  const isMoving =
    Math.abs(velocity.x) > 0.001 ||
    Math.abs(velocity.y) > 0.001 ||
    Math.abs(velocity.z) > 0.001;

  if (!isMoving) return;

  portal.clearVelocity();

  const anchorJson = portal.getDynamicProperty(portalDP.anchorLocation);
  if (!anchorJson) return;

  const anchor = JSON.parse(anchorJson);
  const loc = portal.location;
  const driftedFromAnchor =
    Math.abs(loc.x - anchor.x) > 0.01 ||
    Math.abs(loc.y - anchor.y) > 0.01 ||
    Math.abs(loc.z - anchor.z) > 0.01;

  if (driftedFromAnchor) {
    portal.teleport(anchor);
  }
}

export function switchHair(player, item, inventory) {
  let newHairId = null;

  if (item.typeId === "ram_pg:rick_hair") {
    newHairId = "ram_pg:homesteader_rick_hair";
  } else if (item.typeId === "ram_pg:homesteader_rick_hair") {
    newHairId = "ram_pg:memory_rick_hair";
  } else if (item.typeId === "ram_pg:memory_rick_hair") {
    newHairId = "ram_pg:rick_hair";
  }

  if (newHairId) {
    inventory.setItem(player.selectedSlotIndex, new ItemStack(newHairId, 1));
  }
}