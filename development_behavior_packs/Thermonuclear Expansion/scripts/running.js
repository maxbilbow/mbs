import { system, world } from "@minecraft/server";

world.afterEvents.playerInteractWithBlock.subscribe((newEvent) => {

    system.runTimeout(() => {
        const block = newEvent.block;
        const blockType = block.typeId;
        if (blockType === "kaboom:dummy_block") {
            system.sendScriptEvent("kaboom:test", "test");
        };
    }, 1);
});