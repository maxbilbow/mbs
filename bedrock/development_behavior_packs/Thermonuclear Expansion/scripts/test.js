import { ModalFormData } from "@minecraft/server-ui";
import { system, world, EquipmentSlot } from "@minecraft/server";

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    const { player } = event
    const block = event.block
    const stopRepeat = event.isFirstEvent;
    system.run(() => {
        const hand = player.getComponent("minecraft:equippable");
        const empty = hand.getEquipmentSlot(EquipmentSlot.Mainhand);
        const hasItem = empty.hasItem();
        const customUi = new ModalFormData()
        customUi.title("Sample")
        customUi.textField("Test", "1");
        customUi.textField("Test", "2");
        if (block.typeId === "sample:block" && hasItem == false && stopRepeat == true) {
            customUi.show(player).then((response) => {
                const [testOne, testTwo] = response.formValues
                const one = Number(testOne)
                const two = Number(testTwo)
                console.log(testOne + testTwo);
            });
        };
    });
});