export interface Point {
  x: number;
  y: number;
  z: number;
}

export const directions = ["North", "East", "South", "West"] as const;
export const surfaces = [
  "minecraft:cobblestone",
  "minecraft:stone_bricks",
  "minecraft:black_concrete",
] as const;
export const supplies = [...surfaces, "minecraft:rail"] as const;

export interface BuildJob {
  kind: "road" | "rail";
  origin: Point;
  direction: number;
  width: number;
  length: number;
  progress: number;
  surface: string;
}

export interface BusJob {
  kind: "bus";
  route: string;
  next: number;
  wait: number;
}

export type Job = BuildJob | BusJob;

export interface Stop {
  owner: string;
  dimension: string;
  position: Point;
  route: string;
  order: number;
}

export interface Placement {
  position: Point;
  type: string;
  states?: Record<string, number>;
}

const natural = new Set(
  [
    "air",
    "dirt",
    "grass_block",
    "dirt_with_roots",
    "coarse_dirt",
    "podzol",
    "mycelium",
    "stone",
    "granite",
    "diorite",
    "andesite",
    "deepslate",
    "tuff",
    "calcite",
    "sand",
    "red_sand",
    "gravel",
    "clay",
    "mud",
    "snow",
    "snow_layer",
    "short_grass",
    "tall_grass",
    "fern",
    "large_fern",
    "deadbush",
    "dandelion",
    "poppy",
  ].map((name) => `minecraft:${name}`),
);

export function canExcavate(type: string): boolean {
  return natural.has(type);
}

export function supportsRoute(type: string): boolean {
  return (
    type === "wayworks:bus_stop" ||
    surfaces.some((surface) => surface === type) ||
    (natural.has(type) &&
      ![
        "air",
        "snow_layer",
        "short_grass",
        "tall_grass",
        "fern",
        "large_fern",
        "deadbush",
        "dandelion",
        "poppy",
      ].some((name) => type === `minecraft:${name}`))
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integer(value: unknown, min: number, max: number): value is number {
  return (
    Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max
  );
}

function point(value: unknown): value is Point {
  return (
    record(value) &&
    ["x", "y", "z"].every((key) => integer(value[key], -30_000_000, 30_000_000))
  );
}

export function routeName(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9 _-]{0,31}$/.test(value.trim())
  ) {
    throw new Error(
      "Route names need 1-32 letters, numbers, spaces, hyphens or underscores.",
    );
  }
  return value.trim();
}

export function parseJob(value: string): Job {
  const job: unknown = JSON.parse(value);
  if (record(job)) {
    if (
      job.kind === "bus" &&
      routeName(job.route) === job.route &&
      integer(job.next, 0, 127) &&
      integer(job.wait, 0, 20)
    ) {
      return {
        kind: "bus",
        route: String(job.route),
        next: job.next,
        wait: job.wait,
      };
    }
    if (
      (job.kind === "road" || job.kind === "rail") &&
      point(job.origin) &&
      integer(job.direction, 0, 3) &&
      integer(job.width, 1, 9) &&
      integer(job.length, 1, 128) &&
      integer(job.progress, 0, Number(job.length)) &&
      surfaces.some((type) => type === job.surface)
    ) {
      return {
        kind: job.kind,
        origin: job.origin,
        direction: job.direction,
        width: job.width,
        length: job.length,
        progress: job.progress,
        surface: String(job.surface),
      };
    }
  }
  throw new Error("Invalid saved Wayworks job.");
}

export function parseStop(value: string): Stop {
  const stop: unknown = JSON.parse(value);
  if (
    !record(stop) ||
    typeof stop.owner !== "string" ||
    typeof stop.dimension !== "string" ||
    !point(stop.position) ||
    !integer(stop.order, 1, 128) ||
    !(stop.route === "" || routeName(stop.route) === stop.route)
  ) {
    throw new Error("Invalid saved Wayworks stop.");
  }
  return {
    owner: stop.owner,
    dimension: stop.dimension,
    position: stop.position,
    route: String(stop.route),
    order: stop.order,
  };
}

export function rowPlan(job: BuildJob): Placement[] {
  const forward = [
    { x: 0, z: -1 },
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: -1, z: 0 },
  ][job.direction];
  if (!forward) throw new Error("Invalid construction direction.");
  const result: Placement[] = [];
  for (let lane = 0; lane < job.width; lane++) {
    const offset = lane - Math.floor((job.width - 1) / 2);
    const position = {
      x: job.origin.x + forward.x * job.progress - forward.z * offset,
      y: job.origin.y,
      z: job.origin.z + forward.z * job.progress + forward.x * offset,
    };
    result.push({ position, type: job.surface });
    for (let height = 1; height <= 3; height++) {
      result.push({
        position: { ...position, y: position.y + height },
        type:
          job.kind === "rail" && height === 1
            ? "minecraft:rail"
            : "minecraft:air",
        ...(job.kind === "rail" && height === 1
          ? { states: { rail_direction: job.direction % 2 } }
          : {}),
      });
    }
  }
  return result;
}

export function orderedStops(
  stops: Stop[],
  owner: string,
  route: string,
  dimension: string,
): Stop[] {
  const result = stops
    .filter(
      (stop) =>
        stop.owner === owner &&
        stop.route === route &&
        stop.dimension === dimension,
    )
    .sort((a, b) => a.order - b.order);
  if (result.length < 2)
    throw new Error("A route needs at least two stops in this dimension.");
  if (
    result.some(
      (stop, index) => index > 0 && stop.order === result[index - 1].order,
    )
  ) {
    throw new Error("Route stop numbers must be unique.");
  }
  if (result.some((stop) => stop.position.y !== result[0].position.y)) {
    throw new Error("Version 1 routes require stops at the same height.");
  }
  return result;
}
