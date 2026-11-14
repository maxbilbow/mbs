import type { Point } from "../../plugins/ghosts/behavior/scripts/model.ts";

export const EquipmentSlot = {
  Head: "head",
  Chest: "chest",
  Legs: "legs",
  Feet: "feet",
  Mainhand: "hand",
};
export const GameMode = {
  Survival: "survival",
  Creative: "creative",
  Adventure: "adventure",
  Spectator: "spectator",
};
export const EntityDamageCause = {
  entityAttack: "entityAttack",
  selfDestruct: "selfDestruct",
  void: "void",
};
export class LocationInUnloadedChunkError extends Error {}
export class LocationOutOfWorldBoundariesError extends Error {}
export class ItemStack {
  constructor(
    public typeId: string,
    public amount = 1,
  ) {}
}

function signal<T>() {
  const callbacks: ((event: T) => void)[] = [];
  return {
    subscribe(callback: (event: T) => void) {
      callbacks.push(callback);
    },
    emit(event: T) {
      callbacks.forEach((callback) => callback(event));
    },
  };
}

type Damage = {
  hurtEntity: Entity;
  damageSource: { damagingEntity?: Entity; cause: string };
  cancel: boolean;
};
type BlockEvent = {
  block: Block;
  player: Player;
  itemStack?: ItemStack;
  cancel: boolean;
};

class Block {
  isValid = true;
  typeId = "minecraft:air";
  light = 0;
  constructor(public location: Point) {}
  get isAir() {
    return this.typeId === "minecraft:air";
  }
  getLightLevel() {
    return this.light;
  }
  setType(type: string) {
    this.typeId = type;
  }
}

export class Dimension {
  heightRange = { min: -64, max: 320 };
  blocks = new Map<string, Block>();
  entities: Entity[] = [];
  drops: ItemStack[] = [];
  unloaded = false;
  constructor(public id: string) {}
  getBlock(point: Point) {
    if (this.unloaded) throw new LocationInUnloadedChunkError();
    const location = {
      x: Math.floor(point.x),
      y: Math.floor(point.y),
      z: Math.floor(point.z),
    };
    const key = JSON.stringify(location);
    if (!this.blocks.has(key)) this.blocks.set(key, new Block(location));
    return this.blocks.get(key)!;
  }
  getEntities(options: {
    type: string;
    location?: Point;
    maxDistance?: number;
  }) {
    return this.entities.filter(
      (entity) =>
        entity.isValid &&
        entity.typeId === options.type &&
        (!options.location ||
          Math.hypot(
            entity.location.x - options.location.x,
            entity.location.y - options.location.y,
            entity.location.z - options.location.z,
          ) <= (options.maxDistance ?? Infinity)),
    );
  }
  getTopmostBlock(point: Point) {
    return [...this.blocks.values()]
      .filter(
        (block) =>
          !block.isAir &&
          block.location.x === point.x &&
          block.location.z === point.z,
      )
      .sort((a, b) => b.location.y - a.location.y)[0];
  }
  spawnEntity(type: string, point: Point) {
    const entity = new Entity(type, this, point);
    this.entities.push(entity);
    return entity;
  }
  spawnItem(item: ItemStack) {
    this.drops.push(item);
  }
}

let nextId = 0;
export class Entity {
  id = String(++nextId);
  isValid = true;
  properties = new Map<string, boolean>();
  constructor(
    public typeId: string,
    public dimension: Dimension,
    public location: Point,
  ) {}
  getProperty(key: string) {
    return this.properties.get(key);
  }
  teleport(point: Point) {
    this.location = { ...point };
  }
  remove() {
    this.isValid = false;
  }
}

export class Player extends Entity {
  mode = GameMode.Survival;
  equipment = new Map<string, ItemStack>();
  effects = new Map<string, { duration: number }>();
  particles: string[] = [];
  messages: string[] = [];
  damage = 0;
  velocity = { x: 0, y: 0, z: 0 };
  isFlying = false;
  isSneaking = false;
  isInWater = false;
  isJumping = false;
  canTeleport = true;
  constructor(dimension: Dimension) {
    super("minecraft:player", dimension, { x: 0.5, y: 1, z: 0.5 });
  }
  getComponent() {
    return { getEquipment: (slot: string) => this.equipment.get(slot) };
  }
  getGameMode() {
    return this.mode;
  }
  sendMessage(text: string) {
    this.messages.push(text);
  }
  getEffect(type: string) {
    return this.effects.get(type);
  }
  addEffect(type: string, duration: number) {
    this.effects.set(type, { duration });
  }
  getVelocity() {
    return this.velocity;
  }
  tryTeleport(point: Point) {
    if (!this.canTeleport) return false;
    this.teleport(point);
    return true;
  }
  applyImpulse(point: Point) {
    this.velocity = {
      x: this.velocity.x + point.x,
      y: this.velocity.y + point.y,
      z: this.velocity.z + point.z,
    };
  }
  spawnParticle(type: string) {
    this.particles.push(type);
  }
  applyDamage(amount: number) {
    this.damage += amount;
  }
}

export const intervals = new Map<number, () => void>();
export const deferred: (() => void)[] = [];
export const system = {
  currentTick: 0,
  run(callback: () => void) {
    deferred.push(callback);
  },
  runTimeout(callback: () => void) {
    deferred.push(callback);
  },
  runInterval(callback: () => void, ticks: number) {
    intervals.set(ticks, callback);
  },
};
export const dimensions = new Map(
  ["overworld", "nether", "the_end"].map((name) => [
    name,
    new Dimension(`minecraft:${name}`),
  ]),
);
export let players: Player[] = [];
export let time = 18000;
export const world = {
  gameRules: { doMobSpawning: true },
  getAllPlayers: () => players,
  getDimension: (name: string) => dimensions.get(name)!,
  getTimeOfDay: () => time,
  beforeEvents: {
    entityHurt: signal<Damage>(),
    playerInteractWithEntity: signal<{
      target: Entity;
      player: Player;
      cancel: boolean;
    }>(),
    playerBreakBlock: signal<BlockEvent>(),
    playerInteractWithBlock: signal<BlockEvent>(),
  },
  afterEvents: {
    entityDie: signal<{
      deadEntity: Entity;
      damageSource: Damage["damageSource"];
    }>(),
    playerLeave: signal<{ playerId: string }>(),
    entityRemove: signal<{ removedEntityId: string }>(),
  },
};
export function reset() {
  for (const player of players)
    world.afterEvents.playerLeave.emit({ playerId: player.id });
  for (const dimension of dimensions.values()) {
    for (const entity of dimension.entities)
      world.afterEvents.entityRemove.emit({ removedEntityId: entity.id });
    dimension.entities = [];
    dimension.blocks.clear();
    dimension.drops = [];
    dimension.unloaded = false;
  }
  deferred.length = 0;
  system.currentTick = 0;
  time = 18000;
  world.gameRules.doMobSpawning = true;
  const dimension = dimensions.get("overworld")!;
  const player = new Player(dimension);
  players = [player];
  return { player, dimension };
}
