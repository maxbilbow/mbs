import { world, system, Block, Vector3 } from "@minecraft/server";

function changeRandomBlock(blockLocation, dimension) {
    const blockTypes =
        "kaboom:plutonium";
    const blockNeptunium = "kaboom:neptunium_block"
    try {
        dimension.setBlockType(blockLocation, blockTypes);
    }
    catch (error) {
        console.warn("UwU")

    }
};

world.afterEvents.playerPlaceBlock.subscribe(event => {
    const { block, player } = event;
    const blockTypes = "kaboom:plutonium"


    if (block.typeId === "kaboom:neptunium_block") {
        const blockLocation = block.center();
        const dimension = player.dimension;
        const randomDelayInTicks = Math.floor(Math.random() * 6000) + 100;

        const callbackId = system.runInterval(() => {
            dimension.spawnParticle("minecraft:campfire_tall_smoke_particle", blockLocation);
            dimension.playSound("beacon.ambient", blockLocation, { pitch: 0.8 });
            if (block.typeId !== "kaboom:neptunium_block") {
                system.clearRun(callbackId);
            };
            const blockBelow = player.dimension.getBlockBelow;
            if (blockBelow.typeId === "kaboom:neptunium_block") {
                player.addEffect("wither", 200);
            };
        }, 20);


        system.runTimeout(() => {
            if (block.typeId === "kaboom:neptunium_block") {
                changeRandomBlock(blockLocation, dimension, blockTypes);
                dimension.playSound("random.fizz", blockLocation)
                system.clearRun(callbackId);
            };
        }, randomDelayInTicks);
    }
});