import {
  system,
  EasingType,
  EntityDamageCause,
  GameMode,
  InputPermissionCategory,
  MolangVariableMap,
} from "@minecraft/server";
import {
  playerDP,
  portalDP,
  portalGunDP,
  portalSP,
} from "../utils/ids&variables";
import {
  findPortalGunOwnerInventory,
  removePortal,
  savePortalList,
} from "../utils/utils";

const ENTER_TICKS = 8;
const MOB_BLOOD_DELAY_TICKS = 10;
const SHRED_DELAY_TICKS = 5;
const SHRED_SOUND_GAP_TICKS = 4;
const DROP_GRACE_TICKS = 60;

// How long a Blender Dimension portal bleeds before the victim dies.
export const BLENDER_TICKS = 20;

const VANISH_ANIMATION = "animation.ram_pg.blender.vanish";
const HIDDEN_ANIMATION = "animation.ram_pg.blender.hidden";
const RESET_ANIMATION = "animation.ram_pg.player.reset";
const PASS_ANIMATION = "animation.ram_pg.portal.pass";

const CAMERA_DISTANCE = 4;
const MIN_CAMERA_DISTANCE = 1;
const CAMERA_SIDE = 0.8;
const CAMERA_HEAD_CLEARANCE = 0.6;
const VEIL_PARTICLE = "ram_pg:blender_red_veil";
const VEIL_DISTANCE = 0.6;
const VEIL_TAIL_SECONDS = 0.8;

const HIT_TICKS = 10;
const HIT_DAMAGE = 2;

const BONE = { r: 0.85, g: 0.83, b: 0.75 };
const DARK_BONE = { r: 0.24, g: 0.24, b: 0.26 };
const IRON = { r: 0.72, g: 0.72, b: 0.7 };
const SNOW = { r: 0.95, g: 0.97, b: 1 };
const WOOD = { r: 0.6, g: 0.45, b: 0.28 };
const LIQUID_COLORS = {
  "minecraft:slime": { r: 0.4, g: 0.78, b: 0.3 },
  "minecraft:magma_cube": { r: 0.95, g: 0.42, b: 0.08 },
  "minecraft:sulfur_cube": { r: 0.86, g: 0.92, b: 0.48 },
  "minecraft:warden": { r: 0.15, g: 0.75, b: 1 },
};
const GLOWING_TYPES = new Set(["minecraft:warden"]);
const DUST_COLORS = {
  "minecraft:wither_skeleton": DARK_BONE,
  "minecraft:wither": DARK_BONE,
  "minecraft:skeleton_horse": BONE,
  "minecraft:copper_golem": { r: 0.75, g: 0.45, b: 0.3 },
  "minecraft:creaking": { r: 0.42, g: 0.34, b: 0.28 },
  "minecraft:blaze": { r: 1, g: 0.65, b: 0.15 },
};
const DUST_FAMILIES = [
  ["skeleton", BONE],
  ["irongolem", IRON],
  ["snowgolem", SNOW],
  ["inanimate", WOOD],
];
const NEUTRAL_RESIDUE = { r: 0.55, g: 0.55, b: 0.58 };
const RED_BLOOD_TYPES = new Set([
  "minecraft:player",
  "minecraft:villager",
  "minecraft:villager_v2",
  "minecraft:wandering_trader",
  "minecraft:pillager",
  "minecraft:vindicator",
  "minecraft:evocation_illager",
  "minecraft:witch",
  "minecraft:ravager",
  "minecraft:zombie",
  "minecraft:husk",
  "minecraft:drowned",
  "minecraft:zombie_villager",
  "minecraft:zombie_villager_v2",
  "minecraft:zombie_pigman",
  "minecraft:zombie_horse",
  "minecraft:piglin",
  "minecraft:piglin_brute",
  "minecraft:hoglin",
  "minecraft:zoglin",
  "minecraft:cow",
  "minecraft:mooshroom",
  "minecraft:pig",
  "minecraft:sheep",
  "minecraft:goat",
  "minecraft:horse",
  "minecraft:donkey",
  "minecraft:mule",
  "minecraft:llama",
  "minecraft:trader_llama",
  "minecraft:camel",
  "minecraft:wolf",
  "minecraft:cat",
  "minecraft:ocelot",
  "minecraft:fox",
  "minecraft:rabbit",
  "minecraft:panda",
  "minecraft:polar_bear",
  "minecraft:bat",
  "minecraft:armadillo",
  "minecraft:sniffer",
  "minecraft:dolphin",
  "minecraft:chicken",
  "minecraft:parrot",
  "minecraft:turtle",
  "minecraft:frog",
  "minecraft:tadpole",
  "minecraft:axolotl",
  "minecraft:cod",
  "minecraft:salmon",
  "minecraft:pufferfish",
  "minecraft:tropicalfish",
]);
const EFFECTLESS_TYPES = new Set([
  "minecraft:breeze",
  "minecraft:vex",
  "minecraft:allay",
]);
const SHRED_COLORS = [
  ["netherite", { r: 0.3, g: 0.26, b: 0.27 }],
  ["diamond", { r: 0.4, g: 0.9, b: 0.86 }],
  ["emerald", { r: 0.25, g: 0.85, b: 0.45 }],
  ["gold", { r: 0.98, g: 0.8, b: 0.25 }],
  ["copper", { r: 0.8, g: 0.45, b: 0.3 }],
  ["iron", IRON],
  ["redstone", { r: 0.8, g: 0.1, b: 0.06 }],
  ["lapis", { r: 0.2, g: 0.35, b: 0.85 }],
  ["amethyst", { r: 0.65, g: 0.45, b: 0.9 }],
  ["bone", BONE],
  ["wool", SNOW],
  ["leather", { r: 0.6, g: 0.38, b: 0.22 }],
  ["log", WOOD],
  ["planks", WOOD],
  ["wood", WOOD],
  ["stick", WOOD],
];
const DEFAULT_SHRED_COLOR = { r: 0.55, g: 0.52, b: 0.48 };

// Where each portal plane is drawn relative to the entity origin
// (portal.geo.json + the up/down orientation animations).
const WALL_PLANE_OFFSET = 6 / 16;
const FLOOR_PLANE_HEIGHT = 3 / 16;
const CEILING_PLANE_HEIGHT = 14 / 16;
const PORTAL_CENTER_HEIGHT = 13 / 16;
const PLANE_NUDGE = 0.1;

const X_AXIS = { x: 1, y: 0, z: 0 };
const Z_AXIS = { x: 0, y: 0, z: 1 };

// playerId -> { runId, portal, portalId, bloody } of the player's sequence
const victims = new Map();

const bloodyPortals = new Map();

const dropGrace = new Map();

const lastShredSounds = new Map();

/**
 * Every mob gets blended except the Ender Dragon, and items get shredded. XP,
 * projectiles and vehicles are ignored.
 *
 * @param {Entity} entity
 * @return {boolean}
 */
export function canBeBlended(entity) {
  if (victims.has(entity.id)) return false;
  if (entity.typeId === "minecraft:item") return true;
  if (entity.typeId === "minecraft:ender_dragon") return false;
  if (!(entity.getComponent("minecraft:health")?.currentValue > 0)) {
    return false;
  }

  if (entity.typeId === "minecraft:player") {
    return entity.getGameMode() !== GameMode.Spectator;
  }

  if (entity.hasComponent("minecraft:movement")) return true;

  const typeFamily = entity.getComponent("minecraft:type_family");
  return typeFamily?.hasTypeFamily("mob") ?? false;
}

/**
 * Mobs vanish on contact and the portal starts bleeding MOB_BLOOD_DELAY_TICKS
 * later. Players play their portal_in animation (or get pulled in when they
 * walk in backwards) while a camera aimed at the portal eases out of their
 * head; once inside they vanish, the portal bleeds behind a light red veil
 * and then they die. Items get shredded and spat back out as fragments,
 * except a dead victim's drops for DROP_GRACE_TICKS.
 *
 * @param {Entity} portal - Portal aimed at the Blender Dimension.
 * @param {Entity} entity - Entity that went through it.
 */
export function startBlending(portal, entity) {
  if (entity.typeId === "minecraft:item") {
    shredItem(portal, entity);
    return;
  }

  // Taken before the victim moves, so the blood always comes out where it
  // went in.
  const plane = getBloodPlane(portal, entity);
  const pool = getPoolLocation(portal, entity);
  const effect = getEffect(entity);

  if (entity.typeId === "minecraft:player") {
    startPlayerBlending(portal, entity, plane, pool, effect);
  } else {
    startMobBlending(portal, entity, plane, pool, effect);
  }
}

function startMobBlending(portal, entity, plane, pool, effect) {
  const dimension = entity.dimension;
  const blood = { portal, portalId: portal.id, bloody: false };

  entity.remove();
  portal.playAnimation(PASS_ANIMATION);

  system.runTimeout(() => {
    if (!portal.isValid) return;
    startBleeding(blood, dimension, plane, pool, effect);

    system.runTimeout(() => {
      stopBleeding(blood);
      finishBleeding(portal, dimension, plane, pool, effect);
    }, BLENDER_TICKS);
  }, MOB_BLOOD_DELAY_TICKS);
}

function shredItem(portal, item) {
  if ((dropGrace.get(portal.id) ?? 0) > system.currentTick) return;

  const stack = item.getComponent("minecraft:item")?.itemStack;
  const plane = getBloodPlane(portal, item);
  const dimension = item.dimension;
  const color = getShredColor(stack?.typeId ?? "");
  const amount = stack?.amount ?? 1;

  item.remove();
  portal.playAnimation(PASS_ANIMATION);
  playShredSound(portal, "block.grindstone.use", plane.origin);

  system.runTimeout(() => {
    if (!portal.isValid) return;

    playShredSound(portal, "random.break", plane.origin);
    spawnBlood(dimension, "ram_pg:blender_shred", plane.origin, {
      axes: plane.axes,
      intensity: 1 + Math.min(amount, 64) / 16,
      color,
    });
    spawnBlood(dimension, "ram_pg:blender_blood_mist", plane.origin, {
      duration: 0.2,
      intensity: 3,
      color,
    });
  }, SHRED_DELAY_TICKS);
}

function getShredColor(typeId) {
  const match = SHRED_COLORS.find(([word]) => typeId.includes(word));
  return match ? match[1] : DEFAULT_SHRED_COLOR;
}

function playShredSound(portal, sound, location) {
  const key = `${portal.id}:${sound}`;
  const last = lastShredSounds.get(key);
  if (last !== undefined && system.currentTick - last < SHRED_SOUND_GAP_TICKS) {
    return;
  }

  lastShredSounds.set(key, system.currentTick);
  portal.dimension.playSound(sound, location);
}

function startPlayerBlending(portal, player, plane, pool, effect) {
  const playerId = player.id;
  const dimensionId = player.dimension.id;
  const pin = { ...player.location };
  const enterAnimation = getEnterAnimation(portal, player, plane);
  const entry = enterAnimation
    ? undefined
    : getEntryPoint(portal, player, plane);
  const camera = getCameraLocation(portal, player, plane);
  const victim = {
    runId: undefined,
    portal,
    portalId: portal.id,
    bloody: false,
  };

  let ticks = 0;
  const step = () => {
    ticks++;

    if (ticks === 1) {
      player.camera.setCamera("minecraft:free", {
        location: camera,
        facingLocation: plane.origin,
        easeOptions: {
          easeTime: (ENTER_TICKS - 1) / 20,
          easeType: EasingType.OutSine,
        },
      });
    }

    if (ticks < ENTER_TICKS) {
      const t = ticks / (ENTER_TICKS - 1);
      holdAt(player, entry ? lerp(pin, entry, t * t) : pin);
      if (ticks === ENTER_TICKS - 1) {
        player.addEffect("invisibility", BLENDER_TICKS + 40, {
          showParticles: false,
        });
      }
      return;
    }

    if (ticks === ENTER_TICKS) {
      if (enterAnimation) player.playAnimation(HIDDEN_ANIMATION);
      holdAt(player, pin);
      startBleeding(victim, player.dimension, plane, pool, effect);
      player.runCommand(
        `camerashake add @s 0.4 ${BLENDER_TICKS / 20} positional`,
      );
      spawnVeil(player, camera, plane.origin);
      return;
    }

    const bleedTicks = ticks - ENTER_TICKS;

    if (bleedTicks >= BLENDER_TICKS) {
      forgetVictim(playerId);
      finishBleeding(portal, player.dimension, plane, pool, effect);
      killPlayer(player);
      return;
    }

    if (bleedTicks % HIT_TICKS === 1) hit(player);

    holdAt(player, pin);
  };

  victim.runId = system.runInterval(() => {
    // Left the game, despawned or got moved to another dimension.
    if (!player.isValid || player.dimension.id !== dimensionId) {
      forgetVictim(playerId);
      if (player.isValid) releaseBlenderLock(player);
      return;
    }

    try {
      step();
    } catch (error) {
      forgetVictim(playerId);
      releaseBlenderLock(player);
      throw error;
    }
  }, 1);
  victims.set(playerId, victim);

  player.setDynamicProperty(playerDP.blending, true);
  player.inputPermissions.setPermissionCategory(
    InputPermissionCategory.Movement,
    false,
  );
  player.playAnimation(enterAnimation ?? VANISH_ANIMATION);
  portal.playAnimation(PASS_ANIMATION);
  player.camera.setCamera("minecraft:free", {
    location: getCameraStart(player, camera),
    rotation: player.getRotation(),
  });
}

function startBleeding(blood, dimension, plane, pool, effect) {
  const seconds = BLENDER_TICKS / 20;

  dimension.playSound("ram_pg:blender", plane.origin);
  if (effect?.kind === "blood") {
    blood.bloody = true;
    setBloody(blood.portal, blood.portalId, 1);
  }
  if (!effect) return;

  const grinding = effect.kind === "dust";
  spawnBlood(
    dimension,
    grinding
      ? "ram_pg:blender_dust"
      : fluidParticle(effect, "ram_pg:blender_blood_spray"),
    plane.origin,
    { axes: plane.axes, duration: seconds, color: effect.color },
  );
  spawnBlood(
    dimension,
    fluidParticle(effect, "ram_pg:blender_blood_mist"),
    plane.origin,
    { duration: seconds, color: effect.color },
  );
  if (pool && !grinding) {
    spawnBlood(
      dimension,
      fluidParticle(effect, "ram_pg:blender_blood_pool"),
      pool,
      { splats: 4, color: effect.color },
    );
  }
}

function stopBleeding(blood) {
  if (blood.bloody) setBloody(blood.portal, blood.portalId, -1);
  blood.bloody = false;
}

/**
 * Final splash out of the portal and a bigger pool. An auto-close portal
 * shuts right after.
 *
 * @param {Entity} portal
 * @param {Dimension} dimension
 * @param {{origin: Vector3, axes: Object}} plane - From getBloodPlane.
 * @param {Vector3|undefined} pool - From getPoolLocation.
 * @param {{kind: string, color?: Object}|undefined} effect - From getEffect.
 */
function finishBleeding(portal, dimension, plane, pool, effect) {
  if (!portal.isValid) return;

  if (effect?.kind === "dust") {
    spawnBlood(dimension, "ram_pg:blender_dust", plane.origin, {
      axes: plane.axes,
      duration: 0.15,
      intensity: 6,
      color: effect.color,
    });
  } else if (effect) {
    spawnBlood(
      dimension,
      fluidParticle(effect, "ram_pg:blender_blood_burst"),
      plane.origin,
      { axes: plane.axes, color: effect.color },
    );
  }
  if (effect) {
    spawnBlood(
      dimension,
      fluidParticle(effect, "ram_pg:blender_blood_mist"),
      plane.origin,
      { duration: 0.25, intensity: 6, color: effect.color },
    );
    if (pool) {
      spawnBlood(
        dimension,
        fluidParticle(effect, "ram_pg:blender_blood_pool"),
        pool,
        { splats: effect.kind === "dust" ? 5 : 8, color: effect.color },
      );
    }
  }

  portal.playAnimation(PASS_ANIMATION);

  if (portal.getDynamicProperty(portalDP.autoClose)) {
    system.runTimeout(() => {
      if (portal.isValid) closeBlenderPortal(portal);
    }, 20);
  }
}

function fluidParticle(effect, particle) {
  return effect.glow ? `${particle}_glow` : particle;
}

function killPlayer(player) {
  unlockPlayer(player);
  player.kill();

  system.runTimeout(() => {
    if (!player.isValid || victims.has(player.id)) return;
    if (player.getComponent("minecraft:health")?.currentValue > 0) {
      releaseBlenderLock(player);
    }
  }, 2);
}

/**
 * Gives a player their movement, body and camera back. Runs on spawn (a
 * player that died in the portal keeps watching it until they respawn), when
 * the scripts load and whenever a blend ends early. The flag is only cleared
 * once everything was restored, so a failed attempt is retried later.
 *
 * @param {Player} player
 */
export function releaseBlenderLock(player) {
  if (!player.getDynamicProperty(playerDP.blending)) return;

  unlockPlayer(player);
  player.playAnimation(RESET_ANIMATION);
  player.camera.clear();
  player.setDynamicProperty(playerDP.blending, undefined);
}

function unlockPlayer(player) {
  player.inputPermissions.setPermissionCategory(
    InputPermissionCategory.Movement,
    true,
  );
  player.runCommand("camerashake stop @s");
}

/**
 * Cancels the sequence of a player that died some other way first.
 *
 * @param {Entity} deadEntity
 */
export function onBlenderVictimDie(deadEntity) {
  forgetVictim(deadEntity.id);
}

function forgetVictim(entityId) {
  const victim = victims.get(entityId);
  if (victim === undefined) return;

  system.clearRun(victim.runId);
  victims.delete(entityId);
  stopBleeding(victim);
  dropGrace.set(victim.portalId, system.currentTick + DROP_GRACE_TICKS);
}

function setBloody(portal, portalId, change) {
  const count = (bloodyPortals.get(portalId) ?? 0) + change;
  if (count > 0) bloodyPortals.set(portalId, count);
  else bloodyPortals.delete(portalId);

  if (portal.isValid) portal.setProperty(portalSP.blending, count > 0);
}

function getEffect(entity) {
  const liquid = LIQUID_COLORS[entity.typeId];
  if (liquid) {
    return {
      kind: "liquid",
      color: liquid,
      glow: GLOWING_TYPES.has(entity.typeId),
    };
  }

  const dust = DUST_COLORS[entity.typeId];
  if (dust) return { kind: "dust", color: dust };
  if (EFFECTLESS_TYPES.has(entity.typeId)) return undefined;

  const typeFamily = entity.getComponent("minecraft:type_family");
  const family = DUST_FAMILIES.find(([name]) =>
    typeFamily?.hasTypeFamily(name),
  );
  if (family) return { kind: "dust", color: family[1] };
  return RED_BLOOD_TYPES.has(entity.typeId) ? { kind: "blood" } : { kind: "dust", color: NEUTRAL_RESIDUE };
}

function hit(entity) {
  const health = entity.getComponent("minecraft:health")?.currentValue ?? 0;
  const damage = Math.min(HIT_DAMAGE, health - 1);
  if (damage > 0) {
    entity.applyDamage(damage, { cause: EntityDamageCause.entityAttack });
  }
}

function holdAt(entity, location) {
  const { x, y, z } = entity.location;
  if (
    Math.abs(x - location.x) > 0.05 ||
    Math.abs(y - location.y) > 0.05 ||
    Math.abs(z - location.z) > 0.05
  ) {
    entity.teleport(location);
  }
}

function lerp(from, to, t) {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    z: from.z + (to.z - from.z) * t,
  };
}

function normalize({ x, y, z }) {
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

function getEnterAnimation(portal, player, plane) {
  const orientation = portal.getProperty(portalSP.orientation);

  if (orientation === 1) return "animation.ram_pg.player.portal_in_up";
  if (orientation === 2) {
    return player.isSprinting && player.isOnGround
      ? "animation.ram_pg.player.portal_in_down_dive"
      : "animation.ram_pg.player.portal_in_down";
  }

  const yaw = (player.getRotation().y * Math.PI) / 180;
  const { n } = plane.axes;
  const facing = -Math.sin(yaw) * n.x + Math.cos(yaw) * n.z < 0;
  return facing ? "animation.ram_pg.player.portal_in_front" : undefined;
}

function getEntryPoint(portal, player, plane) {
  if (portal.getProperty(portalSP.orientation) !== 0) return undefined;

  const { origin, axes } = plane;
  return {
    x: origin.x - axes.n.x * PLANE_NUDGE,
    y: player.location.y,
    z: origin.z - axes.n.z * PLANE_NUDGE,
  };
}

function getCameraLocation(portal, player, plane) {
  const orientation = portal.getProperty(portalSP.orientation);
  const yaw = (player.getRotation().y * Math.PI) / 180;
  const back = { x: Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
  const right = { x: -back.z, y: 0, z: back.x };
  const { origin, axes } = plane;

  let base = { x: axes.n.x, y: 0.45, z: axes.n.z };
  let side = axes.v;
  if (orientation === 2) {
    base = { x: back.x * 0.6, y: 1, z: back.z * 0.6 };
    side = right;
  } else if (orientation === 1) {
    base = { x: back.x, y: -0.4, z: back.z };
    side = right;
  }

  let best;
  for (const sign of [1, -1]) {
    const direction = normalize({
      x: base.x + side.x * CAMERA_SIDE * sign,
      y: base.y + side.y * CAMERA_SIDE * sign,
      z: base.z + side.z * CAMERA_SIDE * sign,
    });
    const distance = getClearDistance(player.dimension, origin, direction);
    if (!best || distance > best.distance) best = { direction, distance };
  }

  return {
    x: origin.x + best.direction.x * best.distance,
    y: origin.y + best.direction.y * best.distance,
    z: origin.z + best.direction.z * best.distance,
  };
}

function getCameraStart(player, camera) {
  const eye = player.getHeadLocation();
  const toCamera = normalize({
    x: camera.x - eye.x,
    y: camera.y - eye.y,
    z: camera.z - eye.z,
  });

  return {
    x: eye.x + toCamera.x * CAMERA_HEAD_CLEARANCE,
    y: eye.y + toCamera.y * CAMERA_HEAD_CLEARANCE,
    z: eye.z + toCamera.z * CAMERA_HEAD_CLEARANCE,
  };
}

function getClearDistance(dimension, origin, direction) {
  const hit = dimension.getBlockFromRay(origin, direction, {
    maxDistance: CAMERA_DISTANCE,
    includeLiquidBlocks: false,
    includePassableBlocks: false,
  });
  if (!hit) return CAMERA_DISTANCE;

  const { location } = hit.block;
  const reach = Math.hypot(
    location.x + hit.faceLocation.x - origin.x,
    location.y + hit.faceLocation.y - origin.y,
    location.z + hit.faceLocation.z - origin.z,
  );
  return Math.max(MIN_CAMERA_DISTANCE, reach - 0.4);
}

function spawnVeil(player, camera, focus) {
  const toFocus = normalize({
    x: focus.x - camera.x,
    y: focus.y - camera.y,
    z: focus.z - camera.z,
  });
  const variables = new MolangVariableMap();
  variables.setFloat(
    "variable.duration",
    BLENDER_TICKS / 20 + VEIL_TAIL_SECONDS,
  );

  player.spawnParticle(
    VEIL_PARTICLE,
    {
      x: camera.x + toFocus.x * VEIL_DISTANCE,
      y: camera.y + toFocus.y * VEIL_DISTANCE,
      z: camera.z + toFocus.z * VEIL_DISTANCE,
    },
    variables,
  );
}

export function clearStaleBlood(portal) {
  if (bloodyPortals.has(portal.id)) return;
  if (portal.getProperty(portalSP.blending)) {
    portal.setProperty(portalSP.blending, false);
  }
}

/**
 * Where the blood comes out (the middle of a standing portal, or right
 * under/over the victim on a floor/ceiling portal), plus the plane's axes for
 * the spray: n points out of the portal toward the victim, u/v span the plane.
 *
 * @param {Entity} portal
 * @param {Entity} entity
 * @return {{origin: Vector3, axes: {u: Vector3, v: Vector3, n: Vector3}}}
 */
function getBloodPlane(portal, entity) {
  const orientation = portal.getProperty(portalSP.orientation);
  const p = entity.location;
  const o = portal.location;

  if (orientation === 2) {
    return {
      origin: { x: p.x, y: o.y + FLOOR_PLANE_HEIGHT + 0.08, z: p.z },
      axes: { u: X_AXIS, v: Z_AXIS, n: { x: 0, y: 1, z: 0 } },
    };
  }

  if (orientation === 1) {
    return {
      origin: { x: p.x, y: o.y + CEILING_PLANE_HEIGHT - 0.08, z: p.z },
      axes: { u: X_AXIS, v: Z_AXIS, n: { x: 0, y: -1, z: 0 } },
    };
  }

  // Wall portal: same front direction the exit rotation uses in teleport.js.
  const angle = (portal.getProperty(portalSP.rotation) * Math.PI) / 2;
  const frontX = -Math.sin(angle);
  const frontZ = Math.cos(angle);

  const distanceToPlane =
    (p.x - o.x) * frontX + (p.z - o.z) * frontZ + WALL_PLANE_OFFSET;
  const side = distanceToPlane >= 0 ? 1 : -1;
  const n = { x: frontX * side, y: 0, z: frontZ * side };

  // Nudged out of the plane so droplets don't spawn inside the wall.
  return {
    origin: {
      x: o.x - frontX * WALL_PLANE_OFFSET + n.x * PLANE_NUDGE,
      y: o.y + PORTAL_CENTER_HEIGHT,
      z: o.z - frontZ * WALL_PLANE_OFFSET + n.z * PLANE_NUDGE,
    },
    axes: { u: { x: 0, y: 1, z: 0 }, v: { x: n.z, y: 0, z: -n.x }, n },
  };
}

/**
 * Where the blood pools under the victim: on top of a floor portal (it would
 * hide a pool on the floor under it), otherwise on the first block below.
 *
 * @param {Entity} portal
 * @param {Entity} entity
 * @return {Vector3|undefined} Undefined when there's no floor close enough.
 */
function getPoolLocation(portal, entity) {
  const p = entity.location;

  if (portal.getProperty(portalSP.orientation) === 2) {
    return { x: p.x, y: portal.location.y + FLOOR_PLANE_HEIGHT, z: p.z };
  }

  const floor = entity.dimension.getBlockBelow(p, { maxDistance: 6 });
  if (!floor) return undefined;

  return { x: p.x, y: floor.location.y + 1, z: p.z };
}

/**
 * @param {Dimension} dimension
 * @param {string} effect
 * @param {Vector3} location
 * @param {{axes?: Object, duration?: number, intensity?: number, splats?: number, color?: Object}} [inputs]
 */
function spawnBlood(dimension, effect, location, inputs = {}) {
  const { axes, duration, intensity, splats, color } = inputs;
  const variables = new MolangVariableMap();

  if (duration !== undefined) variables.setFloat("variable.duration", duration);
  if (intensity !== undefined) {
    variables.setFloat("variable.intensity", intensity);
  }
  if (splats !== undefined) variables.setFloat("variable.splats", splats);
  if (color) {
    variables.setFloat("variable.fluid_r", color.r);
    variables.setFloat("variable.fluid_g", color.g);
    variables.setFloat("variable.fluid_b", color.b);
  }
  if (axes) {
    for (const [name, axis] of Object.entries(axes)) {
      variables.setFloat(`variable.${name}x`, axis.x);
      variables.setFloat(`variable.${name}y`, axis.y);
      variables.setFloat(`variable.${name}z`, axis.z);
    }
  }

  dimension.spawnParticle(effect, location, variables);
}

/**
 * Same clean-up as an auto-close after a teleport: close the portal and drop
 * it from its gun's portal list.
 *
 * @param {Entity} portal
 */
function closeBlenderPortal(portal) {
  const portalId = portal.id;
  const ownerId = portal.getDynamicProperty(portalDP.ownerPortalGun);
  removePortal(portal, false);

  const owner =
    ownerId !== undefined ? findPortalGunOwnerInventory(ownerId) : undefined;
  if (!owner) return;

  const listJson = owner.item.getDynamicProperty(portalGunDP.portalList);
  const portalIds = listJson ? JSON.parse(listJson) : [];
  const remaining = portalIds.filter((id) => id !== portalId);

  if (remaining.length !== portalIds.length) {
    savePortalList(
      owner.item,
      remaining,
      owner.player,
      owner.inventory,
      owner.slotIndex,
    );
  }
}
