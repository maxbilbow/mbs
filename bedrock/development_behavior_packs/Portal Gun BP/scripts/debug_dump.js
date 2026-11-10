import { world } from "@minecraft/server";
import { portalGunDP, worldDP } from "./utils/ids&variables";
import { floatingProjectiles } from "./portal/portalGun";

function preview(value) {
  if (typeof value === "string" && value.length > 200) {
    return value.slice(0, 200) + `...(${value.length} chars)`;
  }
  return value;
}

export function dumpDebugState(player) {
  const lines = [];
  lines.push("==== RAM_PG DEBUG DUMP ====");

  // Every dynamic property stored on the world itself.
  const worldIds = world.getDynamicPropertyIds();
  lines.push(`World dynamic properties (${worldIds.length}):`);
  for (const id of worldIds) {
    lines.push(`  ${id} = ${preview(world.getDynamicProperty(id))}`);
  }

  // ram_pg:activePortals registry, with per-ID loaded/unloaded status.
  const activePortalsJson = world.getDynamicProperty(worldDP.activePortals);
  const activePortalIds = activePortalsJson ? JSON.parse(activePortalsJson) : [];
  lines.push(`ram_pg:activePortals (${activePortalIds.length} entries):`);
  for (const id of activePortalIds) {
    const entity = world.getEntity(id);
    lines.push(`  ${id} -> ${entity ? "loaded" : "NOT loaded (unloaded or dead)"}`);
  }

  // In-memory (not persisted) state that could leak within a session.
  lines.push(`floatingProjectiles Set size (in-memory): ${floatingProjectiles.size}`);

  // Currently held item, if it's a portal gun.
  if (player) {
    const inventory = player.getComponent("inventory");
    const item = inventory?.container.getItem(player.selectedSlotIndex);
    if (item) {
      const itemIds = item.getDynamicPropertyIds();
      lines.push(`Held item (${item.typeId}) dynamic properties (${itemIds.length}):`);
      for (const id of itemIds) {
        lines.push(`  ${id} = ${preview(item.getDynamicProperty(id))}`);
      }

      const portalListJson = item.getDynamicProperty(portalGunDP.portalList);
      const portalIds = portalListJson ? JSON.parse(portalListJson) : [];
      lines.push(`  -> portalList (${portalIds.length}): ${JSON.stringify(portalIds)}`);

      const savedLocationsJson = item.getDynamicProperty(
        portalGunDP.savedLocations,
      );
      const savedLocations = savedLocationsJson
        ? JSON.parse(savedLocationsJson)
        : [];
      lines.push(`  -> savedLocations count: ${savedLocations.length}`);

      const historyJson = item.getDynamicProperty(
        portalGunDP.historyLocations,
      );
      const history = historyJson ? JSON.parse(historyJson) : [];
      lines.push(`  -> historyLocations count: ${history.length}`);
    } else {
      lines.push("Held item: none / not a portal gun.");
    }
  }

  lines.push("==== END DEBUG DUMP ====");

  const output = lines.join("\n");
  console.warn(output);
  if (player) {
    player.sendMessage(output);
  } else {
    world.sendMessage(output);
  }
}

export function resetAddonState() {
  const lines = [];
  lines.push("==== RAM_PG STATE RESET ====");

  let removedEntities = 0;
  for (const dimensionId of ["overworld", "nether", "the_end"]) {
    const dimension = world.getDimension(dimensionId);
    const portals = dimension.getEntities({ families: ["ram_pg:portal"] });
    for (const portal of portals) {
      portal.remove();
      removedEntities++;
    }
  }
  lines.push(`Removed ${removedEntities} loaded portal entities.`);
  lines.push(
    "(Portals in unloaded chunks aren't caught by this - reload that area and run again if needed.)",
  );

  let clearedProps = 0;
  for (const id of world.getDynamicPropertyIds()) {
    if (id.startsWith("ram_pg:")) {
      world.setDynamicProperty(id, undefined);
      clearedProps++;
    }
  }
  lines.push(`Cleared ${clearedProps} ram_pg:* world dynamic properties.`);
  lines.push("==== END STATE RESET ====");

  const output = lines.join("\n");
  console.warn(output);
  world.sendMessage(output);
}
