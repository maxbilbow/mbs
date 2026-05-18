import { ModalFormData } from "@minecraft/server-ui";
import { system, world, Vector3 } from "@minecraft/server";

function timeDelay(location, dimension, entityType) {
    const dimensionT = world.getDimension("overworld");
    const block = dimensionT.getBlock(location);
    if (block && block.isValid) {
        const dimension = world.getDimension("overworld");
        const locationSound = entityType.location;
        dimension.playSound("kaboom:launch", locationSound, { volume: 0.05 });
        dimension.createExplosion(locationSound, 1, { causesFire: true });
        let acceleration = 0.15
        const callbackId = system.runInterval(() => {
            const locationParticle = entityType.location
            entityType.applyImpulse({ x: 0, y: acceleration, z: 0 });
            acceleration += 0.15;
            dimension.spawnParticle("minecraft:campfire_smoke_particle", locationParticle);
        }, 1);
        system.runTimeout(() => {
            system.clearRun(callbackId);
            entityType.kill();
        }, 100);
    }
    system.runTimeout(() => {
        dimension.spawnEntity("kaboom:thermonuclear_missile_explode", location);
        console.warn("Entity Spawn at", location);
    }, 200);
};

world.afterEvents.playerInteractWithEntity.subscribe((ass) => {
    const { player } = ass
    const entityType = ass.target
    system.run(() => {
        const customUi = new ModalFormData()
        customUi.title("Target Coordinates")
        customUi.textField("X coordinate", "0");
        customUi.textField("Z coordinate", "0");


        if (entityType.typeId === "kaboom:thermonuclear_missile") {
            customUi.show(player).then((response) => {
                const missile = entityType.typeId
                const [xInput, zInput] = response.formValues
                const x = Number(xInput)
                const z = Number(zInput)
                const dimension = player.dimension
                const location = { x, y: 150, z };
                world.setDynamicProperty("radioactive", location)
                timeDelay(location, dimension, entityType);
            });
        };
    });
});