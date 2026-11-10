import { EntityDamageCause, InputPermissionCategory, system } from "@minecraft/server";
import { playerDP, portalGunDP } from "../utils/ids&variables";
import { isBasicItem } from "../utils/utils";

const SHOCK_DAMAGE = 3;
const SHOCK_PARTICLE = "ram_pg:gun_shock";
const SHOCK_SOUND = "ram_pg:gun_shock";
const SHOCK_HIDDEN_ANIMATION = "animation.ram_pg.player.shock_hidden";
const SHOCK_ANIMATION_CONTROLLER = "ram_pg_shock";
const SHOCK_TAIL_ANIMATION = "animation.ram_pg.player.shocked_tail";
const SHOCK_BODY = "ram_pg:shock_body";
const SHOCK_BODY_TICKS = 12;
const SHOCK_DROP_DISTANCE = 2.2;
const SHOCK_STUN_TICKS = 32;
const SHOCK_STUN_PROPERTY = "ram_pg:shock_stun";

export const SECURITY_PROPERTIES = [
  portalGunDP.ownerId,
  portalGunDP.ownerName,
  portalGunDP.locked,
  portalGunDP.password,
  portalGunDP.authorized,
];

export function hashPassword(text) {
  let hash = 0x811c9dc5;
  for (const char of String(text)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function readAuthorized(portalGunItem) {
  try {
    const list = JSON.parse(portalGunItem.getDynamicProperty(portalGunDP.authorized) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function writeAuthorized(portalGunItem, list) {
  portalGunItem.setDynamicProperty(portalGunDP.authorized, JSON.stringify(list));
}

export function isOwner(player, portalGunItem) {
  return portalGunItem.getDynamicProperty(portalGunDP.ownerId) === player.id;
}

export function canManageGun(player, portalGunItem) {
  if (isBasicItem(portalGunItem)) return true;
  const ownerId = portalGunItem.getDynamicProperty(portalGunDP.ownerId);
  return ownerId === undefined || ownerId === player.id;
}

export function isLocked(portalGunItem) {
  return portalGunItem.getDynamicProperty(portalGunDP.locked) === true;
}

export function hasPassword(portalGunItem) {
  return typeof portalGunItem.getDynamicProperty(portalGunDP.password) === "string";
}

export function checkPassword(portalGunItem, text) {
  return hasPassword(portalGunItem) && portalGunItem.getDynamicProperty(portalGunDP.password) === hashPassword(text);
}

export function claimOwnership(player, portalGunItem) {
  if (portalGunItem.getDynamicProperty(portalGunDP.ownerId) !== undefined) return false;
  portalGunItem.setDynamicProperty(portalGunDP.ownerId, player.id);
  portalGunItem.setDynamicProperty(portalGunDP.ownerName, player.name);
  return true;
}

export function transferOwnership(portalGunItem, player) {
  portalGunItem.setDynamicProperty(portalGunDP.ownerId, player.id);
  portalGunItem.setDynamicProperty(portalGunDP.ownerName, player.name);
  writeAuthorized(
    portalGunItem,
    readAuthorized(portalGunItem).filter((entry) => entry.id !== player.id),
  );
}

export function canUseGun(player, portalGunItem) {
  if (isBasicItem(portalGunItem) || !isLocked(portalGunItem) || isOwner(player, portalGunItem)) return true;
  return readAuthorized(portalGunItem).some((entry) => entry.id === player.id);
}

export function authorize(portalGunItem, player) {
  const list = readAuthorized(portalGunItem).filter((entry) => entry.id !== player.id);
  list.push({ id: player.id, name: player.name });
  writeAuthorized(portalGunItem, list);
}

export function guardGunAccess(player, portalGunItem, slotIndex, promptPassword) {
  const container = player.getComponent("inventory")?.container;
  if (claimOwnership(player, portalGunItem) && container) {
    container.setItem(slotIndex, portalGunItem);
  }
  if (canUseGun(player, portalGunItem)) return true;
  if (hasPassword(portalGunItem) && promptPassword) {
    promptPassword(player, portalGunItem, slotIndex);
  } else {
    shockPlayer(player, slotIndex);
  }
  return false;
}

function setMovement(player, enabled) {
  for (const category of [InputPermissionCategory.Movement, InputPermissionCategory.Jump]) {
    try {
      player.inputPermissions.setPermissionCategory(category, enabled);
    } catch {}
  }
}

export function releaseShockStun(player) {
  if (!player.isValid) return;
  if (!player.getDynamicProperty(playerDP.blending)) setMovement(player, true);
  player.setDynamicProperty(SHOCK_STUN_PROPERTY, undefined);
}

export function hasShockStun(player) {
  return player.getDynamicProperty(SHOCK_STUN_PROPERTY) !== undefined;
}

function stunPlayer(player) {
  const until = system.currentTick + SHOCK_STUN_TICKS;
  player.setDynamicProperty(SHOCK_STUN_PROPERTY, until);
  setMovement(player, false);
  system.runTimeout(() => {
    if (!player.isValid) return;
    const current = player.getDynamicProperty(SHOCK_STUN_PROPERTY);
    if (typeof current === "number" && current > system.currentTick) return;
    releaseShockStun(player);
  }, SHOCK_STUN_TICKS);
}

const activeShocks = new Map();

function rayDistance(dimension, origin, direction, maxDistance) {
  try {
    const hit = dimension.getBlockFromRay(origin, direction, {
      includeLiquidBlocks: false,
      includePassableBlocks: false,
      maxDistance,
    });
    if (!hit) return maxDistance;
    const { location } = hit.block;
    const { faceLocation } = hit;
    return Math.hypot(
      location.x + faceLocation.x - origin.x,
      location.y + faceLocation.y - origin.y,
      location.z + faceLocation.z - origin.z,
    );
  } catch {
    return maxDistance;
  }
}

function dropSpot(dimension, body, forward) {
  const directions = [forward, { x: -forward.x, z: -forward.z }, { x: forward.z, z: -forward.x }, { x: -forward.z, z: forward.x }];
  let best = { distance: -1, direction: forward };
  for (const direction of directions) {
    const distance = rayDistance(dimension, body, { x: direction.x, y: 0, z: direction.z }, SHOCK_DROP_DISTANCE + 0.4) - 0.4;
    if (distance > best.distance) best = { distance, direction };
    if (distance >= SHOCK_DROP_DISTANCE) break;
  }
  const distance = Math.max(0.5, Math.min(SHOCK_DROP_DISTANCE, best.distance));
  return { x: body.x + best.direction.x * distance, y: body.y, z: body.z + best.direction.z * distance };
}

function holdShockedPlayer(player, token) {
  let ticks = 0;
  const run = system.runInterval(() => {
    try {
      ticks++;
      const stop =
        ticks > SHOCK_BODY_TICKS ||
        !player.isValid ||
        activeShocks.get(player.id) !== token ||
        player.dimension.id !== token.dimensionId ||
        (player.getComponent("minecraft:health")?.currentValue ?? 1) <= 0;
      if (stop) {
        system.clearRun(run);
        return;
      }
      const { x, y, z } = player.location;
      const { spot } = token;
      if (Math.abs(x - spot.x) > 0.05 || Math.abs(y - spot.y) > 0.05 || Math.abs(z - spot.z) > 0.05) {
        player.teleport(spot, { keepVelocity: false });
      }
    } catch {
      system.clearRun(run);
    }
  }, 1);
}

function revealShockedPlayer(player, token) {
  try {
    if (token.body?.isValid) token.body.remove();
  } catch {}
  if (!player.isValid || activeShocks.get(player.id) !== token) return;
  activeShocks.delete(player.id);
  player.playAnimation(SHOCK_TAIL_ANIMATION, { controller: SHOCK_ANIMATION_CONTROLLER, blendOutTime: 0.3 });
}

export function shockPlayer(player, slotIndex) {
  const container = player.getComponent("inventory")?.container;
  const item = container?.getItem(slotIndex);
  const dimension = player.dimension;
  const spot = { x: player.location.x, y: player.location.y, z: player.location.z };
  const body = { x: spot.x, y: spot.y + 1, z: spot.z };
  const rotation = player.getRotation();
  const yaw = (rotation.y * Math.PI) / 180;
  const forward = { x: -Math.sin(yaw), z: Math.cos(yaw) };

  if (item && container) {
    container.setItem(slotIndex, undefined);
    dimension.spawnItem(item, dropSpot(dimension, body, forward));
  }

  const token = { spot, dimensionId: dimension.id, body: undefined };
  try {
    token.body = dimension.spawnEntity(SHOCK_BODY, spot, { initialRotation: rotation.y });
  } catch {}
  activeShocks.set(player.id, token);
  holdShockedPlayer(player, token);

  stunPlayer(player);
  player.playAnimation(SHOCK_HIDDEN_ANIMATION, { controller: SHOCK_ANIMATION_CONTROLLER, blendOutTime: 0 });
  try {
    player.applyDamage(SHOCK_DAMAGE, { cause: EntityDamageCause.lightning });
  } catch {}
  try {
    player.runCommand("camerashake add @s 0.8 0.8 positional");
  } catch {}
  dimension.playSound(SHOCK_SOUND, body);

  for (let i = 0; i < 6; i++) {
    system.runTimeout(() => {
      try {
        dimension.spawnParticle(SHOCK_PARTICLE, body);
      } catch {}
    }, i * 5);
  }
  system.runTimeout(() => revealShockedPlayer(player, token), SHOCK_BODY_TICKS);
}
