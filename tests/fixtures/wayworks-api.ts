// Deliberately small Bedrock simulator for the Wayworks runtime tests.
export const GameMode = {
  Creative: "creative",
  Survival: "survival",
  Adventure: "adventure",
  Spectator: "spectator",
};
type Point = { x: number; y: number; z: number };
type Item = { typeId: string; amount: number };

export class Container {
  size = 27;
  slots = new Map<number, Item>();
  get emptySlotsCount() {
    return this.size - this.slots.size;
  }
  getItem(slot: number) {
    const item = this.slots.get(slot);
    return item && { ...item };
  }
  setItem(slot: number, item?: Item) {
    if (item) this.slots.set(slot, { ...item });
    else this.slots.delete(slot);
  }
  addItem(item: Item) {
    let remaining = item.amount;
    for (let slot = 0; slot < this.size && remaining > 0; slot++) {
      const current = this.getItem(slot);
      if (current && current.typeId !== item.typeId) continue;
      const moved = Math.min(64 - (current?.amount ?? 0), remaining);
      if (moved)
        this.setItem(slot, {
          typeId: item.typeId,
          amount: (current?.amount ?? 0) + moved,
        });
      remaining -= moved;
    }
    return remaining ? { ...item, amount: remaining } : undefined;
  }
}

export const BlockPermutation = {
  resolve(type: string, states: Record<string, number> = {}) {
    return {
      type: { id: type },
      states,
      matches(other: string, expected: Record<string, number> = {}) {
        return (
          type === other &&
          Object.entries(expected).every(
            ([key, value]) => states[key] === value,
          )
        );
      },
    };
  },
};

class Block {
  permutation = BlockPermutation.resolve("minecraft:air");
  fail = false;
  constructor(
    public location: Point,
    public dimension: Dimension,
  ) {}
  get typeId() {
    return this.permutation.type.id;
  }
  get isAir() {
    return this.typeId === "minecraft:air";
  }
  get isLiquid() {
    return (
      this.typeId === "minecraft:water" || this.typeId === "minecraft:lava"
    );
  }
  setPermutation(permutation: ReturnType<typeof BlockPermutation.resolve>) {
    if (this.fail) throw new Error("Simulated block write failure");
    this.permutation = permutation;
  }
}

export class Dimension {
  blocks = new Map<string, Block>();
  entities: Entity[] = [];
  unloaded = false;
  constructor(public id: string) {}
  getBlock(position: Point): Block | undefined {
    if (this.unloaded) return undefined;
    const location = {
      x: Math.floor(position.x),
      y: Math.floor(position.y),
      z: Math.floor(position.z),
    };
    const key = JSON.stringify(location);
    let block = this.blocks.get(key);
    if (!block) {
      block = new Block(location, this);
      this.blocks.set(key, block);
    }
    return block;
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
  spawnEntity(type: string, position: Point) {
    const entity = new Entity(type, this, position);
    this.entities.push(entity);
    return entity;
  }
}

let id = 0;
export class Entity {
  id = `entity-${++id}`;
  isValid = true;
  nameTag = "";
  properties = new Map<string, unknown>();
  stock = new Container();
  canTeleport = true;
  constructor(
    public typeId: string,
    public dimension: Dimension,
    public location: Point,
  ) {}
  getComponent() {
    return { container: this.stock };
  }
  getDynamicProperty(key: string) {
    return this.properties.get(key);
  }
  setDynamicProperty(key: string, value?: unknown) {
    if (value === undefined) this.properties.delete(key);
    else this.properties.set(key, value);
  }
  tryTeleport(position: Point) {
    if (!this.canTeleport) return false;
    this.location = { ...position };
    return true;
  }
  remove() {
    this.isValid = false;
  }
}

export class Player extends Entity {
  messages: string[] = [];
  mode = GameMode.Survival;
  constructor(
    dimension: Dimension,
    location: Point = { x: 0.5, y: 1, z: 0.5 },
  ) {
    super("minecraft:player", dimension, location);
  }
  getGameMode() {
    return this.mode;
  }
  sendMessage(text: string) {
    this.messages.push(text);
  }
}

type Callback = (event: Record<string, unknown>) => void;
export const callbacks: Record<string, Callback> = {};
function signal(name: string) {
  return {
    subscribe(callback: Callback) {
      callbacks[name] = callback;
    },
  };
}
export const dimensions = new Map(
  ["overworld", "nether", "the_end"].map((id) => [
    id,
    new Dimension(`minecraft:${id}`),
  ]),
);
export const players: Player[] = [];
const properties = new Map<string, unknown>();
export const world = {
  afterEvents: {
    itemUse: signal("itemUse"),
    playerPlaceBlock: signal("place"),
    playerBreakBlock: signal("break"),
  },
  beforeEvents: {
    playerInteractWithEntity: signal("entity"),
    playerInteractWithBlock: signal("block"),
  },
  getDimension(id: string) {
    return dimensions.get(id)!;
  },
  getAllPlayers() {
    return players;
  },
  getDynamicPropertyIds() {
    return [...properties.keys()];
  },
  getDynamicProperty(key: string) {
    return properties.get(key);
  },
  setDynamicProperty(key: string, value?: unknown) {
    if (value === undefined) properties.delete(key);
    else properties.set(key, value);
  },
};
export const system = {
  run(callback: () => void) {
    callback();
  },
  runInterval(callback: () => void) {
    callbacks.tick = callback;
  },
};

export const responses: {
  canceled?: boolean;
  selection?: number;
  formValues?: unknown[];
}[] = [];
export class ActionFormData {
  title() {
    return this;
  }
  body() {
    return this;
  }
  button() {
    return this;
  }
  async show() {
    return responses.shift() ?? { canceled: true };
  }
}
export class ModalFormData extends ActionFormData {
  dropdown() {
    return this;
  }
  slider() {
    return this;
  }
  textField() {
    return this;
  }
  submitButton() {
    return this;
  }
}

export function reset() {
  players.length = 0;
  responses.length = 0;
  properties.clear();
  for (const dimension of dimensions.values()) {
    dimension.blocks.clear();
    dimension.entities.length = 0;
    dimension.unloaded = false;
  }
  const dimension = dimensions.get("overworld")!;
  const player = new Player(dimension);
  players.push(player);
  const worker = dimension.spawnEntity("wayworks:worker", {
    x: 0.5,
    y: 1,
    z: 0.5,
  });
  worker.setDynamicProperty("wayworks:owner", player.id);
  return { player, worker, dimension };
}
