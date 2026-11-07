// plugins/fart/behavior/scripts/main.ts
import {
  EntityDamageCause,
  InvalidEntityError,
  LocationInUnloadedChunkError,
  LocationOutOfWorldBoundariesError,
  system,
  world
} from "@minecraft/server";
var beanTicks = 60 * 20;
var intervalTicks = 4;
var poisonRadius = 3;
var tiers = [
  { maxDamage: 2, ticks: 8, volume: 0.8, poisonTicks: 40 },
  { maxDamage: 4, ticks: 16, volume: 1.4, poisonTicks: 60 },
  { maxDamage: 8, ticks: 32, volume: 2, poisonTicks: 100 },
  { maxDamage: Infinity, ticks: 60, volume: 3, poisonTicks: 140 }
];
var beans = /* @__PURE__ */ new Map();
var bursts = /* @__PURE__ */ new Map();
var gasPoison = /* @__PURE__ */ new Map();
var grounded = /* @__PURE__ */ new Map();
function withEntity(entity, action) {
  if (!entity.isValid) return;
  try {
    action();
  } catch (error) {
    if (!(error instanceof InvalidEntityError) && !(error instanceof LocationInUnloadedChunkError) && !(error instanceof LocationOutOfWorldBoundariesError)) {
      throw error;
    }
    console.warn(
      `[Fart] Could not update entity ${entity.id}: ${error.message}`
    );
  }
}
function backside(player) {
  const direction = player.getViewDirection();
  const horizontalLength = Math.hypot(direction.x, direction.z);
  const yaw = player.getRotation().y * Math.PI / 180;
  const x = horizontalLength > 1e-3 ? direction.x / horizontalLength : -Math.sin(yaw);
  const z = horizontalLength > 1e-3 ? direction.z / horizontalLength : Math.cos(yaw);
  return {
    x: player.location.x - x * 0.55,
    y: player.location.y + 0.75,
    z: player.location.z - z * 0.55
  };
}
function emit(burst) {
  const { player } = burst;
  const origin = backside(player);
  for (let index = 0; index <= burst.tier; index++) {
    player.dimension.spawnParticle("minecraft:basic_smoke_particle", {
      x: origin.x + (index % 2 ? 0.12 : -0.12),
      y: origin.y + index * 0.05,
      z: origin.z
    });
  }
  for (const target of player.dimension.getEntities({
    location: origin,
    maxDistance: poisonRadius
  })) {
    if (target.id === player.id || burst.poisoned.has(target.id)) continue;
    withEntity(target, () => {
      const health = target.getComponent("minecraft:health");
      if (!health || health.currentValue <= 0) return;
      burst.poisoned.add(target.id);
      if (target.getEffect("poison")) return;
      const duration = tiers[burst.tier].poisonTicks;
      target.addEffect("poison", duration, { amplifier: 0 });
      gasPoison.set(target.id, system.currentTick + duration);
    });
  }
}
function isGassy(player, includeHunger) {
  return (beans.get(player.id) ?? 0) > system.currentTick || !!player.getEffect("poison") || includeHunger && !!player.getEffect("hunger");
}
function startBurst(player, tier) {
  const health = player.getComponent("minecraft:health");
  if (!health || health.currentValue <= 0) return;
  const now = system.currentTick;
  const previous = bursts.get(player.id);
  if (previous && previous.end > now && previous.tier >= tier) return;
  const burst = {
    player,
    tier,
    end: now + tiers[tier].ticks,
    poisoned: previous && previous.end > now ? previous.poisoned : /* @__PURE__ */ new Set()
  };
  bursts.set(player.id, burst);
  player.dimension.playSound(`mbs.fart.${tier + 1}`, backside(player), {
    volume: tiers[tier].volume,
    pitch: 1
  });
  emit(burst);
}
function grantHealthEffect(player, name, duration, amplifier) {
  const existing = player.getEffect(name);
  if (existing && (existing.amplifier > amplifier || existing.amplifier === amplifier && existing.duration >= duration))
    return;
  player.addEffect(name, duration, { amplifier });
}
world.afterEvents.itemCompleteUse.subscribe(({ source, itemStack }) => {
  if (itemStack.typeId !== "mbs:tin_of_beans") return;
  withEntity(source, () => {
    beans.set(source.id, system.currentTick + beanTicks);
    grantHealthEffect(source, "regeneration", 5 * 20, 1);
    grantHealthEffect(source, "absorption", 120 * 20, 0);
    source.sendMessage(
      "[Fart] Beans eaten: health boosted! Hits and jumps make you gassy for 60 seconds."
    );
  });
});
world.afterEvents.entityHurt.subscribe(
  ({ hurtEntity: player, damage, damageSource }) => {
    if (player.typeId !== "minecraft:player" || !Number.isFinite(damage) || damage <= 0)
      return;
    withEntity(player, () => {
      const now = system.currentTick;
      if (damageSource.cause === EntityDamageCause.magic && (gasPoison.get(player.id) ?? 0) > now)
        return;
      if (!isGassy(player, true)) return;
      const tier = tiers.findIndex((settings) => damage <= settings.maxDamage);
      startBurst(player, tier);
    });
  }
);
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    withEntity(player, () => {
      const wasGrounded = grounded.get(player.id);
      const isOnGround = player.isOnGround;
      grounded.set(player.id, isOnGround);
      if (wasGrounded && !isOnGround && player.isJumping && !player.isFlying && !player.isGliding && !player.isSwimming && isGassy(player, false))
        startBurst(player, 0);
    });
  }
}, 1);
system.runInterval(() => {
  const now = system.currentTick;
  for (const entries of [beans, gasPoison]) {
    for (const [id, end] of entries) {
      if (end <= now) entries.delete(id);
    }
  }
  for (const [id, burst] of bursts) {
    if (!burst.player.isValid || burst.end <= now) {
      bursts.delete(id);
      continue;
    }
    withEntity(burst.player, () => {
      const health = burst.player.getComponent("minecraft:health");
      if (!health || health.currentValue <= 0) {
        bursts.delete(id);
        return;
      }
      emit(burst);
    });
  }
}, intervalTicks);
function clearPlayer(id) {
  beans.delete(id);
  bursts.delete(id);
  grounded.delete(id);
}
world.afterEvents.playerLeave.subscribe(
  ({ playerId }) => clearPlayer(playerId)
);
world.afterEvents.playerSpawn.subscribe(({ player }) => {
  clearPlayer(player.id);
});
