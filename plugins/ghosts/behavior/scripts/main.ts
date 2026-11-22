import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import {
  BlockVolume,
  BlockPermutation,
  ButtonState,
  CommandPermissionLevel,
  Direction,
  EntityDamageCause,
  EquipmentSlot,
  GameMode,
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
const provoked = new Map<string, string>();
const notices = new Map<string, number>();
const killStrikes = new Map<
  string,
  {
    attacker: string;
    tick: number;
    cause: EntityDamageCause;
    sword: boolean;
    hostile: boolean;
  }
>();
const damageDrops = new Map<string, number>();
const experimentalKey = "ghosts:experimental_features";
const shovels = new Set([
  "minecraft:wooden_shovel",
  "minecraft:stone_shovel",
  "minecraft:copper_shovel",
  "minecraft:iron_shovel",
  "minecraft:golden_shovel",
  "minecraft:diamond_shovel",
  "minecraft:netherite_shovel",
  "ghosts:spectral_shovel",
]);
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

function addEctoplasm(block: Block, amount = 1): boolean {
  if (block.isAir) {
    block.setPermutation(
      BlockPermutation.resolve(ids.ectoplasm, {
        "ghosts:layers": Math.min(amount, 8),
      }),
    );
    return true;
  }
  if (block.typeId !== ids.ectoplasm) return false;
  const layers = block.permutation.getAllStates()["ghosts:layers"];
  if (typeof layers !== "number")
    throw new Error("Missing ectoplasm layer state.");
  if (layers >= 8) return false;
  block.setPermutation(
    BlockPermutation.resolve(ids.ectoplasm, {
      "ghosts:layers": Math.min(layers + amount, 8),
    }),
  );
  return true;
}

function shedEctoplasm(
  dimension: Dimension,
  point: Point,
  amount = 1,
): boolean {
  const x = Math.floor(point.x);
  const z = Math.floor(point.z);
  const start = Math.min(Math.floor(point.y), dimension.heightRange.max - 1);
  for (
    let y = start;
    y >= Math.max(start - 32, dimension.heightRange.min);
    y--
  ) {
    const block = blockAt(dimension, { x, y, z });
    if (!block) return false;
    if (block.isAir) continue;
    if (block.typeId === ids.ectoplasm) return addEctoplasm(block, amount);
    const above = blockAt(dimension, { x, y: y + 1, z });
    if (!above?.isAir) return false;
    const hit = dimension.getBlockFromRay(
      { x: x + 0.5, y: y + 1.01, z: z + 0.5 },
      { x: 0, y: -1, z: 0 },
      { maxDistance: 1.01, includePassableBlocks: false },
    );
    if (
      hit?.block.location.y !== y ||
      hit.face !== Direction.Up ||
      (hit.faceLocation.y !== 0 && hit.faceLocation.y < 0.999)
    )
      return false;
    return addEctoplasm(above, amount);
  }
  return false;
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

function experimentalEnabled(): boolean {
  const value = world.getDynamicProperty(experimentalKey);
  if (value !== undefined && typeof value !== "boolean")
    throw new Error("Invalid Ghosts experimental features setting.");
  return value === true;
}

function isOperator(player: Player): boolean {
  return player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;
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
  killStrikes.delete(hurt.id);
  const attacker = event.damageSource.damagingEntity;
  if (
    !event.cancel &&
    attacker instanceof Player &&
    playable(attacker) &&
    ordinaryMob(hurt)
  ) {
    // Capture the weapon before the killing blow can break it or the player swaps.
    const strike = {
      attacker: attacker.id,
      tick: system.currentTick,
      cause,
      sword:
        cause === EntityDamageCause.entityAttack &&
        gear(attacker).hand === ids.sword,
      hostile:
        hurt.getComponent("minecraft:type_family")?.hasTypeFamily("monster") ===
        true,
    };
    killStrikes.set(hurt.id, strike);
    system.run(() => {
      if (killStrikes.get(hurt.id) === strike) killStrikes.delete(hurt.id);
    });
  }
  if (hurt instanceof Player && playable(hurt)) {
    const equipment = gear(hurt);
    if (
      (cause === EntityDamageCause.fall && equipment.feet === ids.boots) ||
      (equipment.chest === ids.chest &&
        (cause === EntityDamageCause.lava ||
          cause === EntityDamageCause.fire ||
          cause === EntityDamageCause.fireTick))
    ) {
      event.cancel = true;
      return;
    }
  }
  if (event.hurtEntity.typeId !== ids.specter) return;
  const { damagingEntity } = event.damageSource;
  if (
    cause === EntityDamageCause.selfDestruct ||
    cause === EntityDamageCause.void
  )
    return;
  const allowed =
    (damagingEntity instanceof Player &&
      playable(damagingEntity) &&
      cause === EntityDamageCause.entityAttack &&
      canFight(gear(damagingEntity))) ||
    (cause === EntityDamageCause.projectile &&
      damagingEntity?.typeId === ids.ectoplasmBallProjectile);
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
  if (event.block.typeId === ids.ectoplasm) {
    if (!shovels.has(event.itemStack?.typeId ?? "")) {
      event.cancel = true;
      notify(event.player, "Use a shovel to collect ectoplasm.");
    }
    return;
  }
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

async function openGuide(player: Player) {
  const form = new ActionFormData()
    .title("Ghosts Guide")
    .body(
      [
        "ECTOPLASM",
        "Ghosts shed ectoplasm in snow-like layers; deposits also form during dark thunderstorms.",
        "Break it with any shovel to collect ectoplasm balls.",
        "Throw ectoplasm balls to damage specters.",
        "",
        "SPECTRAL GEAR",
        "Visor: reveals nearby specters and ghost block outlines.",
        "Chestplate: fire, lava and burning immunity.",
        "Leggings: Speed II; experimental resistance inside ghost blocks.",
        "Boots: fall immunity and support on ghost block tops.",
        "Sword: damage specters, and guarantee a ghost on a direct mob-kill blow.",
        "Experimental ghost-block movement and liquid hovering can be enabled in Ghosts settings.",
        "",
        "CRAFTING",
        "Visor: 5 ectoplasm balls",
        "Chestplate: 8 ectoplasm balls",
        "Leggings: 7 ectoplasm balls",
        "Boots: 4 ectoplasm balls",
        "Sword: 2 ectoplasm balls + 1 stick",
        "Pickaxe/Axe: 3 ectoplasm balls + 2 sticks",
        "Shovel: 1 ectoplasm ball + 2 sticks",
        "Ghost block: 4 ectoplasm balls (4 blocks)",
        "Guide book: 1 ectoplasm ball + 1 book",
      ].join("\n"),
    );
  if (isOperator(player)) form.button("Settings");
  const guide = await form.show(player);
  if (guide.canceled || guide.selection !== 0 || !player.isValid) return;
  if (!isOperator(player)) {
    player.sendMessage("[Ghosts] Only operators can change Ghosts settings.");
    return;
  }
  const current = experimentalEnabled();
  const settings = await new ModalFormData()
    .title("Ghosts Settings")
    .toggle("Enable experimental features", {
      defaultValue: current,
      tooltip:
        "Enables liquid hovering and ghost-block movement for everyone. Movement may be jittery.",
    })
    .show(player);
  if (settings.canceled || !player.isValid) return;
  if (!isOperator(player)) {
    player.sendMessage("[Ghosts] Only operators can change Ghosts settings.");
    return;
  }
  const value = settings.formValues?.[0];
  if (typeof value !== "boolean")
    throw new Error("Ghosts settings form returned an invalid toggle value.");
  if (experimentalEnabled() !== current) {
    player.sendMessage("[Ghosts] Settings changed; reopen the guide to retry.");
    return;
  }
  world.setDynamicProperty(experimentalKey, value);
  player.sendMessage(
    `[Ghosts] Experimental features ${value ? "enabled" : "disabled"} for this world.`,
  );
}

world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
  if (itemStack.typeId !== ids.guide) return;
  system.run(() => {
    openGuide(source).catch((error: unknown) => {
      report("opening Ghosts guide", error);
      if (source.isValid)
        source.sendMessage("[Ghosts] Could not open or save Ghosts settings.");
    });
  });
});

function releaseGhost(victim: Entity, killer: Player, hostile: boolean) {
  const dimension = victim.dimension;
  if (
    !canSpawn(
      dimension.getEntities({
        type: ids.specter,
        location: victim.location,
        maxDistance: 48,
      }).length,
      specters(dimension).length,
      true,
    )
  ) {
    notify(
      killer,
      "The nearby spectral population is full; no ghost was released.",
    );
    return;
  }
  const ghost = dimension.spawnEntity(ids.specter, victim.location);
  if (hostile && killer.getGameMode() === GameMode.Survival)
    provoked.set(ghost.id, killer.id);
  dimension.spawnParticle("ghosts:release", {
    ...victim.location,
    y: victim.location.y + 0.75,
  });
  return ghost;
}

world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  provoked.delete(deadEntity.id);
  if (deadEntity.typeId === "minecraft:player") calmGhosts(deadEntity.id);
  const strike = killStrikes.get(deadEntity.id);
  killStrikes.delete(deadEntity.id);
  if (
    strike &&
    damageSource.damagingEntity instanceof Player &&
    damageSource.damagingEntity.id === strike.attacker &&
    damageSource.cause === strike.cause &&
    system.currentTick - strike.tick <= 1
  ) {
    const hostile = strike.hostile && Math.random() < 0.1;
    if (!strike.sword && !hostile) return;
    releaseGhost(deadEntity, damageSource.damagingEntity, hostile);
    return;
  }
  if (
    deadEntity.typeId !== ids.specter ||
    !(damageSource.damagingEntity instanceof Player) ||
    damageSource.cause !== EntityDamageCause.entityAttack
  )
    return;
  // Authorization was checked before damage; do not re-read gear after death.
  shedEctoplasm(
    deadEntity.dimension,
    deadEntity.location,
    1 + Math.floor(Math.random() * 3),
  );
});

world.afterEvents.entityHurt.subscribe(
  ({ hurtEntity, damage, damageSource }) => {
    if (
      hurtEntity.typeId !== ids.specter ||
      !hurtEntity.isValid ||
      damage <= 0 ||
      damageSource.cause !== EntityDamageCause.entityAttack ||
      !(damageSource.damagingEntity instanceof Player)
    )
      return;
    if (
      damageSource.damagingEntity.getGameMode() === GameMode.Survival &&
      (hurtEntity.getComponent("minecraft:health")?.currentValue ?? 0) > 0
    )
      provoked.set(hurtEntity.id, damageSource.damagingEntity.id);
    if (
      system.currentTick - (damageDrops.get(hurtEntity.id) ?? -40) < 40 ||
      Math.random() >= 0.35
    )
      return;
    if (shedEctoplasm(hurtEntity.dimension, hurtEntity.location))
      damageDrops.set(hurtEntity.id, system.currentTick);
  },
);

function calmGhosts(playerId: string) {
  for (const [ghostId, target] of provoked) {
    if (target === playerId) provoked.delete(ghostId);
  }
}

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  positions.delete(playerId);
  notices.delete(playerId);
  calmGhosts(playerId);
  outlines.delete(playerId);
});

world.afterEvents.entityRemove.subscribe(({ removedEntityId }) => {
  attacks.delete(removedEntityId);
  provoked.delete(removedEntityId);
  killStrikes.delete(removedEntityId);
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
  const complete = fullArmor(equipment);
  positions.set(player.id, {
    point: { ...current },
    dimension: player.dimension.id,
  });
  if (
    !previous ||
    previous.dimension !== player.dimension.id ||
    !localMovement(previous.point, current) ||
    (equipment.feet !== ids.boots && equipment.legs !== ids.pants) ||
    !playable(player) ||
    player.isFlying ||
    player.isGliding ||
    player.isSwimming ||
    (player.isInWater && !complete) ||
    !experimentalEnabled()
  )
    return;
  const blocks = player.isInWater
    ? []
    : ghostBlocks(player.dimension, previous.point, current);
  const climbing =
    complete && blocks.some((block) => insideGhost(previous.point, block));
  const velocity = player.getVelocity();
  const jump =
    player.inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed;
  let target = player.isSneaking
    ? { ...current }
    : ghostCollision(previous.point, current, blocks, equipment);
  let supported = false;
  if (climbing) {
    target.y = previous.point.y + (player.isSneaking ? -0.12 : jump ? 0.12 : 0);
    supported = true;
  } else if (player.isSneaking) {
    return;
  } else {
    supported =
      equipment.feet === ids.boots &&
      velocity.y <= 0 &&
      (target.y > current.y ||
        blocks.some((block) =>
          insideGhost({ ...target, y: target.y - 0.02 }, block),
        ));
    if (complete) {
      const origin = {
        x: target.x,
        y: target.y + (player.isInWater ? 0.18 : 0.02),
        z: target.z,
      };
      if (blockAt(player.dimension, origin)) {
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
        if (hit?.face === Direction.Up && hit.block.isLiquid) {
          let exposed = true;
          if (player.isInWater) {
            const above = blockAt(player.dimension, {
              ...hit.block.location,
              y: hit.block.location.y + 1,
            });
            exposed = !!above && !above.isLiquid && !above.isWaterlogged;
          }
          // Bedrock 1.26 reports integer top-face heights as local Y=0, not 1.
          const height = hit.faceLocation.y === 0 ? 1 : hit.faceLocation.y;
          const hover = exposed
            ? hoverHeight(
                target.y,
                velocity.y,
                hit.block.location.y + height,
                player.isInWater,
              )
            : undefined;
          if (hover !== undefined) {
            target.y = hover;
            supported = true;
          }
        }
      }
    }
  }
  for (const axis of ["x", "y", "z"] as const) {
    if (Math.abs(target[axis] - current[axis]) < (axis === "y" ? 0.005 : 0.001))
      target[axis] = current[axis];
  }
  const moved =
    target.x !== current.x || target.y !== current.y || target.z !== current.z;
  if (!moved && !supported) return;
  if (moved && !player.tryTeleport(target, { checkForBlocks: true })) {
    notify(player, "There is not enough clear space for spectral movement.");
    return;
  }
  positions.set(player.id, {
    point: { ...target },
    dimension: player.dimension.id,
  });
  const desiredVelocity = {
    x: target.x !== current.x ? 0 : velocity.x,
    y: supported
      ? !climbing && jump
        ? 0.42
        : 0.08
      : target.y !== current.y
        ? 0
        : velocity.y,
    z: target.z !== current.z ? 0 : velocity.z,
  };
  const actualVelocity = moved ? player.getVelocity() : velocity;
  const impulse = {
    x: desiredVelocity.x - actualVelocity.x,
    y: desiredVelocity.y - actualVelocity.y,
    z: desiredVelocity.z - actualVelocity.z,
  };
  if (impulse.x !== 0 || impulse.y !== 0 || impulse.z !== 0)
    player.applyImpulse(impulse);
}

function specters(dimension: Dimension): Entity[] {
  return dimension.getEntities({ type: ids.specter });
}

function haunt(ghost: Entity, players: Player[]) {
  const target = provoked.get(ghost.id);
  if (!target) return;
  const player = players.find(
    (candidate) =>
      candidate.id === target &&
      candidate.getGameMode() === GameMode.Survival &&
      (candidate.getComponent("minecraft:health")?.currentValue ?? 0) > 0,
  );
  if (!player) {
    provoked.delete(ghost.id);
    return;
  }
  const distance = Math.hypot(
    player.location.x - ghost.location.x,
    player.location.y - ghost.location.y,
    player.location.z - ghost.location.z,
  );
  if (distance >= 20) {
    provoked.delete(ghost.id);
    return;
  }
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

function armorEffects(player: Player, equipment: Gear) {
  if (!playable(player)) return;
  if (equipment.legs === ids.pants) {
    const effect = player.getEffect("speed");
    if (!effect || (effect.duration <= 5 && effect.amplifier === 1))
      player.addEffect("speed", 10, { amplifier: 1, showParticles: false });
  }
  if (equipment.feet === ids.boots) {
    const effect = player.getEffect("slow_falling");
    if (!effect || (effect.duration <= 5 && effect.amplifier === 0))
      player.addEffect("slow_falling", 10, { showParticles: false });
  }
  if (equipment.chest === ids.chest) player.extinguishFire();
  if (system.currentTick % 20 === 0 && fullArmor(equipment)) {
    const effect = player.getEffect("invisibility");
    if (!effect || effect.duration <= 20)
      player.addEffect("invisibility", 40, { showParticles: false });
  }
}

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    try {
      const equipment = gear(player);
      footing(player, equipment);
      armorEffects(player, equipment);
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
      if (block.typeId === ids.ectoplasm) {
        const below = blockAt(dimension, { x, y: y - 1, z });
        if (below && ectoplasmSurface(below.typeId)) {
          surface = below;
        }
      } else if (ectoplasmSurface(block.typeId)) surface = block;
      break;
    }
  }
  if (!surface) return;
  const location = { x, y: surface.location.y + 1, z };
  const above = blockAt(dimension, location);
  if (
    !above ||
    (!above.isAir && above.typeId !== ids.ectoplasm) ||
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
        !block ||
        (!block.isAir && block.typeId !== ids.ectoplasm) ||
        !surface.isValid ||
        !ectoplasmSurface(surface.typeId) ||
        !darkStorm(
          world.getTimeOfDay(),
          thunder,
          block.getLightLevel(),
          dimension.getTopmostBlock(location)?.location.y ===
            (block.isAir ? surface.location.y : location.y),
        )
      )
        return;
      if (ectoplasm) addEctoplasm(block);
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
          shedEctoplasm(ghost.dimension, ghost.location);
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
