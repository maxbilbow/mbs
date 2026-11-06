import { world, system, Vector3, BlockPermutation } from "@minecraft/server";


const TARGET_BLOCK_TYPE_ID = "kaboom:uranium_fuel_rods";
const FUSE_TIME_SECONDS = 10;
const EXPLOSION_RADIUS = 10;


const trackedBlocks = new Map();

world.afterEvents.playerPlaceBlock.subscribe(event => {
    const { block } = event;
    if (block.typeId === TARGET_BLOCK_TYPE_ID) {
        const blockLocation = block.location;

        const locationKey = `${blockLocation.x},${blockLocation.y},${blockLocation.z}`;


        trackedBlocks.set(locationKey, {
            location: blockLocation,
            fuse: FUSE_TIME_SECONDS * 20
        });
    }
});


system.runInterval(() => {
    for (const [locationKey, blockInfo] of trackedBlocks.entries()) {
        const { location, fuse } = blockInfo;
        const block = world.getDimension("overworld").getBlock(location);
        if (!block || block.typeId !== TARGET_BLOCK_TYPE_ID) {

            trackedBlocks.delete(locationKey);
            continue;
        }


        if (block.isWaterlogged) {


            trackedBlocks.delete(locationKey);
            continue;
        }
        block.dimension.playSound("block.campfire.crackle", location)

        blockInfo.fuse--;

        if (blockInfo.fuse <= 0) {

            block.dimension.createExplosion(location, EXPLOSION_RADIUS, {
                causesFire: true,
                breakBlocks: true
            });
            trackedBlocks.delete(locationKey);
        }
    }
}, 1); 
