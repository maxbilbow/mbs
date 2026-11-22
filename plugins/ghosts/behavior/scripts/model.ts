export const ids = {
  specter: "ghosts:specter",
  probe: "ghosts:storm_probe",
  ectoplasm: "ghosts:ectoplasm",
  ectoplasmBall: "ghosts:ectoplasm_ball",
  ectoplasmBallProjectile: "ghosts:ectoplasm_ball_projectile",
  guide: "ghosts:guide_book",
  block: "ghosts:ghost_block",
  visor: "ghosts:spectral_visor",
  chest: "ghosts:spectral_chestplate",
  pants: "ghosts:spectral_leggings",
  boots: "ghosts:spectral_boots",
  sword: "ghosts:spectral_sword",
} as const;

const tools = new Set([
  ids.sword,
  "ghosts:spectral_pickaxe",
  "ghosts:spectral_axe",
  "ghosts:spectral_shovel",
]);

export interface Gear {
  head?: string;
  chest?: string;
  legs?: string;
  feet?: string;
  hand?: string;
}

export interface Point {
  x: number;
  y: number;
  z: number;
}

export function nearbySpecterTarget(time: number): number {
  return time >= 13000 && time < 23000 ? 3 : 1;
}

export function insideGhost(point: Point, block: Point): boolean {
  return (
    point.x + 0.3 > block.x + 0.0001 &&
    point.x - 0.3 < block.x + 1 - 0.0001 &&
    point.y + 1.8 > block.y + 0.0001 &&
    point.y < block.y + 1 - 0.0001 &&
    point.z + 0.3 > block.z + 0.0001 &&
    point.z - 0.3 < block.z + 1 - 0.0001
  );
}

export function localMovement(previous: Point, current: Point): boolean {
  return (
    Math.hypot(current.x - previous.x, current.z - previous.z) <= 2 &&
    Math.abs(current.y - previous.y) <= 4
  );
}

export function ghostCollision(
  previous: Point,
  current: Point,
  blocks: Point[],
  gear: Gear,
): Point {
  if (!localMovement(previous, current)) return { ...current };
  const obstacles = blocks.filter((block) => !insideGhost(previous, block));
  const boundary = { ...previous };
  for (const axis of ["x", "z"] as const) {
    let value = current[axis];
    for (const block of obstacles) {
      const other = axis === "x" ? "z" : "x";
      if (
        boundary.y >= block.y + 1 - 0.0001 ||
        boundary.y + 1.8 <= block.y + 0.0001 ||
        boundary[other] + 0.3 <= block[other] + 0.0001 ||
        boundary[other] - 0.3 >= block[other] + 1 - 0.0001
      )
        continue;
      if (
        previous[axis] + 0.3 <= block[axis] + 0.0001 &&
        value + 0.3 > block[axis]
      )
        value = Math.min(value, block[axis] - 0.3);
      if (
        previous[axis] - 0.3 >= block[axis] + 1 - 0.0001 &&
        value - 0.3 < block[axis] + 1
      )
        value = Math.max(value, block[axis] + 1.3);
    }
    boundary[axis] = value;
  }
  const result = { ...current };
  if (
    gear.legs === ids.pants &&
    (boundary.x !== current.x ||
      boundary.z !== current.z ||
      blocks.some(
        (block) =>
          insideGhost(previous, block) ||
          (insideGhost(current, block) &&
            !(
              gear.feet === ids.boots &&
              previous.y >= block.y + 1 - 0.02 &&
              current.y <= previous.y
            )),
      ))
  ) {
    result.x = previous.x + (current.x - previous.x) * 0.02;
    result.z = previous.z + (current.z - previous.z) * 0.02;
  }
  if (gear.feet !== ids.boots) return result;
  if (
    current.y <= previous.y &&
    blocks.some((block) => insideGhost({ ...result, y: previous.y }, block))
  ) {
    result.y = previous.y;
    return result;
  }
  for (const block of obstacles) {
    if (
      result.x + 0.3 <= block.x + 0.0001 ||
      result.x - 0.3 >= block.x + 1 - 0.0001 ||
      result.z + 0.3 <= block.z + 0.0001 ||
      result.z - 0.3 >= block.z + 1 - 0.0001
    )
      continue;
    if (previous.y >= block.y + 1 - 0.02 && result.y < block.y + 1)
      result.y = Math.max(result.y, block.y + 1);
    if (previous.y + 1.8 <= block.y + 0.0001 && result.y + 1.8 > block.y)
      result.y = Math.min(result.y, block.y - 1.8);
  }
  return result;
}

export function hoverHeight(
  feetY: number,
  velocityY: number,
  surfaceY: number,
  shallowLiquid = false,
): number | undefined {
  const target = surfaceY + 0.125;
  if (
    velocityY > 0 ||
    surfaceY > feetY + (shallowLiquid ? 0.16 : 0.02) ||
    target - feetY > 0.3 ||
    feetY - target > 0.08
  )
    return undefined;
  return target;
}

export function attuned(gear: Gear): boolean {
  return (
    gear.head === ids.visor &&
    (gear.chest === ids.chest || gear.legs === ids.pants)
  );
}

export function canFight(gear: Gear): boolean {
  return attuned(gear) && gear.hand === ids.sword;
}

export function fullArmor(gear: Gear): boolean {
  return (
    gear.head === ids.visor &&
    gear.chest === ids.chest &&
    gear.legs === ids.pants &&
    gear.feet === ids.boots
  );
}

export function spectralTool(type?: string): boolean {
  return type !== undefined && tools.has(type);
}

export function darkStorm(
  time: number,
  thunder: boolean,
  light: number,
  openSky: boolean,
): boolean {
  return thunder && time >= 13000 && time < 23000 && light <= 7 && openSky;
}

export function canSpawn(
  nearby: number,
  total: number,
  enabled: boolean,
): boolean {
  return enabled && nearby < 4 && total < 24;
}

export function ectoplasmSurface(type: string): boolean {
  return [
    "minecraft:grass_block",
    "minecraft:dirt",
    "minecraft:coarse_dirt",
    "minecraft:podzol",
    "minecraft:mycelium",
    "minecraft:stone",
    "minecraft:sand",
    "minecraft:red_sand",
    "minecraft:gravel",
    "minecraft:snow",
    "minecraft:snow_block",
    "minecraft:moss_block",
    "minecraft:mud",
    "minecraft:deepslate",
  ].includes(type);
}
