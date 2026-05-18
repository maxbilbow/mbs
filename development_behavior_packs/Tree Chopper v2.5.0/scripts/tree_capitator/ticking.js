import { world } from "./export";

//system.beforeEvents.startup.subscribe

//world.beforeEvents.worldInitialize

world.beforeEvents.worldInitialize.subscribe((initEvent) => {
   initEvent.blockComponentRegistry.registerCustomComponent("log:ticking", {
      onTick: (ev) => {
         const { block, dimension } = ev;
         const location = block.location;
         const logState = block.permutation.getState("log:state");

         if (logState > 1) {
            dimension.setBlockPermutation(location, block.permutation.withState("log:state", logState - 1));
         } else dimension.setBlockType(location, block.typeId.replace(/rtc/g, "minecraft"));

         dimension.playSound("use.wood", location);
      },
   });
});
