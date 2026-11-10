import {
  ItemStack,
  world,
  EquipmentSlot,
  BiomeTypes,
  DimensionTypes,
  system,
} from "@minecraft/server";
import {
  ActionFormData,
  ModalFormData,
  FormCancelationReason,
} from "@minecraft/server-ui";
import {
  changePortalGunMode,
  findPortalGunInInventory,
  removeAllPortals,
  getGunInstance,
  clearChargeBar,
  isBasicItem,
  locationLimit,
} from "../utils/utils";
import {
  portalGunDP,
  ID,
  portalGuns,
  BLENDER_DIMENSION_ID,
  AUTO_CLOSE_DELAY_DEFAULT,
  playerDP,
  HISTORY_LIMIT,
} from "../utils/ids&variables";
import { abjustTextLength, formatDimensionName } from "../utils/string-slicing";
import { showGunDisplay, hideGunDisplay } from "./gunDisplay";
import {
  authorize,
  canManageGun,
  canUseGun,
  checkPassword,
  hashPassword,
  hasPassword,
  isLocked,
  isOwner,
  readAuthorized,
  SECURITY_PROPERTIES,
  shockPlayer,
  transferOwnership,
  writeAuthorized,
} from "../portal/security";
import {
  findGunsById,
  generateGunId,
  isValidGunId,
  normalizeGunId,
  sameGunId,
  transferGunData,
} from "../portal/gunData";

/**
 * @param {Player} player
 *
 * Causes the player to perform a button-click animation on the portal gun.
 */
function playPlayerAnimation(player) {
  player.playAnimation("animation.ram_pg.player.portal_gun_interface", {
    blendOutTime: 0.5,
    stopExpression: "query.is_moving",
  });
}

/**
 * @param {Player} player
 *
 * Forces player to stop any animation he is playing.
 */
function stopPlayerAnimation(player) {
  player.playAnimation("animation.ram_pg.player.reset");
  hideGunDisplay(player);
}

/**
 * Opens the main Portal Gun menu for the player.
 *
 * @param {Player} player - The player interacting with the Portal Gun.
 * @param {ItemStack} portalGunItem - The Portal Gun item stack being used.
 * @param {PortalGun} gunInstance - The Portal Gun instance containing specific data and textures.
 *
 * Displays the main options such as:
 * Saved Locations, Set Coordinates, Select Mode, and Settings.
 */

const BATTERY_CELLS = 10;

function batteryIndicator(charge, gunInstance) {
  const cells = Math.min(BATTERY_CELLS, Math.max(0, Math.ceil(charge / 10)));
  const fluid = gunInstance?.chargedTubeId?.match(/green|blue|yellow/)?.[0] ?? "green";
  return `textures/ram_pg/ui/pg_ui/battery/${fluid}/level_${cells}`;
}

export function openPortalGunMenu(player, portalGunItem, gunInstance = null) {
  const inventory = player.getComponent("inventory");

  if (!gunInstance) {
    gunInstance = getGunInstance(portalGunItem);
  }

  const charge = portalGunItem.getDynamicProperty(portalGunDP.charge) ?? 0;
  const batteryCode = batteryIndicator(charge, gunInstance);

  let { title, avatar, gun, background, dischargedBg } =
    gunInstance.interfaceTextures ?? {};
  if (charge == 0) {
    background = dischargedBg ?? background;
  }

  const customUi = new ActionFormData()
    .title(`${title}`)
    .body(abjustTextLength(`${background}`, 100) + abjustTextLength(batteryCode, 100))
    .button(
      { translate: "ram_pg.saved_locations.title" },
      `textures/ram_pg/ui/pg_ui/menu/${avatar}`,
    )
    .button(
      { translate: "ram_pg.set_coordinates.title" },
      `${LIGHT_ICONS}/target`,
    )
    .button(
      { translate: "ram_pg.select_mode.title" },
      `textures/ram_pg/items/portal_gun/${gun}`,
    )
    .button("", `${LIGHT_ICONS}/more`)
    .button("", `${LIGHT_ICONS}/settings`)
    .button("", `${LIGHT_ICONS}/history`)
    .button("", `${LIGHT_ICONS}/close`)
    .button("", `${LIGHT_ICONS}/unplug`);

  playPlayerAnimation(player);
  showGunDisplay(player, portalGunItem);
  player.dimension.playSound("ram_pg:open_menu", player.location);

  customUi.show(player).then((response) => {
    switch (response.selection) {
      case 0:
        openSavedLocationsForm(player, inventory, portalGunItem);
        break;
      case 1:
        openSetCoordinatesForm(player, inventory, portalGunItem);
        break;
      case 2:
        openSelectModeForm(player, inventory, portalGunItem);
        break;
      case 3:
        openSettingsForm(player, inventory, portalGunItem);
        break;
      case 4:
        openBehaviorSettingsForm(player, portalGunItem, inventory);
        break;
      case 5:
        if (isBasicGun(portalGunItem)) openPortalGunMenu(player, portalGunItem);
        else openHistoryForm(player, inventory, portalGunItem);
        break;
      case 7:
        stopPlayerAnimation(player);
        dismountPortalGun(player, portalGunItem, inventory);
        break;
      default: {
        stopPlayerAnimation(player);
      }
    }
  });
}

const THEME_KEYS = {
  "Portal Gun Menu": "std",
  Prototype: "proto",
  evil_morty_pg_ui: "evil",
};

const THEME_TOKENS = {
  std: "ram_pg:std|",
  proto: "ram_pg:pro|",
  evil: "ram_pg:evl|",
};

const TERMINAL_TOKENS = {
  std: "ram_pg:tsd|",
  proto: "ram_pg:tpr|",
  evil: "ram_pg:tev|",
};

const LIST_TOKENS = {
  std: "ram_pg:lsd|",
  proto: "ram_pg:lpr|",
  evil: "ram_pg:lev|",
};

const ICONS = "textures/ram_pg/ui/pg_ui/icons";
const LIGHT_ICONS = `${ICONS}/light`;

const MODE_OPTIONS = [
  { mode: "FIFO", key: "fifo", basic: true },
  { mode: "LIFO", key: "lifo", basic: true },
  { mode: "Multi-Pair", key: "multipair", basic: false },
  { mode: "Root", key: "root", basic: false },
  { mode: "Target", key: "target", basic: true },
];

function modesExplained(portalGunItem) {
  const rawtext = [{ translate: "ram_pg.select_mode.explained.header" }];
  for (const { key } of availableModes(portalGunItem)) {
    rawtext.push({ text: "\n\n" }, { translate: `ram_pg.select_mode.explained.${key}` });
  }
  rawtext.push({ text: "\n\n" }, { translate: "ram_pg.select_mode.explained.custom" });
  return { rawtext };
}

function isBasicGun(portalGunItem) {
  return getGunInstance(portalGunItem)?.basic === true;
}

function availableModes(portalGunItem) {
  const basic = isBasicGun(portalGunItem);
  return MODE_OPTIONS.filter((option) => option.basic || !basic);
}

function themeKey(portalGunItem) {
  const menuTitle = getGunInstance(portalGunItem)?.interfaceTextures?.title;
  return THEME_KEYS[menuTitle] ?? "std";
}

function icon(portalGunItem, name) {
  return `${ICONS}/${themeKey(portalGunItem)}/${name}`;
}

const GUN_INFO_WIDTHS = [8, 10, 4];

function gunInfo(portalGunItem) {
  const id = portalGunItem.getDynamicProperty(portalGunDP.id);
  const mode = portalGunItem.getDynamicProperty(portalGunDP.mode) ?? "FIFO";
  const charge = portalGunItem.getDynamicProperty(portalGunDP.charge) ?? 0;
  return [String(id ?? "-"), String(mode), String(charge)]
    .map((value, index) => abjustTextLength(value, GUN_INFO_WIDTHS[index]))
    .join("");
}

function gunView(player, portalGunItem) {
  player.playSound("ram_pg:ui_scan");
  return showGunDisplay(player, portalGunItem);
}

function themed(player, portalGunItem, title, tokens = THEME_TOKENS) {
  const token = tokens[themeKey(portalGunItem)];
  return {
    rawtext: [{ text: token + gunInfo(portalGunItem) }, typeof title === "string" ? { text: title } : title],
  };
}

const MAX_HORIZONTAL_COORDINATE = 1500000;

function isBusy(response) {
  return response.cancelationReason === FormCancelationReason.UserBusy;
}

function actionMenu(portalGunItem, title, body, { tokens = THEME_TOKENS, view = true } = {}) {
  const form = new ActionFormData();
  if (body) form.label(body);
  const actions = [];

  const menu = {
    button(text, icon, action) {
      form.button(text, icon);
      actions.push(action);
      return menu;
    },
    divider() {
      form.divider();
      return menu;
    },
    label(text) {
      form.label(text);
      return menu;
    },
    show(player, onClose) {
      form.title(themed(player, portalGunItem, title, tokens));
      if (view) form.body(gunView(player, portalGunItem));
      else hideGunDisplay(player);
      form.show(player).then((response) => {
        if (isBusy(response)) return stopPlayerAnimation(player);
        const action = actions[response.selection];
        if (action) action();
        else onClose();
      });
    },
  };
  return menu;
}

function modalMenu(portalGunItem, title, error) {
  const steps = [];
  const names = [null];

  const menu = {
    label(text) {
      steps.push((form) => form.label(text));
      names.push(null);
      return menu;
    },
    text(name, label, placeholder, defaultValue) {
      steps.push((form) =>
        form.textField(label, placeholder, {
          defaultValue: String(defaultValue ?? ""),
        }),
      );
      names.push(name);
      return menu;
    },
    dropdown(name, label, items, defaultValueIndex, tooltip) {
      steps.push((form) => form.dropdown(label, items, { defaultValueIndex, tooltip }));
      names.push(name);
      return menu;
    },
    slider(name, label, min, max, valueStep, defaultValue) {
      steps.push((form) => form.slider(label, min, max, { valueStep, defaultValue }));
      names.push(name);
      return menu;
    },
    toggle(name, label, defaultValue) {
      steps.push((form) => form.toggle(label, { defaultValue }));
      names.push(name);
      return menu;
    },
    submit(text) {
      steps.push((form) => form.submitButton(text));
      return menu;
    },
    show(player, onSubmit, onClose) {
      const form = new ModalFormData()
        .title(themed(player, portalGunItem, title))
        .header(gunView(player, portalGunItem));
      for (const step of steps) step(form);
      form.show(player).then((response) => {
        if (isBusy(response)) return stopPlayerAnimation(player);
        if (!response.formValues) return onClose();

        const values = {};
        names.forEach((name, index) => {
          if (name) values[name] = response.formValues[index];
        });
        onSubmit(values);
      });
    },
  };

  if (error) menu.label(typeof error === "string" ? { translate: error } : error);
  return menu;
}

function getSavedLocations(portalGunItem) {
  const json = portalGunItem.getDynamicProperty(portalGunDP.savedLocations);
  return json ? JSON.parse(json) : [];
}

function updateGunInInventory(player, inventory, portalGunItem) {
  const portalGunId = portalGunItem.getDynamicProperty(portalGunDP.id);
  const itemObject = findPortalGunInInventory(player, portalGunId);
  if (itemObject) {
    inventory.container.setItem(itemObject.slotIndex, portalGunItem);
  }
}

function storeSavedLocations(player, inventory, portalGunItem, savedLocations) {
  portalGunItem.setDynamicProperty(
    portalGunDP.savedLocations,
    JSON.stringify(savedLocations),
  );
  updateGunInInventory(player, inventory, portalGunItem);
}

function setDestination(player, inventory, portalGunItem, location) {
  portalGunItem.setDynamicProperty(portalGunDP.mode, "CUSTOM");
  portalGunItem.setDynamicProperty(
    portalGunDP.customLocation,
    JSON.stringify(location),
  );
  updateGunInInventory(player, inventory, portalGunItem);

  player.onScreenDisplay.setActionBar({
    translate: "ram_pg.portal_gun.set_to_location",
    with: [
      String(location.name),
      String(location.x),
      String(location.y),
      String(location.z),
    ],
  });
  player.dimension.playSound("ram_pg:selection", player.location);
}

function newLocationId() {
  return Math.floor(Math.random() * 1000000000);
}

function currentBlockLocation(player) {
  const { x, y, z } = player.location;
  return { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) };
}

const VANILLA_DIMENSIONS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];
const DIMENSION_PAGE_SIZE = 16;
const FAVORITE_DIMENSION_LIMIT = 16;
const SEARCH_ACTIVE_MARKER = "§k§r§k§r§r";

let dimensionTypeIds;
let dimensionTypeSet;
const dimensionEntries = new Map();
let browserDimensionOrder;
let browserSearchKeys;

function registeredDimensionIds() {
  if (!dimensionTypeIds) {
    dimensionTypeIds = DimensionTypes.getAll().map(({ typeId }) => typeId);
    dimensionTypeSet = new Set(dimensionTypeIds);
  }
  return dimensionTypeIds;
}

function dimensionEntryLabel(typeId) {
  const { dimName, color } = getDimensionLabel(typeId);
  if (dimName !== typeId) return `${color}${dimName}§r`;
  try {
    return { translate: world.getDimension(typeId).localizationKey };
  } catch {
    return typeId;
  }
}

function dimensionEntry(typeId) {
  let entry = dimensionEntries.get(typeId);
  if (!entry) {
    entry = { id: typeId, label: dimensionEntryLabel(typeId) };
    dimensionEntries.set(typeId, entry);
  }
  return entry;
}

function savedDimensionIds(portalGunItem) {
  try {
    return getSavedLocations(portalGunItem).map(({ dimensionId }) => dimensionId);
  } catch {
    return [];
  }
}

function getFavoriteDimensions(portalGunItem) {
  try {
    const list = JSON.parse(portalGunItem.getDynamicProperty(portalGunDP.favoriteDimensions) ?? "[]");
    return Array.isArray(list) ? list.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function storeFavoriteDimensions(player, inventory, portalGunItem, favorites) {
  portalGunItem.setDynamicProperty(portalGunDP.favoriteDimensions, JSON.stringify(favorites));
  updateGunInInventory(player, inventory, portalGunItem);
}

function isKnownDimension(dimensionId) {
  registeredDimensionIds();
  return dimensionTypeSet.has(dimensionId) || dimensionId === BLENDER_DIMENSION_ID;
}

function toggleFavoriteDimension(player, inventory, portalGunItem, dimensionId) {
  const favorites = getFavoriteDimensions(portalGunItem).filter(isKnownDimension);
  const index = favorites.indexOf(dimensionId);
  if (index >= 0) favorites.splice(index, 1);
  else if (favorites.length >= FAVORITE_DIMENSION_LIMIT) return false;
  else favorites.push(dimensionId);
  storeFavoriteDimensions(player, inventory, portalGunItem, favorites);
  return true;
}

function normalizeDimensionSearch(text) {
  return text.toLowerCase().replace(/[\s_.]+/g, "");
}

function dimensionBrowserOrder() {
  if (!browserDimensionOrder) {
    const registered = registeredDimensionIds();
    browserDimensionOrder = [
      ...registered.filter((id) => VANILLA_DIMENSIONS.includes(id)),
      BLENDER_DIMENSION_ID,
      ...registered.filter((id) => !VANILLA_DIMENSIONS.includes(id)),
    ];
  }
  return browserDimensionOrder;
}

function browsableDimensions(player, portalGunItem, context, term) {
  const order = dimensionBrowserOrder();
  const query = normalizeDimensionSearch(term);
  if (query && !browserSearchKeys) browserSearchKeys = order.map(normalizeDimensionSearch);
  const hideEnd = context.destination && blocksEnd(player, portalGunItem, "minecraft:the_end");
  const favorites = new Set(getFavoriteDimensions(portalGunItem).filter(isKnownDimension));
  const first = [];
  const rest = [];
  for (let index = 0; index < order.length; index++) {
    const id = order[index];
    if (hideEnd && id === "minecraft:the_end") continue;
    if (query && !browserSearchKeys[index].includes(query)) continue;
    (favorites.has(id) ? first : rest).push(id);
  }
  return { ids: first.concat(rest), favorites };
}

function listDimensions(player, portalGunItem, extraIds = []) {
  registeredDimensionIds();
  const ids = new Set();
  const wanted = [
    ...VANILLA_DIMENSIONS,
    player?.dimension.id,
    ...(portalGunItem ? getFavoriteDimensions(portalGunItem) : []),
    ...extraIds,
  ];
  for (const id of wanted) {
    if (dimensionTypeSet.has(id)) ids.add(id);
  }
  return [...ids, BLENDER_DIMENSION_ID].map(dimensionEntry);
}

function hiddenDimensionCount(dimensions) {
  const listed = dimensions.filter(({ id }) => dimensionTypeSet.has(id)).length;
  return Math.max(0, registeredDimensionIds().length - listed);
}

function dimensionRuleTooltip(hidden) {
  return hidden > 0 ? { translate: "ram_pg.coords.dimension_rule" } : undefined;
}

function destinationDimensions(player, interspatial, portalGunItem, extraIds = []) {
  const listed = listDimensions(player, portalGunItem, extraIds);
  const hidden = hiddenDimensionCount(listed);
  const dimensions = listed.filter(({ id }) => !blocksEnd(player, portalGunItem, id));
  const own = dimensions.findIndex(({ id }) => id === player.dimension.id);

  if (interspatial) {
    const current = dimensions[own] ?? {
      id: player.dimension.id,
      label: getDimensionLabel(player.dimension.id).dimName,
    };
    return { dimensions: [current], own: 0, hidden: 0 };
  }
  return { dimensions, own: Math.max(0, own), hidden };
}

function blocksEnd(player, portalGunItem, dimensionId) {
  return (
    dimensionId === "minecraft:the_end" &&
    player.dimension.id !== "minecraft:the_end" &&
    getGunInstance(portalGunItem)?.chargedTubeId === ID.components.chargedTubes[0]
  );
}

function asRawMessage(label) {
  return typeof label === "string" ? { text: label } : label;
}

function dimensionLabel(dimensionId) {
  return dimensionEntry(dimensionId).label;
}

const DIMENSION_ICONS = {
  Overworld: "dim_overworld",
  Nether: "dim_nether",
  "The End": "dim_end",
};

function dimensionIcon(portalGunItem, dimensionId) {
  const { dimName } = getDimensionLabel(dimensionId);
  return icon(portalGunItem, DIMENSION_ICONS[dimName] ?? "dim_custom");
}

function biomeName(biomeId) {
  const [namespace, name] = biomeId.includes(":")
    ? biomeId.split(":")
    : ["minecraft", biomeId];
  const title = name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return namespace === "minecraft" ? title : `${title} (${namespace})`;
}

const LEGACY_BIOMES = new Set([
  "minecraft:bamboo_jungle_hills",
  "minecraft:birch_forest_hills",
  "minecraft:birch_forest_hills_mutated",
  "minecraft:cold_taiga_hills",
  "minecraft:cold_taiga_mutated",
  "minecraft:deep_warm_ocean",
  "minecraft:desert_hills",
  "minecraft:desert_mutated",
  "minecraft:extreme_hills_edge",
  "minecraft:extreme_hills_plus_trees_mutated",
  "minecraft:forest_hills",
  "minecraft:ice_mountains",
  "minecraft:jungle_edge_mutated",
  "minecraft:jungle_hills",
  "minecraft:jungle_mutated",
  "minecraft:legacy_frozen_ocean",
  "minecraft:mega_taiga_hills",
  "minecraft:mesa_plateau",
  "minecraft:mesa_plateau_mutated",
  "minecraft:mesa_plateau_stone_mutated",
  "minecraft:mushroom_island_shore",
  "minecraft:redwood_taiga_hills_mutated",
  "minecraft:roofed_forest_mutated",
  "minecraft:savanna_plateau_mutated",
  "minecraft:swampland_mutated",
  "minecraft:taiga_hills",
  "minecraft:taiga_mutated",
]);

const BIOME_GROUPS = [
  { key: "nether", tags: ["nether"], dimension: "minecraft:nether", icon: "dim_nether" },
  { key: "end", tags: ["the_end"], dimension: "minecraft:the_end", icon: "dim_end" },
  { key: "caves", tags: ["caves"] },
  { key: "water", tags: ["ocean", "river", "beach"] },
  { key: "mountains", tags: ["mountains", "mountain", "extreme_hills"] },
  { key: "jungles", tags: ["jungle", "bamboo"] },
  { key: "taigas", tags: ["taiga"] },
  { key: "forests", tags: ["forest", "flower_forest", "pale_garden"] },
  { key: "dry", tags: ["desert", "mesa", "savanna"] },
  { key: "plains", tags: ["plains", "ice_plains", "swamp", "mangrove_swamp", "mooshroom_island"] },
  { key: "other", tags: [] },
];
const BIOME_GROUP_DIMENSIONS = BIOME_GROUPS.map(({ dimension }) => dimension).filter(Boolean);

let biomeCatalogCache;

function biomeGroup(biome) {
  let tags = [];
  try {
    tags = biome.getTags();
  } catch {}
  return BIOME_GROUPS.find((group) => group.tags.some((tag) => tags.includes(tag)))?.key ?? "other";
}

function biomeCatalog() {
  if (!biomeCatalogCache) {
    biomeCatalogCache = BiomeTypes.getAll()
      .filter(({ id }) => !LEGACY_BIOMES.has(id))
      .map((biome) => ({ id: biome.id, name: biomeName(biome.id), group: biomeGroup(biome) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  return biomeCatalogCache;
}

function listBiomes() {
  return biomeCatalog().map(({ id }) => id);
}

function distanceTo(player, location) {
  if (location.dimensionId !== player.dimension.id) return undefined;
  return Math.round(
    Math.hypot(
      location.x - player.location.x,
      location.y - player.location.y,
      location.z - player.location.z,
    ),
  );
}

function distanceMessage(prefix, distance) {
  return [
    { text: prefix },
    { translate: "ram_pg.locations.distance", with: [String(distance)] },
    { text: "§r" },
  ];
}

function locationButtonText(player, location) {
  const distance = distanceTo(player, location);
  return {
    rawtext: [
      { text: "§f" },
      location.name ? { text: String(location.name) } : { translate: "ram_pg.locations.nameless" },
      { text: " §7- " },
      asRawMessage(dimensionLabel(location.dimensionId)),
      { text: `§r\nX: ${location.x}, Y: ${location.y}, Z: ${location.z}` },
      ...(distance === undefined ? [] : distanceMessage("  §7", distance)),
    ],
  };
}

function locationDetails(player, location) {
  const distance = distanceTo(player, location);
  return {
    rawtext: [
      asRawMessage(dimensionLabel(location.dimensionId)),
      { text: `\nX: ${location.x}  Y: ${location.y}  Z: ${location.z}` },
      ...(distance === undefined ? [] : distanceMessage("\n§7", distance)),
    ],
  };
}

function savedCountMessage(savedLocations, limit) {
  return {
    translate: "ram_pg.saved_locations.label",
    with: [`${savedLocations.length}/${limit}`],
  };
}

function matchesFilter(location, filter) {
  const term = (filter.term ?? "").trim().toLowerCase();
  return (
    String(location.name).toLowerCase().includes(term) &&
    (!filter.dimensionId || location.dimensionId === filter.dimensionId)
  );
}

function findSavedIndex(savedLocations, location) {
  const key = JSON.stringify(location);
  return savedLocations.findIndex((entry) => JSON.stringify(entry) === key);
}

function warnLocationLimit(player) {
  player.onScreenDisplay.setActionBar({
    translate: "ram_pg.saved_locations.limit_reached",
  });
  player.dimension.playSound("ram_pg:error_sound", player.location);
}

function openSavedLocationsForm(player, inventory, portalGunItem, filter = {}) {
  playPlayerAnimation(player);
  player.dimension.playSound("ram_pg:button_click", player.location);

  const savedLocations = getSavedLocations(portalGunItem);
  const shown = savedLocations.filter((location) =>
    matchesFilter(location, filter),
  );
  const filtering = Boolean((filter.term ?? "").trim() || filter.dimensionId);

  const filterSummary = filtering
    ? [
        { text: "\n" },
        {
          translate: "ram_pg.locations.filter_active",
          with: {
            rawtext: [
              filter.term
                ? { text: `"${filter.term}"` }
                : { translate: "ram_pg.locations.any_name" },
              filter.dimensionId
                ? asRawMessage(dimensionLabel(filter.dimensionId))
                : { translate: "ram_pg.locations.all_dimensions" },
            ],
          },
        },
      ]
    : [];
  const body = { rawtext: [savedCountMessage(savedLocations, locationLimit(portalGunItem)), ...filterSummary] };

  const menu = actionMenu(portalGunItem, { translate: "ram_pg.saved_locations.title" }, body)
    .button(
      { translate: "ram_pg.saved_locations.save_current" },
      icon(portalGunItem, "save"),
      () => openSaveCurrentLocationForm(player, inventory, portalGunItem, filter),
    )
    .button(
      { translate: "ram_pg.locations.save_other" },
      icon(portalGunItem, "save_other"),
      () => openLocationEditor(player, inventory, portalGunItem, { filter }),
    );
  if (hiddenDimensionCount(listDimensions(player, portalGunItem)) > 0) {
    menu.button({ translate: "ram_pg.dimensions.title" }, icon(portalGunItem, "dim_custom"), () =>
      openDimensionBrowser(player, inventory, portalGunItem, {
        destination: false,
        pick: (dimensionId) =>
          openLocationEditor(player, inventory, portalGunItem, {
            filter,
            values: { includeDimension: dimensionId, dimension: undefined },
          }),
        back: () => openSavedLocationsForm(player, inventory, portalGunItem, filter),
      }),
    );
  }
  menu.button(
    { translate: "ram_pg.locations.search_filter" },
    icon(portalGunItem, "search"),
    () => openLocationFilterForm(player, inventory, portalGunItem, filter),
  );

  if (filtering) {
    menu.button({ translate: "ram_pg.locations.clear_filter" }, icon(portalGunItem, "close"), () =>
      openSavedLocationsForm(player, inventory, portalGunItem),
    );
  }
  if (savedLocations.length > 0) {
    menu.button(
      { translate: "ram_pg.locations.manage" },
      icon(portalGunItem, "manage"),
      () => openManageLocationsForm(player, inventory, portalGunItem, filter),
    );
  }

  menu
    .button({ translate: "ram_pg.back" }, icon(portalGunItem, "back"), () =>
      openPortalGunMenu(player, portalGunItem),
    )
    .divider();

  if (shown.length === 0) {
    menu.label({
      translate:
        savedLocations.length > 0
          ? "ram_pg.locations.no_results"
          : "ram_pg.saved_locations.no_locations",
    });
  }
  for (const location of shown) {
    menu.button(
      locationButtonText(player, location),
      dimensionIcon(portalGunItem, location.dimensionId),
      () => {
        setDestination(player, inventory, portalGunItem, location);
        stopPlayerAnimation(player);
      },
    );
  }

  menu.show(player, () => openPortalGunMenu(player, portalGunItem));
}

function openSaveCurrentLocationForm(
  player,
  inventory,
  portalGunItem,
  filter,
  error,
) {
  if (!error && getSavedLocations(portalGunItem).length >= locationLimit(portalGunItem)) {
    warnLocationLimit(player);
    return openSavedLocationsForm(player, inventory, portalGunItem, filter);
  }
  player.dimension.playSound(
    error ? "ram_pg:error_sound" : "ram_pg:button_click",
    player.location,
  );

  modalMenu(portalGunItem, { translate: "ram_pg.saved_locations.save_current" }, error)
    .text(
      "name",
      { translate: "ram_pg.saved_locations.enter_name" },
      { translate: "ram_pg.saved_locations.enter_name" },
      "",
    )
    .submit({ translate: "ram_pg.locations.save" })
    .show(
      player,
      (values) => {
        const name = String(values.name ?? "").trim();
        const retry = (key) =>
          openSaveCurrentLocationForm(player, inventory, portalGunItem, filter, key);
        if (!name) return retry("ram_pg.locations.name_required");

        const savedLocations = getSavedLocations(portalGunItem);
        if (savedLocations.length >= locationLimit(portalGunItem)) {
          return retry("ram_pg.saved_locations.limit_reached");
        }

        savedLocations.push({
          name,
          id: newLocationId(),
          dimensionId: player.dimension.id,
          ...currentBlockLocation(player),
        });
        storeSavedLocations(player, inventory, portalGunItem, savedLocations);
        player.dimension.playSound("ram_pg:selection", player.location);
        openSavedLocationsForm(player, inventory, portalGunItem, filter);
      },
      () => openSavedLocationsForm(player, inventory, portalGunItem, filter),
    );
}

function openLocationEditor(player, inventory, portalGunItem, options) {
  const { filter = {}, location, values, error } = options;
  const editing = Boolean(location);

  if (
    !editing &&
    !error &&
    getSavedLocations(portalGunItem).length >= locationLimit(portalGunItem)
  ) {
    warnLocationLimit(player);
    return openSavedLocationsForm(player, inventory, portalGunItem, filter);
  }
  player.dimension.playSound(
    error ? "ram_pg:error_sound" : "ram_pg:button_click",
    player.location,
  );

  const start = location ?? {
    name: "",
    dimensionId: player.dimension.id,
    ...currentBlockLocation(player),
  };
  const dimensions = listDimensions(player, portalGunItem, [start.dimensionId, values?.includeDimension]);
  const hidden = hiddenDimensionCount(dimensions);
  const startIndex = Math.max(
    0,
    dimensions.findIndex(({ id }) => id === start.dimensionId),
  );
  const input = withPickedDimension(
    {
      name: start.name,
      quick: "",
      x: start.x,
      y: start.y,
      z: start.z,
      dimension: startIndex,
      ...values,
    },
    dimensions,
    startIndex,
  );
  const goBack = editing
    ? () => openLocationOptions(player, inventory, portalGunItem, location, filter)
    : () => openSavedLocationsForm(player, inventory, portalGunItem, filter);

  const menu = modalMenu(
    portalGunItem,
    {
      translate: editing
        ? "ram_pg.locations.edit_coordinates"
        : "ram_pg.locations.save_other",
    },
    error,
  );
  if (!editing) {
    menu.text(
      "name",
      { translate: "ram_pg.saved_locations.enter_name" },
      { translate: "ram_pg.saved_locations.enter_name" },
      input.name,
    );
  }

  menu
    .text(
      "quick",
      { translate: "ram_pg.coords.quick" },
      { translate: "ram_pg.set_coordinates.text_field" },
      input.quick,
    )
    .label({ translate: "ram_pg.coords.or_fill" })
    .text("x", "X", "X", input.x)
    .text("y", "Y", "Y", input.y)
    .text("z", "Z", "Z", input.z)
    .dropdown(
      "dimension",
      { translate: "ram_pg.locations.dimension" },
      dimensions.map(({ label }) => label),
      input.dimension,
      dimensionRuleTooltip(hidden),
    )
    .submit({ translate: "ram_pg.locations.save" })
    .show(
      player,
      (submitted) => {
        const typed = { ...input, ...submitted };
        const retry = (key) =>
          openLocationEditor(player, inventory, portalGunItem, {
            filter,
            location,
            values: typed,
            error: key,
          });

        const name = editing ? location.name : String(typed.name ?? "").trim();
        if (!name) return retry("ram_pg.locations.name_required");

        const destination = readDestination(player, false, String(typed.quick ?? ""), {
          x: typed.x,
          y: typed.y,
          z: typed.z,
          dimensionId: dimensions[typed.dimension]?.id,
        });
        if (destination.error) return retry(destination.error);

        const { x, y, z, dimensionId } = destination.location;
        const savedLocations = getSavedLocations(portalGunItem);

        if (editing) {
          const index = findSavedIndex(savedLocations, location);
          if (index < 0) {
            return openManageLocationsForm(player, inventory, portalGunItem, filter);
          }
          const updated = { ...location, x, y, z, dimensionId };
          savedLocations[index] = updated;
          storeSavedLocations(player, inventory, portalGunItem, savedLocations);
          player.dimension.playSound("ram_pg:selection", player.location);
          return openLocationOptions(player, inventory, portalGunItem, updated, filter);
        }

        if (savedLocations.length >= locationLimit(portalGunItem)) {
          return retry("ram_pg.saved_locations.limit_reached");
        }
        savedLocations.push({ name, id: newLocationId(), x, y, z, dimensionId });
        storeSavedLocations(player, inventory, portalGunItem, savedLocations);
        player.dimension.playSound("ram_pg:selection", player.location);
        openSavedLocationsForm(player, inventory, portalGunItem, filter);
      },
      goBack,
    );
}

function openLocationFilterForm(player, inventory, portalGunItem, filter) {
  player.dimension.playSound("ram_pg:button_click", player.location);

  const present = new Set([...savedDimensionIds(portalGunItem), filter.dimensionId].filter(Boolean));
  const dimensions = [
    ...VANILLA_DIMENSIONS.filter((id) => present.has(id)),
    ...[...present].filter((id) => !VANILLA_DIMENSIONS.includes(id)),
  ].map(dimensionEntry);
  const selected = filter.dimensionId
    ? dimensions.findIndex(({ id }) => id === filter.dimensionId) + 1
    : 0;

  modalMenu(portalGunItem, { translate: "ram_pg.locations.search_filter" })
    .text(
      "term",
      { translate: "ram_pg.locations.search" },
      { translate: "ram_pg.saved_locations.enter_name" },
      filter.term ?? "",
    )
    .dropdown(
      "dimension",
      { translate: "ram_pg.locations.dimension" },
      [
        { translate: "ram_pg.locations.all_dimensions" },
        ...dimensions.map(({ label }) => label),
      ],
      Math.max(0, selected),
    )
    .submit({ translate: "ram_pg.locations.apply" })
    .show(
      player,
      ({ term, dimension }) =>
        openSavedLocationsForm(player, inventory, portalGunItem, {
          term: String(term ?? "").trim(),
          dimensionId: dimension > 0 ? dimensions[dimension - 1]?.id : undefined,
        }),
      () => openSavedLocationsForm(player, inventory, portalGunItem, filter),
    );
}

function openManageLocationsForm(player, inventory, portalGunItem, filter = {}) {
  player.dimension.playSound("ram_pg:button_click", player.location);

  const savedLocations = getSavedLocations(portalGunItem);
  const shown = savedLocations.filter((location) =>
    matchesFilter(location, filter),
  );

  const menu = actionMenu(
    portalGunItem,
    { translate: "ram_pg.locations.manage_title" },
    { translate: "ram_pg.locations.manage_body" },
  )
    .button({ translate: "ram_pg.back" }, icon(portalGunItem, "back"), () =>
      openSavedLocationsForm(player, inventory, portalGunItem, filter),
    )
    .divider();

  if (shown.length === 0) {
    menu.label({
      translate:
        savedLocations.length > 0
          ? "ram_pg.locations.no_results"
          : "ram_pg.saved_locations.no_locations",
    });
  }
  for (const location of shown) {
    menu.button(
      locationButtonText(player, location),
      dimensionIcon(portalGunItem, location.dimensionId),
      () => openLocationOptions(player, inventory, portalGunItem, location, filter),
    );
  }

  menu.show(player, () =>
    openSavedLocationsForm(player, inventory, portalGunItem, filter),
  );
}

function openLocationOptions(player, inventory, portalGunItem, location, filter) {
  player.dimension.playSound("ram_pg:button_click", player.location);
  const backToList = () =>
    openManageLocationsForm(player, inventory, portalGunItem, filter);

  actionMenu(portalGunItem, String(location.name), locationDetails(player, location))
    .button(
      { translate: "ram_pg.coords.confirm" },
      dimensionIcon(portalGunItem, location.dimensionId),
      () => {
        setDestination(player, inventory, portalGunItem, location);
        stopPlayerAnimation(player);
      },
    )
    .button({ translate: "ram_pg.locations.rename" }, icon(portalGunItem, "rename"), () =>
      openRenameLocationForm(player, inventory, portalGunItem, location, filter),
    )
    .button(
      { translate: "ram_pg.locations.edit_coordinates" },
      icon(portalGunItem, "edit_coords"),
      () => openLocationEditor(player, inventory, portalGunItem, { filter, location }),
    )
    .button(
      { translate: "ram_pg.saved_locations.delete_location" },
      icon(portalGunItem, "delete"),
      () => openDeleteLocationForm(player, inventory, portalGunItem, location, filter),
    )
    .button({ translate: "ram_pg.back" }, icon(portalGunItem, "back"), backToList)
    .show(player, backToList);
}

function openRenameLocationForm(
  player,
  inventory,
  portalGunItem,
  location,
  filter,
  error,
) {
  player.dimension.playSound(
    error ? "ram_pg:error_sound" : "ram_pg:button_click",
    player.location,
  );
  const backToOptions = () =>
    openLocationOptions(player, inventory, portalGunItem, location, filter);

  modalMenu(portalGunItem, { translate: "ram_pg.locations.rename" }, error)
    .text(
      "name",
      { translate: "ram_pg.saved_locations.enter_name" },
      { translate: "ram_pg.saved_locations.enter_name" },
      error ? "" : location.name,
    )
    .submit({ translate: "ram_pg.locations.save" })
    .show(
      player,
      ({ name }) => {
        const trimmed = String(name ?? "").trim();
        if (!trimmed) {
          return openRenameLocationForm(
            player,
            inventory,
            portalGunItem,
            location,
            filter,
            "ram_pg.locations.name_required",
          );
        }

        const savedLocations = getSavedLocations(portalGunItem);
        const index = findSavedIndex(savedLocations, location);
        if (index < 0) {
          return openManageLocationsForm(player, inventory, portalGunItem, filter);
        }
        const renamed = { ...location, name: trimmed };
        savedLocations[index] = renamed;
        storeSavedLocations(player, inventory, portalGunItem, savedLocations);
        player.dimension.playSound("ram_pg:selection", player.location);
        openLocationOptions(player, inventory, portalGunItem, renamed, filter);
      },
      backToOptions,
    );
}

function openDeleteLocationForm(player, inventory, portalGunItem, location, filter) {
  player.dimension.playSound("ram_pg:button_click", player.location);
  const backToOptions = () =>
    openLocationOptions(player, inventory, portalGunItem, location, filter);

  actionMenu(
    portalGunItem,
    { translate: "ram_pg.saved_locations.delete_location" },
    { translate: "ram_pg.locations.delete_confirm", with: [String(location.name)] },
  )
    .button(
      { translate: "ram_pg.locations.yes_delete" },
      icon(portalGunItem, "delete"),
      () => {
        const savedLocations = getSavedLocations(portalGunItem);
        const index = findSavedIndex(savedLocations, location);
        if (index >= 0) {
          savedLocations.splice(index, 1);
          storeSavedLocations(player, inventory, portalGunItem, savedLocations);
          player.onScreenDisplay.setActionBar({
            translate: "ram_pg.locations.deleted",
            with: [String(location.name)],
          });
          player.dimension.playSound("ram_pg:selection", player.location);
        }
        openManageLocationsForm(player, inventory, portalGunItem, filter);
      },
    )
    .button({ translate: "ram_pg.locations.cancel" }, icon(portalGunItem, "back"), backToOptions)
    .show(player, backToOptions);
}

function readDestination(player, interspatial, quickInput, fields, portalGunItem) {
  const quick = quickInput.trim();
  const { x, y, z, dimensionId } = quick
    ? parseCoordinates(player, quick.split(/\s+/))
    : {
        x: parseInt(fields.x),
        y: parseInt(fields.y),
        z: parseInt(fields.z),
        dimensionId: fields.dimensionId,
      };

  if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z) || !dimensionId) {
    return { error: "ram_pg.set_coordinates.invalid_input" };
  }
  if (portalGunItem && blocksEnd(player, portalGunItem, dimensionId)) {
    return { error: "ram_pg.error.green_no_end" };
  }
  if (interspatial && dimensionId !== player.dimension.id) {
    return { error: "ram_pg.set_coordinates.dimension_mismatch" };
  }
  if (
    y > 320 ||
    y < -64 ||
    Math.abs(x) > MAX_HORIZONTAL_COORDINATE ||
    Math.abs(z) > MAX_HORIZONTAL_COORDINATE
  ) {
    return { error: "ram_pg.set_coordinates.out_of_bounds" };
  }

  return {
    location: {
      name: "",
      id: -Math.floor(Math.random() * 10000),
      x,
      y,
      z,
      dimensionId,
    },
  };
}

function confirmDestination(player, inventory, portalGunItem, location, input, retry) {
  if (input.save) {
    const name = String(input.name ?? "").trim();
    if (!name) {
      retry("ram_pg.locations.name_required");
      return false;
    }
    const savedLocations = getSavedLocations(portalGunItem);
    if (savedLocations.length >= locationLimit(portalGunItem)) {
      retry("ram_pg.saved_locations.limit_reached");
      return false;
    }
    location.name = name;
    location.id = newLocationId();
    savedLocations.push({ ...location });
    storeSavedLocations(player, inventory, portalGunItem, savedLocations);
  }

  setDestination(player, inventory, portalGunItem, location);
  stopPlayerAnimation(player);
  return true;
}

function currentDestinationMessage(portalGunItem) {
  const json = portalGunItem.getDynamicProperty(portalGunDP.customLocation);
  if (portalGunItem.getDynamicProperty(portalGunDP.mode) !== "CUSTOM" || !json) {
    return { translate: "ram_pg.coords.hub_body" };
  }

  let location;
  try {
    location = JSON.parse(json);
  } catch {
    return { translate: "ram_pg.coords.hub_body" };
  }
  const name = location.name ? `${location.name}  ` : "";
  return {
    translate: "ram_pg.coords.current",
    with: {
      rawtext: [
        { text: `${name}X: ${location.x}, Y: ${location.y}, Z: ${location.z}` },
        asRawMessage(dimensionLabel(location.dimensionId)),
      ],
    },
  };
}

function addDestinationFields(menu, dimensions, interspatial, input, hidden = 0) {
  return addSaveFields(
    menu.dropdown(
      "dimension",
      { translate: "ram_pg.locations.dimension" },
      dimensions.map(({ label }) => label),
      input.dimension,
      interspatial ? { translate: "ram_pg.coords.interspatial_locked" } : dimensionRuleTooltip(hidden),
    ),
    input,
  );
}

function addSaveFields(menu, input) {
  return menu
    .toggle("save", { translate: "ram_pg.coords.save_toggle" }, input.save)
    .text(
      "name",
      { translate: "ram_pg.coords.save_name" },
      { translate: "ram_pg.saved_locations.enter_name" },
      input.name,
    )
    .submit({ translate: "ram_pg.coords.confirm" });
}

function withPickedDimension(input, dimensions, fallback) {
  if (input.dimension !== undefined) return input;
  const index = dimensions.findIndex(({ id }) => id === input.includeDimension);
  return { ...input, dimension: index >= 0 ? index : fallback };
}

function openDimensionBrowser(player, inventory, portalGunItem, context, state = {}) {
  const { page = 0, term = "", notice } = state;
  player.dimension.playSound(notice ? "ram_pg:error_sound" : "ram_pg:button_click", player.location);

  const { ids, favorites } = browsableDimensions(player, portalGunItem, context, term);
  const pages = Math.max(1, Math.ceil(ids.length / DIMENSION_PAGE_SIZE));
  const current = Math.min(Math.max(0, page), pages - 1);
  const reopen = (changes) =>
    openDimensionBrowser(player, inventory, portalGunItem, context, { page: current, term, ...changes });

  const info = [
    { translate: "ram_pg.dimensions.count", with: [String(ids.length)] },
    { text: "\n" },
    {
      translate: "ram_pg.dimensions.favorites_hint",
      with: [String(favorites.size), String(FAVORITE_DIMENSION_LIMIT)],
    },
  ];
  if (!ids.length) info.push({ text: "\n" }, { translate: "ram_pg.dimensions.no_results" });
  if (notice) info.push({ text: "\n" }, notice);

  const menu = actionMenu(
    portalGunItem,
    { translate: "ram_pg.dimensions.title" },
    { rawtext: info },
    { tokens: LIST_TOKENS, view: false },
  )
    .button(
      term
        ? { rawtext: [{ text: SEARCH_ACTIVE_MARKER }, { translate: "ram_pg.dimensions.search" }] }
        : { translate: "ram_pg.dimensions.search" },
      icon(portalGunItem, "search"),
      () => openDimensionSearchForm(player, inventory, portalGunItem, context, { term }),
    )
    .button(term ? { translate: "ram_pg.dimensions.clear_search" } : "", icon(portalGunItem, "close"), () =>
      reopen({ page: 0, term: "" }),
    )
    .label({ translate: "ram_pg.dimensions.page", with: [String(current + 1), String(pages)] });
  if (current > 0) {
    menu.button({ translate: "ram_pg.dimensions.previous" }, icon(portalGunItem, "page_prev"), () =>
      reopen({ page: current - 1 }),
    );
  } else {
    menu.button({ translate: "ram_pg.back" }, icon(portalGunItem, "back"), context.back);
  }
  menu
    .button(
      current < pages - 1 ? { translate: "ram_pg.dimensions.next" } : "",
      icon(portalGunItem, "page_next"),
      () => reopen({ page: current + 1 }),
    );

  for (const id of ids.slice(current * DIMENSION_PAGE_SIZE, (current + 1) * DIMENSION_PAGE_SIZE)) {
    const favorite = favorites.has(id);
    const name = favorite
      ? { text: `§e${getDimensionLabel(id).dimName}§r` }
      : asRawMessage(dimensionEntry(id).label);
    menu
      .button({ rawtext: [{ text: "§f" }, name, { text: `\n§7${id}` }] }, dimensionIcon(portalGunItem, id), () =>
        context.pick(id),
      )
      .button("*", icon(portalGunItem, favorite ? "favorite" : "favorite_off"), () => {
        if (toggleFavoriteDimension(player, inventory, portalGunItem, id)) return reopen({});
        reopen({
          notice: {
            translate: "ram_pg.dimensions.favorites_full",
            with: [String(FAVORITE_DIMENSION_LIMIT)],
          },
        });
      });
  }
  menu.show(player, context.back);
}

function openDimensionSearchForm(player, inventory, portalGunItem, context, state) {
  player.dimension.playSound("ram_pg:button_click", player.location);
  modalMenu(portalGunItem, { translate: "ram_pg.dimensions.search" })
    .text(
      "term",
      { translate: "ram_pg.dimensions.search_field" },
      { translate: "ram_pg.dimensions.search_placeholder" },
      state.term,
    )
    .submit({ translate: "ram_pg.locations.apply" })
    .show(
      player,
      ({ term }) =>
        openDimensionBrowser(player, inventory, portalGunItem, context, {
          ...state,
          page: 0,
          term: String(term ?? "").trim(),
        }),
      () => openDimensionBrowser(player, inventory, portalGunItem, context, state),
    );
}

function openSetCoordinatesForm(player, inventory, portalGunItem) {
  playPlayerAnimation(player);
  player.dimension.playSound("ram_pg:button_click", player.location);

  const menu = actionMenu(
    portalGunItem,
    { translate: "ram_pg.set_coordinates.title" },
    currentDestinationMessage(portalGunItem),
  )
    .button({ translate: "ram_pg.coords.type" }, icon(portalGunItem, "type_coords"), () =>
      openTypeCoordinatesForm(player, inventory, portalGunItem),
    )
    .button({ translate: "ram_pg.coords.random" }, icon(portalGunItem, "random"), () =>
      openRandomLocationForm(player, inventory, portalGunItem),
    );
  if (!isBasicGun(portalGunItem)) {
    menu.button({ translate: "ram_pg.coords.find_biome" }, icon(portalGunItem, "biome"), () =>
      openBiomeFinderForm(player, inventory, portalGunItem),
    );
  }
  if (
    !portalGunItem.typeId.includes("blue") &&
    destinationDimensions(player, false, portalGunItem).hidden > 0
  ) {
    menu.button({ translate: "ram_pg.dimensions.title" }, icon(portalGunItem, "dim_custom"), () =>
      openDimensionBrowser(player, inventory, portalGunItem, {
        destination: true,
        pick: (dimensionId) =>
          openTypeCoordinatesForm(player, inventory, portalGunItem, {
            includeDimension: dimensionId,
            dimension: undefined,
          }),
        back: () => openSetCoordinatesForm(player, inventory, portalGunItem),
      }),
    );
  }
  menu
    .button({ translate: "ram_pg.back" }, icon(portalGunItem, "back"), () =>
      openPortalGunMenu(player, portalGunItem),
    )
    .show(player, () => openPortalGunMenu(player, portalGunItem));
}

function openTypeCoordinatesForm(player, inventory, portalGunItem, values, error) {
  player.dimension.playSound(
    error ? "ram_pg:error_sound" : "ram_pg:button_click",
    player.location,
  );

  const interspatial = portalGunItem.typeId.includes("blue");
  const { dimensions, own, hidden } = destinationDimensions(
    player,
    interspatial,
    portalGunItem,
    values?.includeDimension ? [values.includeDimension] : [],
  );
  const here = currentBlockLocation(player);
  const input = withPickedDimension(
    {
      quick: "",
      x: here.x,
      y: here.y,
      z: here.z,
      dimension: own,
      save: false,
      name: "",
      ...values,
    },
    dimensions,
    own,
  );

  const menu = modalMenu(portalGunItem, { translate: "ram_pg.coords.type" }, error)
    .text(
      "quick",
      { translate: "ram_pg.coords.quick" },
      { translate: "ram_pg.set_coordinates.text_field" },
      input.quick,
    )
    .label({ translate: "ram_pg.set_coordinates.label" })
    .label({ translate: "ram_pg.coords.or_fill" })
    .text("x", "X", "X", input.x)
    .text("y", "Y", "Y", input.y)
    .text("z", "Z", "Z", input.z);

  addDestinationFields(menu, dimensions, interspatial, input, hidden).show(
    player,
    (submitted) => {
      const typed = { ...input, ...submitted };
      const retry = (key) =>
        openTypeCoordinatesForm(player, inventory, portalGunItem, typed, key);

      const destination = readDestination(
        player,
        interspatial,
        String(typed.quick ?? ""),
        {
          x: typed.x,
          y: typed.y,
          z: typed.z,
          dimensionId: dimensions[typed.dimension]?.id,
        },
        portalGunItem,
      );
      if (destination.error) return retry(destination.error);
      confirmDestination(
        player,
        inventory,
        portalGunItem,
        destination.location,
        typed,
        retry,
      );
    },
    () => openSetCoordinatesForm(player, inventory, portalGunItem),
  );
}

function openRandomLocationForm(player, inventory, portalGunItem, values, error) {
  player.dimension.playSound(
    error ? "ram_pg:error_sound" : "ram_pg:button_click",
    player.location,
  );

  const interspatial = portalGunItem.typeId.includes("blue");
  const { dimensions, own, hidden } = destinationDimensions(
    player,
    interspatial,
    portalGunItem,
    values?.includeDimension ? [values.includeDimension] : [],
  );
  const input = withPickedDimension(
    { radius: 2000, dimension: own, save: false, name: "", ...values },
    dimensions,
    own,
  );

  const menu = modalMenu(portalGunItem, { translate: "ram_pg.coords.random" }, error).slider(
    "radius",
    { translate: "ram_pg.coords.random_radius" },
    100,
    20000,
    100,
    input.radius,
  );

  addDestinationFields(menu, dimensions, interspatial, input, hidden).show(
    player,
    (submitted) => {
      const typed = { ...input, ...submitted };
      const center = currentBlockLocation(player);
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * typed.radius;

      confirmDestination(
        player,
        inventory,
        portalGunItem,
        {
          name: "",
          id: -Math.floor(Math.random() * 10000),
          x: Math.round(center.x + Math.cos(angle) * distance),
          y: center.y,
          z: Math.round(center.z + Math.sin(angle) * distance),
          dimensionId: dimensions[typed.dimension]?.id ?? player.dimension.id,
          surface: true,
        },
        typed,
        (key) => openRandomLocationForm(player, inventory, portalGunItem, typed, key),
      );
    },
    () => openSetCoordinatesForm(player, inventory, portalGunItem),
  );
}

function biomeFinderDimensions(player, interspatial, portalGunItem) {
  return destinationDimensions(player, interspatial, portalGunItem).dimensions.filter(
    ({ id }) => id !== BLENDER_DIMENSION_ID,
  );
}

function availableBiomeGroups(dimensions) {
  const ids = dimensions.map(({ id }) => id);
  const surface = ids.some((id) => !BIOME_GROUP_DIMENSIONS.includes(id));
  const used = new Set(biomeCatalog().map(({ group }) => group));
  return BIOME_GROUPS.filter(
    ({ key, dimension }) => used.has(key) && (dimension ? ids.includes(dimension) : surface),
  );
}

function biomeDimensionId(player, dimensions, group) {
  const current = player.dimension.id;
  const wanted =
    group?.dimension ??
    (BIOME_GROUP_DIMENSIONS.includes(current) ? "minecraft:overworld" : current);
  return dimensions.some(({ id }) => id === wanted) ? wanted : current;
}

function openBiomeFinderForm(player, inventory, portalGunItem) {
  const interspatial = portalGunItem.typeId.includes("blue");
  const groups = availableBiomeGroups(biomeFinderDimensions(player, interspatial, portalGunItem));
  if (groups.length < 2) {
    return openBiomeSearchForm(player, inventory, portalGunItem, groups[0]);
  }

  player.dimension.playSound("ram_pg:button_click", player.location);
  const back = () => openSetCoordinatesForm(player, inventory, portalGunItem);
  const menu = actionMenu(
    portalGunItem,
    { translate: "ram_pg.coords.find_biome" },
    { translate: "ram_pg.coords.biome_group" },
  );
  for (const group of groups) {
    menu.button(
      { translate: `ram_pg.coords.biome_group.${group.key}` },
      icon(portalGunItem, group.icon ?? "biome"),
      () => openBiomeSearchForm(player, inventory, portalGunItem, group),
    );
  }
  menu.button({ translate: "ram_pg.back" }, icon(portalGunItem, "back"), back).show(player, back);
}

function openBiomeSearchForm(player, inventory, portalGunItem, group, values, error) {
  player.dimension.playSound(
    error ? "ram_pg:error_sound" : "ram_pg:button_click",
    player.location,
  );

  const interspatial = portalGunItem.typeId.includes("blue");
  const dimensions = biomeFinderDimensions(player, interspatial, portalGunItem);
  const biomes = biomeCatalog().filter((biome) => !group || biome.group === group.key);
  const dimensionId = biomeDimensionId(player, dimensions, group);
  const input = values ?? { biome: 0, save: false, name: "" };
  const back = () =>
    availableBiomeGroups(dimensions).length > 1
      ? openBiomeFinderForm(player, inventory, portalGunItem)
      : openSetCoordinatesForm(player, inventory, portalGunItem);

  const menu = modalMenu(portalGunItem, { translate: "ram_pg.coords.find_biome" }, error).dropdown(
    "biome",
    { translate: "ram_pg.coords.biome" },
    biomes.map(({ name }) => name),
    input.biome,
  );

  addSaveFields(menu, input).show(
    player,
    (submitted) => {
      const typed = { ...input, ...submitted };
      const retry = (message) =>
        openBiomeSearchForm(player, inventory, portalGunItem, group, typed, message);
      const biomeId = biomes[typed.biome]?.id;

      let found;
      try {
        found = world
          .getDimension(dimensionId)
          .calculateClosestBiomeFromSeed(player.location, biomeId);
      } catch (searchError) {
        console.warn(`[ram_pg] Biome search failed for ${biomeId}:`, searchError);
      }
      if (!found) {
        return retry({
          translate: "ram_pg.coords.biome_not_found",
          with: [biomeName(biomeId)],
        });
      }

      const here = currentBlockLocation(player);
      const location = {
        name: "",
        id: -Math.floor(Math.random() * 10000),
        x: Math.floor(found.x),
        y: here.y,
        z: Math.floor(found.z),
        dimensionId,
        surface: true,
      };
      if (confirmDestination(player, inventory, portalGunItem, location, typed, retry)) {
        player.onScreenDisplay.setActionBar({
          translate: "ram_pg.coords.biome_found",
          with: [
            biomeName(biomeId),
            String(location.x),
            String(location.z),
            String(Math.round(Math.hypot(location.x - here.x, location.z - here.z))),
          ],
        });
      }
    },
    back,
  );
}

function parseCoordinates(player, coordinates) {
  if (coordinates.length === 1) {
    const { x, y, z } = player.location;
    return {
      x: Math.floor(x),
      y: Math.floor(y),
      z: Math.floor(z),
      dimensionId: resolveDimensionId(coordinates[0]),
    };
  }

  if (coordinates.length !== 3 && coordinates.length !== 4) {
    return { x: NaN, y: NaN, z: NaN, dimensionId: null };
  }

  const dimensionId =
    coordinates.length === 4
      ? resolveDimensionId(coordinates[3])
      : player.dimension.id;

  return {
    x: parseInt(coordinates[0]),
    y: parseInt(coordinates[1]),
    z: parseInt(coordinates[2]),
    dimensionId: dimensionId,
  };
}

function resolveDimensionId(input) {
  let dimensionInp = input.toLowerCase();

  if (dimensionInp === "end") {
    dimensionInp = "the_end";
  }

  if (dimensionInp === "blender") {
    dimensionInp = "blender_dimension";
  }

  if (`ram_pg:${dimensionInp}` === BLENDER_DIMENSION_ID) {
    return BLENDER_DIMENSION_ID;
  }

  // Só assume namespace "minecraft:" se o jogador não informou nenhum namespace
  if (!dimensionInp.includes(":")) {
    dimensionInp = `minecraft:${dimensionInp}`;
  }

  if (dimensionInp === BLENDER_DIMENSION_ID) {
    return dimensionInp;
  }

  try {
    world.getDimension(dimensionInp);
    return dimensionInp;
  } catch {
    return null;
  }
}

/**
 * Opens the Portal Gun mode selection menu.
 * Player can switch between FIFO, LIFO, Multi-Pair, or Root mode.
 *
 * @param {Player} player
 * @param {EntityInventoryComponent} inventory
 * @param {ItemStack} portalGunItem
 */
function openSelectModeForm(player, inventory, portalGunItem) {
  playPlayerAnimation(player);
  player.dimension.playSound("ram_pg:button_click", player.location);
  const currentMode = portalGunItem.getDynamicProperty(portalGunDP.mode);
  const menu = actionMenu(
    portalGunItem,
    { translate: "ram_pg.select_mode.title" },
    { translate: "ram_pg.select_mode.body", with: [currentMode] },
  );
  for (const { mode, key } of availableModes(portalGunItem)) {
    menu.button({ translate: `ram_pg.select_mode.${key}` }, icon(portalGunItem, key), () => {
      changePortalGunMode(player, inventory, portalGunItem, mode);
      player.onScreenDisplay.setActionBar({
        translate: "ram_pg.select_mode.set_mode",
        with: [mode],
      });
      stopPlayerAnimation(player);
    });
  }
  menu
    .divider()
    .label(modesExplained(portalGunItem))
    .button({ translate: "ram_pg.back" }, icon(portalGunItem, "back"), () =>
      openPortalGunMenu(player, portalGunItem),
    )
    .show(player, () => openPortalGunMenu(player, portalGunItem));
}

/**
 * Opens the Portal Gun settings menu.
 * Provides access to behavior settings, history, dismounting, resetting, and debugging.
 *
 * @param {Player} player
 * @param {EntityInventoryComponent} inventory
 * @param {ItemStack} portalGunItem
 */
function sameGun(item, portalGunItem) {
  return item?.getDynamicProperty(portalGunDP.id) === portalGunItem.getDynamicProperty(portalGunDP.id);
}

export function openPasswordPrompt(player, portalGunItem, slotIndex) {
  const container = player.getComponent("inventory").container;
  modalMenu(portalGunItem, { translate: "ram_pg.security.locked_title" })
    .label({
      translate: "ram_pg.security.locked_body",
      with: [String(portalGunItem.getDynamicProperty(portalGunDP.ownerName) ?? "?")],
    })
    .text("password", { translate: "ram_pg.security.password" }, { translate: "ram_pg.security.password_placeholder" }, "")
    .submit({ translate: "ram_pg.security.unlock" })
    .show(
      player,
      ({ password }) => {
        stopPlayerAnimation(player);
        const current = container.getItem(slotIndex);
        if (!sameGun(current, portalGunItem)) return;
        if (!checkPassword(current, password)) return shockPlayer(player, slotIndex);
        authorize(current, player);
        container.setItem(slotIndex, current);
        player.onScreenDisplay.setActionBar({ translate: "ram_pg.security.granted" });
        player.dimension.playSound("ram_pg:selection", player.location);
      },
      () => {
        stopPlayerAnimation(player);
        if (sameGun(container.getItem(slotIndex), portalGunItem)) shockPlayer(player, slotIndex);
      },
    );
}

function securityStatus(portalGunItem) {
  return {
    rawtext: [
      { translate: "ram_pg.security.owner", with: [String(portalGunItem.getDynamicProperty(portalGunDP.ownerName) ?? "?")] },
      { text: "\n" },
      { translate: isLocked(portalGunItem) ? "ram_pg.security.status_locked" : "ram_pg.security.status_unlocked" },
      { text: "\n" },
      { translate: hasPassword(portalGunItem) ? "ram_pg.security.password_set" : "ram_pg.security.password_none" },
      { text: "\n" },
      { translate: "ram_pg.security.authorized_count", with: [String(readAuthorized(portalGunItem).length)] },
    ],
  };
}

function openSecurityForm(player, inventory, portalGunItem) {
  playPlayerAnimation(player);
  player.dimension.playSound("ram_pg:button_click", player.location);
  const back = () => openSettingsForm(player, inventory, portalGunItem);
  const reopen = () => openSecurityForm(player, inventory, portalGunItem);
  const menu = actionMenu(portalGunItem, { translate: "ram_pg.security.title" }, securityStatus(portalGunItem));

  if (isOwner(player, portalGunItem)) {
    const locked = isLocked(portalGunItem);
    menu
      .button(
        { translate: locked ? "ram_pg.security.unlock_gun" : "ram_pg.security.lock_gun" },
        icon(portalGunItem, locked ? "unlock" : "lock"),
        () => {
          portalGunItem.setDynamicProperty(portalGunDP.locked, !locked);
          updateGunInInventory(player, inventory, portalGunItem);
          player.dimension.playSound("ram_pg:selection", player.location);
          reopen();
        },
      )
      .button({ translate: "ram_pg.security.change_password" }, icon(portalGunItem, "key"), () =>
        openPasswordForm(player, inventory, portalGunItem),
      )
      .button({ translate: "ram_pg.security.authorize" }, icon(portalGunItem, "user_add"), () =>
        openAuthorizeForm(player, inventory, portalGunItem),
      );
    if (readAuthorized(portalGunItem).length) {
      menu.button({ translate: "ram_pg.security.revoke" }, icon(portalGunItem, "user_remove"), () =>
        openRevokeForm(player, inventory, portalGunItem),
      );
    }
    menu.button({ translate: "ram_pg.security.transfer" }, icon(portalGunItem, "transfer"), () =>
      openTransferForm(player, inventory, portalGunItem),
    );
  } else {
    menu.label({ translate: "ram_pg.security.owner_only" });
  }

  menu.button({ translate: "ram_pg.back" }, icon(portalGunItem, "back"), back).show(player, back);
}

function openPasswordForm(player, inventory, portalGunItem) {
  const reopen = () => openSecurityForm(player, inventory, portalGunItem);
  modalMenu(portalGunItem, { translate: "ram_pg.security.change_password" })
    .text("password", { translate: "ram_pg.security.new_password" }, { translate: "ram_pg.security.password_placeholder" }, "")
    .submit({ translate: "ram_pg.settings.save" })
    .show(
      player,
      ({ password }) => {
        const value = String(password ?? "");
        portalGunItem.setDynamicProperty(portalGunDP.password, value ? hashPassword(value) : undefined);
        updateGunInInventory(player, inventory, portalGunItem);
        player.onScreenDisplay.setActionBar({
          translate: value ? "ram_pg.security.password_saved" : "ram_pg.security.password_removed",
        });
        player.dimension.playSound("ram_pg:selection", player.location);
        reopen();
      },
      reopen,
    );
}

function openAuthorizeForm(player, inventory, portalGunItem) {
  const reopen = () => openSecurityForm(player, inventory, portalGunItem);
  const ownerId = portalGunItem.getDynamicProperty(portalGunDP.ownerId);
  const authorized = readAuthorized(portalGunItem);
  const candidates = world
    .getAllPlayers()
    .filter((other) => other.id !== ownerId && !authorized.some((entry) => entry.id === other.id));
  if (!candidates.length) {
    player.onScreenDisplay.setActionBar({ translate: "ram_pg.security.no_players" });
    player.dimension.playSound("ram_pg:error_sound", player.location);
    return reopen();
  }
  modalMenu(portalGunItem, { translate: "ram_pg.security.authorize" })
    .dropdown("player", { translate: "ram_pg.security.authorize_player" }, candidates.map((other) => other.name), 0)
    .submit({ translate: "ram_pg.security.authorize" })
    .show(
      player,
      ({ player: index }) => {
        const chosen = candidates[index];
        if (chosen?.isValid) {
          authorize(portalGunItem, chosen);
          updateGunInInventory(player, inventory, portalGunItem);
          player.onScreenDisplay.setActionBar({ translate: "ram_pg.security.authorized", with: [chosen.name] });
          player.dimension.playSound("ram_pg:selection", player.location);
        }
        reopen();
      },
      reopen,
    );
}

function openTransferForm(player, inventory, portalGunItem) {
  const reopen = () => openSecurityForm(player, inventory, portalGunItem);
  const candidates = world.getAllPlayers().filter((other) => other.id !== player.id);
  if (!candidates.length) {
    player.onScreenDisplay.setActionBar({ translate: "ram_pg.security.no_players_transfer" });
    player.dimension.playSound("ram_pg:error_sound", player.location);
    return reopen();
  }
  modalMenu(portalGunItem, { translate: "ram_pg.security.transfer" })
    .label({ translate: "ram_pg.security.transfer_warning" })
    .dropdown("player", { translate: "ram_pg.security.transfer_player" }, candidates.map((other) => other.name), 0)
    .toggle("confirm", { translate: "ram_pg.security.transfer_confirm" }, false)
    .submit({ translate: "ram_pg.security.transfer" })
    .show(
      player,
      ({ player: index, confirm }) => {
        const chosen = candidates[index];
        if (!confirm || !chosen?.isValid || !isOwner(player, portalGunItem)) {
          player.dimension.playSound("ram_pg:error_sound", player.location);
          return reopen();
        }
        transferOwnership(portalGunItem, chosen);
        updateGunInInventory(player, inventory, portalGunItem);
        player.onScreenDisplay.setActionBar({ translate: "ram_pg.security.transferred", with: [chosen.name] });
        chosen.sendMessage({ translate: "ram_pg.security.transfer_received", with: [player.name] });
        player.dimension.playSound("ram_pg:selection", player.location);
        reopen();
      },
      reopen,
    );
}

function openRevokeForm(player, inventory, portalGunItem) {
  const reopen = () => openSecurityForm(player, inventory, portalGunItem);
  const menu = actionMenu(portalGunItem, { translate: "ram_pg.security.revoke" });
  for (const entry of readAuthorized(portalGunItem)) {
    menu.button({ text: `§f${entry.name}` }, icon(portalGunItem, "user_remove"), () => {
      writeAuthorized(portalGunItem, readAuthorized(portalGunItem).filter((other) => other.id !== entry.id));
      updateGunInInventory(player, inventory, portalGunItem);
      player.onScreenDisplay.setActionBar({ translate: "ram_pg.security.revoked", with: [entry.name] });
      player.dimension.playSound("ram_pg:selection", player.location);
      reopen();
    });
  }
  menu.button({ translate: "ram_pg.back" }, icon(portalGunItem, "back"), reopen).show(player, reopen);
}

function openSettingsForm(player, inventory, portalGunItem) {
  playPlayerAnimation(player);
  player.dimension.playSound("ram_pg:button_click", player.location);
  let form = new ActionFormData()
    .title(themed(player, portalGunItem, { translate: "ram_pg.settings.title" }))
    .body(gunView(player, portalGunItem))
    .button(
      { translate: "ram_pg.back" },
      icon(portalGunItem, "back"),
    )
    .divider()
    .button(
      { translate: "ram_pg.settings.close_all_portals" },
      icon(portalGunItem, "close_all"),
    )
    .button(
      { translate: "ram_pg.settings.reset_portal_gun" },
      icon(portalGunItem, "reset"),
    )
    .button(
      { translate: "ram_pg.settings.how_to_use" },
      icon(portalGunItem, "how_to_use"),
    )
    .button(
      { translate: "ram_pg.settings.terminal" },
      icon(portalGunItem, "terminal"),
    );
  if (!isBasicGun(portalGunItem)) {
    form.button({ translate: "ram_pg.security.title" }, icon(portalGunItem, "lock"));
  }

  form.show(player).then((response) => {
    switch (response.selection) {
      case 0:
        openPortalGunMenu(player, portalGunItem);
        break;
      case 1: {
        stopPlayerAnimation(player);
        const portalGunId = portalGunItem.getDynamicProperty(portalGunDP.id);
        const itemObject = findPortalGunInInventory(player, portalGunId);
        if (itemObject) {
          removeAllPortals(player, portalGunItem, itemObject.slotIndex);
        }
        player.dimension.playSound("ram_pg:selection", player.location);
        break;
      }
      case 2:
        if (canManageGun(player, portalGunItem)) {
          openResetForm(player, portalGunItem, inventory);
        } else {
          player.onScreenDisplay.setActionBar({ translate: "ram_pg.security.owner_only_reset" });
          player.dimension.playSound("ram_pg:error_sound", player.location);
          openSettingsForm(player, inventory, portalGunItem);
        }
        break;
      case 3:
        openHowToUseForm(player, inventory, portalGunItem);
        break;
      case 4:
        openTerminalForm(player, inventory, portalGunItem);
        break;
      case 5:
        if (!isBasicGun(portalGunItem)) openSecurityForm(player, inventory, portalGunItem);
        else openSettingsForm(player, inventory, portalGunItem);
        break;
      default:
        if (isBusy(response)) stopPlayerAnimation(player);
        else openPortalGunMenu(player, portalGunItem);
    }
  });
}

/**
 * Opens behavior settings form for the Portal Gun.
 * Adjusts auto-close, high pressure, safe placement, and portal scale.
 *
 * @param {Player} player
 * @param {ItemStack} portalGunItem
 * @param {EntityInventoryComponent} inventory
 */
function openBehaviorSettingsForm(player, portalGunItem, inventory) {
  playPlayerAnimation(player);
  player.dimension.playSound("ram_pg:button_click", player.location);
  const read = (key) => portalGunItem.getDynamicProperty(portalGunDP.behavior[key]);
  const form = new ModalFormData()
    .title(themed(player, portalGunItem, { translate: "ram_pg.settings.behavior_settings" }))
    .header(gunView(player, portalGunItem));
  const fields = [null];
  const toggle = (key, label, fallback = false) => {
    form.toggle(
      { translate: `ram_pg.settings.${label}` },
      {
        defaultValue: (read(key) ?? fallback) ? true : false,
        tooltip: { translate: `ram_pg.settings.${label}_tooltip` },
      },
    );
    fields.push(key);
  };
  const slider = (key, label, min, max, defaultValue, tooltip) => {
    form.slider({ translate: `ram_pg.settings.${label}` }, min, max, {
      defaultValue,
      valueStep: 1,
      ...(tooltip ? { tooltip: { translate: `ram_pg.settings.${label}_tooltip` } } : {}),
    });
    fields.push(key);
  };

  toggle("autoClose", "auto_close_portals");
  slider("autoCloseDelay", "auto_close_delay", 1, 30, read("autoCloseDelay") ?? AUTO_CLOSE_DELAY_DEFAULT, true);
  toggle("highPressure", "high_pressure_mode");
  toggle("safePlacement", "safe_placement");
  slider("scale", "portal_scale", 1, 4, SCALE_STEPS.indexOf(read("scale")) + 1 || 2);
  toggle("fastLocationChange", "fast_location_change");
  toggle("swingModeChange", "swing_mode_change", true);
  if (!isBasicGun(portalGunItem)) toggle("tracker", "tracker");
  toggle("chargeBar", "charge_bar");
  toggle("floatingPortals", "floating_portals");
  slider("floatingPortalsDistance", "floating_portals_distance", 5, 30, read("floatingPortalsDistance") ?? 5);
  form.divider().submitButton({ translate: "ram_pg.settings.save" });

  form.show(player).then((response) => {
    if (response.formValues === undefined) {
      if (isBusy(response)) stopPlayerAnimation(player);
      else openPortalGunMenu(player, portalGunItem);
      return;
    }

    fields.forEach((key, index) => {
      if (!key) return;
      const value = response.formValues[index];
      portalGunItem.setDynamicProperty(
        portalGunDP.behavior[key],
        key === "scale" ? (SCALE_STEPS[value - 1] ?? 1) : value,
      );
    });
    if (!read("chargeBar")) clearChargeBar(player);

    updateGunInInventory(player, inventory, portalGunItem);
    player.onScreenDisplay.setActionBar({
      translate: "ram_pg.settings.behavior_settings_saved",
    });
    player.dimension.playSound("ram_pg:selection", player.location);
    stopPlayerAnimation(player);
  });
}

/**
 * Opens the teleportation history menu.
 * Player can select previous locations (up to 30) to use them again.
 *
 * @param {Player} player
 * @param {EntityInventoryComponent} inventory
 * @param {ItemStack} portalGunItem
 */
function openHistoryForm(player, inventory, portalGunItem) {
  playPlayerAnimation(player);
  player.dimension.playSound("ram_pg:button_click", player.location);
  const historyJson = portalGunItem.getDynamicProperty(
    portalGunDP.historyLocations,
  );
  const history = historyJson ? JSON.parse(historyJson) : [];

  let form = new ActionFormData()
    .title(themed(player, portalGunItem, { translate: "ram_pg.settings.history" }))
    .body(gunView(player, portalGunItem))
    .label({ translate: "ram_pg.settings.history_body", with: [String(HISTORY_LIMIT)] })
    .divider()
    .button(
      { translate: "ram_pg.back" },
      icon(portalGunItem, "back"),
    )
    .divider();

  if (history.length == 0) {
    form.label({ translate: "ram_pg.settings.history_empty" });
  } else
    history.forEach((location) => {
      form.button(
        locationButtonText(player, location),
        dimensionIcon(portalGunItem, location.dimensionId),
      );
    });

  form.show(player).then((response) => {
    if (response.selection == 0) {
      openPortalGunMenu(player, portalGunItem);
    } else if (response.selection !== undefined && response.selection > 0) {
      const selectedLocation = history[response.selection - 1];

      portalGunItem.setDynamicProperty(
        portalGunDP.customLocation,
        JSON.stringify(selectedLocation),
      );
      portalGunItem.setDynamicProperty(portalGunDP.mode, "CUSTOM");

      const portalGunId = portalGunItem.getDynamicProperty(portalGunDP.id);
      const itemObject = findPortalGunInInventory(player, portalGunId);
      inventory.container.setItem(itemObject.slotIndex, portalGunItem);

      player.onScreenDisplay.setActionBar({
        translate: "ram_pg.portal_gun.set_to_location",
        with: [
          String(selectedLocation.name),
          String(selectedLocation.x),
          String(selectedLocation.y),
          String(selectedLocation.z),
        ],
      });
      player.dimension.playSound("ram_pg:selection", player.location);
      stopPlayerAnimation(player);
    } else if (isBusy(response)) {
      stopPlayerAnimation(player);
    } else {
      openPortalGunMenu(player, portalGunItem);
    }
  });
}

/**
 * Opens a confirmation form to reset the Portal Gun.
 * Clears all dynamic properties and saved locations.
 *
 * @param {Player} player
 * @param {ItemStack} portalGunItem
 * @param {EntityInventoryComponent} inventory
 */
function openResetForm(player, portalGunItem, inventory) {
  playPlayerAnimation(player);
  player.dimension.playSound("ram_pg:button_click", player.location);
  let form = new ActionFormData()
    .title(themed(player, portalGunItem, { translate: "ram_pg.settings.reset_portal_gun" }))
    .body(gunView(player, portalGunItem))
    .label({ translate: "ram_pg.settings.reset_portal_gun_body" })
    .button({ translate: "ram_pg.confirm" })
    .button({ translate: "ram_pg.cancel" });

  form.show(player).then((response) => {
    if (response.selection === undefined) {
      if (isBusy(response)) stopPlayerAnimation(player);
      else openSettingsForm(player, inventory, portalGunItem);
      return;
    }
    if (response.selection == 0) {
      stopPlayerAnimation(player);
      const portalGunId = portalGunItem.getDynamicProperty(portalGunDP.id);
      const itemObject = findPortalGunInInventory(player, portalGunId);
      if (!itemObject) return;

      removeAllPortals(player, portalGunItem, itemObject.slotIndex);
      const kept = [portalGunDP.charge, ...SECURITY_PROPERTIES].map((id) => [id, portalGunItem.getDynamicProperty(id)]);
      portalGunItem.clearDynamicProperties();
      for (const [id, value] of kept) {
        if (value !== undefined) portalGunItem.setDynamicProperty(id, value);
      }

      inventory.container.setItem(itemObject.slotIndex, portalGunItem);

      player.dimension.playSound("ram_pg:selection", player.location);
      player.onScreenDisplay.setActionBar({
        translate: "ram_pg.settings.reset_portal_gun_confirmation",
      });
    } else if (response.selection == 1) {
      openSettingsForm(player, inventory, portalGunItem);
    }
  });
}

/**
 * Opens the “How to Use” tutorial form.
 * Displays controls and basic usage instructions.
 *
 * @param {Player} player
 * @param {EntityInventoryComponent} inventory
 * @param {ItemStack} portalGunItem
 */
const HOW_TO_SECTIONS = ["controls", "assembly", "quick", "target"];

function openHowToUseForm(player, inventory, portalGunItem) {
  playPlayerAnimation(player);
  player.dimension.playSound("ram_pg:button_click", player.location);
  let form = new ActionFormData()
    .title(themed(player, portalGunItem, { translate: "ram_pg.settings.how_to_use" }))
    .body(gunView(player, portalGunItem));
  HOW_TO_SECTIONS.forEach((section, index) => {
    if (index) form.divider();
    form.label({ translate: `ram_pg.how_to.${section}` });
  });
  form.button({ translate: "ram_pg.back" }, icon(portalGunItem, "back"));
  form.show(player).then((response) => {
    if (isBusy(response)) {
      stopPlayerAnimation(player);
    } else {
      openSettingsForm(player, inventory, portalGunItem);
    }
  });
}

const TERMINAL_LIST_LIMIT = 15;
const TYPE_MARKER = "§k§r§k§r§";
const TYPE_LINE_TICKS = 9;
const TRANSFER_PARTS = {
  all: ["locations", "history"],
  locations: ["locations"],
  locs: ["locations"],
  loc: ["locations"],
  history: ["history"],
  hist: ["history"],
};
const BOOL_ON = ["on", "true", "1", "yes"];
const BOOL_OFF = ["off", "false", "0", "no"];
const SCALE_STEPS = [0.5, 1, 1.5, 2];
const GUN_SETTINGS = {
  autoclose: { property: portalGunDP.behavior.autoClose, label: "ram_pg.settings.auto_close_portals", type: "bool" },
  closedelay: { property: portalGunDP.behavior.autoCloseDelay, label: "ram_pg.settings.auto_close_delay", type: "range", min: 1, max: 30, fallback: AUTO_CLOSE_DELAY_DEFAULT },
  pressure: { property: portalGunDP.behavior.highPressure, label: "ram_pg.settings.high_pressure_mode", type: "bool" },
  safe: { property: portalGunDP.behavior.safePlacement, label: "ram_pg.settings.safe_placement", type: "bool" },
  scale: { property: portalGunDP.behavior.scale, label: "ram_pg.settings.portal_scale", type: "scale" },
  fastchange: { property: portalGunDP.behavior.fastLocationChange, label: "ram_pg.settings.fast_location_change", type: "bool" },
  swingmode: { property: portalGunDP.behavior.swingModeChange, label: "ram_pg.settings.swing_mode_change", type: "bool", fallback: true },
  tracker: { property: portalGunDP.behavior.tracker, label: "ram_pg.settings.tracker", type: "bool", advanced: true },
  chargebar: { property: portalGunDP.behavior.chargeBar, label: "ram_pg.settings.charge_bar", type: "bool" },
  float: { property: portalGunDP.behavior.floatingPortals, label: "ram_pg.settings.floating_portals", type: "bool" },
  floatdist: { property: portalGunDP.behavior.floatingPortalsDistance, label: "ram_pg.settings.floating_portals_distance", type: "range", min: 5, max: 30, fallback: 5 },
};

function term(key, ...values) {
  return { translate: `ram_pg.term.${key}`, with: values.map(String) };
}

function termError(key, ...values) {
  return { rawtext: [{ text: "§c" }, term(key, ...values), { text: "§r" }] };
}

function ownerOnly() {
  return { error: { rawtext: [{ text: "§c" }, { translate: "ram_pg.security.owner_only" }] } };
}

function termField(labelKey, value) {
  return {
    rawtext: [
      { text: "§7" },
      term(`label.${labelKey}`),
      { text: ": §f" },
      typeof value === "object" ? value : { text: String(value) },
      { text: "§r" },
    ],
  };
}

function batteryText(charge) {
  const cells = Math.min(BATTERY_CELLS, Math.max(0, Math.ceil(charge / 10)));
  const color = cells <= 2 ? "§c" : cells <= 5 ? "§e" : "§a";
  return {
    rawtext: [{ text: `§7[${color}${"|".repeat(cells)}§8${"|".repeat(BATTERY_CELLS - cells)}§7] §f` }, term("percent", charge)],
  };
}

function terminalLocation(player, location, index) {
  const distance = distanceTo(player, location);
  return {
    rawtext: [
      { text: index === undefined ? "§f" : `§7#${index} §f` },
      location.name ? { text: String(location.name) } : { translate: "ram_pg.locations.nameless" },
      { text: " §7- " },
      asRawMessage(dimensionLabel(location.dimensionId)),
      { text: ` §7X §f${location.x} §7Y §f${location.y} §7Z §f${location.z}` },
      ...(distance === undefined ? [] : distanceMessage(" §8", distance)),
      { text: "§r" },
    ],
  };
}

function currentDestination(portalGunItem) {
  const json = portalGunItem.getDynamicProperty(portalGunDP.customLocation);
  if (portalGunItem.getDynamicProperty(portalGunDP.mode) !== "CUSTOM" || !json) return undefined;
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

function destinationField(player, portalGunItem) {
  const location = currentDestination(portalGunItem);
  return termField("destination", location ? terminalLocation(player, location) : term("label.none"));
}

function findLocation(savedLocations, target) {
  const query = String(target ?? "").trim();
  if (!query) return { error: true };
  const number = /^#?(\d+)$/.exec(query);
  if (number) {
    const index = Number(number[1]) - 1;
    return savedLocations[index] ? { index } : { error: true };
  }
  const lower = query.toLowerCase();
  const exact = savedLocations.findIndex((location) => String(location.name).toLowerCase() === lower);
  if (exact >= 0) return { index: exact };
  const partial = savedLocations
    .map((location, index) => ({ index, name: String(location.name).toLowerCase() }))
    .filter(({ name }) => name.startsWith(lower));
  if (partial.length === 1) return { index: partial[0].index };
  return { error: true, ambiguous: partial.length > 1 };
}

function gunSettingValue(portalGunItem, setting) {
  const value = portalGunItem.getDynamicProperty(setting.property);
  if (setting.type === "bool") return (value ?? setting.fallback) ? "on" : "off";
  if (setting.type === "scale") return String(value ?? 1);
  return String(value ?? setting.fallback ?? setting.min);
}

function parseGunSetting(setting, raw) {
  const input = String(raw ?? "").toLowerCase();
  if (setting.type === "bool") {
    if (BOOL_ON.includes(input)) return { value: true };
    if (BOOL_OFF.includes(input)) return { value: false };
    return { error: true };
  }
  const number = Number(input);
  if (setting.type === "scale") {
    return SCALE_STEPS.includes(number) ? { value: number } : { error: true };
  }
  if (Number.isInteger(number) && number >= setting.min && number <= setting.max) return { value: number };
  return { error: true };
}

function gunSlot(player, portalGunItem) {
  const portalGunId = portalGunItem.getDynamicProperty(portalGunDP.id);
  return findPortalGunInInventory(player, portalGunId)?.slotIndex;
}

function portalCount(portalGunItem) {
  const json = portalGunItem.getDynamicProperty(portalGunDP.portalList);
  try {
    return json ? JSON.parse(json).length : 0;
  } catch {
    return 0;
  }
}

function modelName(portalGunItem) {
  return portalGunItem.nameTag ? { text: portalGunItem.nameTag } : { translate: portalGunItem.localizationKey };
}

function identityFields(player, portalGunItem) {
  const charge = portalGunItem.getDynamicProperty(portalGunDP.charge) ?? 0;
  return [
    termField("model", modelName(portalGunItem)),
    termField("id", portalGunItem.getDynamicProperty(portalGunDP.id) ?? "-"),
    termField("user", portalGunItem.getDynamicProperty(portalGunDP.lastUser) ?? player.name),
    termField("mode", portalGunItem.getDynamicProperty(portalGunDP.mode) ?? "FIFO"),
    termField("battery", batteryText(charge)),
    termField("portals", portalCount(portalGunItem)),
    termField("saved", `${getSavedLocations(portalGunItem).length}/${locationLimit(portalGunItem)}`),
  ];
}

/**
 * Command registry for the terminal.
 * Each command name maps to a handler function.
 */
const TERMINAL_COMMANDS = {
  help: {
    usage: "help [command]",
    run({ args }) {
      if (args[0]) {
        const name = TERMINAL_ALIASES[args[0].toLowerCase()] ?? args[0].toLowerCase();
        const command = TERMINAL_COMMANDS[name];
        if (!command) return { error: termError("help.unknown", args[0]) };
        const aliases = Object.keys(TERMINAL_ALIASES).filter((alias) => TERMINAL_ALIASES[alias] === name);
        return [
          `§f${command.usage}§r`,
          term(`desc.${name}`),
          ...(aliases.length ? [term("help.aliases", aliases.join(", "))] : []),
        ];
      }
      return [
        term("help.header"),
        ...Object.keys(TERMINAL_COMMANDS).map((name) => ({
          rawtext: [{ text: `§f${name}§7 - ` }, term(`desc.${name}`), { text: "§r" }],
        })),
      ];
    },
  },
  clear: { usage: "clear", run: () => ({ clear: true }) },
  exit: {
    usage: "exit",
    run({ player, inventory, portalGunItem }) {
      openSettingsForm(player, inventory, portalGunItem);
      return null;
    },
  },
  whoami: { usage: "whoami", run: ({ player, portalGunItem }) => identityFields(player, portalGunItem) },
  status: {
    usage: "status",
    run({ player, portalGunItem }) {
      const charge = portalGunItem.getDynamicProperty(portalGunDP.charge) ?? 0;
      return [
        termField("battery", batteryText(charge)),
        termField("mode", portalGunItem.getDynamicProperty(portalGunDP.mode) ?? "FIFO"),
        termField("portals", portalCount(portalGunItem)),
        destinationField(player, portalGunItem),
      ];
    },
  },
  pwd: { usage: "pwd", run: ({ player, portalGunItem }) => [destinationField(player, portalGunItem)] },
  ls: {
    usage: "ls [filter]",
    run({ player, portalGunItem, rest }) {
      const savedLocations = getSavedLocations(portalGunItem);
      if (!savedLocations.length) return [term("msg.no_locations")];
      const filter = rest.toLowerCase();
      const rows = savedLocations
        .map((location, index) => ({ location, index }))
        .filter(({ location }) => !filter || String(location.name).toLowerCase().includes(filter));
      if (!rows.length) return { error: termError("msg.not_found", rest) };
      return [
        term("msg.ls_header", savedLocations.length, locationLimit(portalGunItem)),
        ...rows.slice(0, TERMINAL_LIST_LIMIT).map(({ location, index }) => terminalLocation(player, location, index + 1)),
        ...(rows.length > TERMINAL_LIST_LIMIT ? [term("msg.more", rows.length - TERMINAL_LIST_LIMIT)] : []),
      ];
    },
  },
  cd: {
    usage: "cd <name|#number>",
    run({ player, inventory, portalGunItem, rest }) {
      const savedLocations = getSavedLocations(portalGunItem);
      const found = findLocation(savedLocations, rest);
      if (found.error) return { error: termError(found.ambiguous ? "msg.ambiguous" : "msg.not_found", rest) };
      const location = savedLocations[found.index];
      const interspatial = portalGunItem.typeId.includes("blue");
      if (interspatial && location.dimensionId !== player.dimension.id) {
        return { error: { rawtext: [{ text: "§c" }, { translate: "ram_pg.set_coordinates.dimension_mismatch" }] } };
      }
      setDestination(player, inventory, portalGunItem, location);
      return [term("msg.destination"), terminalLocation(player, location)];
    },
  },
  goto: {
    usage: "goto <x> <y> <z> [dimension]",
    run({ player, inventory, portalGunItem, rest }) {
      if (!rest) return { usage: true };
      const interspatial = portalGunItem.typeId.includes("blue");
      const destination = readDestination(player, interspatial, rest, {}, portalGunItem);
      if (destination.error) return { error: { rawtext: [{ text: "§c" }, { translate: destination.error }] } };
      setDestination(player, inventory, portalGunItem, destination.location);
      return [term("msg.destination"), terminalLocation(player, destination.location)];
    },
  },
  random: {
    usage: "random [radius]",
    run({ player, inventory, portalGunItem, args }) {
      const radius = Math.min(20000, Math.max(100, parseInt(args[0]) || 2000));
      const center = currentBlockLocation(player);
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * radius;
      const location = {
        name: "",
        id: -Math.floor(Math.random() * 10000),
        x: Math.round(center.x + Math.cos(angle) * distance),
        y: center.y,
        z: Math.round(center.z + Math.sin(angle) * distance),
        dimensionId: player.dimension.id,
        surface: true,
      };
      setDestination(player, inventory, portalGunItem, location);
      return [term("msg.random", location.x, location.z, Math.round(distance))];
    },
  },
  biome: {
    usage: "biome <name>",
    run({ player, inventory, portalGunItem, rest }) {
      if (isBasicGun(portalGunItem)) return { error: termError("msg.unsupported", "biome") };
      if (!rest) return { usage: true };
      const query = rest.toLowerCase().replace(/\s+/g, "_");
      const biomes = listBiomes();
      const biomeId =
        biomes.find((id) => id === query || id === `minecraft:${query}`) ??
        biomes.find((id) => id.split(":")[1].startsWith(query)) ??
        biomes.find((id) => biomeName(id).toLowerCase().includes(rest.toLowerCase()));
      if (!biomeId) return { error: termError("msg.biome_unknown", rest) };

      let found;
      try {
        found = player.dimension.calculateClosestBiomeFromSeed(player.location, biomeId);
      } catch (searchError) {
        console.warn(`[ram_pg] Biome search failed for ${biomeId}:`, searchError);
      }
      if (!found) {
        return { error: { rawtext: [{ text: "§c" }, { translate: "ram_pg.coords.biome_not_found", with: [biomeName(biomeId)] }] } };
      }
      const here = currentBlockLocation(player);
      const location = {
        name: "",
        id: -Math.floor(Math.random() * 10000),
        x: Math.floor(found.x),
        y: here.y,
        z: Math.floor(found.z),
        dimensionId: player.dimension.id,
        surface: true,
      };
      setDestination(player, inventory, portalGunItem, location);
      return [
        {
          translate: "ram_pg.coords.biome_found",
          with: [
            biomeName(biomeId),
            String(location.x),
            String(location.z),
            String(Math.round(Math.hypot(location.x - here.x, location.z - here.z))),
          ],
        },
      ];
    },
  },
  save: {
    usage: "save <name>",
    run({ player, inventory, portalGunItem, rest }) {
      if (!rest) return { usage: true };
      const savedLocations = getSavedLocations(portalGunItem);
      if (savedLocations.length >= locationLimit(portalGunItem)) return { error: termError("msg.limit", locationLimit(portalGunItem)) };
      const position = currentBlockLocation(player);
      savedLocations.push({ name: rest, id: newLocationId(), dimensionId: player.dimension.id, ...position });
      storeSavedLocations(player, inventory, portalGunItem, savedLocations);
      player.dimension.playSound("ram_pg:selection", player.location);
      return [term("msg.saved", rest, position.x, position.y, position.z)];
    },
  },
  rm: {
    usage: "rm <name|#number> | rm -a",
    run({ player, inventory, portalGunItem, rest }) {
      if (!rest) return { usage: true };
      const savedLocations = getSavedLocations(portalGunItem);
      if (rest === "-a" || rest === "-all") {
        if (!savedLocations.length) return [term("msg.no_locations")];
        storeSavedLocations(player, inventory, portalGunItem, []);
        player.dimension.playSound("ram_pg:selection", player.location);
        return [term("msg.deleted_all", savedLocations.length)];
      }
      const found = findLocation(savedLocations, rest);
      if (found.error) return { error: termError(found.ambiguous ? "msg.ambiguous" : "msg.not_found", rest) };
      const [removed] = savedLocations.splice(found.index, 1);
      storeSavedLocations(player, inventory, portalGunItem, savedLocations);
      player.dimension.playSound("ram_pg:selection", player.location);
      return [term("msg.deleted", removed.name || "#" + (found.index + 1))];
    },
  },
  mv: {
    usage: "mv <name|#number> <new name>",
    run({ player, inventory, portalGunItem, args }) {
      const newName = args.slice(1).join(" ").trim();
      if (!args[0] || !newName) return { usage: true };
      const savedLocations = getSavedLocations(portalGunItem);
      const found = findLocation(savedLocations, args[0]);
      if (found.error) return { error: termError(found.ambiguous ? "msg.ambiguous" : "msg.not_found", args[0]) };
      const oldName = savedLocations[found.index].name || "#" + (found.index + 1);
      savedLocations[found.index] = { ...savedLocations[found.index], name: newName };
      storeSavedLocations(player, inventory, portalGunItem, savedLocations);
      player.dimension.playSound("ram_pg:selection", player.location);
      return [term("msg.renamed", oldName, newName)];
    },
  },
  history: {
    usage: "history",
    run({ player, portalGunItem }) {
      if (isBasicGun(portalGunItem)) return { error: termError("msg.unsupported", "history") };
      let history = [];
      try {
        history = JSON.parse(portalGunItem.getDynamicProperty(portalGunDP.historyLocations) ?? "[]");
      } catch {}
      if (!history.length) return [term("msg.no_history")];
      return [
        term("msg.history_header"),
        ...history.slice(0, TERMINAL_LIST_LIMIT).map((location, index) => terminalLocation(player, location, index + 1)),
      ];
    },
  },
  mode: {
    usage: "mode [mode]",
    run({ player, inventory, portalGunItem, args }) {
      const options = availableModes(portalGunItem);
      if (!args[0]) {
        const current = portalGunItem.getDynamicProperty(portalGunDP.mode) ?? "FIFO";
        return [term("msg.mode_current", current, options.map(({ key }) => key).join(", "))];
      }
      const wanted = args[0].toLowerCase();
      const option = options.find(({ key }) => key === wanted);
      if (!option) {
        const known = MODE_OPTIONS.some(({ key }) => key === wanted);
        return { error: known ? termError("msg.unsupported", wanted) : termError("msg.invalid_value", args[0], "mode") };
      }
      changePortalGunMode(player, inventory, portalGunItem, option.mode);
      return [term("msg.mode_set", option.mode)];
    },
  },
  portals: { usage: "portals", run: ({ portalGunItem }) => [termField("portals", portalCount(portalGunItem))] },
  close: {
    usage: "close",
    run({ player, portalGunItem }) {
      const count = portalCount(portalGunItem);
      const slot = gunSlot(player, portalGunItem);
      if (slot !== undefined) removeAllPortals(player, portalGunItem, slot);
      player.dimension.playSound("ram_pg:selection", player.location);
      return [term("msg.closed", count)];
    },
  },
  set: {
    usage: "set [setting] [value]",
    run({ player, inventory, portalGunItem, args }) {
      if (!args[0]) {
        return [
          term("msg.settings_header"),
          ...Object.entries(GUN_SETTINGS)
            .filter(([, setting]) => !setting.advanced || !isBasicGun(portalGunItem))
            .map(([name, setting]) => ({
              rawtext: [
                { text: `§f${name}§7 = §f${gunSettingValue(portalGunItem, setting)}§7  (` },
                { translate: setting.label },
                { text: ")§r" },
              ],
            })),
        ];
      }
      const name = args[0].toLowerCase();
      const setting = GUN_SETTINGS[name];
      if (!setting) return { error: termError("msg.unknown_setting", args[0]) };
      if (setting.advanced && isBasicGun(portalGunItem)) return { error: termError("msg.unsupported", name) };
      if (args[1] === undefined) return [`§f${name}§7 = §f${gunSettingValue(portalGunItem, setting)}§r`];
      const parsed = parseGunSetting(setting, args[1]);
      if (parsed.error) return { error: termError("msg.invalid_value", args[1], name) };
      portalGunItem.setDynamicProperty(setting.property, parsed.value);
      updateGunInInventory(player, inventory, portalGunItem);
      if (setting.property === portalGunDP.behavior.chargeBar && !parsed.value) clearChargeBar(player);
      player.dimension.playSound("ram_pg:selection", player.location);
      return [term("msg.setting_set", name, gunSettingValue(portalGunItem, setting))];
    },
  },
  whereami: {
    usage: "whereami",
    run({ player }) {
      const { x, y, z } = currentBlockLocation(player);
      let biome = "-";
      try {
        biome = biomeName(player.dimension.getBiome(player.location).id);
      } catch {}
      return [
        termField("position", `X ${x}  Y ${y}  Z ${z}`),
        termField("dimension", asRawMessage(dimensionLabel(player.dimension.id))),
        termField("biome", biome),
      ];
    },
  },
  date: {
    usage: "date",
    run() {
      const ticks = world.getTimeOfDay();
      const hours = Math.floor((ticks / 1000 + 6) % 24);
      const minutes = Math.floor(((ticks % 1000) / 1000) * 60);
      return [
        termField("day", world.getDay()),
        termField("time", `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`),
      ];
    },
  },
  echo: { usage: "echo <text>", run: ({ rest }) => [`§f${rest}§r`] },
  uname: {
    usage: "uname",
    run: ({ portalGunItem }) => [
      { rawtext: [{ text: "§fPORTAL-OS §7ram_pg §f" }, modelName(portalGunItem), { text: "§r" }] },
    ],
  },
  lock: {
    usage: "lock",
    run({ player, inventory, portalGunItem }) {
      if (isBasicGun(portalGunItem)) return { error: termError("msg.unsupported", "lock") };
      if (!isOwner(player, portalGunItem)) return ownerOnly();
      portalGunItem.setDynamicProperty(portalGunDP.locked, true);
      updateGunInInventory(player, inventory, portalGunItem);
      return [{ translate: "ram_pg.security.status_locked" }];
    },
  },
  unlock: {
    usage: "unlock",
    run({ player, inventory, portalGunItem }) {
      if (isBasicGun(portalGunItem)) return { error: termError("msg.unsupported", "unlock") };
      if (!isOwner(player, portalGunItem)) return ownerOnly();
      portalGunItem.setDynamicProperty(portalGunDP.locked, false);
      updateGunInInventory(player, inventory, portalGunItem);
      return [{ translate: "ram_pg.security.status_unlocked" }];
    },
  },
  passwd: {
    usage: "passwd <password|->",
    run({ player, inventory, portalGunItem, rest }) {
      if (isBasicGun(portalGunItem)) return { error: termError("msg.unsupported", "passwd") };
      if (!isOwner(player, portalGunItem)) return ownerOnly();
      if (!rest) return { usage: true };
      const remove = rest === "-";
      portalGunItem.setDynamicProperty(portalGunDP.password, remove ? undefined : hashPassword(rest));
      updateGunInInventory(player, inventory, portalGunItem);
      return [{ translate: remove ? "ram_pg.security.password_removed" : "ram_pg.security.password_saved" }];
    },
  },
  transfer: {
    usage: "transfer <to|from> <id> [locs|history|all]",
    run({ player, portalGunItem, args }) {
      const direction = args[0]?.toLowerCase();
      if ((direction !== "to" && direction !== "from") || !args[1]) return { usage: true };
      let parts = TRANSFER_PARTS[(args[2] ?? "all").toLowerCase()];
      if (!parts) return { error: termError("xfer.invalid_part", args[2]) };
      const targetId = normalizeGunId(args[1]);
      if (!isValidGunId(targetId)) return { error: termError("xfer.invalid_id", args[1]) };
      const ownId = portalGunItem.getDynamicProperty(portalGunDP.id);
      if (sameGunId(ownId, targetId)) return { error: termError("xfer.self") };
      const own = findPortalGunInInventory(player, ownId);
      if (!own) return { error: termError("xfer.source_missing") };
      const matches = findGunsById(targetId, player);
      if (!matches.length) return { error: termError("xfer.not_found", targetId) };
      if (matches.length > 1) return { error: termError("xfer.duplicate", targetId, matches.length) };
      const [target] = matches;
      if (!canUseGun(player, target.item)) return { error: termError("xfer.denied", targetId) };

      const pushing = direction === "to";
      const source = pushing ? own.item : target.item;
      const destination = pushing ? target.item : own.item;
      if (isBasicItem(destination)) parts = parts.filter((part) => part !== "history");
      if (!parts.length) return { error: termError("msg.unsupported", "history") };
      const outcome = transferGunData(source, destination, parts, { locations: locationLimit(destination) });
      if (outcome.error) return { error: termError(`xfer.${outcome.error}`, outcome.part) };
      if (outcome.changed) {
        try {
          if (pushing) target.write(destination);
          else player.getComponent("inventory").container.setItem(own.slotIndex, destination);
        } catch {
          return { error: termError("xfer.write_failed") };
        }
      }

      const fromId = pushing ? normalizeGunId(ownId) : targetId;
      const toId = pushing ? targetId : normalizeGunId(ownId);
      const count = (part) => (outcome.results[part] ? outcome.results[part].total : "-");
      const result = (part) => {
        const stats = outcome.results[part];
        return {
          rawtext: [{ text: stats.added ? "§a" : "§7" }, term(`xfer.result_${part}`, stats.added, stats.duplicates, stats.overflow, stats.invalid)],
        };
      };
      return {
        animated: [
          { rawtext: [{ text: "§7" }, term("xfer.link", targetId)] },
          { rawtext: [{ text: "§7" }, term("xfer.handshake")] },
          { rawtext: [{ text: "§7" }, term("xfer.route", fromId, toId)] },
          { rawtext: [{ text: "§7" }, term("xfer.payload", count("locations"), count("history"))] },
          { rawtext: [{ text: "§f" }, term("xfer.progress")] },
          { rawtext: [{ text: "§7" }, term("xfer.verify")] },
          ...parts.map(result),
          { rawtext: [{ text: outcome.changed ? "§a" : "§e" }, term(outcome.changed ? "xfer.done" : "xfer.nothing")] },
        ],
        item: pushing ? own.item : destination,
      };
    },
  },
  resetid: {
    usage: "resetid",
    run({ player, inventory, portalGunItem }) {
      if (!canManageGun(player, portalGunItem)) return { error: termError("msg.resetid_owner") };
      const oldId = portalGunItem.getDynamicProperty(portalGunDP.id);
      const own = findPortalGunInInventory(player, oldId);
      if (!own) return { error: termError("xfer.source_missing") };
      const before = portalCount(own.item);
      removeAllPortals(player, own.item, own.slotIndex);
      const fresh = inventory.container.getItem(own.slotIndex);
      const remaining = portalCount(fresh);
      if (remaining > 0) return { error: termError("msg.resetid_portals", remaining) };
      const newId = generateGunId();
      fresh.setDynamicProperty(portalGunDP.id, newId);
      inventory.container.setItem(own.slotIndex, fresh);
      if (sameGunId(player.getDynamicProperty(playerDP.portalGunId), oldId)) {
        player.setDynamicProperty(playerDP.portalGunId, newId);
      }
      player.dimension.playSound("ram_pg:selection", player.location);
      return { lines: [term("msg.resetid", oldId ?? "-", newId, before - remaining)], item: fresh };
    },
  },
  reset: {
    usage: "reset",
    run({ player, inventory, portalGunItem }) {
      if (!canManageGun(player, portalGunItem)) {
        return { error: { rawtext: [{ text: "§c" }, { translate: "ram_pg.security.owner_only_reset" }] } };
      }
      openResetForm(player, portalGunItem, inventory);
      return null;
    },
  },
};

const TERMINAL_ALIASES = {
  man: "help",
  cls: "clear",
  quit: "exit",
  gunconfig: "whoami",
  gc: "whoami",
  showlocs: "ls",
  dir: "ls",
  delloc: "rm",
  coords: "whereami",
  time: "date",
  killall: "close",
  xfer: "transfer",
  newid: "resetid",
};

function runTerminalCommand(player, inventory, portalGunItem, input) {
  const [first = "", ...args] = input.split(/\s+/);
  const name = TERMINAL_ALIASES[first.toLowerCase()] ?? first.toLowerCase();
  const command = TERMINAL_COMMANDS[name];
  const rest = input.slice(first.length).trim();
  const echo = { text: `§7> ${input}§r` };
  const print = (lines) => {
    const rawtext = [echo];
    for (const line of lines) rawtext.push({ text: "\n" }, typeof line === "string" ? { text: line } : line);
    openTerminalForm(player, inventory, portalGunItem, { rawtext });
  };

  if (!command) {
    player.dimension.playSound("ram_pg:error_sound", player.location);
    return print([termError("unknown", first)]);
  }

  const result = command.run({ player, inventory, portalGunItem, args, rest });
  if (result === null) return;
  if (result.clear) return openTerminalForm(player, inventory, portalGunItem);
  if (result.item) portalGunItem = result.item;
  if (result.animated) {
    const labels = [
      echo,
      ...result.animated.map((line, index) => ({
        rawtext: [{ text: `${TYPE_MARKER}${index}§r` }, typeof line === "string" ? { text: line } : line],
      })),
    ];
    result.animated.forEach((_, index) => {
      system.runTimeout(() => {
        if (!player.isValid) return;
        player.playSound(index === result.animated.length - 1 ? "ram_pg:selection" : "ram_pg:button_click");
      }, index * TYPE_LINE_TICKS);
    });
    return openTerminalForm(player, inventory, portalGunItem, labels);
  }
  if (result.lines) return print(result.lines);
  if (result.usage || result.error) {
    player.dimension.playSound("ram_pg:error_sound", player.location);
    return print([result.error ?? termError("usage", command.usage)]);
  }
  print(result);
}

/**
 * Opens the terminal command input form.
 * Executes matching commands from the command registry.
 *
 * @param {Player} player
 * @param {EntityInventoryComponent} inventory
 * @param {ItemStack} portalGunItem
 * @param {string|import("@minecraft/server").RawMessage|null} response - Optional response message to display
 */
function openTerminalForm(player, inventory, portalGunItem, response = null) {
  playPlayerAnimation(player);
  player.dimension.playSound("ram_pg:button_click", player.location);

  const form = new ModalFormData().title(
    themed(player, portalGunItem, { translate: "ram_pg.settings.terminal" }, TERMINAL_TOKENS),
  );
  if (Array.isArray(response)) {
    for (const line of response) form.label(line);
  } else if (response) {
    form.label(typeof response === "string" ? `${response}§r` : response);
  }
  form
    .textField("", { translate: "ram_pg.settings.terminal_text_field" })
    .submitButton({ translate: "ram_pg.settings.terminal_submit" });

  form.show(player).then((response) => {
    if (response.formValues === undefined) {
      if (isBusy(response)) stopPlayerAnimation(player);
      else openSettingsForm(player, inventory, portalGunItem);
      return;
    }

    const input = response.formValues.find((value) => typeof value === "string")?.trim();
    if (!input) return openTerminalForm(player, inventory, portalGunItem);
    runTerminalCommand(player, inventory, portalGunItem, input);
  });
}

/**
 * Helper function: returns a user-friendly dimension name and color for UI.
 *
 * @param {string} dimensionId
 * @returns {{dimName: string, color: string}}
 */
function getDimensionLabel(dimensionId) {
  switch (dimensionId) {
    case "minecraft:overworld":
      return { dimName: "Overworld", color: "§q" };
    case "minecraft:nether":
      return { dimName: "Nether", color: "§c" };
    case "minecraft:the_end":
      return { dimName: "The End", color: "§u" };
    case BLENDER_DIMENSION_ID:
      return { dimName: "Blender Dimension", color: "§6" };
    default:
      return { dimName: formatDimensionName(dimensionId), color: "§f" };
  }
}

/**
 * Dismounts the Portal Gun back to its base form and returns tubes for remaining charge.
 *
 * @param {Player} player
 * @param {ItemStack} portalGunItem
 * @param {EntityInventoryComponent} inventory
 */
function dismountPortalGun(player, portalGunItem, inventory) {
  const gunInstance = getGunInstance(portalGunItem);

  if (!gunInstance) {
    player.sendMessage({ translate: "ram_pg.dismount_error" });
    return;
  }

  const chargedTubeId = gunInstance.chargedTubeId;
  const emptyTubeId = gunInstance.emptyTubeId;
  const gunBaseId = gunInstance.baseId;

  stopPlayerAnimation(player);

  const portalGunProperties = portalGunItem.getDynamicPropertyIds();
  const portalGunBase = new ItemStack(gunBaseId, 1);

  portalGunProperties.forEach((id) => {
    const value = portalGunItem.getDynamicProperty(id);
    portalGunBase.setDynamicProperty(id, value);
  });

  const portalGunId = portalGunItem.getDynamicProperty(portalGunDP.id);
  const itemObject = findPortalGunInInventory(player, portalGunId);
  inventory.container.setItem(itemObject.slotIndex, portalGunBase);

  const charge = portalGunItem.getDynamicProperty(portalGunDP.charge);

  const equippable = player.getComponent("minecraft:equippable");
  const itemOffhand = equippable.getEquipment(EquipmentSlot.Offhand);

  function giveOrDrop(item) {
    if (inventory.container.emptySlotsCount === 0) {
      player.dimension.spawnItem(item, player.location);
      return;
    }
    inventory.container.addItem(item);
  }

  if (charge > 0) {
    const chargedTube = new ItemStack(chargedTubeId, 1);
    chargedTube.setDynamicProperty(portalGunDP.charge, charge);
    chargedTube.setLore([`§eCharge: ${charge}%§r`]);
    if (!itemOffhand) {
      equippable.setEquipment(EquipmentSlot.Offhand, chargedTube);
    } else {
      giveOrDrop(chargedTube);
    }
  } else {
    if (!itemOffhand) {
      equippable.setEquipment(
        EquipmentSlot.Offhand,
        new ItemStack(emptyTubeId, 1),
      );
    } else {
      giveOrDrop(new ItemStack(emptyTubeId, 1));
    }
  }

  player.dimension.playSound("ram_pg:portal_gun_unplug", player.location);
}
