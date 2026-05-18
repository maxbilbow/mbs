import { system, world, Block } from "@minecraft/server";

function changeRandomBlock(blockLocation, dimension) {
    // List of possible replacement blocks
    const blockTypes =
        "kaboom:neptunium_block";
    try {
        dimension.setBlockType(blockLocation, blockTypes);
    }
    catch (error) {
        console.warn("UwU")

    }
};

world.afterEvents.playerPlaceBlock.subscribe(event => {
    const { block, player } = event;
    const blockTypes = "kaboom:neptunium_block";
    if (block.typeId === "kaboom:uranium_block") {

        const blockLocation = block.center();
        const dimension = player.dimension;
        const randomDelayInTicks = Math.floor(Math.random() * 6000) + 100;
        const blockBelow = block.below(1);
        if (blockBelow.typeId === "kaboom:uranium_fuel_rods" && block.typeId === "kaboom:uranium_block") {
            const blockTransmute = system.runInterval(() => {
                player.dimension.playSound("beacon.ambient", blockLocation, { pitch: 0.8 });
                dimension.spawnParticle("minecraft:campfire_tall_smoke_particle", blockLocation);
                if (block.typeId !== "kaboom:uranium_block") {
                    system.clearRun(blockTransmute);
                };
            }, 10);
        };
        system.runTimeout(() => {
            if (blockBelow.typeId === "kaboom:uranium_fuel_rods") {
                if (block.typeId === "kaboom:uranium_block") {
                    changeRandomBlock(blockLocation, dimension, blockTypes);
                    dimension.playSound("random.fizz", blockLocation)
                };
            }
        }, randomDelayInTicks);
    }
});