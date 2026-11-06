import { world, BlockPermutation } from '@minecraft/server';


export class IronGolemStructureManager {
    constructor() {
        this.golemTypes = [];

        world.afterEvents.playerPlaceBlock.subscribe(this.handleBlockPlacement.bind(this));
    }


    registerGolemType(headBlockTypeId, bodyBlockTypeId, spawnEntityTypeId) {
        this.golemTypes.push({
            head: headBlockTypeId,
            body: bodyBlockTypeId,
            entity: spawnEntityTypeId
        });
    }

    handleBlockPlacement(ev) {
        const player = ev.player;
        const block = ev.block;

        for (const golem of this.golemTypes) {
            if (block.typeId !== golem.head) continue;

            const blockBelow1 = block.below();
            const blockBelow2 = blockBelow1.below();
            const blockNorth = blockBelow1.north();
            const blockSouth = blockBelow1.south();
            const blockEast = blockBelow1.east();
            const blockWest = blockBelow1.west();

            const isBodyBlock = blockBelow1.typeId == golem.body && blockBelow2.typeId == golem.body;
            const hasArms =
                (blockNorth.typeId == golem.body && blockSouth.typeId == golem.body) ||
                (blockEast.typeId == golem.body && blockWest.typeId == golem.body);

            if (isBodyBlock && hasArms) {
                const structureBlocks = [block, blockBelow1, blockBelow2];

                if (blockEast.typeId == golem.body && blockWest.typeId == golem.body) {
                    structureBlocks.push(blockEast, blockWest);
                } else if (blockNorth.typeId == golem.body && blockSouth.typeId == golem.body) {
                    structureBlocks.push(blockNorth, blockSouth);
                }

                structureBlocks.forEach(b => b.setPermutation(BlockPermutation.resolve("minecraft:air")));

                player.dimension.spawnEntity(golem.entity, blockBelow2.location, { spawnEvent: 'minecraft:from_player' });
                break;
            }
        }
    }
}


export class SnowGolemStructureSpawner {

    /**Summons an entity with the structure of the snow golem.
     * @param {string} headBlockTypeId
     * @param {string} bodyBlockTypeId
     * @param {string} spawnEntityTypeId
     * 
     */
    constructor(headBlockTypeId, bodyBlockTypeId, spawnEntityTypeId) {
        this.head_block_type = headBlockTypeId;
        this.body_block_type = bodyBlockTypeId;
        this.spawn_entity_type = spawnEntityTypeId;

        world.afterEvents.playerPlaceBlock.subscribe(this.handleBlockPlacement.bind(this));
    }

    handleBlockPlacement(ev) {
        const player = ev.player;
        const block = ev.block;


        const blockBelow1 = block.below();
        const blockBelow2 = blockBelow1.below();

        const structureBlocks = [block, blockBelow1, blockBelow2];

        const isHeadBlock = block.typeId == this.head_block_type;
        const isBodyBlock = blockBelow1.typeId == this.body_block_type && blockBelow2.typeId == this.body_block_type;

        // Check the structure
        if (isHeadBlock && isBodyBlock) {

            // Clear the blocks in the structure
            structureBlocks.forEach(block => block.setPermutation(BlockPermutation.resolve('minecraft:air')));

            // Spawn the defined entity
            player.dimension.spawnEntity(this.spawn_entity_type, blockBelow2.location);
        }
    }
}