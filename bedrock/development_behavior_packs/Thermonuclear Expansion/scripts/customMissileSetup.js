import { system, world } from "@minecraft/server";

world.afterEvents.worldLoad.subscribe((event) => {

    system.runTimeout(() => {
        world.getDynamicProperty("warhead");
    }, 1);
});