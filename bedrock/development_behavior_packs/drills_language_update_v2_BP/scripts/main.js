import { world, system, EquipmentSlot } from '@minecraft/server';
import { registerAllDrills, initializeAllDrillSystems, initializeDrillAddon } from './main_drill_addon.js';


world.beforeEvents.worldInitialize.subscribe(eventData => {

    registerAllDrills(eventData.itemComponentRegistry);
});


world.afterEvents.worldInitialize.subscribe(() => {

    initializeAllDrillSystems();


    initializeDrillAddon();
});
