import * as mc from "@minecraft/server";
import * as utils from "../utils/ids&variables";
import { guardGunAccess } from "../portal/security";
import { openPasswordPrompt } from "../gui/pg_menu";
import { formatDimensionName } from "../utils/string-slicing";
import { changePortalGunMode, getGunInstance } from "../utils/utils";

const CYCLE_MODES = [
  utils.PORTAL_MODES.FIFO,
  utils.PORTAL_MODES.LIFO,
  utils.PORTAL_MODES.MULTI_PAIR,
  utils.PORTAL_MODES.ROOT,
  utils.PORTAL_MODES.TARGET,
];
const BASIC_MODES = [utils.PORTAL_MODES.FIFO, utils.PORTAL_MODES.LIFO, utils.PORTAL_MODES.TARGET];

export function cycleMode(player, item) {
  if (!guardGunAccess(player, item, player.selectedSlotIndex, openPasswordPrompt)) return;
  const modes = getGunInstance(item)?.basic ? BASIC_MODES : CYCLE_MODES;
  const current = modes.indexOf(item.getDynamicProperty(utils.portalGunDP.mode));
  const next = modes[(current + 1) % modes.length];
  changePortalGunMode(player, player.getComponent("inventory"), item, next);
  player.onScreenDisplay.setActionBar({
    translate: "ram_pg.select_mode.set_mode",
    with: [next],
  });
}

const TARGET_COLORS = {
  green: { red: 0.45, green: 1, blue: 0.35 },
  blue: { red: 0.35, green: 0.75, blue: 1 },
  yellow: { red: 1, green: 0.85, blue: 0.25 },
};

const TARGET_FACES = {
  Up: { x: 0, y: 1, z: 0 },
  Down: { x: 0, y: -1, z: 0 },
  North: { x: 0, y: 0, z: -1 },
  South: { x: 0, y: 0, z: 1 },
  East: { x: 1, y: 0, z: 0 },
  West: { x: -1, y: 0, z: 0 },
};

export function markTarget(player, item, inventory) {
  if (!guardGunAccess(player, item, player.selectedSlotIndex, openPasswordPrompt)) return;
  const hit = player.getBlockFromViewDirection({
    includeLiquidBlocks: false,
    includePassableBlocks: false,
    maxDistance: utils.TARGET_RANGE,
  });
  if (!hit) {
    player.onScreenDisplay.setActionBar({ translate: "ram_pg.target.no_block" });
    player.dimension.playSound("ram_pg:error_sound", player.location);
    return;
  }
  const normal = TARGET_FACES[hit.face] ?? TARGET_FACES.Up;
  const block = hit.block.location;
  const target = {
    name: "",
    id: Math.floor(Math.random() * 1000000000),
    x: block.x + normal.x,
    y: block.y + normal.y,
    z: block.z + normal.z,
    dimensionId: player.dimension.id,
  };
  item.setDynamicProperty(utils.portalGunDP.targetLocation, JSON.stringify(target));
  inventory.setItem(player.selectedSlotIndex, item);
  player.dimension.playSound("ram_pg:selection", player.location);
  const fluid = getGunInstance(item)?.chargedTubeId?.match(/green|blue|yellow/)?.[0] ?? "green";
  const colors = new mc.MolangVariableMap();
  colors.setColorRGB("variable.color", TARGET_COLORS[fluid]);
  const center = { x: target.x + 0.5, y: target.y + 0.5, z: target.z + 0.5 };
  for (const particle of ["ram_pg:target_marker", "ram_pg:target_marker_spark"]) {
    try {
      player.spawnParticle(particle, center, colors);
    } catch {}
  }
  player.onScreenDisplay.setActionBar({
    translate: "ram_pg.target.marked",
    with: [String(target.x), String(target.y), String(target.z)],
  });
}

export function waypointHandler(player, items) {
  for (let i = 0; i < items.length; i++) {
    const entity = items[i];
    if (!entity.isValid) continue;

    let realTypeId = entity.typeId;

    const itemComp = entity.getComponent("minecraft:item");
    if (itemComp) realTypeId = itemComp.itemStack.typeId;

    const gunData = utils.portalGuns.find(
      (gun) =>
        gun.typeId === realTypeId || gun.dischargedVersionId === realTypeId,
    );
    if (!gunData || gunData.basic) continue;

    const portalGunItem = entity.getComponent("minecraft:item").itemStack;
    if (!portalGunItem) continue;

    const isTrackerEnabled = portalGunItem.getDynamicProperty("ram_pg:tracker");
    if (!isTrackerEnabled) continue;

    const textureSelector = {
      textureBoundsList: [
        {
          lowerBound: 0,
          texture: {
            iconHeight: 1.0,
            iconWidth: 1.0,
            path: gunData.interfaceTextures.waypoint,
          },
        },
      ],
    };

    const entityRules = {
      showDead: true,
      showInvisible: true,
      showSneaking: true,
    };

    const waypoint = new mc.EntityWaypoint(
      entity,
      textureSelector,
      entityRules,
    );

    player.locatorBar.addWaypoint(waypoint);
  }
}

export function switchLocation(player, item, inventory, step = player.isSneaking ? -1 : 1) {
  const fastLocationChange = item.getDynamicProperty(
    utils.portalGunDP.behavior.fastLocationChange,
  );
  if (!fastLocationChange) return;
  if (!guardGunAccess(player, item, player.selectedSlotIndex, openPasswordPrompt)) return;

  let savedLocationsJson = item.getDynamicProperty(utils.portalGunDP.savedLocations);
  let savedLocations = savedLocationsJson ? JSON.parse(savedLocationsJson) : [];
  if (savedLocations.length === 0) return;

  let mode = item.getDynamicProperty(utils.portalGunDP.mode);
  let currentIndex = Number(
    item.getDynamicProperty(utils.portalGunDP.customLocationIndex) ?? 0,
  );

  if (!(currentIndex >= 0 && currentIndex < savedLocations.length)) currentIndex = 0;
  if (mode !== utils.PORTAL_MODES.CUSTOM) {
    item.setDynamicProperty(utils.portalGunDP.mode, utils.PORTAL_MODES.CUSTOM);
  } else {
    currentIndex = (((currentIndex + step) % savedLocations.length) + savedLocations.length) % savedLocations.length;
  }

  item.setDynamicProperty(
    utils.portalGunDP.customLocation,
    JSON.stringify(savedLocations[currentIndex]),
  );
  item.setDynamicProperty(utils.portalGunDP.customLocationIndex, currentIndex);

  let dimension = savedLocations[currentIndex].dimensionId;
  switch (dimension) {
    case "minecraft:overworld":
      dimension = "Overworld";
      break;
    case "minecraft:nether":
      dimension = "Nether";
      break;
    case "minecraft:the_end":
      dimension = "The End";
      break;
    default:
      dimension = formatDimensionName(dimension);
  }

  inventory.setItem(player.selectedSlotIndex, item);

  player.dimension.playSound("ram_pg:selection", player.location);
  player.onScreenDisplay.setActionBar({
    translate: "ram_pg.location_selection",
    with: [
      String(savedLocations[currentIndex].name),
      String(currentIndex + 1),
      String(savedLocations.length),
      dimension,
    ],
  });
}
