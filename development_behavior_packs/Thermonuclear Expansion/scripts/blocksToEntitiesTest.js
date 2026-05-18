import { ModalFormData, uiManager } from "@minecraft/server-ui";
import { system, world, EquipmentSlot } from "@minecraft/server";

function timeDelay(locationTarget, dimension, block, blockAbove) {
    const dimensionT = world.getDimension("overworld");
    const blockNew = dimensionT.getBlock(locationTarget);
    const warhead = world.getDynamicProperty("launch");
    if (block.isValid == true) {
        system.run(() => {
            system.sendScriptEvent("kaboom:test", "test");
            system.runTimeout(() => {
                if (blockAbove === "kaboom:missile_engine") {
                    const tier = world.getDynamicProperty("warhead");
                    console.warn(tier);
                    dimension.spawnEntity(tier, locationTarget);
                    world.setDynamicProperty("launch", false);
                };
            }, 200);
        });
    };
};
system.run(() => {
    world.beforeEvents.playerInteractWithBlock.subscribe((ass) => {
        const { player } = ass;
        const block = ass.block;
        const stopRepeat = ass.isFirstEvent;
        const blockAbove = block.above(1).typeId;
        system.run(() => {
            const hand = player.getComponent("minecraft:equippable");
            const empty = hand.getEquipmentSlot(EquipmentSlot.Mainhand);
            const noItem = empty.hasItem();
            const customUi = new ModalFormData()
            customUi.title("Target Coordinates")
            customUi.textField("X coordinate", "0");
            customUi.textField("Z coordinate", "0");
            system.sendScriptEvent("kaboom:ui", "ui");
            if (block.typeId === "kaboom:launchpad_block" && noItem == false && stopRepeat == true) {
                customUi.show(player).then((response) => {
                    const [xInput, zInput] = response.formValues
                    const x = Number(xInput)
                    const z = Number(zInput)
                    const dimension = player.dimension
                    const location = block.center();
                    const locationTarget = { x, y: 150, z };
                    world.setDynamicProperty("block", location);
                    world.setDynamicProperty("blockTarget", locationTarget);
                    timeDelay(locationTarget, dimension, block, blockAbove);
                    const test = "4D 61 64 65 20 62 79 20 42 69 67 4D 61 6E 49 73 61 6B";
                }); uiManager.closeAllForms(player);
            };
        });
    });
});