import { world, system, ItemStack } from "./export";

world.beforeEvents.playerBreakBlock.subscribe((e) => {
   const { block, dimension, player } = e;
   const { x, y, z } = block.location;
   if (world.getDynamicProperty(`tc:${x}:${y}:${z}`) !== undefined) return;

   const TYPEID = block.typeId;

   if (TYPEID.startsWith("minecraft") && player.isSneaking && (TYPEID.endsWith("_stem") || TYPEID.endsWith("_log"))) {
      const hasAirBelow =
         block.dimension.getBlock({ x: x, y: y - 2, z: z }).typeId === "minecraft:air" &&
         block.dimension.getBlock({ x: x, y: y - 1, z: z }).typeId === "minecraft:air";

      const hasBlockAbove = [-1, 0, 1].some((dx) =>
         [-1, 0, 1].some((dz) => {
            const b = block.dimension.getBlock({
               x: block.location.x + dx,
               y: block.location.y + 1,
               z: block.location.z + dz,
            });
            return b && (b.typeId.includes("log") || b.typeId.includes("stem"));
         })
      );

      if (!hasBlockAbove || (hasAirBelow && !TYPEID.endsWith("mangrove_log"))) return;

      system.run(() => {
         try {
            const RTCID = TYPEID.replace(/^minecraft:/, "rtc:").replace(/stripped_/g, "");

            player.playSound("dig.wood", { location: block.location, pitch: 1.3 });
            dimension.runCommand(`setblock ${x} ${y} ${z} ${RTCID}`);
         } catch (err) {
            dimension.runCommand(`setblock ${x} ${y} ${z} air destroy`);
         }
      });

      takeDurability(e);
      e.cancel = true;
   }

   if (block.hasTag("custom:log")) {
      const breakState = block.permutation.getState("log:state");

      if (breakState < 4) {
         system.run(() => {
            player.playSound("dig.wood", {
               location: block.location,
               pitch: 1 + breakState * 0.2,
            });

            dimension.setBlockPermutation(block.location, block.permutation.withState("log:state", breakState + 1));
         });

         takeDurability(e);
         e.cancel = true;
      }
   }
});

const applyDamage = (itemStack) => {
   const unbreakingLevel =
      itemStack.getComponent("enchantable")?.getEnchantment("unbreaking")
         ?.level ?? 0;
   return 1 / (unbreakingLevel + 1) >= Math.random();
};

function takeDurability(e) {
   const { player, itemStack } = e;

   if (
      !player?.isValid ||
      !itemStack ||
      player.getGameMode() === "creative"
   )
      return;

   if (!applyDamage(itemStack)) return;

   const durability = itemStack.getComponent("durability");
   if(!durability?.isValid) return;
   const shouldBreak = durability.damage >= durability.maxDurability;

   const mainhand = player.getComponent("inventory").container;
   const currentSlot = player.selectedSlotIndex;

   system.run(() => {
      if (shouldBreak) {
         mainhand.setItem(currentSlot, undefined);
         player.playSound("random.break");
      } else {
         durability.damage++;
         mainhand.setItem(currentSlot, itemStack);
      }
   });
}

world.afterEvents.entitySpawn.subscribe(({ entity }) => {
   if (!entity.getComponent("item")) return;
   const { typeId } = entity.getComponent("item").itemStack;

   if (!typeId.startsWith("rtc")) return;
   entity.dimension.spawnItem(new ItemStack(typeId.replaceAll(/rtc/g, "minecraft")), entity.location);
   entity.remove();
});

world.afterEvents.playerPlaceBlock.subscribe(({ player, block }) => {
   if (!block.typeId.startsWith("rtc")) return;
   const { x, y, z } = block.location;
   block.dimension.runCommand(`setblock ${x} ${y} ${z} air`);
   player.runCommand("replaceitem entity @s slot.weapon.mainhand 0 air");
});