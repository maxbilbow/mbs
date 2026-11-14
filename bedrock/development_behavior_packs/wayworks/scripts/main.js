// plugins/wayworks/behavior/scripts/main.ts
import {
  BlockPermutation,
  GameMode,
  system,
  world
} from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

// plugins/wayworks/behavior/scripts/model.ts
var directions = ["North", "East", "South", "West"];
var surfaces = [
  "minecraft:cobblestone",
  "minecraft:stone_bricks",
  "minecraft:black_concrete"
];
var supplies = [...surfaces, "minecraft:rail"];
var natural = new Set(
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
    "poppy"
  ].map((name) => `minecraft:${name}`)
);
function canExcavate(type) {
  return natural.has(type);
}
function supportsRoute(type) {
  return type === "wayworks:bus_stop" || surfaces.some((surface) => surface === type) || natural.has(type) && ![
    "air",
    "snow_layer",
    "short_grass",
    "tall_grass",
    "fern",
    "large_fern",
    "deadbush",
    "dandelion",
    "poppy"
  ].some((name) => type === `minecraft:${name}`);
}
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function integer(value, min, max) {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
}
function point(value) {
  return record(value) && ["x", "y", "z"].every((key) => integer(value[key], -3e7, 3e7));
}
function routeName(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9 _-]{0,31}$/.test(value.trim())) {
    throw new Error(
      "Route names need 1-32 letters, numbers, spaces, hyphens or underscores."
    );
  }
  return value.trim();
}
function parseJob(value) {
  const job = JSON.parse(value);
  if (record(job)) {
    if (job.kind === "bus" && routeName(job.route) === job.route && integer(job.next, 0, 127) && integer(job.wait, 0, 20)) {
      return {
        kind: "bus",
        route: String(job.route),
        next: job.next,
        wait: job.wait
      };
    }
    if ((job.kind === "road" || job.kind === "rail") && point(job.origin) && integer(job.direction, 0, 3) && integer(job.width, 1, 9) && integer(job.length, 1, 128) && integer(job.progress, 0, Number(job.length)) && surfaces.some((type) => type === job.surface)) {
      return {
        kind: job.kind,
        origin: job.origin,
        direction: job.direction,
        width: job.width,
        length: job.length,
        progress: job.progress,
        surface: String(job.surface)
      };
    }
  }
  throw new Error("Invalid saved Wayworks job.");
}
function parseStop(value) {
  const stop = JSON.parse(value);
  if (!record(stop) || typeof stop.owner !== "string" || typeof stop.dimension !== "string" || !point(stop.position) || !integer(stop.order, 1, 128) || !(stop.route === "" || routeName(stop.route) === stop.route)) {
    throw new Error("Invalid saved Wayworks stop.");
  }
  return {
    owner: stop.owner,
    dimension: stop.dimension,
    position: stop.position,
    route: String(stop.route),
    order: stop.order
  };
}
function rowPlan(job) {
  const forward = [
    { x: 0, z: -1 },
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: -1, z: 0 }
  ][job.direction];
  if (!forward) throw new Error("Invalid construction direction.");
  const result = [];
  for (let lane = 0; lane < job.width; lane++) {
    const offset = lane - Math.floor((job.width - 1) / 2);
    const position = {
      x: job.origin.x + forward.x * job.progress - forward.z * offset,
      y: job.origin.y,
      z: job.origin.z + forward.z * job.progress + forward.x * offset
    };
    result.push({ position, type: job.surface });
    for (let height = 1; height <= 3; height++) {
      result.push({
        position: { ...position, y: position.y + height },
        type: job.kind === "rail" && height === 1 ? "minecraft:rail" : "minecraft:air",
        ...job.kind === "rail" && height === 1 ? { states: { rail_direction: job.direction % 2 } } : {}
      });
    }
  }
  return result;
}
function orderedStops(stops, owner2, route, dimension) {
  const result = stops.filter(
    (stop) => stop.owner === owner2 && stop.route === route && stop.dimension === dimension
  ).sort((a, b) => a.order - b.order);
  if (result.length < 2)
    throw new Error("A route needs at least two stops in this dimension.");
  if (result.some(
    (stop, index) => index > 0 && stop.order === result[index - 1].order
  )) {
    throw new Error("Route stop numbers must be unique.");
  }
  if (result.some((stop) => stop.position.y !== result[0].position.y)) {
    throw new Error("Version 1 routes require stops at the same height.");
  }
  return result;
}

// plugins/wayworks/behavior/scripts/main.ts
var workerType = "wayworks:worker";
var stopType = "wayworks:bus_stop";
var plannerType = "wayworks:planner";
var ownerKey = "wayworks:owner";
var jobKey = "wayworks:job";
var pausedKey = "wayworks:paused";
var stopPrefix = "wayworks:stop:";
var openMenus = /* @__PURE__ */ new Set();
var workerCursor = 0;
function message(player, text) {
  player.sendMessage(`[Wayworks] ${text}`);
}
function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}
function inventory(entity) {
  const container = entity.getComponent("minecraft:inventory")?.container;
  if (!container) throw new Error("Inventory is unavailable.");
  return container;
}
function owner(worker) {
  const value = worker.getDynamicProperty(ownerKey);
  if (typeof value !== "string")
    throw new Error(
      "This worker has no owner. Recruit workers using the planner."
    );
  return value;
}
function authorize(player, worker) {
  if (!worker.isValid || owner(worker) !== player.id) {
    throw new Error("Only the recruiting player can manage this worker.");
  }
  if (player.getGameMode() === GameMode.Spectator || player.getGameMode() === GameMode.Adventure) {
    throw new Error("Wayworks requires survival or creative mode.");
  }
  if (worker.dimension.id !== player.dimension.id || Math.hypot(
    worker.location.x - player.location.x,
    worker.location.y - player.location.y,
    worker.location.z - player.location.z
  ) > 16) {
    throw new Error("Stay within 16 blocks of your worker.");
  }
}
function readJob(worker) {
  const raw = worker.getDynamicProperty(jobKey);
  if (raw === void 0) return void 0;
  if (typeof raw !== "string") throw new Error("Invalid saved worker job.");
  return parseJob(raw);
}
function saveJob(worker, job) {
  worker.setDynamicProperty(
    jobKey,
    job === void 0 ? void 0 : JSON.stringify(job)
  );
}
function count(container, type) {
  let total = 0;
  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (item?.typeId === type) total += item.amount;
  }
  return total;
}
function spend(container, type, amount) {
  if (count(container, type) < amount)
    throw new Error(`Need ${amount} ${type}.`);
  for (let slot = 0; slot < container.size && amount > 0; slot++) {
    const item = container.getItem(slot);
    if (item?.typeId !== type) continue;
    const used = Math.min(item.amount, amount);
    if (used === item.amount) container.setItem(slot);
    else {
      item.amount -= used;
      container.setItem(slot, item);
    }
    amount -= used;
  }
}
function transfer(from, to) {
  let moved = 0;
  for (let slot = 0; slot < from.size; slot++) {
    const item = from.getItem(slot);
    if (!item || !supplies.some((type) => type === item.typeId)) continue;
    const remaining = to.addItem(item);
    from.setItem(slot, remaining);
    moved += item.amount - (remaining?.amount ?? 0);
  }
  return moved;
}
function stopKey(dimension, position) {
  return `${stopPrefix}${dimension}:${position.x},${position.y},${position.z}`;
}
function readStops() {
  return world.getDynamicPropertyIds().filter((key) => key.startsWith(stopPrefix)).map((key) => {
    const raw = world.getDynamicProperty(key);
    if (typeof raw !== "string")
      throw new Error(`Invalid stop property: ${key}`);
    return parseStop(raw);
  });
}
function putStop(stop) {
  world.setDynamicProperty(
    stopKey(stop.dimension, stop.position),
    JSON.stringify(stop)
  );
}
function getBlock(worker, position) {
  const block = worker.dimension.getBlock(position);
  if (!block) throw new Error("Chunk is unloaded. Move closer and resume.");
  return block;
}
function pause(worker, reason) {
  worker.setDynamicProperty(pausedKey, reason);
  worker.nameTag = "Wayworks worker (paused)";
  const player = world.getAllPlayers().find((player2) => player2.id === worker.getDynamicProperty(ownerKey));
  if (player) message(player, reason);
}
function stepBuild(worker, player, job) {
  if (job.progress >= job.length) {
    saveJob(worker);
    worker.nameTag = "Wayworks worker";
    message(player, "Construction complete.");
    return;
  }
  const changes = rowPlan(job).map((placement) => ({
    ...placement,
    block: getBlock(worker, placement.position),
    permutation: BlockPermutation.resolve(placement.type, placement.states)
  })).filter(
    (change) => !change.block.permutation.matches(change.type, change.states)
  );
  const required = /* @__PURE__ */ new Map();
  for (const change of changes) {
    if (!canExcavate(change.block.typeId) && !(change.type === "minecraft:rail" && change.block.typeId === change.type)) {
      throw new Error(
        `Obstacle ${change.block.typeId} at ${change.position.x}, ${change.position.y}, ${change.position.z}. Clear it, then resume.`
      );
    }
    if (change.type !== "minecraft:air" && change.block.typeId !== change.type) {
      required.set(change.type, (required.get(change.type) ?? 0) + 1);
    }
  }
  const creative = player.getGameMode() === GameMode.Creative;
  const stock = inventory(worker);
  if (!creative) {
    for (const [type, amount] of required) {
      if (count(stock, type) < amount)
        throw new Error(
          `Out of supplies: need ${amount} ${type} for the next row. Load supplies, then resume.`
        );
    }
  }
  for (const change of changes) {
    if (!creative && change.type !== "minecraft:air" && change.block.typeId !== change.type) {
      const slot = Array.from({ length: stock.size }, (_, index) => index).find(
        (index) => stock.getItem(index)?.typeId === change.type
      );
      if (slot === void 0)
        throw new Error(`Supply disappeared: ${change.type}.`);
      const previous = stock.getItem(slot);
      spend(stock, change.type, 1);
      try {
        change.block.setPermutation(change.permutation);
      } catch (error) {
        stock.setItem(slot, previous);
        throw error;
      }
    } else change.block.setPermutation(change.permutation);
  }
  const center = rowPlan(job)[Math.floor((job.width - 1) / 2) * 4].position;
  if (!worker.tryTeleport(
    { x: center.x + 0.5, y: center.y + 1.1, z: center.z + 0.5 },
    { checkForBlocks: true }
  )) {
    throw new Error(
      "Worker cannot stand on the completed row. Clear space, then resume."
    );
  }
  job.progress++;
  saveJob(worker, job);
}
function stepBus(worker, job) {
  const stops = orderedStops(
    readStops(),
    owner(worker),
    job.route,
    worker.dimension.id
  );
  for (const stop2 of stops) {
    if (getBlock(worker, stop2.position).typeId !== stopType) {
      throw new Error(
        `Route ${job.route} has a missing stop. Replace or reconfigure it.`
      );
    }
  }
  if (job.wait > 0) {
    job.wait--;
    saveJob(worker, job);
    return;
  }
  job.next %= stops.length;
  const stop = stops[job.next];
  const destination = {
    x: stop.position.x + 0.5,
    y: stop.position.y + 1,
    z: stop.position.z + 0.5
  };
  const distance = Math.hypot(
    destination.x - worker.location.x,
    destination.y - worker.location.y,
    destination.z - worker.location.z
  );
  if (distance < 0.2) {
    job.next = (job.next + 1) % stops.length;
    job.wait = 10;
    saveJob(worker, job);
    return;
  }
  const fraction = Math.min(0.5 / distance, 1);
  const next = {
    x: worker.location.x + (destination.x - worker.location.x) * fraction,
    y: worker.location.y + (destination.y - worker.location.y) * fraction,
    z: worker.location.z + (destination.z - worker.location.z) * fraction
  };
  const below = getBlock(worker, {
    x: Math.floor(next.x),
    y: Math.floor(next.y - 0.1),
    z: Math.floor(next.z)
  });
  if (!supportsRoute(below.typeId) || !worker.tryTeleport(next, {
    checkForBlocks: true,
    facingLocation: destination
  })) {
    throw new Error(
      `Route ${job.route} is blocked or unsupported. Provide a clear, level path and resume.`
    );
  }
}
async function buildMenu(player, worker) {
  const response = await new ModalFormData().title("Wayworks construction").dropdown("Project", ["Road", "Railway"]).dropdown("Direction", [...directions]).slider("Width (railway width = parallel tracks)", 1, 9, {
    defaultValue: 3,
    valueStep: 1
  }).slider("Length (blocks)", 1, 128, { defaultValue: 16, valueStep: 1 }).dropdown("Surface / railway foundation", [...surfaces]).submitButton("Build here: clears natural terrain!").show(player);
  if (response.canceled) return;
  authorize(player, worker);
  if (readJob(worker))
    throw new Error("Cancel the current job before starting another.");
  const [kind, direction, width, length, surface] = response.formValues ?? [];
  const origin = {
    x: Math.floor(worker.location.x),
    y: Math.floor(worker.location.y) - 1,
    z: Math.floor(worker.location.z)
  };
  if (kind !== 0 && kind !== 1 || typeof surface !== "number" || !surfaces[surface]) {
    throw new Error("Invalid construction selection.");
  }
  const job = parseJob(
    JSON.stringify({
      kind: kind === 0 ? "road" : "rail",
      origin,
      direction,
      width,
      length,
      progress: 0,
      surface: surfaces[surface]
    })
  );
  saveJob(worker, job);
  worker.setDynamicProperty(pausedKey, void 0);
  message(
    player,
    "Job started at the worker's feet. Natural terrain is removed without drops; no undo."
  );
}
async function routeMenu(player, worker) {
  const names = [
    ...new Set(
      readStops().filter(
        (stop) => stop.owner === player.id && stop.dimension === worker.dimension.id && stop.route !== ""
      ).map((stop) => stop.route)
    )
  ].sort();
  if (names.length === 0)
    throw new Error("Place and configure two bus stops first.");
  const response = await new ModalFormData().title("Assign bus route").dropdown("Route (worker only; no passengers yet)", names).show(player);
  if (response.canceled) return;
  authorize(player, worker);
  if (readJob(worker)) throw new Error("Cancel the current job first.");
  const index = response.formValues?.[0];
  if (typeof index !== "number" || !names[index])
    throw new Error("Invalid route selection.");
  const route = names[index];
  orderedStops(readStops(), player.id, route, worker.dimension.id);
  saveJob(worker, { kind: "bus", route, next: 0, wait: 0 });
  worker.setDynamicProperty(pausedKey, void 0);
  message(
    player,
    `Assigned route ${route}. Workers follow straight, level segments between stops.`
  );
}
async function workerMenu(player, worker) {
  authorize(player, worker);
  const stock = inventory(worker);
  const job = readJob(worker);
  const summary = job?.kind === "bus" ? `Route: ${job.route}` : job ? `${job.kind}: ${job.progress}/${job.length} rows` : "Idle";
  const response = await new ActionFormData().title("Wayworks worker").body(
    `${summary}
${worker.getDynamicProperty(pausedKey) ?? ""}

Supplies:
${supplies.map((type) => `${type}: ${count(stock, type)}`).join("\n")}`
  ).button("Build road / railway").button("Load all construction supplies").button("Return supplies").button("Assign bus route").button("Pause / resume job").button("Cancel job (no undo)").button("Dismiss empty, idle worker (no recruitment refund)").show(player);
  if (response.canceled) return;
  authorize(player, worker);
  switch (response.selection) {
    case 0:
      await buildMenu(player, worker);
      break;
    case 1:
      message(
        player,
        `Loaded ${transfer(inventory(player), inventory(worker))} items.`
      );
      break;
    case 2:
      message(
        player,
        `Returned ${transfer(inventory(worker), inventory(player))} items. Unreturned items remain with the worker.`
      );
      break;
    case 3:
      await routeMenu(player, worker);
      break;
    case 4:
      if (!readJob(worker)) throw new Error("This worker has no job.");
      if (worker.getDynamicProperty(pausedKey)) {
        worker.setDynamicProperty(pausedKey, void 0);
        worker.nameTag = "Wayworks worker";
        message(player, "Job resumed.");
      } else pause(worker, "Job paused by owner.");
      break;
    case 5:
      saveJob(worker);
      worker.setDynamicProperty(pausedKey, void 0);
      worker.nameTag = "Wayworks worker";
      message(
        player,
        "Job canceled. Existing construction has not been removed."
      );
      break;
    case 6:
      if (readJob(worker) || inventory(worker).emptySlotsCount !== inventory(worker).size) {
        throw new Error(
          "Cancel the job and return all supplies before dismissing."
        );
      }
      worker.remove();
      message(player, "Worker dismissed.");
      break;
  }
}
function recruit(player) {
  if (player.getGameMode() !== GameMode.Creative && player.getGameMode() !== GameMode.Survival) {
    throw new Error("Recruitment requires survival or creative mode.");
  }
  const position = {
    x: Math.floor(player.location.x) + 0.5,
    y: Math.floor(player.location.y),
    z: Math.floor(player.location.z) + 0.5
  };
  for (let height = 0; height <= 1; height++) {
    if (!player.dimension.getBlock({ ...position, y: position.y + height })?.isAir) {
      throw new Error("Stand in a clear, two-block-high space to recruit.");
    }
  }
  const creative = player.getGameMode() === GameMode.Creative;
  const stock = inventory(player);
  if (!creative && count(stock, "minecraft:iron_ingot") < 4)
    throw new Error("Recruitment costs 4 iron ingots.");
  const worker = player.dimension.spawnEntity(workerType, position);
  worker.setDynamicProperty(ownerKey, player.id);
  worker.nameTag = "Wayworks worker";
  if (!creative) spend(stock, "minecraft:iron_ingot", 4);
  message(
    player,
    "Worker recruited at your feet. Interact with it to give orders."
  );
}
async function plannerMenu(player) {
  const workers = player.dimension.getEntities({
    type: workerType,
    location: player.location,
    maxDistance: 16
  }).filter((worker) => worker.getDynamicProperty(ownerKey) === player.id);
  const form = new ActionFormData().title("Wayworks").body(
    "Recruit at your feet: 4 iron ingots (free in creative).\nInteract with a worker to build or load supplies.\nCraft bus stops, place them, then interact to configure routes."
  ).button("Recruit worker");
  for (const worker of workers)
    form.button(
      `${worker.nameTag} (${Math.floor(worker.location.x)}, ${Math.floor(worker.location.z)})`
    );
  const response = await form.show(player);
  if (response.canceled) return;
  if (response.selection === 0) recruit(player);
  else if (response.selection !== void 0 && workers[response.selection - 1]) {
    await workerMenu(player, workers[response.selection - 1]);
  }
}
async function stopMenu(player, dimension, position) {
  const key = stopKey(dimension, position);
  const raw = world.getDynamicProperty(key);
  if (typeof raw !== "string")
    throw new Error("Unregistered stop: break and place it again.");
  const stop = parseStop(raw);
  if (stop.owner !== player.id)
    throw new Error("Only the player who placed this stop can assign it.");
  const response = await new ModalFormData().title("Wayworks bus stop").textField("Route name (blank = unassigned)", "e.g. Town Loop", {
    defaultValue: stop.route
  }).slider("Stop number", 1, 128, { defaultValue: stop.order, valueStep: 1 }).show(player);
  if (response.canceled) return;
  if (player.dimension.id !== dimension || Math.hypot(
    player.location.x - position.x,
    player.location.y - position.y,
    player.location.z - position.z
  ) > 16 || player.dimension.getBlock(position)?.typeId !== stopType || world.getDynamicProperty(key) !== raw) {
    throw new Error("Stop changed or is too far away. Open it again.");
  }
  const [input, order] = response.formValues ?? [];
  if (typeof input !== "string" || typeof order !== "number" || !Number.isInteger(order) || order < 1 || order > 128)
    throw new Error("Invalid stop settings.");
  const route = input.trim() === "" ? "" : routeName(input);
  if (route && readStops().some(
    (other) => other.owner === player.id && other.dimension === dimension && other.route === route && other.order === order && stopKey(other.dimension, other.position) !== key
  ))
    throw new Error("This route already has that stop number.");
  putStop({ ...stop, route, order });
  message(
    player,
    route ? `Stop ${order} assigned to ${route}.` : "Stop unassigned."
  );
}
function openMenu(player, action) {
  if (openMenus.has(player.id)) return;
  openMenus.add(player.id);
  system.run(() => {
    action().catch((error) => {
      console.warn(`[Wayworks] Menu for ${player.id}: ${errorText(error)}`);
      if (player.isValid) message(player, errorText(error));
    }).finally(() => openMenus.delete(player.id));
  });
}
world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
  if (itemStack.typeId === plannerType)
    openMenu(source, () => plannerMenu(source));
});
world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
  if (event.target.typeId !== workerType) return;
  event.cancel = true;
  const { player, target } = event;
  openMenu(player, () => workerMenu(player, target));
});
world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  if (event.block.typeId !== stopType && event.itemStack?.typeId !== plannerType)
    return;
  event.cancel = true;
  if (!event.isFirstEvent) return;
  const { player, block } = event;
  const dimension = block.dimension.id;
  const position = { ...block.location };
  const isStop = block.typeId === stopType;
  openMenu(
    player,
    () => isStop ? stopMenu(player, dimension, position) : plannerMenu(player)
  );
});
world.afterEvents.playerPlaceBlock.subscribe(({ block, player }) => {
  if (block.typeId !== stopType) return;
  try {
    const key = stopKey(block.dimension.id, block.location);
    if (world.getDynamicProperty(key) === void 0 && readStops().length >= 128) {
      throw new Error(
        "Wayworks supports 128 registered stops per world. Remove unused stops, then replace this block."
      );
    }
    putStop({
      owner: player.id,
      dimension: block.dimension.id,
      position: block.location,
      route: "",
      order: 1
    });
    message(
      player,
      "Bus stop placed. Interact to assign a route and stop number."
    );
  } catch (error) {
    console.warn(`[Wayworks] Register stop: ${errorText(error)}`);
    message(player, errorText(error));
  }
});
world.afterEvents.playerBreakBlock.subscribe(
  ({ block, brokenBlockPermutation }) => {
    if (brokenBlockPermutation.type.id === stopType) {
      world.setDynamicProperty(
        stopKey(block.dimension.id, block.location),
        void 0
      );
    }
  }
);
system.runInterval(() => {
  const workers = ["overworld", "nether", "the_end"].flatMap(
    (dimension) => world.getDimension(dimension).getEntities({ type: workerType })
  ).filter(
    (worker) => worker.isValid && !worker.getDynamicProperty(pausedKey) && worker.getDynamicProperty(jobKey) !== void 0
  );
  for (let index = 0; index < Math.min(workers.length, 16); index++) {
    const worker = workers[(workerCursor + index) % workers.length];
    try {
      const job = readJob(worker);
      if (!job) continue;
      const player = world.getAllPlayers().find((player2) => player2.id === owner(worker));
      if (!player || player.dimension.id !== worker.dimension.id || player.getGameMode() !== GameMode.Creative && player.getGameMode() !== GameMode.Survival)
        continue;
      if (job.kind === "bus") stepBus(worker, job);
      else stepBuild(worker, player, job);
    } catch (error) {
      console.warn(`[Wayworks] Worker ${worker.id}: ${errorText(error)}`);
      if (worker.isValid) pause(worker, errorText(error));
    }
  }
  workerCursor = workers.length ? (workerCursor + 16) % workers.length : 0;
}, 10);
