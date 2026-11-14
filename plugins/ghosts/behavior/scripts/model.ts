export const ids = {
  specter: "ghosts:specter",
  probe: "ghosts:storm_probe",
  ectoplasm: "ghosts:ectoplasm",
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

// Only downward crossings count: never lift players through a block from below.
export function platformTop(
  previous: Point,
  current: Point,
  velocityY: number,
  blocks: Point[],
): number | undefined {
  if (
    velocityY > 0 ||
    Math.hypot(current.x - previous.x, current.z - previous.z) > 2 ||
    previous.y - current.y > 4
  )
    return undefined;
  return blocks
    .filter(
      (block) =>
        current.x + 0.29 > block.x &&
        current.x - 0.29 < block.x + 1 &&
        current.z + 0.29 > block.z &&
        current.z - 0.29 < block.z + 1 &&
        previous.y >= block.y + 1 - 0.02 &&
        current.y <= block.y + 1 &&
        current.y >= block.y - 3,
    )
    .reduce<
      number | undefined
    >((top, block) => Math.max(top ?? -Infinity, block.y + 1), undefined);
}
