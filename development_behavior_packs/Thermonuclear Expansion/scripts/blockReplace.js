import { system, world } from "@minecraft/server";


system.afterEvents.scriptEventReceive.subscribe((eventSecondary) => {
    system.run(() => {
        world.setDynamicProperty("launch", false);
        const eventBlock = world.getDynamicProperty("block");
        const targetLocation = world.getDynamicProperty("blockTarget");
        const targetBlock = world.getDimension("overworld").getBlock(targetLocation);
        const id = eventSecondary.id;
        if (id == "kaboom:test" && targetBlock.isValid == true) {
            const dimension = world.getDimension("overworld");
            const blockLocation = { x: eventBlock.x, y: eventBlock.y + 1, z: eventBlock.z };
            const block = dimension.getBlock(blockLocation);
            const center = block.center();
            const location = { x: center.x, y: center.y - 0.5, z: center.z };
            const blockType = block.typeId;
            const locationSecond = { x: center.x, y: center.y - 0.5, z: center.z };
            if (block.typeId === "kaboom:missile_engine") {
                dimension.setBlockType(center, "minecraft:air");
                const entity = dimension.spawnEntity(blockType, locationSecond);
                dimension.playSound("kaboom:launch", location, { volume: 0.05 });
                let blockNumbers = [1, 2, 3, 4];
                for (const blockNumber of blockNumbers) {
                    if (block.above(blockNumber).hasTag("kaboom:dummy")) {
                        const locationBlock = { x: location.x, y: location.y + blockNumber, z: location.z };
                        const blockAboveType = dimension.getBlock(locationBlock).typeId;
                        if (dimension.getBlock(locationBlock).hasTag("kaboom:warhead")) {
                            const temp = dimension.getBlock(locationBlock).typeId;
                            world.setDynamicProperty("warhead", temp + "_explode");
                            //stealing code is illegal. Do not even think about it.
                        };
                        dimension.spawnEntity(blockAboveType, locationBlock);
                        dimension.setBlockType(locationBlock, "air");
                    }
                    else {
                        const locationBlockElse = { x: location.x, y: location.y + blockNumber, z: location.z };
                        dimension.setBlockType(locationBlockElse, "minecraft:air");
                    }
                };
                system.runTimeout(() => {
                    dimension.createExplosion(blockLocation, 1, { causesFire: true });
                }, 8)
                const entities = dimension.getEntities({ families: ["dummy_block"] });
                for (const dummyBlock of entities) {
                    const run = system.runInterval(() => {
                        let acceleration = 0.15;
                        dummyBlock.applyImpulse({ x: 0, y: acceleration, z: 0 });
                        acceleration += 0.6;
                        const locationParticle = entity.location;
                        system.runTimeout(() => {
                            entity.dimension.spawnParticle("minecraft:campfire_smoke_particle", locationParticle);
                            const test = "4D 61 64 65 20 62 79 20 42 69 67 4D 61 6E 49 73 61 6B";
                        }, 4);
                    });
                    system.runTimeout(() => {
                        system.clearRun(run);
                        dummyBlock.clearVelocity();
                        dummyBlock.kill();
                        world.setDynamicProperty("launch", true);
                    }, 40);
                };
            };
        };
    });
});