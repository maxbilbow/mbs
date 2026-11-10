import { system, world, InputPermissionCategory } from "@minecraft/server";
import { portalGunDP, portalDP, portalSP, AUTO_CLOSE_DELAY_DEFAULT } from "../utils/ids&variables";
import {
  calculateEuclideanDistance,
  findPortalGunInInventory,
  findPortalGunOwnerInventory,
  linkPortals,
  removePortal,
  dealPortalFluidDamage,
  getActivePortalIds,
  pinPortalInPlace,
  savePortalList,
  readDualRecord,
  rememberDual,
} from "../utils/utils";
import { canBeBlended, clearStaleBlood, startBlending } from "./blender";
import { keepPortalLoaded } from "./chunkLoader";

const AUTO_CLOSE_PENDING = "ram_pg:auto_close_pending";

const TELEPORTED_TAG = "ram_pg:teleported";
const OBJECTIVE_ID = "ram_pg:cooldownTime";
const PRELOAD_RADIUS = 16;
const PRELOAD_INTERVAL = 10;
const GONE_DUAL_TICKS = 40;

const lastPreload = new Map();
const waitingSince = new Map();
const missingSince = new Map();
const recordedDuals = new Set();

function calculateHorizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

// Handles teleport cooldown tags for entities in all dimensions
// Removes the TELEPORTED_TAG when the entity is ready to teleport again
export function handleTags() {
  const portalIds = getActivePortalIds();

  portalIds.forEach((portalId) => {
    const portal = world.getEntity(portalId);
    if (!portal) return;

    const entities = portal.dimension.getEntities({ tags: [TELEPORTED_TAG] });

    entities.forEach((entity) => {
      if (isOnCooldown(entity)) {
        return;
      }

      const lastPortalId = entity.getDynamicProperty(portalDP.lastPortalUsed);
      const lastPortal = lastPortalId && world.getEntity(lastPortalId);

      if (!lastPortal || entity.dimension.id !== lastPortal.dimension.id) {
        entity.removeTag(TELEPORTED_TAG);
        return;
      }

      const exitOrientation = lastPortal.getProperty(portalSP.orientation);

      const distance =
        exitOrientation === 2
          ? calculateHorizontalDistance(entity.location, lastPortal.location)
          : calculateEuclideanDistance(entity.location, lastPortal.location);

      const maxDistance = lastPortal.getProperty(portalSP.scale) > 1 ? 3 : 1.5;

      if (distance >= maxDistance) {
        entity.removeTag(TELEPORTED_TAG);
      }
    });
  });
}

// Decrease cooldowns for all participants and remove expired entries
export function runCooldown() {
  const scoreboard =
    world.scoreboard.getObjective(OBJECTIVE_ID) ??
    world.scoreboard.addObjective(OBJECTIVE_ID, OBJECTIVE_ID);

  scoreboard.getParticipants().forEach((participant) => {
    const cooldown = scoreboard.getScore(participant) - 1;

    if (cooldown < 0) {
      scoreboard.removeParticipant(participant);
    } else {
      scoreboard.setScore(participant, cooldown);
    }
  });
}

const FAR_PORTAL_DISTANCE = 64;

/**
 * Decide se o jogador deve ganhar a tag anti-reentrada ao sair de um portal.
 *
 * - Parede/teto (orientation 0 ou 1): sempre protege.
 * - Chão (orientation 2), MESMA dimensão e perto: NÃO protege.
 * - Chão (orientation 2), dimensão DIFERENTE ou muito longe: protege.
 *
 * @param {Entity} dualPortal - Portal de destino (onde o jogador saiu).
 * @param {Entity} portal - Portal de origem (o que o jogador usou).
 */
function shouldAddTeleportTag(dualPortal, portal) {
  const exitOrientation = dualPortal.getProperty(portalSP.orientation);

  if (exitOrientation !== 2) return true;

  if (portal.dimension.id !== dualPortal.dimension.id) return true;
  return calculateEuclideanDistance(portal.location, dualPortal.location) > FAR_PORTAL_DISTANCE;
}

// Called every tick to handle portals: teleportation, animations, fluids
export function onTick() {
  const portalIds = getActivePortalIds();

  portalIds.forEach((portalId) => {
    const portal = world.getEntity(portalId);
    if (!portal || !portal.isValid) return;
    pinPortalInPlace(portal);

    const dualityPortalId = portal.getDynamicProperty(portalDP.DualityPortalId);

    const dualPortal = dualityPortalId
      ? world.getEntity(dualityPortalId)
      : null;
    let dualRecord =
      dualityPortalId && !dualPortal ? readDualRecord(portal) : undefined;
    if (dualRecord && isDualGone(portal, dualRecord)) dualRecord = undefined;
    if (dualPortal) recordDual(portal, dualPortal);

    // Blender Dimension portals have no destination entity but act linked.
    const leadsToBlender =
      portal.getDynamicProperty(portalDP.blenderPortal) === true;

    const isLinked = !!dualPortal || !!dualRecord || leadsToBlender;
    portal.setProperty(portalSP.isLinked, isLinked);
    if (leadsToBlender) clearStaleBlood(portal);

    const radius = getPortalRadius(portal);

    let nearbyEntities = findEntitiesNearPortal(
      portal.dimension,
      portal.location,
      radius,
    );

    const scale = portal.getProperty(portalSP.scale);

    if (scale < 1) {
      nearbyEntities = filterSmallEntities(nearbyEntities);
    }

    if (scale <= 1) {
      nearbyEntities = nearbyEntities.filter(
        (entity) => entity.typeId !== "minecraft:ender_dragon",
      );
    }

    nearbyEntities = nearbyEntities.filter((entity) => {
      const isRiding = entity.hasComponent("minecraft:riding");
      return !isRiding;
    });

    // An unlinked portal can't teleport, so make it react to contact instead
    // (the RP animation controller plays the pass animation + loop particle
    // while this property is true). Only write it when it actually changes.
    const touched = !isLinked && nearbyEntities.length > 0;
    if (portal.getProperty(portalSP.touched) !== touched) {
      portal.setProperty(portalSP.touched, touched);
    }

    if (dualPortal || dualRecord) {
      preloadDual(
        portal,
        dualityPortalId,
        dualPortal,
        dualRecord,
        nearbyEntities,
      );
    }
    if (dualRecord) return;

    nearbyEntities.forEach((entity) => {
      if (!isLinked) return;

      if (leadsToBlender) {
        if (canBeBlended(entity)) startBlending(portal, entity);
        return;
      }

      playPortalAnimation(portal, dualPortal);

      if (entity.typeId !== "minecraft:player") {
        activateCooldown(entity);
        entity.setDynamicProperty(portalDP.lastPortalUsed, dualPortal.id);
        entity.addTag(TELEPORTED_TAG);

        teleportEntityToLocation(portal, dualPortal, entity);
      } else {
        playerUsePortal(portal, dualPortal, entity);
      }
    });
  });
}

function recordDual(portal, dualPortal) {
  const key = `${portal.id}>${dualPortal.id}`;
  if (recordedDuals.has(key)) return;

  recordedDuals.add(key);
  rememberDual(portal, dualPortal);
}

function isDualGone(portal, dualRecord) {
  const dimension = world.getDimension(dualRecord.dimensionId);
  if (!dimension.isChunkLoaded(dualRecord)) {
    missingSince.delete(portal.id);
    return false;
  }

  const now = system.currentTick;
  const since = missingSince.get(portal.id) ?? now;
  missingSince.set(portal.id, since);
  if (now - since < GONE_DUAL_TICKS) return false;

  missingSince.delete(portal.id);
  portal.setDynamicProperty(portalDP.dualLocation, undefined);
  return true;
}

function preloadDual(portal, dualId, dualPortal, dualRecord, touching) {
  const now = system.currentTick;
  const touched = touching.length > 0;
  const last = lastPreload.get(portal.id);
  if (!touched && last !== undefined && now - last < PRELOAD_INTERVAL) return;
  lastPreload.set(portal.id, now);

  if (!dualRecord || !touched) waitingSince.delete(portal.id);
  else if (!waitingSince.has(portal.id)) waitingSince.set(portal.id, now);

  if (touched) {
    const waited = now - (waitingSince.get(portal.id) ?? now);
    if (waited >= PRELOAD_INTERVAL && waited % PRELOAD_INTERVAL === 0) {
      for (const entity of touching) {
        if (entity.typeId !== "minecraft:player") continue;
        entity.onScreenDisplay.setActionBar({
          translate: "ram_pg.info.loading_destination",
        });
      }
    }
  } else {
    const players = portal.dimension.getPlayers({
      location: portal.location,
      maxDistance: PRELOAD_RADIUS,
    });
    if (players.length === 0) return;
  }

  if (dualPortal) {
    keepPortalLoaded(dualId, dualPortal.dimension, dualPortal.location);
  } else {
    keepPortalLoaded(
      dualId,
      world.getDimension(dualRecord.dimensionId),
      dualRecord,
    );
  }
}

const fluids = {
  water: ["minecraft:water", "minecraft:flowing_water"],
  lava: ["minecraft:lava", "minecraft:flowing_lava"],
};

/**
 * Handle water or lava interaction for a portal.
 */
export function handlePortalFluids() {
  const portalIds = getActivePortalIds();

  portalIds.forEach((portalId) => {
    const portal = world.getEntity(portalId);
    if (!portal || !portal.isValid) return;

    const dualityPortalId = portal.getDynamicProperty(portalDP.DualityPortalId);

    const dualPortal = dualityPortalId
      ? world.getEntity(dualityPortalId)
      : null;
    if(!dualPortal) return;

    const isLinked = !!dualPortal;
    portal.setProperty(portalSP.isLinked, isLinked);

    const block = portal.dimension.getBlock(portal.location);
    if (!block) return;

    const hasCloseProperty = portal.getProperty(portalSP.close);

    if (!hasCloseProperty) {
      if (fluids.water.includes(block.typeId)) {
        portal.teleport(portal.location);

        if (dualPortal.dimension.id === "minecraft:nether") {
          dualPortal.dimension.playSound("random.fizz", dualPortal.location);
          dualPortal.dimension.spawnParticle(
            "minecraft:water_evaporation_manual",
            dualPortal.location,
          );
          return;
        }

        dualPortal.dimension.runCommand(
          `setblock ${dualPortal.location.x} ${dualPortal.location.y} ${dualPortal.location.z} flowing_water`,
        );
      } else if (fluids.lava.includes(block.typeId)) {
        portal.teleport(portal.location);
        dualPortal.dimension.runCommand(
          `setblock ${dualPortal.location.x} ${dualPortal.location.y} ${dualPortal.location.z} flowing_lava`,
        );
      }
    }
  });
}

/**
 * Calculate the detection radius of a portal based on scale and orientation.
 *
 * @param {Entity} portal - The portal entity to calculate radius for.
 * @return {number} The radius around the portal for entity detection.
 */
function getPortalRadius(portal) {
  const scale = portal.getProperty(portalSP.scale);
  const orientation = portal.getProperty(portalSP.orientation);

  if (scale === 0.5) return 0.8;
  if (scale === 1) return orientation === 0 ? 1.2 : 1;
  if (scale > 1) return orientation === 0 ? 2.2 : 2;

  return 1;
}

/**
 * Filter entities allowed to pass through small-scale portals.
 *
 * @param {Array<Entity>} entities - Array of entity objects near the portal.
 * @return {Array<Entity>} Filtered array of entities allowed to teleport.
 */
function filterSmallEntities(entities) {
  return entities.filter((entity) => {
    if (entity.typeId === "minecraft:item") return true;

    const typeFamily = entity.getComponent("minecraft:type_family");
    const isBaby = entity.hasComponent("minecraft:is_baby");

    const allowedFamily =
      typeFamily.hasTypeFamily("minecart") ||
      typeFamily.hasTypeFamily("lightweight") ||
      typeFamily.hasTypeFamily("fish") ||
      typeFamily.hasTypeFamily("tnt") ||
      typeFamily.hasTypeFamily("player");

    return isBaby || allowedFamily;
  });
}

/**
 * Play the portal pass animation on both portals.
 *
 * @param {Entity} portal - The first portal entity.
 * @param {Entity} dualPortal - The linked portal entity.
 */
function playPortalAnimation(portal, dualPortal) {
  const animation_length = 0.4;
  const tickDelay = animation_length * 20;

  portal.playAnimation("animation.ram_pg.portal.pass");

  system.runTimeout(() => {
    dualPortal?.playAnimation("animation.ram_pg.portal.pass");
  }, tickDelay);
}

/**
 * Responsible for playing player animations when entering a portal.
 *
 * @param {Entity} portal
 * @param {Player} player
 */
function playInAnimation(portal, player) {
  const orientation = portal.getProperty(portalSP.orientation);
  let animation;

  switch (orientation) {
    case 0: {
      const pPos = player.location;
      const qPos = portal.location;

      const vx = qPos.x - pPos.x;
      const vz = qPos.z - pPos.z;
      const len = Math.hypot(vx, vz) || 1;

      const nx = vx / len;
      const nz = vz / len;

      const yawRad = (player.getRotation().y * Math.PI) / 180;

      const lookX = -Math.sin(yawRad);
      const lookZ = Math.cos(yawRad);

      const dot = lookX * nx + lookZ * nz;

      // There's no good animation for walking through backwards, so only
      // play one when the player is actually facing the portal.
      animation =
        dot > 0 ? "animation.ram_pg.player.portal_in_front" : undefined;

      break;
    }

    case 1: {
      animation = "animation.ram_pg.player.portal_in_up";
      break;
    }

    case 2: {
      animation = player.isSprinting && player.isOnGround
        ? "animation.ram_pg.player.portal_in_down_dive"
        : "animation.ram_pg.player.portal_in_down";

      break;
    }

    default: {
      animation = "animation.ram_pg.player.portal_in_front";
    }
  }

  if (animation) {
    player.playAnimation(animation);
  }
  playCameraAnimation(player, orientation);
}

/**
 * Responsible for playing player animations when leaving a portal.
 *
 * @param {Entity} portal
 * @param {Player} player
 */
function playOutAnimation(portal, player) {
  const orientation = portal.getProperty(portalSP.orientation);
  let animation;

  switch (orientation) {
    case 0: {
      animation = "animation.ram_pg.player.portal_out_front";
      break;
    }

    case 1: {
      animation = "animation.ram_pg.player.portal_out_up";
      break;
    }

    case 2: {
      animation = "animation.ram_pg.player.portal_out_down";
      break;
    }
  }

  player.playAnimation(animation);
  player.runCommand(`camera @s clear`);
}

function playCameraFade(player, fadeColor) {
  let r = 0,
    g = 0,
    b = 0;

  switch (fadeColor) {
    case "green":
      g = 255;
      break;

    case "blue":
      b = 255;
      break;

    case "yellow":
      r = 255;
      g = 255;
      break;
  }

  player.runCommand(`camera @s fade time 0.3 0 0.3 color ${r} ${g} ${b}`);
}

function playCameraAnimation(player, orientation) {
  if (orientation == 0) {
    const yawRad = (player.getRotation().y * Math.PI) / 180;

    const dirX = -Math.sin(yawRad);
    const dirZ = Math.cos(yawRad);

    const dist = 6;

    const x = (dirX * dist).toFixed(3);
    const z = (dirZ * dist).toFixed(3);

    player.runCommand(
      `camera @s set minecraft:free ease 3 out_sine pos ~${x} ~ ~${z} rot ~ ~`,
    );
  } else if (orientation == 1) {
    player.runCommand(
      `camera @s set minecraft:free ease 3 out_sine pos ~ ~10 ~ rot ~ ~`,
    );
  } else if (orientation == 2) {
    player.runCommand(
      `camera @s set minecraft:free ease 3 out_sine pos ~ ~-10 ~ rot ~ ~`,
    );
  }
}

/**
 * Teleports a player through a portal while handling animations,
 * cooldown, and auto-close portal logic.
 *
 * @param {Entity} portal - The portal entity the player entered.
 * @param {Entity} dualPortal - The linked portal entity the player will teleport to.
 * @param {Entity} player - The player entity that is being teleported.
 */
function playerUsePortal(portal, dualPortal, player) {
  const animation_length = 0.4;
  const tickDelay = animation_length * 20;
  const cooldown = 10 + tickDelay;

  const portalTypeId = portal.typeId;
  const portalColor = portalTypeId.slice(7).replace("_portal", "");

  activateCooldown(player, cooldown);

  player.inputPermissions.setPermissionCategory(
    InputPermissionCategory.Jump,
    false,
  );

  playInAnimation(portal, player);
  playCameraFade(player, portalColor);

  const portalGunId = portal.getDynamicProperty(portalDP.ownerPortalGun);
  const portalGunItem = findPortalGunInInventory(player, portalGunId)?.item;

  if (portalGunItem) {
    const autoClose = portalGunItem.getDynamicProperty(
      portalGunDP.behavior.autoClose,
    );

    if (autoClose) {
      portal.setDynamicProperty(portalDP.autoClose, true);
      dualPortal.setDynamicProperty(portalDP.autoClose, true);
    }
  }

  system.runTimeout(() => {
    let exitOrientation = 0;

    try {
      if (!portal?.isValid || !dualPortal?.isValid) {
        throw new Error(
          "Portal de origem ou destino foi removido durante a animação.",
        );
      }

      teleportEntityToLocation(portal, dualPortal, player);
      playOutAnimation(dualPortal, player);

      player.setDynamicProperty(portalDP.lastPortalUsed, dualPortal.id);

      if (shouldAddTeleportTag(dualPortal, portal)) {
        player.addTag(TELEPORTED_TAG);
      }

      exitOrientation = dualPortal.getProperty(portalSP.orientation);
    } catch (err) {
      player.runCommand(`camera @s clear`);
    } finally {
      if (exitOrientation === 2) {
        system.runTimeout(() => {
          player.inputPermissions.setPermissionCategory(
            InputPermissionCategory.Jump,
            true,
          );
        }, 4);
      } else {
        player.inputPermissions.setPermissionCategory(
          InputPermissionCategory.Jump,
          true,
        );
      }
    }
  }, tickDelay);
}
/**
 * Checks if an entity is currently on the portal cooldown.
 *
 * @param {Entity} entity - The entity to check for cooldown.
 * @return {boolean} True if the entity is on cooldown, false otherwise.
 */
function isOnCooldown(entity) {
  let scoreboard = world.scoreboard.getObjective(OBJECTIVE_ID);

  if (scoreboard === undefined) {
    scoreboard = world.scoreboard.addObjective(OBJECTIVE_ID, OBJECTIVE_ID);
  }

  return scoreboard.hasParticipant(entity);
}

/**
 * Activates a cooldown for an entity to prevent immediate re-teleportation.
 *
 * @param {Entity} entity - The entity to activate the cooldown for.
 * @param {number} ticks - Duration of the cooldown in ticks.
 */
function activateCooldown(entity, ticks = 20) {
  let scoreboard = world.scoreboard.getObjective(OBJECTIVE_ID);

  if (scoreboard === undefined) {
    scoreboard = world.scoreboard.addObjective(OBJECTIVE_ID, OBJECTIVE_ID);
  }

  scoreboard.setScore(entity, ticks);
}

/**
 * Finds nearby entities around a portal that are eligible for teleportation.
 * Excludes certain entity families and entities on cooldown.
 *
 * @param {Dimension} dimension - The dimension to search around.
 * @param {Vector3} location - The center location to search around.
 * @param {number} radius - The search radius.
 * @return {Array<Entity>} An array of nearby eligible entities.
 */
function findEntitiesNearPortal(dimension, location, radius) {
  const excludeFamilies = ["ram_pg:portal", "ram_pg:projectile", "ram_pg:inert"];

  const queryOptions = {
    location,
    maxDistance: radius,
    excludeFamilies,
  };

  return dimension.getEntities(queryOptions).filter((entity) => {
    return !isOnCooldown(entity) && !entity.hasTag(TELEPORTED_TAG);
  });
}

/**
 * Teleports an entity to the linked portal's location,
 * adjusting orientation and rotation.
 *
 * @param {Entity} portal - The portal that the entity used.
 * @param {Entity} dualPortal - The destination portal entity.
 * @param {Entity} entity - The entity to teleport.
 */
function teleportEntityToLocation(portal, dualPortal, entity) {
  const orientation = dualPortal.getProperty(portalSP.orientation);

  const rotation = dualPortal.getProperty(portalSP.rotation);
  const scale = dualPortal.getProperty(portalSP.scale);

  let ry = entity.getRotation().y;

  let tpLocation = {
    x: dualPortal.location.x,
    y: dualPortal.location.y,
    z: dualPortal.location.z,
  };

  if (orientation === 0) {
    if (scale >= 1) {
      tpLocation.y -= 1;
    }

    switch (rotation) {
      case 0:
        ry = 0;
        break;

      case 1:
        ry = 90;
        break;

      case 2:
        ry = 180;
        break;

      case 3:
        ry = -90;
        break;
    }
  }

  const differentDimension = portal.dimension.id !== dualPortal.dimension.id;

  if (differentDimension && orientation === 0) {
    const offsetDistance = 1;
    let offset = { x: 0, z: 0 };

    switch (rotation) {
      case 0:
        offset.z = -offsetDistance;
        break;

      case 1:
        offset.x = offsetDistance;
        break;

      case 2:
        offset.z = offsetDistance;
        break;

      case 3:
        offset.x = -offsetDistance;
        break;
    }

    tpLocation.x += offset.x;
    tpLocation.z += offset.z;
  }

  try {
    if (entity.typeId === "minecraft:lightning_bolt") {
      const newLightning = dualPortal.dimension.spawnEntity(
        "minecraft:lightning_bolt",
        tpLocation,
      );

      activateCooldown(newLightning, 60);
      return;
    } else {
      entity.teleport(tpLocation, {
        dimension: dualPortal.dimension,
        rotation: {
          x: entity.getRotation().x,
          y: ry,
        },
      });
    }
  } catch (error) {
    world.sendMessage({
      translate: "ram_pg.error.failed_to_teleport_entity",
      with: [String(error)],
    });
  }

  if (orientation === 2 && entity.typeId === "minecraft:player") {
    system.runTimeout(() => {
      entity.applyImpulse({
        x: 0,
        y: 0.7,
        z: 0,
      });
    }, 2);
  }

  const autoClose =
    dualPortal.getDynamicProperty(portalDP.autoClose) ||
    portal.getDynamicProperty(portalDP.autoClose);

  if (!autoClose) return;
  if (portal.getDynamicProperty(AUTO_CLOSE_PENDING) || dualPortal.getDynamicProperty(AUTO_CLOSE_PENDING)) return;

  const dualPortalIsRoot = dualPortal.getDynamicProperty(portalDP.isRoot);
  const ownerPortalGunId = dualPortal.getDynamicProperty(
    portalDP.ownerPortalGun,
  );
  const ownerGun = ownerPortalGunId === undefined ? undefined : findPortalGunOwnerInventory(ownerPortalGunId)?.item;
  const delaySeconds = ownerGun?.getDynamicProperty(portalGunDP.behavior.autoCloseDelay) ?? AUTO_CLOSE_DELAY_DEFAULT;
  portal.setDynamicProperty(AUTO_CLOSE_PENDING, true);
  dualPortal.setDynamicProperty(AUTO_CLOSE_PENDING, true);

  system.runTimeout(() => {
    for (const entity of [portal, dualPortal]) {
      if (entity.isValid) entity.setDynamicProperty(AUTO_CLOSE_PENDING, undefined);
    }
    if (!portal.isValid || !dualPortal.isValid) return;
    // Track exactly which portal IDs get removed here, so the owning gun's
    // portalList (used by "Close All Portals" and the terminal's "Quantity
    // of Portals Active") stays in sync - this used to only touch the
    // portal entities themselves, leaving the gun's tracking stale after
    // an auto-close.
    const removedIds = [];

    if (dualPortalIsRoot === undefined) {
      removedIds.push(dualPortal.id, portal.id);
      removePortal(dualPortal, true);
    } else {
      const rootPortal = dualPortalIsRoot ? dualPortal : portal;

      const childListJson = rootPortal.getDynamicProperty(portalDP.childList);

      const childList = childListJson ? JSON.parse(childListJson) : [];

      if (childList.length > 2) {
        const portalToRemove = dualPortalIsRoot ? portal : dualPortal;

        const idx = childList.indexOf(portalToRemove.id);

        if (idx !== -1) {
          childList.splice(idx, 1);
        }

        rootPortal.setDynamicProperty(
          portalDP.childList,
          JSON.stringify(childList),
        );

        linkPortals(childList[0], childList[childList.length - 1]);

        removedIds.push(portalToRemove.id);
        removePortal(portalToRemove, false);
      } else {
        removedIds.push(dualPortal.id, portal.id);
        removePortal(dualPortal, true);
      }
    }

    if (removedIds.length > 0 && ownerPortalGunId !== undefined) {
      const ownerItemObject = findPortalGunOwnerInventory(ownerPortalGunId);
      if (ownerItemObject) {
        const portalListJson = ownerItemObject.item.getDynamicProperty(
          portalGunDP.portalList,
        );
        const portalIds = portalListJson ? JSON.parse(portalListJson) : [];
        const remaining = portalIds.filter((id) => !removedIds.includes(id));
        if (remaining.length !== portalIds.length) {
          savePortalList(
            ownerItemObject.item,
            remaining,
            ownerItemObject.player,
            ownerItemObject.inventory,
            ownerItemObject.slotIndex,
          );
        }
      }
    }
  }, Math.max(1, Math.round(delaySeconds * 20)));
}
