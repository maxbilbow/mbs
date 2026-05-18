import { world, ItemStack } from "@minecraft/server"
import { IronGolemStructureManager } from "./golemStructureSpawner.js"

const golemManager = new IronGolemStructureManager();

golemManager.registerGolemType('minecraft:carved_pumpkin', 'minecraft:gold_block', 'eu:gold_golem')
golemManager.registerGolemType('minecraft:carved_pumpkin', 'minecraft:emerald_block', 'eu:emerald_golem')
golemManager.registerGolemType('minecraft:carved_pumpkin', 'minecraft:lapis_block', 'eu:lapis_golem')
golemManager.registerGolemType('minecraft:carved_pumpkin', 'minecraft:diamond_block', 'eu:diamond_golem')
golemManager.registerGolemType('minecraft:carved_pumpkin', 'minecraft:redstone_block', 'eu:redstone_golem')
golemManager.registerGolemType('minecraft:carved_pumpkin', 'minecraft:hay_block', 'eu:hay_golem')
golemManager.registerGolemType('minecraft:carved_pumpkin', 'minecraft:glass', 'eu:glass_golem')
golemManager.registerGolemType('minecraft:carved_pumpkin', 'minecraft:oak_log', 'eu:oak_golem')
golemManager.registerGolemType('minecraft:carved_pumpkin', 'minecraft:tnt', 'eu:tnt_golem')
golemManager.registerGolemType('minecraft:carved_pumpkin', 'minecraft:cobblestone', 'eu:cobblestone_golem')
golemManager.registerGolemType('minecraft:carved_pumpkin', 'minecraft:mossy_cobblestone', 'eu:mossy_cobblestone_golem')
golemManager.registerGolemType('minecraft:carved_pumpkin', 'minecraft:obsidian', 'eu:obsidian_golem')
golemManager.registerGolemType('minecraft:carved_pumpkin', 'minecraft:bedrock', 'eu:bedrock_golem')


//devuelve un numero aleatorio en el rango especificado
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

//te reduce en 1 la cantidad de items que tengas en la mano
function updateItemAmount(player) {
    let slot = player.selectedSlotIndex;
    let container = player.getComponent('inventory').container;
    let item = container.getItem(slot);
    let itemTypeId = item.typeId
    let itemAmount = item.amount - 1
    if (itemAmount > 0) {
        let updateItemAmount = new ItemStack(itemTypeId, itemAmount)
        container.setItem(slot, updateItemAmount);
    } else {
        container.setItem(slot, undefined);
    }
}
/* 
const golems = [
    { type: 'eu:lapis_golem', probability: 25, repairItem: 'minecraft:lapis_lazuli' },
    { type: 'eu:emerald_golem', probability: 10, repairItem: 'minecraft:emerald' },
    { type: 'eu:gold_golem', probability: 10, repairItem: 'minecraft:gold_ingot' },
    { type: 'eu:diamond_golem', probability: 5, repairItem: 'minecraft:diamond' },
];
 */
const golems = {
    'eu:hay_golem': { probability: 20, repairItem: 'minecraft:wheat' },
    'eu:lapis_golem': { probability: 15, repairItem: 'minecraft:lapis_lazuli' },
    'eu:redstone_golem': { probability: 15, repairItem: 'minecraft:redstone' },
    'eu:emerald_golem': { probability: 15, repairItem: 'minecraft:emerald' },
    'eu:gold_golem': { probability: 15, repairItem: 'minecraft:gold_ingot' },
    'eu:diamond_golem': { probability: 10, repairItem: 'minecraft:diamond' },
    'eu:netherite_golem': { probability: 0, repairItem: 'minecraft:netherite_ingot' },
    'eu:oak_golem': { probability: 20, repairItem: 'minecraft:oak_log' },
    'eu:cobblestone_golem': { probability: 10, repairItem: 'minecraft:cobblestone' },
    'eu:mossy_cobblestone_golem': { probability: 10, repairItem: 'minecraft:mossy_cobblestone' },

    'eu:tnt_golem': { probability: 0, repairItem: 'minecraft:tnt' },

};

//repara al golem
world.beforeEvents.playerInteractWithEntity.subscribe(async ev => {
    let entity = ev.target;
    let player = ev.player
    let item = ev.itemStack;


    //world.sendMessage(`${entity.getProperty('eu:is_lit')}`)
    const golem = golems[entity.typeId];

    // Verificar si el golem existe y si el item coincide con el repairItem
    if (golem && item?.typeId == golem.repairItem) {
        await null;
        //world.sendMessage('golem reparado');
        let entityHealth = entity.getComponent('health');
        let currentHealth = entityHealth.currentValue;
        if (currentHealth >= entityHealth.effectiveMax) {
            return;
        }

        updateItemAmount(player)
        entityHealth.setCurrentValue(currentHealth + 20);
        entity.dimension.playSound('mob.irongolem.repair', entity.location)
    }
});

//convierte al golem de diamante en netherite
world.beforeEvents.playerInteractWithEntity.subscribe(async ev => {
    let entity = ev.target;
    let player = ev.player
    let item = ev.itemStack;


    if (entity.typeId == 'eu:diamond_golem' && item?.typeId == 'minecraft:netherite_block') {
        await null;
        let location = entity.location
        updateItemAmount(player)
        entity.dimension.spawnEntity('eu:netherite_golem', location);
        entity.remove()
        player.dimension.playSound('random.anvil_land', location)

    }
});

//Inmortalidad del golem de bedrock
world.afterEvents.entitySpawn.subscribe(ev => {
    let entity = ev.entity;

    if (entity.typeId == 'eu:bedrock_golem') {
        entity.runCommand('effect @s resistance infinite 10 true')
    }
});

//probabilidad de hacer spawn en una aldea
world.afterEvents.entitySpawn.subscribe(ev => {
    let entity = ev.entity;


    //existe un evento en el golem que es filtro de cuando aparece en aldea podrias checarlo y cambiarlo
    if (entity.typeId == 'minecraft:iron_golem') {
        let location = entity.location;

        // Para comprobar si su spawn fue natural o no verifico si habia players cerca
        let players = entity.dimension.getPlayers({ location: location, maxDistance: 5 });

        if (players.length > 0) {
            return;
        }

        let probability = randomInt(1, 200);
        let cumulativeProbability = 0;


        for (const golemType in golems) {
            const golem = golems[golemType];

            cumulativeProbability += golem.probability;
            if (probability <= cumulativeProbability) {
                entity.dimension.spawnEntity(golemType, location, { spawnEvent: 'minecraft:from_village' });
                entity.remove();
                break;
            }
        }
    }
});

world.afterEvents.entityHealthChanged.subscribe(ev => {
    const { entity, newValue, oldValue } = ev
    if (entity.typeId == 'eu:tnt_golem' && newValue <= 15 && !entity.getProperty('eu:is_lit')) {
        //entity.setProperty('eu:is_lit', true)
        entity.triggerEvent('eu:start_explosion')
    }
})