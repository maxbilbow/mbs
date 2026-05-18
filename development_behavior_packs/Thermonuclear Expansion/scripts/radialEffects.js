import { system } from "@minecraft/server";

/** @type {import("@minecraft/server").BlockCustomComponent} */
const BlockRadialEffectsComponent = {
    onTick({ block, dimension }, { params }) {
        const effects = params; // The value we have assigned to the component in the block JSON.

        // Iterates over each object in the array.
        for (const { radius, name, duration, amplifier } of effects) {
            // Gets all entities in the specified "radius" around the block.
            const entities = dimension.getEntities({
                location: block.center(),
                maxDistance: radius,
            });

            for (const entity of entities) {
                if (!entity.hasTag("immune")) {
                    entity.addEffect(name, duration, { amplifier });
                }
            }
        }
    },
};

system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
    blockComponentRegistry.registerCustomComponent(
        "kaboom:radiation",
        BlockRadialEffectsComponent
    );
});