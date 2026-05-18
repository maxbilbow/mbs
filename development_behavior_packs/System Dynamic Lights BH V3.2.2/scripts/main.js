import {world, system, EquipmentSlot, ItemStack, EntityEquippableComponent} from "@minecraft/server";
const LIGHT_GROUPS = {
  15: ["lit_pumpkin", "lava_bucket", "glowstone", "shroomlight", "beacon", "minecraft:lantern", "sea_lantern", ":campfire", "froglight", "end_rod", "conduit"],
  13: ["minecraft:torch", "soul_lantern", "soul_campfire", "candle", "copper_lantern",],
  11: ["crying_obsidian", "soul_torch"],
  9:  ["fire_charge", "redstone_torch", "ender_chest", "enchanting_table", "catalyst", "totem_of_undying", "nether_star"],
  6:  ["enchanted_book", "dragon_breath", "ender_eye", "magma", "blaze_rod", "blaze_powder", "glow_ink_sac", "glow_berries", "glowstone_dust", "experience_bottle", "firefly_bush", "glow_item_frame", "brewing_stand"]
};
const LIGHT_ALL = ["black_candle","red_candle", "green_candle", "brown_candle", "blue_candle", "cyan_candle","purple_candle","light_gray_candle","gray_candle","pink_candle","lime_candle","light_blue_candle","yellow_candle","white_candle","magenta_candle","orange_candle","waxed_weathered_copper_lantern","waxed_copper_lantern","weathered_copper_lantern","waxed_oxidized_copper_lantern","waxed_exposed_copper_lantern","oxidized_copper_lantern","exposed_copper_lantern","copper_lantern", "dragon_breath","lit_pumpkin", "lava_bucket", "glowstone", "shroomlight", "beacon", "lantern", "sea_lantern", "campfire", "froglight", "end_rod","torch", "soul_lantern", "soul_campfire", "candle", "crying_obsidian", "soul_torch", "fire_charge", "redstone_torch", "ender_chest", "enchanting_table", "catalyst", "totem_of_undying", "nether_star", "magma", "blaze_rod", "blaze_powder", "glow_ink_sac", "glowstone_dust", "sea_pickle", "glow_item_frame", "brewing_stand", "conduit"];

const HELMET_LIGHT = ["lantern_gold_helmet", "lantern_iron_helmet", "lantern_diamond_helmet", "lantern_netherite_helmet", "lantern_chainmain_helmet", "lantern_copper_helmet"];
const lightFnByLevel = (lvl, special) =>
  special === "sea_pickle" ? "sea_pickle" : special === "noOffhand" ? "noOffhand" :
  lvl === 15 ? "light15" :
  lvl === 13 ? "light13" :
  lvl === 11 ? "light11" :
  lvl === 9  ? "light9"  :
  lvl === 6  ? "light6"  : null;
function getLightInfoFromItemId(id) {
  if (!id) return null;
  if (id.includes("sea_pickle")) return { level: 13, special: "sea_pickle" };
  if (id.includes("ender_eye")||id.includes("glow_berries")||id.includes("experience_bottle")||id.includes("enchanted_book")) return { level: 6, special: "noOffhand" };
  if (id.includes("glowstone_dust")) return { level: 6 };
  for (const [lvlStr, arr] of Object.entries(LIGHT_GROUPS)) {
    const lvl = Number(lvlStr);
    for (const key of arr) {
      if (id.includes(key)) return { level: lvl };
    }
  }
  return null;
}
function loreFor(level, special) {
  const base = `§6Lightning: §7${level} Blocks`;
  const tag  = `\n§r§d[System Dynamic Lights]§r`;
  const offhand = `\n§cUse the item to switch to the offhand`
  if (special === "noOffhand") return [`${base}`, tag];
  if (special === "sea_pickle") return [`${base}`, "You can use it underwater", tag];
  return [base+offhand, tag];
}
function setLoreOnce(item, level, special) {
  if (!item) return;
  const lore = item.getLore();
  if (!lore?.length) item.setLore(loreFor(level, special));
}
function runLight(entity, level, special) {
  const fn = lightFnByLevel(level, special);
  if (fn) entity.runCommandAsync(`execute as @s positioned ~~1~1 run function ${fn}`);
}
function runNoLight(entity) {
  entity.runCommandAsync(`function no_light`);
}
function setTag(entity, tag, enabled) {
  const has = entity.hasTag(tag);
  if (enabled && !has) entity.addTag(tag);
  if (!enabled && has) entity.removeTag(tag);
}
system.runInterval(() => {
  for (const p of world.getPlayers()) {
    const inv = p.getComponent("inventory")?.container;
    const equip = p.getComponent("minecraft:equippable");
    const hand   = equip?.getEquipment(EquipmentSlot.Mainhand);
    const offhand= equip?.getEquipment(EquipmentSlot.Offhand);
    const head   = equip?.getEquipment(EquipmentSlot.Head);
    if (inv) {
      for (let slot = 0; slot < inv.size; slot++) {
        const item = inv.getItem(slot);
        if (!item) continue;
        const info = getLightInfoFromItemId(item.typeId);
        if (info) {
          setLoreOnce(item, info.level, info.special);
          inv.setItem(slot, item);
        }
      }
    }
    let helmetLight = false;
    if (head) {
      for (const h of HELMET_LIGHT) {
        if (head.typeId.includes(h)) { helmetLight = true; break; }
      }
    }
    if (helmetLight) {
      setTag(p, "helmet_light", true);
      runLight(p, 15, null);
    } else {
      if (p.hasTag("helmet_light")) {
        setTag(p, "helmet_light", false);
        runNoLight(p);
      }
    }
    if (!helmetLight) {
      const handInfo    = hand    ? getLightInfoFromItemId(hand.typeId)    : null;
      const offhandInfo = offhand ? getLightInfoFromItemId(offhand.typeId) : null;
      if (offhandInfo && !p.hasTag("light_mainhand")) {
        setTag(p, "light_offhand", true);
        runLight(p, offhandInfo.level, offhandInfo.special);
      } else {
        if (p.hasTag("light_offhand") && !offhandInfo) {
          setTag(p, "light_offhand", false);
          runNoLight(p);
        }
      }
      if (handInfo && !p.hasTag("light_offhand")) {
        setTag(p, "light_mainhand", true);
        runLight(p, handInfo.level, handInfo.special);
      } else {
        if (p.hasTag("light_mainhand") && !handInfo) {
          setTag(p, "light_mainhand", false);
          runNoLight(p);
        }
      }
    }
  }
  const overworld = world.getDimension("overworld");
  for (const mob of overworld.getEntities()) {
    const itemComp = mob.getComponent("minecraft:item");
    const itemId = itemComp?.itemStack?.typeId;
    if (itemId) {
      const info = getLightInfoFromItemId(itemId);
      if (info) {
        mob.runCommandAsync(`execute as @s positioned ~~~ run function ${lightFnByLevel(info.level, info.special)}`);
      }
    }
    const onFire = mob.getComponent("minecraft:onfire");
    let shouldGlow = false;
    if (onFire || mob.typeId === "minecraft:blaze") {
      mob.runCommandAsync(`execute as @s positioned ~~1~ run function light11`);
      shouldGlow = true;
    }
    if (mob.typeId === "minecraft:magma_cube") {
      mob.runCommandAsync(`execute as @s positioned ~~1~ run function light9`);
      shouldGlow = true;
    }
    if (mob.typeId === "minecraft:glow_squid") {
      mob.runCommandAsync(`execute as @s positioned ~~1~ run function sea_pickle`);
      shouldGlow = true;
    }
    if (shouldGlow) {
      setTag(mob, "onFire", true);
    } else if (mob.hasTag("onFire")) {
      runNoLight(mob);
      mob.removeTag("onFire");
    }
  }
});
const w = world.getDimension("overworld")
const groundItems = new Set();
world.afterEvents.entityDie.subscribe(({deadEntity: de, damageSource: damage})=>{
  if(de.getComponent("minecraft:onfire")||de.typeId=="minecraft:blaze"||de.typeId=="minecraft:magma_cube"||de.typeId=="minecraft:glow_squid"){
    de.runCommandAsync(`execute as @s positioned ~~1~ run function no_light`);
  }
})
world.afterEvents.itemUse.subscribe(use=>{
  const item = use.itemStack;
  const p = use.source;
  const equip = p.getComponent(EntityEquippableComponent.componentId);
  const offhand = equip.getEquipment(EquipmentSlot.Offhand);
  const b = p.getBlockFromViewDirection({maxDistance: 8})
  if(!b){
    LIGHT_ALL.forEach(o=>{
      if(item&&item.typeId==`minecraft:${o}`&&!offhand){
        p.runCommand(`replaceitem entity @s slot.weapon.offhand 0 ${item.typeId} ${item.amount}`)
        equip.setEquipment(EquipmentSlot.Mainhand, undefined)
      }
    })
  }
})
world.afterEvents.entitySpawn.subscribe((event) => {
			const entity = event.entity;
			if (entity.hasComponent("item")) {
				groundItems.add(entity);
			}
});
world.beforeEvents.entityRemove.subscribe((event) => {
			const entity = event.removedEntity;
      const l = entity.location
			if (!groundItems.has(entity)) return;
			groundItems.delete(entity);
      const itemStack = entity.getComponent("item").itemStack;
			if (!itemStack) return;
			const nearbyPlayers = entity.dimension.getEntities({
				location: entity.location,
				maxDistance: 2,
				type: "player",
			});
			for (const player of nearbyPlayers) {
				const inv = player.getComponent("inventory").container;
				for (let i = 0; i < inv.size; i++) {
					const slotItem = inv.getItem(i);
					if (slotItem && slotItem.typeId === itemStack.typeId) {
            if(!player.hasTag("light_mainhand")&&!player.hasTag("light_offhand")){
              system.run(()=>{
                player.runCommand(`execute positioned ~~1~ run function no_light`)
              })
            }
            return
					}
				}
			}
      system.run(()=>{
        w.runCommand(`execute positioned ${Math.floor(l.x)} ${Math.floor(l.y)+1} ${Math.floor(l.z)} run function no_light`)
      })
});