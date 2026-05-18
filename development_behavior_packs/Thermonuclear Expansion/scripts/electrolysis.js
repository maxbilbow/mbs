import { system, world, Block } from "@minecraft/server";

function changeRandomBlock(blockLocation, dimension) {
	// List of possible replacement blocks
	const blockTypes =
		"kaboom:deuterium_casing_full";
	try {
		dimension.setBlockType(blockLocation, blockTypes);
	}
	catch (error) {
		console.warn("UwU")

	}
};

world.afterEvents.playerPlaceBlock.subscribe(event => {
	const { block, player } = event;
	const blockTypes = "kaboom:deuterium_casing_full"
	if (block.typeId === "kaboom:deuterium_casing") {

		const blockLocation = block.center();
		const dimension = player.dimension;
		const randomDelayInTicks = Math.floor(Math.random() * 10) + 100;
		const blockBelow = block.below(1);
		if (blockBelow.typeId === "minecraft:redstone_block" && block.isWaterlogged) {
			player.dimension.playSound("bubble.down", blockLocation);
			dimension.spawnParticle("minecraft:crop_growth_emitter", blockLocation)
		};

		system.runTimeout(() => {

			if (blockBelow.typeId === "minecraft:redstone_block" && block.isWaterlogged) {
				if (block.typeId === "kaboom:deuterium_casing") {
					changeRandomBlock(blockLocation, dimension, blockTypes);
					player.playSound("bubble.down");
					dimension.spawnParticle("minecraft:crop_growth_emitter", blockLocation)
				};
			}
		}, randomDelayInTicks);
	}
});