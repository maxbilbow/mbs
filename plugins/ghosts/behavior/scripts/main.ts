import {
  BlockVolume,
  ButtonState,
  Direction,
  EntityDamageCause,
  EquipmentSlot,
  GameMode,
  ItemStack,
  InputButton,
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
  ghostCollision,
  hoverHeight,
  ids,
  insideGhost,
  localMovement,
  nearbySpecterTarget,
  spectralTool,
  type Gear,
  type Point,
} from "./model.ts";

declare const console: { warn(message: string): void };

const positions = new Map<string, { point: Point; dimension: string }>();
const attacks = new Map<string, number>();
const notices = new Map<string, number>();
const hovering = new Map<
  string,
  { point: Point; dimension: string; tick: number }
>();
const swordStrikes = new Map<string, { attacker: string; tick: number }>();
const damageDrops = new Map<string, number>();
const outlines = new Map<
  string,
  { dimension: string; center: Point; tick: number; blocks: Point[] }
>();
let spawnCursor = 0;
let ambientCursor = 0;

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

function ordinaryMob(entity: Entity): boolean {
  // Lethal before-events may already report zero health; fish lack "mob".
  return (
    entity.typeId !== "minecraft:player" &&
    entity.typeId !== "minecraft:armor_stand" &&
    entity.typeId !== ids.specter &&
    entity.typeId !== ids.probe &&
    entity.getComponent("minecraft:health") !== undefined &&
    entity.getComponent("minecraft:type_family")?.hasTypeFamily("inanimate") ===
      false
  );
}

world.beforeEvents.entityHurt.subscribe((event) => {
  const hurt = event.hurtEntity;
  const cause = event.damageSource.cause;
  swordStrikes.delete(hurt.id);
  const attacker = event.damageSource.damagingEntity;
  if (
    !event.cancel &&
    cause === EntityDamageCause.entityAttack &&
    attacker instanceof Player &&
    playable(attacker) &&
    gear(attacker).hand === ids.sword &&
    ordinaryMob(hurt)
  ) {
    // Capture the weapon before the killing blow can break it or the player swaps.
    const strike = { attacker: attacker.id, tick: system.currentTick };
    swordStrikes.set(hurt.id, strike);
    system.run(() => {
      if (swordStrikes.get(hurt.id) === strike) swordStrikes.delete(hurt.id);
    });
  }
  if (
    hurt instanceof Player &&
    (cause === EntityDamageCause.lava ||
      cause === EntityDamageCause.fire ||
      cause === EntityDamageCause.fireTick) &&
    hoveringAboveLava(hurt)
  ) {
    event.cancel = true;
    return;
  }
  if (event.hurtEntity.typeId !== ids.specter) return;
  const { damagingEntity } = event.damageSource;
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
  const strike = swordStrikes.get(deadEntity.id);
  swordStrikes.delete(deadEntity.id);
  if (
    strike &&
    damageSource.damagingEntity instanceof Player &&
    damageSource.damagingEntity.id === strike.attacker &&
    damageSource.cause === EntityDamageCause.entityAttack &&
    system.currentTick - strike.tick <= 1
  ) {
    const dimension = deadEntity.dimension;
    if (
      canSpawn(
        dimension.getEntities({
          type: ids.specter,
          location: deadEntity.location,
          maxDistance: 48,
        }).length,
        specters(dimension).length,
        true,
      )
    )
      dimension.spawnEntity(ids.specter, deadEntity.location);
    else
      notify(
        damageSource.damagingEntity,
        "The nearby spectral population is full; no ghost was released.",
      );
    return;
  }
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

world.afterEvents.entityHurt.subscribe(
  ({ hurtEntity, damage, damageSource }) => {
    if (
      hurtEntity.typeId !== ids.specter ||
      !hurtEntity.isValid ||
      damage <= 0 ||
      damageSource.cause !== EntityDamageCause.entityAttack ||
      !(damageSource.damagingEntity instanceof Player) ||
      system.currentTick - (damageDrops.get(hurtEntity.id) ?? -40) < 40 ||
      Math.random() >= 0.35
    )
      return;
    hurtEntity.dimension.spawnItem(
      new ItemStack(ids.ectoplasm),
      hurtEntity.location,
    );
    damageDrops.set(hurtEntity.id, system.currentTick);
  },
);

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  positions.delete(playerId);
  notices.delete(playerId);
  hovering.delete(playerId);
  outlines.delete(playerId);
});

world.afterEvents.entityRemove.subscribe(({ removedEntityId }) => {
  attacks.delete(removedEntityId);
  swordStrikes.delete(removedEntityId);
  damageDrops.delete(removedEntityId);
});

function revealBlocks(player: Player) {
  if (gear(player).head !== ids.visor) {
    outlines.delete(player.id);
    return;
  }
  const center = player.location;
  const minY = Math.max(
    player.dimension.heightRange.min,
    Math.floor(center.y) - 8,
  );
  const maxY = Math.min(
    player.dimension.heightRange.max - 1,
    Math.floor(center.y) + 8,
  );
  if (minY > maxY) {
    outlines.delete(player.id);
    return;
  }
  let cached = outlines.get(player.id);
  if (
    !cached ||
    cached.dimension !== player.dimension.id ||
    system.currentTick - cached.tick >= 20 ||
    Math.hypot(
      center.x - cached.center.x,
      center.y - cached.center.y,
      center.z - cached.center.z,
    ) > 2
  ) {
    const volume = new BlockVolume(
      { x: Math.floor(center.x) - 8, y: minY, z: Math.floor(center.z) - 8 },
      { x: Math.floor(center.x) + 8, y: maxY, z: Math.floor(center.z) + 8 },
    );
    const distance = (point: Point) =>
      Math.hypot(
        point.x + 0.5 - center.x,
        point.y + 0.5 - center.y,
        point.z + 0.5 - center.z,
      );
    const blocks = [
      ...player.dimension
        .getBlocks(volume, { includeTypes: [ids.block] }, true)
        .getBlockLocationIterator(),
    ]
      .filter((point) => distance(point) <= 8)
      .sort((a, b) => distance(a) - distance(b))
      .slice(0, 32);
    cached = {
      dimension: player.dimension.id,
      center: { ...center },
      tick: system.currentTick,
      blocks,
    };
    outlines.set(player.id, cached);
  }
  for (const block of cached.blocks) {
    if (
      Math.hypot(
        block.x + 0.5 - center.x,
        block.y + 0.5 - center.y,
        block.z + 0.5 - center.z,
      ) > 8
    )
      continue;
    if (blockAt(player.dimension, block)?.typeId !== ids.block) continue;
    for (const axis of ["x", "y", "z"] as const) {
      const plane = axis === "x" ? "yz" : axis === "y" ? "xz" : "xy";
      for (const side of [0, 1]) {
        const face = { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 };
        face[axis] = block[axis] + side;
        player.spawnParticle(`ghosts:block_${plane}`, face);
      }
    }
  }
}

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    try {
      revealBlocks(player);
    } catch (error) {
      report(`revealing ghost blocks for ${player.id}`, error);
    }
  }
}, 5);

function lava(type?: string): boolean {
  return type === "minecraft:lava" || type === "minecraft:flowing_lava";
}

function hoveringAboveLava(player: Player): boolean {
  const support = hovering.get(player.id);
  return (
    support !== undefined &&
    system.currentTick - support.tick <= 1 &&
    support.dimension === player.dimension.id &&
    !player.isSneaking &&
    playable(player) &&
    fullArmor(gear(player)) &&
    Math.abs(player.location.y - support.point.y) <= 0.1 &&
    Math.hypot(
      player.location.x - support.point.x,
      player.location.z - support.point.z,
    ) <= 0.4 &&
    lava(
      blockAt(player.dimension, {
        x: player.location.x,
        y: support.point.y - 0.26,
        z: player.location.z,
      })?.typeId,
    )
  );
}

function ghostBlocks(
  dimension: Dimension,
  previous: Point,
  current: Point,
): Point[] {
  const blocks: Point[] = [];
  for (
    let x = Math.floor(Math.min(previous.x, current.x) - 0.3);
    x <= Math.floor(Math.max(previous.x, current.x) + 0.3);
    x++
  ) {
    for (
      let z = Math.floor(Math.min(previous.z, current.z) - 0.3);
      z <= Math.floor(Math.max(previous.z, current.z) + 0.3);
      z++
    ) {
      for (
        let y = Math.floor(Math.min(previous.y, current.y)) - 1;
        y <= Math.floor(Math.max(previous.y, current.y) + 1.8);
        y++
      ) {
        const point = { x, y, z };
        if (blockAt(dimension, point)?.typeId === ids.block) blocks.push(point);
      }
    }
  }
  return blocks;
}

function footing(player: Player, equipment: Gear) {
  const current = player.location;
  const previous = positions.get(player.id);
  hovering.delete(player.id);
  positions.set(player.id, {
    point: { ...current },
    dimension: player.dimension.id,
  });
  if (
    !previous ||
    previous.dimension !== player.dimension.id ||
    !localMovement(previous.point, current) ||
    equipment.feet !== ids.boots ||
    !playable(player) ||
    player.isFlying ||
    player.isGliding ||
    player.isSwimming ||
    player.isInWater
  )
    return;
  const blocks = ghostBlocks(player.dimension, previous.point, current);
  const complete = fullArmor(equipment);
  const climbing =
    complete && blocks.some((block) => insideGhost(previous.point, block));
  const velocity = player.getVelocity();
  const jump =
    player.inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed;
  let target = { ...current };
  let supported = false;
  let hover = false;
  if (climbing) {
    target.y = previous.point.y + (player.isSneaking ? -0.12 : jump ? 0.12 : 0);
    supported = true;
  } else if (player.isSneaking) {
    return;
  } else {
    target = ghostCollision(previous.point, current, blocks);
    supported = target.y > current.y && velocity.y <= 0;
    if (complete) {
      const surfaces = blocks
        .filter(
          (block) =>
            Math.abs(target.x - (block.x + 0.5)) < 0.8 &&
            Math.abs(target.z - (block.z + 0.5)) < 0.8 &&
            target.y >= block.y + 1 - 0.02,
        )
        .map((block) => block.y + 1);
      for (const [x, z] of [
        [0, 0],
        [-0.28, -0.28],
        [-0.28, 0.28],
        [0.28, -0.28],
        [0.28, 0.28],
      ]) {
        const origin = { x: target.x + x, y: target.y + 0.02, z: target.z + z };
        if (!blockAt(player.dimension, origin)) continue;
        const hit = player.dimension.getBlockFromRay(
          origin,
          { x: 0, y: -1, z: 0 },
          {
            maxDistance: Math.min(
              1.5,
              origin.y - player.dimension.heightRange.min,
            ),
            includeLiquidBlocks: true,
            includePassableBlocks: true,
          },
        );
        if (hit?.face === Direction.Up) {
          // Bedrock 1.26 reports integer top-face heights as local Y=0, not 1.
          const height = hit.faceLocation.y === 0 ? 1 : hit.faceLocation.y;
          surfaces.push(hit.block.location.y + height);
        }
      }
      const heights = surfaces
        .map((surface) => hoverHeight(target.y, velocity.y, surface))
        .filter((height): height is number => height !== undefined);
      if (heights.length) {
        target.y = Math.max(...heights);
        supported = hover = true;
      }
    }
  }
  const moved =
    target.x !== current.x || target.y !== current.y || target.z !== current.z;
  if (!moved && !supported) return;
  if (
    moved &&
    !player.tryTeleport(target, { checkForBlocks: true, keepVelocity: true })
  ) {
    notify(player, "There is not enough clear space for spectral movement.");
    return;
  }
  positions.set(player.id, {
    point: { ...target },
    dimension: player.dimension.id,
  });
  player.applyImpulse({
    x: target.x !== current.x ? -velocity.x : 0,
    y:
      target.y !== current.y || supported
        ? -velocity.y + (supported && !climbing && jump ? 0.42 : 0)
        : 0,
    z: target.z !== current.z ? -velocity.z : 0,
  });
  if (hover) {
    hovering.set(player.id, {
      point: { ...target },
      dimension: player.dimension.id,
      tick: system.currentTick,
    });
    if (hoveringAboveLava(player)) player.extinguishFire();
  }
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

function outdoorSpecter(player: Player) {
  const dimension = player.dimension;
  if (
    dimension.id !== "minecraft:overworld" ||
    !playable(player) ||
    !world.gameRules.doMobSpawning ||
    (dimension.getTopmostBlock(player.location)?.location.y ?? -Infinity) >=
      player.location.y
  )
    return;
  const nearby = dimension.getEntities({
    type: ids.specter,
    location: player.location,
    maxDistance: 32,
  }).length;
  if (
    nearby >= nearbySpecterTarget(world.getTimeOfDay()) ||
    !canSpawn(
      dimension.getEntities({
        type: ids.specter,
        location: player.location,
        maxDistance: 48,
      }).length,
      specters(dimension).length,
      true,
    )
  )
    return;
  for (let attempt = 0; attempt < 4; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 12 + Math.random() * 12;
    const location = {
      x: Math.floor(player.location.x + Math.cos(angle) * distance) + 0.5,
      y: Math.floor(player.location.y),
      z: Math.floor(player.location.z + Math.sin(angle) * distance) + 0.5,
    };
    if (
      blockAt(dimension, location)?.isAir &&
      blockAt(dimension, { ...location, y: location.y + 1 })?.isAir &&
      (dimension.getTopmostBlock(location)?.location.y ?? -Infinity) <
        location.y
    ) {
      dimension.spawnEntity(ids.specter, location);
      return;
    }
  }
}

system.runInterval(() => {
  const players = world.getAllPlayers();
  for (let count = 0; count < Math.min(4, players.length); count++) {
    try {
      outdoorSpecter(players[(ambientCursor + count) % players.length]);
    } catch (error) {
      report("maintaining outdoor specters", error);
    }
  }
  if (players.length)
    ambientCursor =
      (ambientCursor + Math.min(4, players.length)) % players.length;
}, 200);

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
  for (const name of ["overworld", "nether", "the_end"]) {
    for (const ghost of specters(world.getDimension(name))) {
      try {
        if (
          ghost.isValid &&
          (ghost.getComponent("minecraft:health")?.currentValue ?? 0) > 0 &&
          Math.random() < 0.1
        )
          ghost.dimension.spawnItem(
            new ItemStack(ids.ectoplasm),
            ghost.location,
          );
      } catch (error) {
        report(`dropping ectoplasm from ${ghost.id}`, error);
      }
    }
  }
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
