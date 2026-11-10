import { PortalGun } from "./classes";

export var portalSP;
export var portalDP;
export var playerDP;
export var portalGunDP;

export var ID = {
  portalGunsIds: [
    "ram_pg:standard_portal_gun",
    "ram_pg:prototype_portal_gun",
    "ram_pg:blue_prototype_portal_gun",
    "ram_pg:evil_morty_portal_gun",
    "ram_pg:prime.portal_gun",
    "ram_pg:blue_standard_portal_gun",
    "ram_pg:blue_evil_morty_portal_gun",
    "ram_pg:yellow_standard_portal_gun",
    "ram_pg:yellow_prototype_portal_gun",
    "ram_pg:green_evil_morty_portal_gun",
    "ram_pg:blue_prime.portal_gun",
    "ram_pg:yellow_prime.portal_gun",
  ],

  dischargedPortalGuns: [
    "ram_pg:standard_portal_gun_discharged",
    "ram_pg:prototype_portal_gun_discharged",
    "ram_pg:evil_morty_portal_gun_discharged",
    "ram_pg:prime.portal_gun_discharged",
  ],

  components: {
    portalGunBases: [
      "ram_pg:standard_portal_gun_base",
      "ram_pg:prototype_portal_gun_base",
      "ram_pg:evil_morty_portal_gun_base",
      "ram_pg:prime.portal_gun_base",
    ],

    emptyTubes: ["ram_pg:empty_tube"],

    chargedTubes: [
      "ram_pg:green_portal_fluid",
      "ram_pg:blue_portal_fluid",
      "ram_pg:yellow_portal_fluid",
    ],

    solutions: [
      "ram_pg:interspatial_solution_full",
      "ram_pg:interdimensional_solution_full",
      "ram_pg:extradimensional_solution_full",
      "ram_pg:interspatial_solution_mid",
      "ram_pg:interdimensional_solution_mid",
      "ram_pg:extradimensional_solution_mid",
      "ram_pg:interspatial_solution_low",
      "ram_pg:interdimensional_solution_low",
      "ram_pg:extradimensional_solution_low",
    ],
  },

  projectiles: [
    "ram_pg:green_fluid_projectile",
    "ram_pg:green_fluid_projectile_high_pressure",
    "ram_pg:blue_fluid_projectile",
    "ram_pg:blue_fluid_projectile_high_pressure",
    "ram_pg:yellow_fluid_projectile",
    "ram_pg:yellow_fluid_projectile_high_pressure",
  ],

  portals: [
    "ram_pg:green_portal",
    "ram_pg:blue_portal",
    "ram_pg:yellow_portal",
  ],

  hair: [
    "ram_pg:rick_hair",
    "ram_pg:homesteader_rick_hair",
    "ram_pg:memory_rick_hair",
  ],
};

/* ======================================================
   PORTAL GUNS (SEM HARDCODE)
====================================================== */

export const portalGuns = [
  // STANDARD PORTAL GUN
  new PortalGun({
    typeId: ID.portalGunsIds[0],
    baseId: ID.components.portalGunBases[0],
    dischargedVersionId: ID.dischargedPortalGuns[0],
    emptyTubeId: ID.components.emptyTubes[0],
    chargedTubeId: ID.components.chargedTubes[0],
    projectileId: ID.projectiles[0],
    highPressureProjectileId: ID.projectiles[1],
    portalId: ID.portals[0],
    interfaceTextures: {
      title: "Portal Gun Menu",
      avatar: "rick_avatar",
      gun: "standard/standard_portal_gun",
      background: "textures/ram_pg/ui/pg_ui/menu/standard_pg",
      dischargedBg: "textures/ram_pg/ui/pg_ui/menu/standard_pg_discharged",
      waypoint: "textures/ram_pg/ui/hud/waypoint/standard_pg_waypoint",
    },
  }),

  // BLUE STANDARD PORTAL GUN
  new PortalGun({
    typeId: ID.portalGunsIds[5],
    baseId: ID.components.portalGunBases[0],
    dischargedVersionId: ID.dischargedPortalGuns[0],
    emptyTubeId: ID.components.emptyTubes[0],
    chargedTubeId: ID.components.chargedTubes[1],
    projectileId: ID.projectiles[2],
    highPressureProjectileId: ID.projectiles[3],
    portalId: ID.portals[1],
    interfaceTextures: {
      title: "Portal Gun Menu",
      avatar: "rick_avatar",
      gun: "standard/blue_standard_portal_gun",
      background: "textures/ram_pg/ui/pg_ui/menu/standard_pg_blue",
      dischargedBg: "textures/ram_pg/ui/pg_ui/menu/standard_pg_discharged",
      waypoint: "textures/ram_pg/ui/hud/waypoint/standard_pg_waypoint",
    },
  }),
  // YELLOW STANDARD PORTAL GUN
  new PortalGun({
    typeId: ID.portalGunsIds[7],
    baseId: ID.components.portalGunBases[0],
    dischargedVersionId: ID.dischargedPortalGuns[0],
    emptyTubeId: ID.components.emptyTubes[0],
    chargedTubeId: ID.components.chargedTubes[2],
    projectileId: ID.projectiles[4],
    highPressureProjectileId: ID.projectiles[5],
    portalId: ID.portals[2],
    interfaceTextures: {
      title: "Portal Gun Menu",
      avatar: "rick_avatar",
      gun: "standard/yellow_standard_portal_gun",
      background: "textures/ram_pg/ui/pg_ui/menu/standard_pg_yellow",
      dischargedBg: "textures/ram_pg/ui/pg_ui/menu/standard_pg_discharged",
      waypoint: "textures/ram_pg/ui/hud/waypoint/standard_pg_waypoint",
    },
  }),

  // GREEN PROTOTYPE PORTAL GUN
  new PortalGun({
    typeId: ID.portalGunsIds[1],
    baseId: ID.components.portalGunBases[1],
    dischargedVersionId: ID.dischargedPortalGuns[1],
    emptyTubeId: ID.components.emptyTubes[0],
    chargedTubeId: ID.components.chargedTubes[0],
    projectileId: ID.projectiles[0],
    highPressureProjectileId: ID.projectiles[1],
    portalId: ID.portals[0],
    interfaceTextures: {
      title: "Prototype",
      avatar: "memory_rick_avatar",
      gun: "prototype/prototype_portal_gun",
      background: "textures/ram_pg/ui/pg_ui/menu/prototype_pg",
      dischargedBg: "textures/ram_pg/ui/pg_ui/menu/prototype_pg_discharged",
      waypoint: "textures/ram_pg/ui/hud/waypoint/prototype_pg_waypoint",
    },
    basic: true,
  }),

  // BLUE PROTOTYPE PORTAL GUN
  new PortalGun({
    typeId: ID.portalGunsIds[2],
    baseId: ID.components.portalGunBases[1],
    dischargedVersionId: ID.dischargedPortalGuns[1],
    emptyTubeId: ID.components.emptyTubes[0],
    chargedTubeId: ID.components.chargedTubes[1],
    projectileId: ID.projectiles[2],
    highPressureProjectileId: ID.projectiles[3],
    portalId: ID.portals[1],
    interfaceTextures: {
      title: "Prototype",
      avatar: "memory_rick_avatar",
      gun: "prototype/blue_prototype_portal_gun",
      background: "textures/ram_pg/ui/pg_ui/menu/prototype_pg_blue",
      dischargedBg: "textures/ram_pg/ui/pg_ui/menu/prototype_pg_discharged",
      waypoint: "textures/ram_pg/ui/hud/waypoint/prototype_pg_waypoint",
    },
    basic: true,
  }),
  // YELLOW PROTOTYPE PORTAL GUN
  new PortalGun({
    typeId: ID.portalGunsIds[8],
    baseId: ID.components.portalGunBases[1],
    dischargedVersionId: ID.dischargedPortalGuns[1],
    emptyTubeId: ID.components.emptyTubes[0],
    chargedTubeId: ID.components.chargedTubes[2],
    projectileId: ID.projectiles[4],
    highPressureProjectileId: ID.projectiles[5],
    portalId: ID.portals[2],
    interfaceTextures: {
      title: "Prototype",
      avatar: "memory_rick_avatar",
      gun: "prototype/yellow_prototype_portal_gun",
      background: "textures/ram_pg/ui/pg_ui/menu/prototype_pg_yellow",
      dischargedBg: "textures/ram_pg/ui/pg_ui/menu/prototype_pg_discharged",
      waypoint: "textures/ram_pg/ui/hud/waypoint/prototype_pg_waypoint",
    },
    basic: true,
  }),

  // EVIL MORTY PORTAL GUN
  new PortalGun({
    typeId: ID.portalGunsIds[3],
    baseId: ID.components.portalGunBases[2],
    dischargedVersionId: ID.dischargedPortalGuns[2],
    emptyTubeId: ID.components.emptyTubes[0],
    chargedTubeId: ID.components.chargedTubes[2],
    projectileId: ID.projectiles[4],
    highPressureProjectileId: ID.projectiles[5],
    portalId: ID.portals[2],
    interfaceTextures: {
      title: "evil_morty_pg_ui",
      avatar: "evil_morty_avatar",
      gun: "evil_morty/evil_morty_portal_gun",
      background: "textures/ram_pg/ui/pg_ui/menu/evil_morty_pg",
      dischargedBg: "textures/ram_pg/ui/pg_ui/menu/evil_morty_pg_discharged",
      waypoint: "textures/ram_pg/ui/hud/waypoint/evil_morty_pg_waypoint",
    },
  }),

  // BLUE EVIL MORTY PORTAL GUN
  new PortalGun({
    typeId: ID.portalGunsIds[6],
    baseId: ID.components.portalGunBases[2],
    dischargedVersionId: ID.dischargedPortalGuns[2],
    emptyTubeId: ID.components.emptyTubes[0],
    chargedTubeId: ID.components.chargedTubes[1],
    projectileId: ID.projectiles[2],
    highPressureProjectileId: ID.projectiles[3],
    portalId: ID.portals[1],
    interfaceTextures: {
      title: "evil_morty_pg_ui",
      avatar: "evil_morty_avatar",
      gun: "evil_morty/blue_evil_morty_portal_gun",
      background: "textures/ram_pg/ui/pg_ui/menu/evil_morty_pg_blue",
      dischargedBg: "textures/ram_pg/ui/pg_ui/menu/evil_morty_pg_discharged",
      waypoint: "textures/ram_pg/ui/hud/waypoint/evil_morty_pg_waypoint",
    },
  }),
  // GREEN EVIL MORTY PORTAL GUN
  new PortalGun({
    typeId: ID.portalGunsIds[9],
    baseId: ID.components.portalGunBases[2],
    dischargedVersionId: ID.dischargedPortalGuns[2],
    emptyTubeId: ID.components.emptyTubes[0],
    chargedTubeId: ID.components.chargedTubes[0],
    projectileId: ID.projectiles[0],
    highPressureProjectileId: ID.projectiles[1],
    portalId: ID.portals[0],
    interfaceTextures: {
      title: "evil_morty_pg_ui",
      avatar: "evil_morty_avatar",
      gun: "evil_morty/green_evil_morty_portal_gun",
      background: "textures/ram_pg/ui/pg_ui/menu/evil_morty_pg_green",
      dischargedBg: "textures/ram_pg/ui/pg_ui/menu/evil_morty_pg_discharged",
      waypoint: "textures/ram_pg/ui/hud/waypoint/evil_morty_pg_waypoint",
    },
  }),

  // PRIME PORTAL GUN
  new PortalGun({
    typeId: ID.portalGunsIds[4],
    baseId: ID.components.portalGunBases[3],
    dischargedVersionId: ID.dischargedPortalGuns[3],
    emptyTubeId: ID.components.emptyTubes[0],
    chargedTubeId: ID.components.chargedTubes[0],
    projectileId: ID.projectiles[0],
    highPressureProjectileId: ID.projectiles[1],
    portalId: ID.portals[0],
    interfaceTextures: {
      title: "Portal Gun Menu",
      avatar: "rick_prime_avatar",
      gun: "prime/prime-portal_gun",
      background: "textures/ram_pg/ui/pg_ui/menu/prime_pg",
      dischargedBg: "textures/ram_pg/ui/pg_ui/menu/prime_pg_discharged",
      waypoint: "textures/ram_pg/items/portal_gun/prime/prime-portal_gun",
    },
  }),
  // BLUE PRIME PORTAL GUN
  new PortalGun({
    typeId: ID.portalGunsIds[10],
    baseId: ID.components.portalGunBases[3],
    dischargedVersionId: ID.dischargedPortalGuns[3],
    emptyTubeId: ID.components.emptyTubes[0],
    chargedTubeId: ID.components.chargedTubes[1],
    projectileId: ID.projectiles[2],
    highPressureProjectileId: ID.projectiles[3],
    portalId: ID.portals[1],
    interfaceTextures: {
      title: "Portal Gun Menu",
      avatar: "rick_prime_avatar",
      gun: "prime/blue_prime-portal_gun",
      background: "textures/ram_pg/ui/pg_ui/menu/prime_pg_blue",
      dischargedBg: "textures/ram_pg/ui/pg_ui/menu/prime_pg_discharged",
      waypoint: "textures/ram_pg/items/portal_gun/prime/prime-portal_gun",
    },
  }),
  // YELLOW PRIME PORTAL GUN
  new PortalGun({
    typeId: ID.portalGunsIds[11],
    baseId: ID.components.portalGunBases[3],
    dischargedVersionId: ID.dischargedPortalGuns[3],
    emptyTubeId: ID.components.emptyTubes[0],
    chargedTubeId: ID.components.chargedTubes[2],
    projectileId: ID.projectiles[4],
    highPressureProjectileId: ID.projectiles[5],
    portalId: ID.portals[2],
    interfaceTextures: {
      title: "Portal Gun Menu",
      avatar: "rick_prime_avatar",
      gun: "prime/yellow_prime-portal_gun",
      background: "textures/ram_pg/ui/pg_ui/menu/prime_pg_yellow",
      dischargedBg: "textures/ram_pg/ui/pg_ui/menu/prime_pg_discharged",
      waypoint: "textures/ram_pg/items/portal_gun/prime/prime-portal_gun",
    },
  }),
];

/* ======================================================
   PORTAL MODES
====================================================== */

export const PORTAL_MODES = {
  FIFO: "FIFO",
  LIFO: "LIFO",
  MULTI_PAIR: "Multi-Pair",
  ROOT: "Root",
  CUSTOM: "CUSTOM",
  TARGET: "Target",
};

/* ======================================================
   STRING PROPERTIES
====================================================== */

(function (portalSP) {
  portalSP["isLinked"] = "ram_pg:is_linked";
  portalSP["rotation"] = "ram_pg:rotation";
  portalSP["orientation"] = "ram_pg:orientation";
  portalSP["close"] = "ram_pg:close";
  portalSP["scale"] = "ram_pg:portal_scale";
  portalSP["touched"] = "ram_pg:touched";
  portalSP["blending"] = "ram_pg:blending";
})(portalSP || (portalSP = {}));

(function (portalDP) {
  portalDP["DualityPortalId"] = "ram_pg:dualityPortalId";
  portalDP["lastPortalUsed"] = "ram_pg:lastPortalUsed";
  portalDP["locationId"] = "ram_pg:location_id";
  portalDP["ownerPortalGun"] = "ram_pg:owner_portal_gun";
  portalDP["dualLocation"] = "ram_pg:dual_location";
  portalDP["autoClose"] = "ram_pg:auto_close";
  portalDP["isRoot"] = "ram_pg:is_root";
  portalDP["childList"] = "ram_pg:child_list";
  portalDP["anchorLocation"] = "ram_pg:anchorLocation";
  portalDP["fluidCheckCounter"] = "ram_pg:fluidCheckCounter";
  portalDP["fluidState"] = "ram_pg:fluidState";
  portalDP["blenderPortal"] = "ram_pg:blender_portal";
})(portalDP || (portalDP = {}));

(function (playerDP) {
  playerDP["portalGunId"] = "ram_pg:portal_gun_id";
  playerDP["blending"] = "ram_pg:blending";
})(playerDP || (playerDP = {}));

(function (portalGunDP) {
  portalGunDP["id"] = "ram_pg:portal_gun_id";
  portalGunDP["lastUser"] = "ram_pg:last_user";
  portalGunDP["portalList"] = "ram_pg:portal_list";
  portalGunDP["mode"] = "ram_pg:mode";
  portalGunDP["customLocation"] = "ram_pg:custom_location";
  portalGunDP["customLocationIndex"] = "ram_pg:custom_location_index";
  portalGunDP["targetLocation"] = "ram_pg:target_location";
  portalGunDP["savedLocations"] = "ram_pg:saved_locations";
  portalGunDP["historyLocations"] = "ram_pg:history_locations";
  portalGunDP["favoriteDimensions"] = "ram_pg:favorite_dimensions";
  portalGunDP["charge"] = "ram_pg:charge";
  portalGunDP["ownerId"] = "ram_pg:owner_id";
  portalGunDP["ownerName"] = "ram_pg:owner_name";
  portalGunDP["locked"] = "ram_pg:locked";
  portalGunDP["password"] = "ram_pg:password";
  portalGunDP["authorized"] = "ram_pg:authorized";

  portalGunDP["behavior"] = {
    autoClose: "ram_pg:auto_close",
    highPressure: "ram_pg:high_pressure",
    safePlacement: "ram_pg:safe_placement",
    fastLocationChange: "ram_pg:fast_location_change",
    scale: "ram_pg:portal_scale",
    tracker: "ram_pg:tracker",
    chargeBar: "ram_pg:charge_bar",
    floatingPortals: "ram_pg:floating_portals",
    floatingPortalsDistance: "ram_pg:floating_portals_distance",
    autoCloseDelay: "ram_pg:auto_close_delay",
    swingModeChange: "ram_pg:swing_mode_change"
  };
})(portalGunDP || (portalGunDP = {}));

export const AUTO_CLOSE_DELAY_DEFAULT = 15;
export const HIGH_PRESSURE_SPEED = 3;
export const HIGH_PRESSURE_RANGE = 160;
export const LOCATION_LIMIT = 100;
export const BASIC_LOCATION_LIMIT = 20;
export const HISTORY_LIMIT = 100;
export const TARGET_RANGE = 200;

export const worldDP = {
  activePortals: "ram_pg:activePortals",
  gunIds: "ram_pg:gun_ids",
};

// Not a real dimension: portals aimed at it blend whoever goes through them
// (portal/blender.js).
export const BLENDER_DIMENSION_ID = "ram_pg:blender_dimension";
