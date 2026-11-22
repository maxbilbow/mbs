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
  lava: "lava",
  fire: "fire",
  fireTick: "fireTick",
  fall: "fall",
};
export const Direction = { Up: "Up" };
export const ButtonState = { Pressed: "Pressed", Released: "Released" };
export const InputButton = { Jump: "Jump" };
export const CommandPermissionLevel = { Any: 0, GameDirectors: 1 };
export class LocationInUnloadedChunkError extends Error {}
export class LocationOutOfWorldBoundariesError extends Error {}
export class ItemStack {
  constructor(
    public typeId: string,
    public amount = 1,
  ) {}
}
export class BlockVolume {
  constructor(
    public from: Point,
    public to: Point,
  ) {}
}

export class BlockPermutation {
  constructor(
    public typeId: string,
    private states: Record<string, string | boolean | number> = {},
  ) {}
  static resolve(
    type: string,
    states: Record<string, string | boolean | number> = {},
  ) {
    return new BlockPermutation(type, states);
  }
  getAllStates() {
    return { ...this.states };
  }
}

export const actionResponses: { canceled: boolean; selection?: number }[] = [];
export const modalResponses: {
  canceled: boolean;
  formValues?: (boolean | number | string | undefined)[];
}[] = [];
export const shownForms: {
  kind: "action" | "modal";
  buttons?: string[];
  defaultValue?: boolean;
}[] = [];

export class ActionFormData {
  buttons: string[] = [];
  title(_title: string) {
    return this;
  }
  body(_body: string) {
    return this;
  }
  button(text: string) {
    this.buttons.push(text);
    return this;
  }
  async show(_player: Player) {
    shownForms.push({ kind: "action", buttons: [...this.buttons] });
    return actionResponses.shift() ?? { canceled: true };
  }
}

export class ModalFormData {
  defaultValue?: boolean;
  title(_title: string) {
    return this;
  }
  toggle(_label: string, options: { defaultValue?: boolean }) {
    this.defaultValue = options.defaultValue;
    return this;
  }
  async show(_player: Player) {
    shownForms.push({ kind: "modal", defaultValue: this.defaultValue });
    return modalResponses.shift() ?? { canceled: true };
  }
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
  permutation = BlockPermutation.resolve("minecraft:air");
  light = 0;
  surfaceHeight = 1;
  constructor(public location: Point) {}
  get isAir() {
    return this.typeId === "minecraft:air";
  }
  get isLiquid() {
    return [
      "minecraft:water",
      "minecraft:flowing_water",
      "minecraft:lava",
      "minecraft:flowing_lava",
    ].includes(this.typeId);
  }
  isWaterlogged = false;
  getLightLevel() {
    return this.light;
  }
  setType(type: string) {
    this.typeId = type;
    this.permutation = BlockPermutation.resolve(
      type,
      type === "ghosts:ectoplasm" ? { "ghosts:layers": 1 } : {},
    );
  }
  setPermutation(permutation: BlockPermutation) {
    this.typeId = permutation.typeId;
    this.permutation = permutation;
  }
}

export class Dimension {
  heightRange = { min: -64, max: 320 };
  blocks = new Map<string, Block>();
  entities: Entity[] = [];
  drops: ItemStack[] = [];
  particles: { type: string; point: Point }[] = [];
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
  getBlocks(volume: BlockVolume, options: { includeTypes: string[] }) {
    const blocks = this.unloaded
      ? []
      : [...this.blocks.values()].filter(
          (block) =>
            options.includeTypes.includes(block.typeId) &&
            (["x", "y", "z"] as const).every(
              (axis) =>
                block.location[axis] >= volume.from[axis] &&
                block.location[axis] <= volume.to[axis],
            ),
        );
    return {
      getBlockLocationIterator: function* () {
        for (const block of blocks) yield { ...block.location };
      },
    };
  }
  getTopmostBlock(point: Point) {
    return [...this.blocks.values()]
      .filter(
        (block) =>
          !block.isAir &&
          block.location.x === Math.floor(point.x) &&
          block.location.z === Math.floor(point.z),
      )
      .sort((a, b) => b.location.y - a.location.y)[0];
  }
  getBlockFromRay(
    origin: Point,
    _direction: Point,
    options: { maxDistance: number; includePassableBlocks: boolean },
  ) {
    for (
      let y = Math.floor(origin.y);
      y >= Math.floor(origin.y - options.maxDistance);
      y--
    ) {
      const block = this.getBlock({ x: origin.x, y, z: origin.z });
      if (
        !options.includePassableBlocks &&
        [
          "minecraft:water",
          "minecraft:flowing_water",
          "minecraft:lava",
          "minecraft:flowing_lava",
        ].includes(block.typeId)
      )
        continue;
      if (
        block.isAir ||
        block.typeId === "ghosts:ghost_block" ||
        block.typeId === "ghosts:ectoplasm"
      )
        continue;
      const top = y + block.surfaceHeight;
      if (top <= origin.y && top >= origin.y - options.maxDistance)
        return {
          block,
          face: Direction.Up,
          faceLocation: { x: 0.5, y: block.surfaceHeight % 1, z: 0.5 },
        };
    }
    return undefined;
  }
  spawnEntity(type: string, point: Point) {
    const entity = new Entity(type, this, point);
    this.entities.push(entity);
    return entity;
  }
  spawnItem(item: ItemStack) {
    this.drops.push(item);
  }
  spawnParticle(type: string, point: Point) {
    this.particles.push({ type, point: { ...point } });
  }
}

let nextId = 0;
export class Entity {
  id = String(++nextId);
  isValid = true;
  properties = new Map<string, boolean>();
  health: number | undefined = 20;
  families = new Set(["mob"]);
  equipment = new Map<string, ItemStack>();
  constructor(
    public typeId: string,
    public dimension: Dimension,
    public location: Point,
  ) {}
  getProperty(key: string) {
    return this.properties.get(key);
  }
  getComponent(type: string) {
    if (type === "minecraft:health" && this.health === undefined)
      return undefined;
    if (type === "minecraft:type_family" && this.families.size === 0)
      return undefined;
    return {
      currentValue: this.health,
      hasTypeFamily: (family: string) => this.families.has(family),
      getEquipment: (slot: string) => this.equipment.get(slot),
    };
  }
  teleport(point: Point) {
    this.location = { ...point };
  }
  remove() {
    this.isValid = false;
  }
}

export class Player extends Entity {
  commandPermissionLevel = CommandPermissionLevel.Any;
  mode = GameMode.Survival;
  effects = new Map<string, { duration: number; amplifier?: number }>();
  particles: string[] = [];
  particlePoints: { type: string; point: Point }[] = [];
  messages: string[] = [];
  damage = 0;
  velocity = { x: 0, y: 0, z: 0 };
  isFlying = false;
  isGliding = false;
  isSwimming = false;
  isSneaking = false;
  isInWater = false;
  isJumping = false;
  canTeleport = true;
  extinguished = 0;
  inputInfo = {
    getButtonState: () =>
      this.isJumping ? ButtonState.Pressed : ButtonState.Released,
  };
  constructor(dimension: Dimension) {
    super("minecraft:player", dimension, { x: 0.5, y: 1, z: 0.5 });
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
  addEffect(type: string, duration: number, options?: { amplifier?: number }) {
    this.effects.set(type, { duration, amplifier: options?.amplifier ?? 0 });
  }
  getVelocity() {
    return this.velocity;
  }
  tryTeleport(
    point: Point,
    options?: { checkForBlocks?: boolean; keepVelocity?: boolean },
  ) {
    if (options?.keepVelocity)
      throw new Error(
        "keepVelocity is not supported for player teleportation.",
      );
    if (!this.canTeleport) return false;
    this.teleport(point);
    this.velocity = { x: 0, y: 0, z: 0 };
    return true;
  }
  applyImpulse(point: Point) {
    this.velocity = {
      x: this.velocity.x + point.x,
      y: this.velocity.y + point.y,
      z: this.velocity.z + point.z,
    };
  }
  spawnParticle(type: string, point: Point) {
    this.particles.push(type);
    this.particlePoints.push({ type, point: { ...point } });
  }
  applyDamage(amount: number) {
    this.damage += amount;
  }
  extinguishFire() {
    this.extinguished++;
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
export const worldProperties = new Map<string, boolean | number | string>();
export const world = {
  gameRules: { doMobSpawning: true },
  getDynamicProperty: (key: string) => worldProperties.get(key),
  setDynamicProperty: (key: string, value: boolean | number | string) =>
    worldProperties.set(key, value),
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
    entityHurt: signal<Omit<Damage, "cancel"> & { damage: number }>(),
    entityDie: signal<{
      deadEntity: Entity;
      damageSource: Damage["damageSource"];
    }>(),
    itemUse: signal<{ source: Player; itemStack: ItemStack }>(),
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
    dimension.particles = [];
    dimension.unloaded = false;
  }
  deferred.length = 0;
  actionResponses.length = 0;
  modalResponses.length = 0;
  shownForms.length = 0;
  worldProperties.clear();
  system.currentTick = 0;
  time = 18000;
  world.gameRules.doMobSpawning = true;
  const dimension = dimensions.get("overworld")!;
  const player = new Player(dimension);
  players = [player];
  return { player, dimension };
}
export function setTime(value: number) {
  time = value;
}
