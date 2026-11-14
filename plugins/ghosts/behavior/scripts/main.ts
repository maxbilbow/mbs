import {
  EntityDamageCause,
  EquipmentSlot,
  GameMode,
  ItemStack,
  LocationInUnloadedChunkError,
  LocationOutOfWorldBoundariesError,
  Player,
  system,
  world,
  type Block,
  type Dimension,
  type Entity,
} from "@minecraft/server";
import {
  attuned,
  canFight,
  canSpawn,
  darkStorm,
  ectoplasmSurface,
  fullArmor,
  ids,
  platformTop,
  spectralTool,
  type Gear,
  type Point,
} from "./model.ts";

declare const console: { warn(message: string): void };

const positions = new Map<string, { point: Point; dimension: string }>();
const attacks = new Map<string, number>();
const notices = new Map<string, number>();
let spawnCursor = 0;

function report(context: string, error: unknown) {
  console.warn(
    `[Ghosts] ${context}: ${error instanceof Error ? error.message : String(error)}`,
  );
}

function blockAt(dimension: Dimension, point: Point): Block | undefined {
  if (
    point.y < dimension.heightRange.min ||
    point.y >= dimension.heightRange.max
  )
    return undefined;
  try {
    return dimension.getBlock(point);
  } catch (error) {
    if (
      error instanceof LocationInUnloadedChunkError ||
      error instanceof LocationOutOfWorldBoundariesError
    )
      return undefined;
    throw error;
  }
}

function gear(player: Player): Gear {
  const equipment = player.getComponent("minecraft:equippable");
  if (!equipment) throw new Error("Player equipment is unavailable.");
  return {
    head: equipment.getEquipment(EquipmentSlot.Head)?.typeId,
    chest: equipment.getEquipment(EquipmentSlot.Chest)?.typeId,
    legs: equipment.getEquipment(EquipmentSlot.Legs)?.typeId,
    feet: equipment.getEquipment(EquipmentSlot.Feet)?.typeId,
    hand: equipment.getEquipment(EquipmentSlot.Mainhand)?.typeId,
  };
}

function playable(player: Player): boolean {
  return (
    player.getGameMode() === GameMode.Survival ||
    player.getGameMode() === GameMode.Creative
  );
}

function notify(player: Player, text: string) {
  if ((notices.get(player.id) ?? -100) + 60 > system.currentTick) return;
  notices.set(player.id, system.currentTick);
  system.run(() => {
    if (player.isValid) player.sendMessage(`[Ghosts] ${text}`);
  });
}

world.beforeEvents.entityHurt.subscribe((event) => {
  if (event.hurtEntity.typeId !== ids.specter) return;
  const { damagingEntity, cause } = event.damageSource;
  if (
    cause === EntityDamageCause.selfDestruct ||
    cause === EntityDamageCause.void
  )
    return;
  const allowed =
    damagingEntity instanceof Player &&
    playable(damagingEntity) &&
    cause === EntityDamageCause.entityAttack &&
    canFight(gear(damagingEntity));
  if (!allowed) event.cancel = true;
  if (!allowed && damagingEntity instanceof Player) {
    notify(
      damagingEntity,
      "Specters require a visor, spectral chestplate or pants, and a spectral sword.",
    );
  }
});

world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
  if (event.target.typeId === ids.probe) event.cancel = true;
  if (event.target.typeId !== ids.specter) return;
  if (!attuned(gear(event.player)) || !playable(event.player))
    event.cancel = true;
});

world.beforeEvents.playerBreakBlock.subscribe((event) => {
  if (event.block.typeId !== ids.block) return;
  if (!spectralTool(event.itemStack?.typeId)) {
    event.cancel = true;
    notify(
      event.player,
      "Ghost blocks can only be harvested with spectral tools.",
    );
  }
});

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  if (event.block.typeId !== ids.block) return;
  if (gear(event.player).feet !== ids.boots) {
    event.cancel = true;
    notify(event.player, "Wear Spectral Boots to use ghost blocks.");
  }
});

world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  if (
    deadEntity.typeId !== ids.specter ||
    !(damageSource.damagingEntity instanceof Player) ||
    damageSource.cause !== EntityDamageCause.entityAttack
  )
    return;
  // Authorization was checked before damage; do not re-read gear after death.
  deadEntity.dimension.spawnItem(
    new ItemStack(ids.ectoplasm, 1 + Math.floor(Math.random() * 3)),
    deadEntity.location,
  );
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  positions.delete(playerId);
  notices.delete(playerId);
});

world.afterEvents.entityRemove.subscribe(({ removedEntityId }) => {
  attacks.delete(removedEntityId);
});

function footing(player: Player, equipment: Gear) {
  const current = player.location;
  const previous = positions.get(player.id);
  positions.set(player.id, {
    point: { ...current },
    dimension: player.dimension.id,
  });
  if (
    !previous ||
    previous.dimension !== player.dimension.id ||
    equipment.feet !== ids.boots ||
    !playable(player) ||
    player.isFlying ||
    player.isSneaking ||
    player.isInWater
  )
    return;
  const blocks: Point[] = [];
  for (
    let x = Math.floor(current.x - 0.29);
    x <= Math.floor(current.x + 0.29);
    x++
  ) {
    for (
      let z = Math.floor(current.z - 0.29);
      z <= Math.floor(current.z + 0.29);
      z++
    ) {
      for (
        let y = Math.floor(current.y) - 1;
        y <= Math.floor(previous.point.y);
        y++
      ) {
        if (previous.point.y - current.y > 4) break;
        const point = { x, y, z };
        if (blockAt(player.dimension, point)?.typeId === ids.block)
          blocks.push(point);
      }
    }
  }
  const velocity = player.getVelocity();
  const top = platformTop(previous.point, current, velocity.y, blocks);
  if (top === undefined) return;
  if (
    !player.tryTeleport(
      { ...current, y: top },
      { checkForBlocks: true, keepVelocity: true },
    )
  ) {
    notify(player, "There is not enough space to stand on this ghost block.");
    return;
  }
  positions.set(player.id, {
    point: { ...current, y: top },
    dimension: player.dimension.id,
  });
  player.applyImpulse({
    x: 0,
    y: -velocity.y + (player.isJumping ? 0.42 : 0),
    z: 0,
  });
}

function specters(dimension: Dimension): Entity[] {
  return dimension.getEntities({ type: ids.specter });
}

function haunt(ghost: Entity, players: Player[]) {
  const candidates = players
    .filter(
      (player) =>
        player.getGameMode() === GameMode.Survival && attuned(gear(player)),
    )
    .map((player) => ({
      player,
      distance: Math.hypot(
        player.location.x - ghost.location.x,
        player.location.y - ghost.location.y,
        player.location.z - ghost.location.z,
      ),
    }))
    .filter(({ distance }) => distance < 20)
    .sort((a, b) => a.distance - b.distance);
  const target = candidates[0];
  if (!target) return;
  const { player, distance } = target;
  if (distance > 1.8) {
    const from = ghost.location;
    const to = player.location;
    ghost.teleport({
      x: from.x + ((to.x - from.x) / distance) * 0.12,
      y: from.y + ((to.y - from.y) / distance) * 0.12,
      z: from.z + ((to.z - from.z) / distance) * 0.12,
    });
  } else if ((attacks.get(ghost.id) ?? -40) + 30 <= system.currentTick) {
    player.applyDamage(3, {
      cause: EntityDamageCause.entityAttack,
      damagingEntity: ghost,
    });
    attacks.set(ghost.id, system.currentTick);
  }
}

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    try {
      const equipment = gear(player);
      footing(player, equipment);
      if (
        system.currentTick % 20 === 0 &&
        fullArmor(equipment) &&
        playable(player)
      ) {
        const effect = player.getEffect("invisibility");
        if (!effect || effect.duration <= 20)
          player.addEffect("invisibility", 40, { showParticles: false });
      }
    } catch (error) {
      report(`updating player ${player.id}`, error);
    }
  }
}, 1);

system.runInterval(() => {
  const players = world.getAllPlayers();
  for (const name of ["overworld", "nether", "the_end"]) {
    const dimension = world.getDimension(name);
    const local = players.filter(
      (player) => player.dimension.id === dimension.id,
    );
    for (const ghost of specters(dimension)) {
      try {
        if (
          local.every(
            (player) =>
              Math.hypot(
                player.location.x - ghost.location.x,
                player.location.y - ghost.location.y,
                player.location.z - ghost.location.z,
              ) > 64,
          )
        ) {
          ghost.remove();
          continue;
        }
        haunt(ghost, local);
        for (const player of local) {
          if (
            gear(player).head === ids.visor &&
            Math.hypot(
              player.location.x - ghost.location.x,
              player.location.y - ghost.location.y,
              player.location.z - ghost.location.z,
            ) <= 32
          )
            player.spawnParticle("ghosts:specter", ghost.location);
        }
      } catch (error) {
        report(`updating specter ${ghost.id}`, error);
      }
    }
  }
}, 2);

// A data-driven weather probe also works when enabling the pack mid-storm.
function stormAttempt(player: Player) {
  const dimension = player.dimension;
  if (dimension.id !== "minecraft:overworld" || !playable(player)) return;
  const time = world.getTimeOfDay();
  if (time < 13000 || time >= 23000) return;
  const angle = Math.random() * Math.PI * 2;
  const distance = 8 + Math.random() * 16;
  const x = Math.floor(player.location.x + Math.cos(angle) * distance);
  const z = Math.floor(player.location.z + Math.sin(angle) * distance);
  let surface: Block | undefined;
  for (
    let y = Math.floor(player.location.y) + 8;
    y >= player.location.y - 12;
    y--
  ) {
    const block = blockAt(dimension, { x, y, z });
    if (block && !block.isAir) {
      if (ectoplasmSurface(block.typeId)) surface = block;
      break;
    }
  }
  if (!surface) return;
  const location = { x, y: surface.location.y + 1, z };
  const above = blockAt(dimension, location);
  if (
    !above?.isAir ||
    !blockAt(dimension, { ...location, y: location.y + 1 })?.isAir
  )
    return;
  const ectoplasm = Math.random() < 0.1;
  const ghost = Math.random() < 0.15;
  if (!ectoplasm && !ghost) return;
  const probe = dimension.spawnEntity(ids.probe, {
    x: x + 0.5,
    y: location.y,
    z: z + 0.5,
  });
  system.runTimeout(() => {
    if (!probe.isValid) return;
    try {
      const thunder = probe.getProperty("ghosts:storm") === true;
      probe.remove();
      const block = blockAt(dimension, location);
      if (
        !block?.isAir ||
        !surface.isValid ||
        !ectoplasmSurface(surface.typeId) ||
        !darkStorm(
          world.getTimeOfDay(),
          thunder,
          block.getLightLevel(),
          dimension.getTopmostBlock(location)?.location.y ===
            surface.location.y,
        )
      )
        return;
      if (ectoplasm) block.setType(ids.ectoplasm);
      if (
        ghost &&
        canSpawn(
          dimension.getEntities({
            type: ids.specter,
            location,
            maxDistance: 48,
          }).length,
          specters(dimension).length,
          world.gameRules.doMobSpawning,
        )
      )
        dimension.spawnEntity(ids.specter, {
          x: x + 0.5,
          y: location.y,
          z: z + 0.5,
        });
    } catch (error) {
      if (probe.isValid) probe.remove();
      report("spawning during a storm", error);
    }
  }, 5);
}

system.runInterval(() => {
  const players = world.getAllPlayers();
  if (players.length === 0) return;
  // Bound surface scans to four players per interval, rotating fairly.
  for (let count = 0; count < Math.min(4, players.length); count++) {
    const player = players[(spawnCursor + count) % players.length];
    try {
      stormAttempt(player);
    } catch (error) {
      report("checking a storm spawn site", error);
    }
  }
  spawnCursor = (spawnCursor + Math.min(4, players.length)) % players.length;
}, 400);
