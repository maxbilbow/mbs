import { world } from "./export";

world.afterEvents.playerBreakBlock.subscribe(({ block }) => {
   const { x, y, z } = block.location;
   if (world.getDynamicProperty(`tc:${x}:${y}:${z}`) !== undefined) {
      world.setDynamicProperty(`tc:${x}:${y}:${z}`, undefined);
   }
});

world.afterEvents.playerPlaceBlock.subscribe(({ block }) => {
   const TYPEID = block.typeId;
   const { x, y, z } = block.location;

   if (TYPEID.startsWith("minecraft") && (TYPEID.endsWith("_stem") || TYPEID.endsWith("_log"))) {
      world.setDynamicProperty(`tc:${x}:${y}:${z}`, true);
   }
});
