import * as module from "@minecraft/server"; // not used (yet)

const GLASS = [ 'basic', 'regular', 'white', 'silver', 'gray', 'black', 'brown', 'red', 'orange', 'yellow', 'lime', 'green', 'cyan', 'light_blue', 'blue', 'purple', 'magenta', 'pink' ]

const BLACK_LIST = [ 'air', 'small_amethyst_bud', 'medium_amethyst_bud', 'large_amethyst_bud', 'amethyst_cluster', 'anvil', 'azalea', 'flowering_azalea', 'bamboo', 'bamboo_sapling', 'standing_banner', 'wall_banner', 'banner', 'beacon', 'bed', 'beetroot', 'bell', 'big_dripleaf', 'brewing_stand', 'button', 'cactus', 'cake', 'camera', 'campfire', 'soul_campfire', 'candle', 'carpet', 'carrots', 'chain', 'chest', 'chorus', 'web', 'cocoa', 'conduit', 'coral', 'daylight_detector', 'deadbush', 'door', 'dragon_egg', 'enchanting_table', 'end_portal_frame', 'end_rod', 'ender_chest', 'fence', 'tallgrass', 'double_plant', 'flower', 'wither_rose', 'fungus', 'glow_lichen', 'grindstone', 'hanging_roots', 'hopper', 'frame', 'kelp', 'ladder', 'lantern', 'leaves', 'lectern', 'lever', 'light_block', 'lightning_rod', 'waterlily', 'skull', 'mushroom', 'nether_sprouts', 'nether_wart', 'potatoes', 'pointed_dripstone', 'pressure_plate', 'rail', 'comparator', 'redstone_wire', 'repeater', 'redstone_torch', 'roots', 'sapling', 'scaffolding', 'sculk_sensor', 'sea_pickle', 'seagrass', 'shulker_box', 'sign', 'slab', 'small_dripleaf_block', 'snow_layer', 'mob_spawner', 'spore_blossom', 'stairs', 'stonecutter_block', 'reeds', 'sweet_berry_bush', 'torch', 'trapdoor', 'tripwire', 'turtle_egg', 'vine', 'wheat' ]

/**
 * @param {import("@minecraft/server").Block} block
 */
export function connectedGlass( block ) {

    const dimension = block.dimension;
    const loc = block.location;
    const blockId = block.typeId;


    if ( blockId.split(':')[0] != 'glass_pane' || !block.permutation.getState('state:active') )
        return;

    const solid_x = 1 * testForSolidBlock({x: loc.x + 1,y: loc.y    ,z: loc.z    }, dimension);
    const y       = 1 * testForBlock     ({x: loc.x    ,y: loc.y + 1,z: loc.z    }, blockId, dimension);
    const solid_z = 1 * testForSolidBlock({x: loc.x    ,y: loc.y    ,z: loc.z + 1}, dimension);
    
    const solid_neg_x = 1 * testForSolidBlock({x: loc.x - 1,y: loc.y    ,z: loc.z    }, dimension);
    const neg_y       = 1 * testForBlock     ({x: loc.x    ,y: loc.y - 1,z: loc.z    }, blockId, dimension);
    const solid_neg_z = 1 * testForSolidBlock({x: loc.x    ,y: loc.y    ,z: loc.z - 1}, dimension);

    let dataA;
    let dataB;
    const dataC = 2*y + neg_y;
    const horizontalPlane = `${solid_neg_x}${solid_neg_z}${solid_x}${solid_z}`;

    loc.__proto__.offset = function (x, y, z) {
        return { x: this.x + x, y: this.y + y, z: this.z + z }
    }

    switch (horizontalPlane) {
        case '0000':
            switch (dataC) {
                case 0:
                case 1:
                case 2:
                    dataB = 7;
                    dataA = 1;
                    break;
                case 3:
                    dataB = 9;
                    dataA = 1;
                    break;
            }
            break;
        
        
        case '1100':
            dataB = 5 + 2*(dataC == 3);
            dataA = 2*!testForBlock(loc.offset(0, 0, -1), blockId, dimension) + !testForBlock(loc.offset(-1, 0, 0), blockId, dimension) + 1;
            break;
        case '0110':
            dataB = 5 + 2*(dataC == 3);
            dataA = 2*!testForBlock(loc.offset(0, 0, -1), blockId, dimension) + !testForBlock(loc.offset(1, 0, 0), blockId, dimension) + 5;
            break;
        case '0011':
            dataB = 5 + 2*(dataC == 3);
            dataA = 2*!testForBlock(loc.offset(0, 0, 1), blockId, dimension) + !testForBlock(loc.offset(1, 0, 0), blockId, dimension) + 9;
            break;
        case '1001':
            dataB = 5 + 2*(dataC == 3);
            dataA = 2*!testForBlock(loc.offset(0, 0, 1), blockId, dimension) + !testForBlock(loc.offset(-1, 0, 0), blockId, dimension) + 13;
            break;
        
        
        case '1101':
            dataB = 2;
            dataA = 8*!testForBlock(loc.offset(-1, 0, 0), blockId, dimension) + 2*!testForBlock(loc.offset(0, 0, -1), blockId, dimension) + !testForBlock(loc.offset(0, 0, 1), blockId, dimension) + 1;
            break;
        case '0111':
            dataB = 2;
            dataA = 8*!testForBlock(loc.offset(1, 0, 0), blockId, dimension) + 2*!testForBlock(loc.offset(0, 0, -1), blockId, dimension) + !testForBlock(loc.offset(0, 0, 1), blockId, dimension) + 5;
            break;
        case '1011':
            dataB = 3;
            dataA = 8*!testForBlock(loc.offset(0, 0, 1), blockId, dimension) + 2*!testForBlock(loc.offset(1, 0, 0), blockId, dimension) + !testForBlock(loc.offset(-1, 0, 0), blockId, dimension) + 1;
            break;
        case '1110':
            dataB = 3;
            dataA = 8*!testForBlock(loc.offset(0, 0, -1), blockId, dimension) + 2*!testForBlock(loc.offset(1, 0, 0), blockId, dimension) + !testForBlock(loc.offset(-1, 0, 0), blockId, dimension) + 5;
            break;
        
            
        case '1111':
            dataB = 1;
            dataA = 8*!testForBlock(loc.offset(0, 0, -1), blockId, dimension) + 4*!testForBlock(loc.offset(0, 0, 1), blockId, dimension) + 2*!testForBlock(loc.offset(1, 0, 0), blockId, dimension) + !testForBlock(loc.offset(-1, 0, 0), blockId, dimension) + 1;
            break;
        default:
            switch (dataC) {
                case 0:
                    switch (horizontalPlane) {
                        case '1010':
                            if ( !testForBlock(loc.offset(1, 0, 0), blockId, dimension) && !testForBlock(loc.offset(-1, 0, 0), blockId, dimension) ) {
                                dataB = 7;
                                dataA = 2;
                            } else {
                                dataB = 4;
                                dataA = 2*!testForBlock(loc.offset(1, 0, 0), blockId, dimension) + !testForBlock(loc.offset(-1, 0, 0), blockId, dimension) + 1;
                            }
                            break;
                        case '0101':
                            if (!testForBlock(loc.offset(0, 0, 1), blockId, dimension)*!testForBlock(loc.offset(0, 0, -1), blockId, dimension)) {
                                dataB = 7;
                                dataA = 3;
                            } else {
                                dataB = 4;
                                dataA = 2*!testForBlock(loc.offset(0, 0, -1), blockId, dimension) + !testForBlock(loc.offset(0, 0, 1), blockId, dimension) + 5;
                            }
                            break;



                        case '1000':
                            dataB = 6;
                            dataA = 2*testForBlock(loc.offset(-1, 0, 0), blockId, dimension) + !testForBlock(loc.offset(-1, 0, 0), blockId, dimension);
                            break;
                        case '0100':
                            dataB = 6;
                            dataA = 4*testForBlock(loc.offset(0, 0, -1), blockId, dimension) + 3*!testForBlock(loc.offset(0, 0, -1), blockId, dimension);
                            break;
                        case '0010':
                            dataB = 6;
                            dataA = 6*testForBlock(loc.offset(1, 0, 0), blockId, dimension) + 5*!testForBlock(loc.offset(1, 0, 0), blockId, dimension);
                            break;
                        case '0001':
                            dataB = 6;
                            dataA = 8*testForBlock(loc.offset(0, 0, 1), blockId, dimension) + 7*!testForBlock(loc.offset(0, 0, 1), blockId, dimension);
                            break;   
                    }
                    break;
                case 1:
                    switch (horizontalPlane) {
                        case '1010':
                            switch (2*!testForBlock(loc.offset(1, 0, 0), blockId, dimension) + !testForBlock(loc.offset(-1, 0, 0), blockId, dimension)){
                                case 0:
                                    dataB = 4;
                                    dataA = 2*!testForBlock(loc.offset(1, -1, 0), blockId, dimension) + !testForBlock(loc.offset(-1, -1, 0), blockId, dimension) + 1;
                                    break;
                                case 1:
                                    dataB = 4;
                                    dataA = !testForBlock(loc.offset(1, -1, 0), blockId, dimension) + 5;
                                    break;
                                case 2:
                                    dataB = 4;
                                    dataA = !testForBlock(loc.offset(-1, -1, 0), blockId, dimension) + 7;
                                    break;
                                case 3:
                                    dataB = 7;
                                    dataA = 2;
                                    break;
                            }
                            break;
                        case '0101':
                            switch (2*!testForBlock(loc.offset(0, 0, -1), blockId, dimension) + !testForBlock(loc.offset(0, 0, 1), blockId, dimension)){
                                case 0:
                                    dataB = 4;
                                    dataA = 2*!testForBlock(loc.offset(0, -1, -1), blockId, dimension) + !testForBlock(loc.offset(0, -1, 1), blockId, dimension) + 9;
                                    break;
                                case 1:
                                    dataB = 4;
                                    dataA = !testForBlock(loc.offset(0, -1, -1), blockId, dimension) + 13;
                                    break;
                                case 2:
                                    dataB = 4;
                                    dataA = !testForBlock(loc.offset(0, -1, 1), blockId, dimension) + 15;
                                    break;
                                case 3:
                                    dataB = 7;
                                    dataA = 3;
                                    break;
                            }
                            break;



                        case '1000':
                            dataB = 6;
                            dataA = testForBlock(loc.offset(-1, 0, 0), blockId, dimension)*(1 + !testForBlock(loc.offset(-1, -1, 0), blockId, dimension)) + 3*!testForBlock(loc.offset(-1, 0, 0), blockId, dimension);
                            break;
                        case '0100':
                            dataB = 6;
                            dataA = testForBlock(loc.offset(0, 0, -1), blockId, dimension)*(4 + !testForBlock(loc.offset(0, -1, -1), blockId, dimension)) + 6*!testForBlock(loc.offset(0, 0, -1), blockId, dimension);
                            break;
                        case '0010':
                            dataB = 6;
                            dataA = testForBlock(loc.offset(1, 0, 0), blockId, dimension)*(7 + !testForBlock(loc.offset(1, -1, 0), blockId, dimension)) + 9*!testForBlock(loc.offset(1, 0, 0), blockId, dimension);
                            break;
                        case '0001':
                            dataB = 6;
                            dataA = testForBlock(loc.offset(0, 0, 1), blockId, dimension)*(10 + !testForBlock(loc.offset(0, -1, 1), blockId, dimension)) + 12*!testForBlock(loc.offset(0, 0, 1), blockId, dimension);
                            break;
                    }
                    break;
                case 2:
                    switch (horizontalPlane) {
                        case '1010':
                            switch (2*!testForBlock(loc.offset(1, 0, 0), blockId, dimension) + !testForBlock(loc.offset(-1, 0, 0), blockId, dimension)){
                                case 0:
                                    dataB = 4;
                                    dataA = 2*!testForBlock(loc.offset(1, 1, 0), blockId, dimension) + !testForBlock(loc.offset(-1, 1, 0), blockId, dimension) + 1;
                                    break;
                                case 1:
                                    dataB = 4;
                                    dataA = !testForBlock(loc.offset(1, 1, 0), blockId, dimension) + 5;
                                    break;
                                case 2:
                                    dataB = 4;
                                    dataA = !testForBlock(loc.offset(-1, 1, 0), blockId, dimension) + 7;
                                    break;
                                case 3:
                                    dataB = 7;
                                    dataA = 2;
                                    break;
                            }
                            break;
                        case '0101':
                            switch (2*!testForBlock(loc.offset(0, 0, -1), blockId, dimension) + !testForBlock(loc.offset(0, 0, 1), blockId, dimension)){
                                case 0:
                                    dataB = 4;
                                    dataA = 2*!testForBlock(loc.offset(0, 1, -1), blockId, dimension) + !testForBlock(loc.offset(0, 1, 1), blockId, dimension) + 9;
                                    break;
                                case 1:
                                    dataB = 4;
                                    dataA = !testForBlock(loc.offset(0, 1, -1), blockId, dimension) + 13;
                                    break;
                                case 2:
                                    dataB = 4;
                                    dataA = !testForBlock(loc.offset(0, 1, 1), blockId, dimension) + 15;
                                    break;
                                case 3:
                                    dataB = 7;
                                    dataA = 3;
                                    break;
                            }
                            break;



                        case '1000':
                            dataB = 6;
                            dataA = testForBlock(loc.offset(-1, 0, 0), blockId, dimension)*(1 + !testForBlock(loc.offset(-1, 1, 0), blockId, dimension)) + 3*!testForBlock(loc.offset(-1, 0, 0), blockId, dimension);
                            break;
                        case '0100':
                            dataB = 6;
                            dataA = testForBlock(loc.offset(0, 0, -1), blockId, dimension)*(4 + !testForBlock(loc.offset(0, 1, -1), blockId, dimension)) + 6*!testForBlock(loc.offset(0, 0, -1), blockId, dimension);
                            break;
                        case '0010':
                            dataB = 6;
                            dataA = testForBlock(loc.offset(1, 0, 0), blockId, dimension)*(7 + !testForBlock(loc.offset(1, 1, 0), blockId, dimension)) + 9*!testForBlock(loc.offset(1, 0, 0), blockId, dimension);
                            break;
                        case '0001':
                            dataB = 6;
                            dataA = testForBlock(loc.offset(0, 0, 1), blockId, dimension)*(10 + !testForBlock(loc.offset(0, 1, 1), blockId, dimension)) + 12*!testForBlock(loc.offset(0, 0, 1), blockId, dimension);
                            break;
                    }
                    break;
                case 3:
                    switch (horizontalPlane) {
                        case '1010':
                            switch (2*!testForBlock(loc.offset(1, 0, 0), blockId, dimension) + !testForBlock(loc.offset(-1, 0, 0), blockId, dimension)){
                                case 0:
                                    dataB = 4;
                                    dataA = 8*!testForBlock(loc.offset(-1, -1, 0), blockId, dimension) + 4*!testForBlock(loc.offset(1, -1, 0), blockId, dimension) + 2*!testForBlock(loc.offset(1, 1, 0), blockId, dimension) + !testForBlock(loc.offset(-1, 1, 0), blockId, dimension) + 1;
                                    break;
                                case 1:
                                    dataB = 6;
                                    dataA = 2*!testForBlock(loc.offset(1, 1, 0), blockId, dimension) + !testForBlock(loc.offset(1, -1, 0), blockId, dimension) + 1;
                                    break;
                                case 2:
                                    dataB = 6;
                                    dataA = 2*!testForBlock(loc.offset(-1, 1, 0), blockId, dimension) + !testForBlock(loc.offset(-1, -1, 0), blockId, dimension) + 5;
                                    break;
                                case 3:
                                    dataB = 9;
                                    dataA = 2;
                                    break;
                            }
                            break;
                        case '0101':
                            switch (2*!testForBlock(loc.offset(0, 0, -1), blockId, dimension) + !testForBlock(loc.offset(0, 0, 1), blockId, dimension)){
                                case 0:
                                    dataB = 5;
                                    dataA = 8*!testForBlock(loc.offset(0, -1, 1), blockId, dimension) + 4*!testForBlock(loc.offset(0, -1, -1), blockId, dimension) + 2*!testForBlock(loc.offset(0, 1, -1), blockId, dimension) + !testForBlock(loc.offset(0, 1, 1), blockId, dimension) + 1;
                                    break;
                                case 1:
                                    dataB = 6;
                                    dataA = 2*!testForBlock(loc.offset(0, 1, -1), blockId, dimension) + !testForBlock(loc.offset(0, -1, -1), blockId, dimension) + 9;
                                    break;
                                case 2:
                                    dataB = 6;
                                    dataA = 2*!testForBlock(loc.offset(0, 1, 1), blockId, dimension) + !testForBlock(loc.offset(0, -1, 1), blockId, dimension) + 13;
                                    break;
                                case 3:
                                    dataB = 9;
                                    dataA = 3;
                                    break;
                            }
                            break;



                        case '1000':
                            if (!testForBlock(loc.offset(-1, 0, 0), blockId, dimension)) {
                                dataB = 9;
                                dataA = 4;
                            } else {
                                dataB = 8;
                                dataA = 2*!testForBlock(loc.offset(-1, 1, 0), blockId, dimension) + !testForBlock(loc.offset(-1, -1, 0), blockId, dimension) + 1;
                            }
                            break;
                        case '0100':
                            if (!testForBlock(loc.offset(0, 0, -1), blockId, dimension)) {
                                dataB = 9;
                                dataA = 5;
                            } else {
                                dataB = 8;
                                dataA = 2*!testForBlock(loc.offset(0, 1, -1), blockId, dimension) + !testForBlock(loc.offset(0, -1, -1), blockId, dimension) + 5;
                            }
                            break;
                        case '0010':
                            if (!testForBlock(loc.offset(1, 0, 0), blockId, dimension)) {
                                dataB = 9;
                                dataA = 6;
                            } else {
                                dataB = 8;
                                dataA = 2*!testForBlock(loc.offset(1, 1, 0), blockId, dimension) + !testForBlock(loc.offset(1, -1, 0), blockId, dimension) + 9;
                            }
                            break;
                        case '0001':
                            if (!testForBlock(loc.offset(0, 0, 1), blockId, dimension)) {
                                dataB = 9;
                                dataA = 7;
                            } else {
                                dataB = 8;
                                dataA = 2*!testForBlock(loc.offset(0, 1, 1), blockId, dimension) + !testForBlock(loc.offset(0, -1, 1), blockId, dimension) + 13;
                            }
                            break;
                    }
                    break;
            }
    }
    
    block.setPermutation(block.permutation.withState('data:a', dataA).withState('data:b', dataB).withState('data:c', dataC));

}

/**
 * @param {import("@minecraft/server").Vector3} location
 * @param {string} blockId
 * @param {import("@minecraft/server").Dimension} dimension
 */
export function testForBlock( location, blockId, dimension ) { return (blockId == dimension.getBlock(location).typeId); }

/**
 * @param {import("@minecraft/server").Vector3} location
 * @param {import("@minecraft/server").Dimension} dimension
 */
export function testForGlassBlock( location, dimension ) {

    return {
        result: GLASS.includes( dimension.getBlock(location).typeId.split(':')[1] ),
        block: dimension.getBlock(location)
    };

}

/**
 * @param {import("@minecraft/server").Vector3} location
 * @param {import("@minecraft/server").Dimension} dimension
 */
export function testForSolidBlock( location, dimension ) {

    let blockName = dimension.getBlock(location).typeId;
    let result = BLACK_LIST.some( e => blockName.split(':')[1].includes(e) );

    if (blockName.includes('slab')) result = result && !blockName.includes('double_') && /\w+_slab/.test(blockName)
    else if (blockName.split(':')[0] === ( 'glass' || 'glass_pane' ) ) return result = true;

    return !result;

}

/**
 * @param {import("@minecraft/server").Block} block
 * @param {import("@minecraft/server").Dimension} dimension
 */
export function init( block ) {

    connectedGlass( block );
    
    const  {location: loc, dimension } = block

    const x     = testForGlassBlock({x: loc.x + 1,y: loc.y    ,z: loc.z    }, dimension);
    const neg_x = testForGlassBlock({x: loc.x - 1,y: loc.y    ,z: loc.z    }, dimension);
    const y     = testForGlassBlock({x: loc.x    ,y: loc.y + 1,z: loc.z    }, dimension);
    const neg_y = testForGlassBlock({x: loc.x    ,y: loc.y - 1,z: loc.z    }, dimension);
    const z     = testForGlassBlock({x: loc.x    ,y: loc.y    ,z: loc.z + 1}, dimension);
    const neg_z = testForGlassBlock({x: loc.x    ,y: loc.y    ,z: loc.z - 1}, dimension);

    if ( x.result )     { connectedGlass( x.block    , dimension ) }
    if ( neg_x.result ) { connectedGlass( neg_x.block, dimension ) }
    if ( y.result )     { connectedGlass( y.block    , dimension ) }
    if ( neg_y.result ) { connectedGlass( neg_y.block, dimension ) }
    if ( z.result )     { connectedGlass( z.block    , dimension ) }
    if ( neg_z.result ) { connectedGlass( neg_z.block, dimension ) }

module.v

    const x_y         = testForGlassBlock({x: loc.x + 1,y: loc.y + 1,z: loc.z    }, dimension);
    const x_neg_y     = testForGlassBlock({x: loc.x + 1,y: loc.y - 1,z: loc.z    }, dimension);
    const neg_x_y     = testForGlassBlock({x: loc.x - 1,y: loc.y + 1,z: loc.z    }, dimension);
    const neg_x_neg_y = testForGlassBlock({x: loc.x - 1,y: loc.y - 1,z: loc.z    }, dimension);

    if ( x_y.result )         { connectedGlass( x_y.block        , dimension ) }
    if ( x_neg_y.result )     { connectedGlass( x_neg_y.block    , dimension ) }
    if ( neg_x_y.result )     { connectedGlass( neg_x_y.block    , dimension ) }
    if ( neg_x_neg_y.result ) { connectedGlass( neg_x_neg_y.block, dimension ) }



    const z_y         = testForGlassBlock({x: loc.x    ,y: loc.y + 1,z: loc.z + 1}, dimension);
    const neg_z_y     = testForGlassBlock({x: loc.x    ,y: loc.y + 1,z: loc.z - 1}, dimension);
    const z_neg_y     = testForGlassBlock({x: loc.x    ,y: loc.y - 1,z: loc.z + 1}, dimension);
    const neg_z_neg_y = testForGlassBlock({x: loc.x    ,y: loc.y - 1,z: loc.z - 1}, dimension);

    if ( z_y.result )         { connectedGlass( z_y.block        , dimension ) }
    if ( neg_z_y.result )     { connectedGlass( neg_z_y.block    , dimension ) }
    if ( z_neg_y.result )     { connectedGlass( z_neg_y.block    , dimension ) }
    if ( neg_z_neg_y.result ) { connectedGlass( neg_z_neg_y.block, dimension ) }

}